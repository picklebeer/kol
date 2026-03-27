use anchor_lang::prelude::*;

#[error_code]
pub enum KolError {
    #[msg("Invalid oil line rank (must be 1-10)")]
    InvalidRank,

    #[msg("Stake amount is below the minimum for this rank")]
    StakeTooLow,

    #[msg("Challenge cooldown has not elapsed")]
    CooldownActive,

    #[msg("Cannot challenge your own position")]
    SelfChallenge,

    #[msg("Insufficient token balance")]
    InsufficientBalance,

    #[msg("Game is paused")]
    GamePaused,

    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Nothing to withdraw")]
    NothingToWithdraw,
}
