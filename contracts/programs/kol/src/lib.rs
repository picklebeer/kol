use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::initialize::*;
use instructions::init_oil_line::*;
use instructions::register_player::*;
use instructions::drill::*;
use instructions::withdraw::*;
use instructions::admin::*;
use instructions::admin_vault::*;

declare_id!("aEZUE9ooMZ81eMMFppHzsPVYWxhiNMUjf7eDLATDZtT");

#[program]
pub mod kol {
    use super::*;

    /// Initialize game state and token vault
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    /// Initialize a single oil line (rank 1-10)
    pub fn init_oil_line(
        ctx: Context<InitOilLine>,
        rank: u8,
    ) -> Result<()> {
        instructions::init_oil_line::handler(ctx, rank)
    }

    /// Register a new player
    pub fn register_player(
        ctx: Context<RegisterPlayer>,
    ) -> Result<()> {
        instructions::register_player::handler(ctx)
    }

    /// Drill into an oil line position
    pub fn drill(
        ctx: Context<Drill>,
        rank: u8,
        stake_amount: u64,
        client_seed: [u8; 16],
    ) -> Result<()> {
        instructions::drill::handler(ctx, rank, stake_amount, client_seed)
    }

    /// Withdraw pending winnings
    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        instructions::withdraw::handler(ctx)
    }

    /// Admin: pause/unpause
    pub fn toggle_pause(
        ctx: Context<AdminTogglePause>,
        paused: bool,
    ) -> Result<()> {
        instructions::admin::handler(ctx, paused)
    }

    /// Admin: deposit KOL tokens into the vault
    pub fn admin_deposit(ctx: Context<AdminVault>, amount: u64) -> Result<()> {
        instructions::admin_vault::deposit_handler(ctx, amount)
    }

    /// Admin: withdraw KOL tokens from the vault
    pub fn admin_withdraw(ctx: Context<AdminVault>, amount: u64) -> Result<()> {
        instructions::admin_vault::withdraw_handler(ctx, amount)
    }
}
