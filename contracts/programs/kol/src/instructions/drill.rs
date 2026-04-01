use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_lang::solana_program::sysvar::slot_hashes;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::*;
use crate::errors::KolError;
use crate::state::*;

/// Core game instruction: challenger drills into an oil line position
pub fn handler(ctx: Context<Drill>, rank: u8, stake_amount: u64, client_seed: [u8; 16]) -> Result<()> {
    // Validate rank
    require!(rank >= 1 && rank <= NUM_OIL_LINES, KolError::InvalidRank);

    let game = &ctx.accounts.game_state;
    require!(!game.paused, KolError::GamePaused);

    // Validate minimum stake
    let min_stake = MIN_STAKES[(rank - 1) as usize];
    require!(stake_amount >= min_stake, KolError::StakeTooLow);

    // Check cooldown
    let clock = Clock::get()?;
    let player = &ctx.accounts.player_account;
    if player.last_challenge_at > 0 {
        let elapsed = clock.unix_timestamp - player.last_challenge_at;
        require!(elapsed >= COOLDOWN_SECONDS, KolError::CooldownActive);
    }

    // Cannot challenge your own position
    let oil_line = &ctx.accounts.oil_line;
    require!(
        oil_line.holder == Pubkey::default() || oil_line.holder != ctx.accounts.challenger.key(),
        KolError::SelfChallenge
    );

    // Validate defender account matches the oil line holder
    if oil_line.holder != Pubkey::default() {
        // Position is held — defender account MUST be provided and must be the holder's PDA
        let defender = ctx.accounts.defender_account.as_ref()
            .ok_or(KolError::InvalidDefender)?;
        require!(defender.authority == oil_line.holder, KolError::InvalidDefender);

        // Verify it's the correct PDA
        let (expected_pda, _) = Pubkey::find_program_address(
            &[PLAYER_SEED, oil_line.holder.as_ref()],
            ctx.program_id,
        );
        require!(defender.key() == expected_pda, KolError::InvalidDefender);
    }

    // Transfer stake from challenger to vault
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.challenger_token.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.challenger.to_account_info(),
            },
        ),
        stake_amount,
        TOKEN_DECIMALS,
    )?;

    // ─── Provably-Fair RNG ───
    // Combine: slot_hashes + client_seed + challenger key + timestamp
    let slot_hashes_info = &ctx.accounts.slot_hashes;
    let slot_data = slot_hashes_info.data.borrow();
    // Take first 32 bytes of SlotHashes sysvar data
    let slot_bytes: &[u8] = if slot_data.len() >= 32 {
        &slot_data[..32]
    } else {
        &slot_data[..]
    };

    let mut seed_material = Vec::with_capacity(32 + 16 + 32 + 8);
    seed_material.extend_from_slice(slot_bytes);
    seed_material.extend_from_slice(&client_seed);
    seed_material.extend_from_slice(ctx.accounts.challenger.key().as_ref());
    seed_material.extend_from_slice(&clock.unix_timestamp.to_le_bytes());

    let seed_hash = hash(&seed_material);
    // Roll: first 2 bytes mod 10000
    let roll = u16::from_le_bytes([seed_hash.to_bytes()[0], seed_hash.to_bytes()[1]]) % 10000;

    // Calculate win threshold (45% base + 1% per 100 KOL over minimum, max 65%)
    let bonus_units = stake_amount.saturating_sub(min_stake) / (100_000_000); // per 100 KOL (6 decimals)
    let bonus_bp = (bonus_units as u16).min(MAX_WIN_CHANCE - BASE_WIN_CHANCE);
    let win_threshold = BASE_WIN_CHANCE + bonus_bp;
    let win = roll < win_threshold;

    // ─── Resolve outcome ───
    let mut payout: u64 = 0;

    let oil_line = &mut ctx.accounts.oil_line;
    let player = &mut ctx.accounts.player_account;
    let game = &mut ctx.accounts.game_state;

    player.total_staked = player.total_staked.checked_add(stake_amount).ok_or(KolError::Overflow)?;
    player.last_challenge_at = clock.unix_timestamp;

    if win {
        // Payout = stake * 1.8
        payout = stake_amount
            .checked_mul(PAYOUT_NUMERATOR)
            .ok_or(KolError::Overflow)?
            .checked_div(PAYOUT_DENOMINATOR)
            .ok_or(KolError::Overflow)?;

        player.wins += 1;
        player.total_won = player.total_won.checked_add(payout).ok_or(KolError::Overflow)?;
        player.pending_withdraw = player.pending_withdraw.checked_add(payout).ok_or(KolError::Overflow)?;

        // If position had a defender, give them 10% of the lost stake as consolation
        if oil_line.holder != Pubkey::default() && ctx.accounts.defender_account.is_some() {
            let defender_cut = stake_amount
                .checked_mul(DEFENDER_CUT_NUMERATOR)
                .ok_or(KolError::Overflow)?
                .checked_div(DEFENDER_CUT_DENOMINATOR)
                .ok_or(KolError::Overflow)?;

            if let Some(defender) = &mut ctx.accounts.defender_account {
                defender.pending_withdraw = defender
                    .pending_withdraw
                    .checked_add(defender_cut)
                    .ok_or(KolError::Overflow)?;
            }
        }

        // Challenger takes the position
        oil_line.holder = ctx.accounts.challenger.key();
        oil_line.stake_amount = stake_amount;
        oil_line.defenses = 0;
        oil_line.claimed_at = clock.unix_timestamp;
    } else {
        player.losses += 1;

        // Defender gets 10% cut of the lost stake
        if oil_line.holder != Pubkey::default() {
            oil_line.defenses += 1;

            if let Some(defender) = &mut ctx.accounts.defender_account {
                let defender_cut = stake_amount
                    .checked_mul(DEFENDER_CUT_NUMERATOR)
                    .ok_or(KolError::Overflow)?
                    .checked_div(DEFENDER_CUT_DENOMINATOR)
                    .ok_or(KolError::Overflow)?;
                defender.pending_withdraw = defender
                    .pending_withdraw
                    .checked_add(defender_cut)
                    .ok_or(KolError::Overflow)?;
            }
        }
    }

    game.total_challenges += 1;

    // Emit event
    emit!(DrillResult {
        challenger: ctx.accounts.challenger.key(),
        rank,
        stake_amount,
        roll,
        win_threshold,
        outcome: if win { "win".to_string() } else { "loss".to_string() },
        payout,
        seed_hash: seed_hash.to_bytes(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(rank: u8)]
pub struct Drill<'info> {
    #[account(mut)]
    pub challenger: Signer<'info>,

    #[account(
        mut,
        seeds = [GAME_STATE_SEED],
        bump = game_state.bump,
    )]
    pub game_state: Account<'info, GameState>,

    #[account(
        mut,
        seeds = [OIL_LINE_SEED, &[rank]],
        bump = oil_line.bump,
    )]
    pub oil_line: Account<'info, OilLine>,

    #[account(
        mut,
        seeds = [PLAYER_SEED, challenger.key().as_ref()],
        bump = player_account.bump,
    )]
    pub player_account: Account<'info, PlayerAccount>,

    /// Optional: defender's player account (if position is held)
    #[account(mut)]
    pub defender_account: Option<Account<'info, PlayerAccount>>,

    #[account(address = game_state.token_mint)]
    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = game_state.token_mint,
        token::authority = challenger,
    )]
    pub challenger_token: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump,
        token::mint = game_state.token_mint,
        token::authority = game_state,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// SlotHashes sysvar for on-chain RNG
    /// CHECK: Validated by address constraint
    #[account(address = slot_hashes::id())]
    pub slot_hashes: AccountInfo<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}
