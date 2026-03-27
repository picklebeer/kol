/// Number of oil line positions in the pipeline
pub const NUM_OIL_LINES: u8 = 10;

/// Base win chance in basis points (45% = 4500/10000)
pub const BASE_WIN_CHANCE: u16 = 4500;

/// Max win chance in basis points (65% = 6500/10000)
pub const MAX_WIN_CHANCE: u16 = 6500;

/// Win payout multiplier as fixed-point (1.8x = 18/10)
pub const PAYOUT_NUMERATOR: u64 = 18;
pub const PAYOUT_DENOMINATOR: u64 = 10;

/// Defender cut of lost stakes (10% = 1/10)
pub const DEFENDER_CUT_NUMERATOR: u64 = 1;
pub const DEFENDER_CUT_DENOMINATOR: u64 = 10;

/// Challenge cooldown in seconds
pub const COOLDOWN_SECONDS: i64 = 30;

/// Minimum stakes per rank (1-indexed). Amounts in token base units (with 9 decimals).
/// Rank 1: 100,000 KOL, Rank 2: 75,000, ..., Rank 10: 2,500
pub const MIN_STAKES: [u64; 10] = [
    100_000_000_000_000, // Rank 1:  100,000 KOL — Ghawar
     75_000_000_000_000, // Rank 2:   75,000 KOL — Kirkuk-Ceyhan
     50_000_000_000_000, // Rank 3:   50,000 KOL — Trans-Arabian
     35_000_000_000_000, // Rank 4:   35,000 KOL — Abqaiq
     25_000_000_000_000, // Rank 5:   25,000 KOL — Burgan
     15_000_000_000_000, // Rank 6:   15,000 KOL — Marib
     10_000_000_000_000, // Rank 7:   10,000 KOL — Dura Europos
      7_500_000_000_000, // Rank 8:    7,500 KOL — Bab al-Mandeb
      5_000_000_000_000, // Rank 9:    5,000 KOL — Sidon
      2_500_000_000_000, // Rank 10:   2,500 KOL — Dilmun
];

/// PDA seeds
pub const GAME_STATE_SEED: &[u8] = b"game_state";
pub const OIL_LINE_SEED: &[u8] = b"oil_line";
pub const PLAYER_SEED: &[u8] = b"player";
pub const VAULT_SEED: &[u8] = b"vault";
