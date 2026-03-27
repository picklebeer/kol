use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::KolError;
use crate::state::*;

/// Withdraw pending winnings from the vault
pub fn handler(ctx: Context<Withdraw>) -> Result<()> {
    let player = &mut ctx.accounts.player_account;
    let amount = player.pending_withdraw;
    require!(amount > 0, KolError::NothingToWithdraw);

    player.pending_withdraw = 0;

    // Transfer from vault to player using PDA signer
    let game_bump = ctx.accounts.game_state.bump;
    let seeds = &[GAME_STATE_SEED, &[game_bump]];
    let signer_seeds = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.player_token.to_account_info(),
                authority: ctx.accounts.game_state.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    msg!("Withdrew {} tokens to {}", amount, ctx.accounts.player.key());
    Ok(())
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        seeds = [GAME_STATE_SEED],
        bump = game_state.bump,
    )]
    pub game_state: Account<'info, GameState>,

    #[account(
        mut,
        seeds = [PLAYER_SEED, player.key().as_ref()],
        bump = player_account.bump,
        constraint = player_account.authority == player.key() @ KolError::Unauthorized,
    )]
    pub player_account: Account<'info, PlayerAccount>,

    #[account(
        mut,
        token::mint = game_state.token_mint,
        token::authority = player,
    )]
    pub player_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump,
        token::mint = game_state.token_mint,
        token::authority = game_state,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
