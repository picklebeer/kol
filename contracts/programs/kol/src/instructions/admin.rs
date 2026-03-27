use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::KolError;
use crate::state::*;

/// Pause or unpause the game
pub fn handler(ctx: Context<AdminTogglePause>, paused: bool) -> Result<()> {
    let game = &mut ctx.accounts.game_state;
    game.paused = paused;
    msg!("Game paused = {}", paused);
    Ok(())
}

#[derive(Accounts)]
pub struct AdminTogglePause<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GAME_STATE_SEED],
        bump = game_state.bump,
        has_one = authority @ KolError::Unauthorized,
    )]
    pub game_state: Account<'info, GameState>,
}
