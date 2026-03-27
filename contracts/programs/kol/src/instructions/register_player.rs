use anchor_lang::prelude::*;

use crate::constants::*;
use crate::state::*;

/// Register a new player account (PDA per wallet)
pub fn handler(ctx: Context<RegisterPlayer>) -> Result<()> {
    let player = &mut ctx.accounts.player_account;
    player.authority = ctx.accounts.payer.key();
    player.wins = 0;
    player.losses = 0;
    player.total_won = 0;
    player.total_staked = 0;
    player.last_challenge_at = 0;
    player.pending_withdraw = 0;
    player.bump = ctx.bumps.player_account;

    msg!("Player registered: {}", player.authority);
    Ok(())
}

#[derive(Accounts)]
pub struct RegisterPlayer<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = PlayerAccount::SIZE,
        seeds = [PLAYER_SEED, payer.key().as_ref()],
        bump,
    )]
    pub player_account: Account<'info, PlayerAccount>,

    pub system_program: Program<'info, System>,
}
