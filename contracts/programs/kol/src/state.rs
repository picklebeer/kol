use anchor_lang::prelude::*;

use crate::constants::NUM_OIL_LINES;

/// Global game configuration — one per deployment
#[account]
#[derive(Default)]
pub struct GameState {
    /// Authority that can pause/unpause the game
    pub authority: Pubkey,
    /// KOL token mint address
    pub token_mint: Pubkey,
    /// Vault token account (PDA-owned)
    pub vault: Pubkey,
    /// Whether the game is paused
    pub paused: bool,
    /// Total challenges executed
    pub total_challenges: u64,
    /// Bump for PDA derivation
    pub bump: u8,
}

impl GameState {
    pub const SIZE: usize = 8  // discriminator
        + 32  // authority
        + 32  // token_mint
        + 32  // vault
        + 1   // paused
        + 8   // total_challenges
        + 1;  // bump
}

/// One of the 10 oil line positions
#[account]
#[derive(Default)]
pub struct OilLine {
    /// Rank 1-10
    pub rank: u8,
    /// Current holder (Pubkey::default() if unclaimed)
    pub holder: Pubkey,
    /// Amount staked by current holder
    pub stake_amount: u64,
    /// Number of successful defenses
    pub defenses: u32,
    /// Timestamp when the position was last claimed
    pub claimed_at: i64,
    /// Bump for PDA derivation
    pub bump: u8,
}

impl OilLine {
    pub const SIZE: usize = 8  // discriminator
        + 1   // rank
        + 32  // holder
        + 8   // stake_amount
        + 4   // defenses
        + 8   // claimed_at
        + 1;  // bump
}

/// Per-player stats account
#[account]
#[derive(Default)]
pub struct PlayerAccount {
    /// Player wallet address
    pub authority: Pubkey,
    /// Total wins
    pub wins: u32,
    /// Total losses
    pub losses: u32,
    /// Total KOL won
    pub total_won: u64,
    /// Total KOL staked
    pub total_staked: u64,
    /// Last challenge timestamp (for cooldown)
    pub last_challenge_at: i64,
    /// Pending withdrawal amount
    pub pending_withdraw: u64,
    /// Bump for PDA derivation
    pub bump: u8,
}

impl PlayerAccount {
    pub const SIZE: usize = 8  // discriminator
        + 32  // authority
        + 4   // wins
        + 4   // losses
        + 8   // total_won
        + 8   // total_staked
        + 8   // last_challenge_at
        + 8   // pending_withdraw
        + 1;  // bump
}

/// Emitted after every drill attempt
#[event]
pub struct DrillResult {
    pub challenger: Pubkey,
    pub rank: u8,
    pub stake_amount: u64,
    pub roll: u16,
    pub win_threshold: u16,
    pub outcome: String,
    pub payout: u64,
    pub seed_hash: [u8; 32],
    pub timestamp: i64,
}
