# KOL - King of the Oil Lines | Game Mechanics

## Overview

KOL is a Solana-based staking game built around a 10-position ranked pipeline. Players stake KOL tokens to "drill" into oil line positions, competing for control of the pipeline. The game uses provably-fair randomness, on-chain settlement, and a defender-rewards system to create a persistent competitive economy.

---

## The Pipeline

The pipeline consists of 10 ranked oil line positions, each named after a historic Middle Eastern oil landmark:

| Rank | Name | Min Stake (KOL) |
|------|------|----------------|
| 1 | Ghawar | 100,000 |
| 2 | Kirkuk-Ceyhan | 75,000 |
| 3 | Trans-Arabian | 50,000 |
| 4 | Abqaiq | 35,000 |
| 5 | Burgan | 25,000 |
| 6 | Marib | 15,000 |
| 7 | Dura Europos | 10,000 |
| 8 | Bab al-Mandeb | 7,500 |
| 9 | Sidon | 5,000 |
| 10 | Dilmun | 2,500 |

Higher ranks require larger stakes but yield richer rewards. Each position can be held by one player at a time, or remain unclaimed.

---

## Core Game Loop

```
Connect Wallet --> Choose Oil Line --> Stake KOL --> Drill
                                                      |
                                            +---------+---------+
                                            |                   |
                                       STRIKE OIL           DRY WELL
                                       (Win: 45-65%)       (Loss: 35-55%)
                                            |                   |
                                  Take position +          Lose stake
                                  1.8x payout            Defender gets 10%
```

### Step 1: Connect Wallet
Players connect a Solana wallet (Phantom or Solflare). A player account is auto-created on first interaction.

### Step 2: Choose a Target
Select any of the 10 oil line positions. Each shows:
- Current holder (or "UNCLAIMED")
- Current stake amount
- Minimum stake required
- Defense count

### Step 3: Set Your Stake
Enter a stake amount >= the position's minimum. Staking more than the minimum increases your win probability (see Win Probability below).

### Step 4: Drill
Submit the challenge. The system resolves the outcome using provably-fair randomness.

---

## Win Probability

The win chance scales with your stake amount:

```
Base chance:  45%
Bonus:        +1% per 100 KOL above the minimum stake
Maximum:      65%

Formula: win_chance = min(45 + floor((stake - min_stake) / 100), 65)
```

**Example — Drilling Rank 10 (Dilmun, min 2,500 KOL):**

| Stake | Bonus | Win Chance |
|-------|-------|------------|
| 2,500 | +0% | 45% |
| 3,000 | +5% | 50% |
| 4,000 | +15% | 60% |
| 4,500+ | +20% | 65% (cap) |

---

## Outcomes

### Strike Oil (Win)

When a challenger wins:

1. **Payout**: Challenger receives 1.8x their stake amount
2. **Position captured**: Challenger takes the oil line position
3. **Defender displaced**: If the position was held, the previous holder drops to rank + 1 with 50% of their original stake. If they were at rank 10, they are removed entirely.
4. **Defense counter resets**: The position's defense count resets to 0

```
Challenger stakes 10,000 KOL and wins:
  - Payout: 18,000 KOL (1.8x)
  - Challenger now holds the position at 10,000 KOL stake
  - Previous defender drops to next rank with 5,000 KOL stake
```

### Dry Well (Loss)

When a challenger loses:

1. **Stake lost**: Challenger loses their full stake
2. **Defender bonus**: If the position is held, the defender receives 10% of the lost stake
3. **Defense incremented**: Position's defense counter increases by 1
4. **Position unchanged**: Holder and stake remain the same

```
Challenger stakes 10,000 KOL and loses:
  - Challenger loses 10,000 KOL
  - Defender receives 1,000 KOL (10% cut)
  - Defender's defense count increases
```

---

## Provably Fair System

Every drill operation uses a commit-reveal randomness scheme that ensures neither the server nor the player can manipulate the outcome.

### On-Chain (Primary)

```
Entropy Sources:
  1. SlotHashes sysvar (32 bytes) - recent Solana slot hashes
  2. Client seed (16 bytes) - player-generated random value
  3. Challenger pubkey (32 bytes) - player's wallet address
  4. Timestamp (8 bytes) - current Unix timestamp

Combined = slot_hashes || client_seed || challenger || timestamp
Roll = SHA-256(Combined)[0..2] as u16 % 10000
```

### Off-Chain (API Fallback)

