use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::*;
use crate::errors::KolError;
use crate::state::*;

/// Admin deposits KOL tokens into the vault (seeding / top-up)
pub fn deposit_handler(ctx: Context<AdminVault>, amount: u64) -> Result<()> {
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.authority_token.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        ),
        amount,
        TOKEN_DECIMALS,
    )?;

    msg!("Admin deposited {} tokens to vault", amount);
    Ok(())
}

/// Admin withdraws KOL tokens from the vault
pub fn withdraw_handler(ctx: Context<AdminVault>, amount: u64) -> Result<()> {
    let game_bump = ctx.accounts.game_state.bump;
    let seeds = &[GAME_STATE_SEED, &[game_bump]];
    let signer_seeds = &[&seeds[..]];

    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.authority_token.to_account_info(),
                authority: ctx.accounts.game_state.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        TOKEN_DECIMALS,
    )?;

    msg!("Admin withdrew {} tokens from vault", amount);
    Ok(())
}

#[derive(Accounts)]
pub struct AdminVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [GAME_STATE_SEED],
        bump = game_state.bump,
        has_one = authority @ KolError::Unauthorized,
    )]
    pub game_state: Account<'info, GameState>,

    #[account(address = game_state.token_mint)]
    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = game_state.token_mint,
        token::authority = authority,
    )]
    pub authority_token: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump,
        token::mint = game_state.token_mint,
        token::authority = game_state,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}
