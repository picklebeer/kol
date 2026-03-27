use anchor_lang::prelude::*;

use crate::constants::*;
use crate::state::*;
use crate::errors::KolError;

/// Initialize a single oil line position (called once per rank 1-10)
pub fn handler(ctx: Context<InitOilLine>, rank: u8) -> Result<()> {
    require!(rank >= 1 && rank <= NUM_OIL_LINES, KolError::InvalidRank);

    let oil_line = &mut ctx.accounts.oil_line;
    oil_line.rank = rank;
    oil_line.holder = Pubkey::default();
    oil_line.stake_amount = 0;
    oil_line.defenses = 0;
    oil_line.claimed_at = 0;
    oil_line.bump = ctx.bumps.oil_line;

    msg!("Oil line #{} initialized", rank);
    Ok(())
}

#[derive(Accounts)]
#[instruction(rank: u8)]
pub struct InitOilLine<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [GAME_STATE_SEED],
        bump = game_state.bump,
        has_one = authority,
    )]
    pub game_state: Account<'info, GameState>,

    #[account(
        init,
        payer = authority,
        space = OilLine::SIZE,
        seeds = [OIL_LINE_SEED, &[rank]],
        bump,
    )]
    pub oil_line: Account<'info, OilLine>,

    pub system_program: Program<'info, System>,
}