```
Server seed: 32 random bytes (generated per challenge)
Server seed hash: SHA-256(server_seed) — committed before play
Client seed: 16 random bytes (player-generated)

Roll = SHA-256(server_seed:client_seed)[0..8] as hex → integer % 10000
```

After the challenge resolves, both the server seed and its pre-committed hash are revealed so the player can independently verify the outcome.

### Verification

Players can verify any outcome:

1. Check that `SHA-256(server_seed) == server_seed_hash` (proves seed wasn't changed)
2. Compute `SHA-256(server_seed + ":" + client_seed)`
3. Take first 8 hex characters, convert to integer, mod 10000
4. Compare to the reported roll
5. Check roll against win threshold

---

## Cooldown

Each player has a **30-second cooldown** between drill attempts. This prevents rapid-fire challenges and gives the pipeline time to settle.

---

## Defender Economics

Holding an oil line position generates passive income:

- Every time a challenger loses against your position, you earn **10% of their stake**
- This is auto-credited to your account
- You can withdraw accumulated winnings at any time
- The longer you hold (more defenses), the more you've earned

**Example — Defending Rank 5 (Burgan):**

If 10 challengers each stake 25,000 KOL and all lose:
- You earn 10% x 25,000 x 10 = **25,000 KOL** in passive defender income
- Your position's defense counter shows "10 held"

---

## Position Displacement

When a position holder is defeated:

```
Rank 1-9: Defender drops to (rank + 1) with 50% of their original stake
Rank 10:  Defender is removed from the pipeline entirely
```

This creates a cascading effect — winning rank 3 pushes the defender to rank 4, which may displace whoever was at rank 4 (handled on next challenge at that rank).

---

## Token Economics in Gameplay

| Flow | Amount | Recipient |
|------|--------|-----------|
| Challenge stake | Full stake | Vault (locked) |
| Win payout | 1.8x stake | Challenger |
| Loss — defender cut | 10% of stake | Defender |
| Loss — remainder | 90% of stake | Vault (retained) |
| Displacement stake | 50% of original | Displaced holder |

The vault retains 90% of lost stakes minus the defender cut, creating a deflationary pressure on circulating KOL.

---

## Architecture

### Dual-Track Resolution

```
          Challenge Submitted
                 |
        +--------+--------+
        |                 |
   On-Chain (Primary)   API (Fallback)
        |                 |
   Anchor Program     FastAPI Backend
   Solana Mainnet     SQLite Database
        |                 |
        +--------+--------+
                 |
          Result Displayed
```

The frontend attempts on-chain settlement first. If the wallet transaction fails (network issues, insufficient SOL for fees, etc.), it falls back to the API backend which uses the same game logic with off-chain provably-fair randomness.

### On-Chain Indexer

A background indexer polls Solana every 15 seconds, reading all program accounts and syncing the on-chain state (oil line positions, player stats) into the local SQLite database. This keeps the API backend in sync with on-chain reality.

---

## Accounts & PDAs

All on-chain state is stored in Program Derived Addresses (PDAs):

| Account | Seed | Description |
|---------|------|-------------|
| GameState | `"game_state"` | Global game config (authority, token mint, vault, paused state) |
| OilLine | `"oil_line" + rank` | Per-position state (holder, stake, defenses) |
| PlayerAccount | `"player" + wallet` | Per-player stats (wins, losses, totals, pending withdrawals) |
| Vault | `"vault"` | Token vault holding all staked KOL |

---

## Error Conditions

| Error | Condition |
|-------|-----------|
| Invalid Rank | Rank outside 1-10 |
| Stake Too Low | Below minimum for target rank |
| Cooldown Active | Less than 30s since last challenge |
| Self Challenge | Challenger already holds target position |
| Insufficient Balance | Wallet lacks required KOL tokens |
| Game Paused | Admin has paused the game |
| Nothing to Withdraw | No pending withdrawal balance |

---

## Key Constants Summary

| Constant | Value |
|----------|-------|
| Pipeline positions | 10 |
| Base win chance | 45% |
| Max win chance | 65% |
| Win chance bonus | +1% per 100 KOL over min |
| Win payout multiplier | 1.8x |
| Defender loss cut | 10% |
| Displacement penalty | 50% stake reduction |
| Challenge cooldown | 30 seconds |
| Token decimals | 9 |
| Indexer poll interval | 15 seconds |
| Roll range | 0-9999 |
