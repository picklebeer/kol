use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::state::*;

/// Initialize the game: create GameState, vault, and all 10 OilLine accounts
pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let game = &mut ctx.accounts.game_state;
    game.authority = ctx.accounts.authority.key();
    game.token_mint = ctx.accounts.token_mint.key();
    game.vault = ctx.accounts.vault.key();
    game.paused = false;
    game.total_challenges = 0;
    game.bump = ctx.bumps.game_state;

    msg!("KOL game initialized by {}", game.authority);
    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = GameState::SIZE,
        seeds = [GAME_STATE_SEED],
        bump,
    )]
    pub game_state: Account<'info, GameState>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = authority,
        token::mint = token_mint,
        token::authority = game_state,
        seeds = [VAULT_SEED],
        bump,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub rent: Sysvar<'info, Rent>,
}
