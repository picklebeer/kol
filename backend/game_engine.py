import hashlib
import os
import uuid
import time

import database as db

# Minimum stakes per ladder position (rank 1 = highest)
MIN_STAKES = {
    1: 100000, 2: 75000, 3: 50000, 4: 35000, 5: 25000,
    6: 15000, 7: 10000, 8: 7500, 9: 5000, 10: 2500,
}

# Historical Middle East pipeline names
PIPELINE_NAMES = {
    1:  "Ghawar",
    2:  "Kirkuk-Ceyhan",
    3:  "Trans-Arabian",
    4:  "Abqaiq",
    5:  "Burgan",
    6:  "Marib",
    7:  "Dura Europos",
    8:  "Bab al-Mandeb",
    9:  "Sidon",
    10: "Dilmun",
}

# Win probability: base 45%, +1% per 100 tokens staked above minimum (capped at 65%)
BASE_WIN_CHANCE = 4500  # out of 10000
MAX_WIN_CHANCE = 6500

# Payout multipliers
WIN_PAYOUT_MULT = 1.8  # winner gets 1.8x their stake
DEFENDER_CUT = 0.1     # defender gets 10% of lost stakes

_last_challenge: dict[str, float] = {}


def _generate_server_seed() -> str:
    return os.urandom(32).hex()


def _hash_seed(seed: str) -> str:
    return hashlib.sha256(seed.encode()).hexdigest()


def _compute_roll(server_seed: str, client_seed: str) -> int:
    combined = f"{server_seed}:{client_seed}"
    h = hashlib.sha256(combined.encode()).hexdigest()
    return int(h[:8], 16) % 10000


def _calc_win_threshold(stake_amount: float, min_stake: float) -> int:
    bonus = int((stake_amount - min_stake) / 100) * 100
    threshold = BASE_WIN_CHANCE + bonus
    return min(threshold, MAX_WIN_CHANCE)


async def get_ladder_state() -> list[dict]:
    ladder = await db.get_ladder()
    result = []
    for row in ladder:
        result.append({
            "rank": row["rank"],
            "name": PIPELINE_NAMES.get(row["rank"], f"Line {row['rank']}"),
            "holder": row["holder"],
            "username": row.get("username"),
            "stake_amount": row["stake_amount"],
            "defenses": row["defenses"],
            "min_challenge_stake": MIN_STAKES.get(row["rank"], 250),
        })
    return result


async def create_challenge(challenger: str, target_rank: int, stake_amount: float, client_seed: str) -> dict:
    # Validate rank
    if target_rank < 1 or target_rank > 10:
        raise ValueError("Invalid rank. Must be 1-10.")

    # Cooldown check
    now = time.time()
    last = _last_challenge.get(challenger, 0)
    if now - last < 30:
        remaining = int(30 - (now - last))
        raise ValueError(f"Cooldown active. Wait {remaining}s.")

    # Minimum stake check
    min_stake = MIN_STAKES.get(target_rank, 250)
    if stake_amount < min_stake:
        raise ValueError(f"Minimum stake for rank {target_rank} is {min_stake} KOL.")

    # Get current holder
    ladder = await db.get_ladder()
    position = next((p for p in ladder if p["rank"] == target_rank), None)
    defender = position["holder"] if position else None

    # Can't challenge yourself
    if defender == challenger:
        raise ValueError("You already hold this position.")

    # Ensure player exists
    await db.create_player(challenger)

    # Generate provably-fair seeds
    server_seed = _generate_server_seed()
    server_seed_hash = _hash_seed(server_seed)

    # Compute outcome
    roll = _compute_roll(server_seed, client_seed)
    win_threshold = _calc_win_threshold(stake_amount, min_stake)
    is_win = roll < win_threshold

    challenge_id = str(uuid.uuid4())[:8]

    if is_win:
        payout = round(stake_amount * WIN_PAYOUT_MULT, 2)
        # Move challenger to position
        if defender:
            # Defender drops — shift them down or remove if at rank 10
            if target_rank < 10:
                await db.set_ladder_position(target_rank + 1, defender, position["stake_amount"] * 0.5)
            else:
                await db.set_ladder_position(target_rank, None, 0)

        await db.set_ladder_position(target_rank, challenger, stake_amount)
        await db.update_player_stats(challenger, stake_amount, payout, 0, True)
        if defender:
            await db.update_player_stats(defender, 0, 0, position["stake_amount"] * 0.5, False)
        outcome = "win"
    else:
        payout = 0
        defender_bonus = round(stake_amount * DEFENDER_CUT, 2)
        await db.update_player_stats(challenger, stake_amount, 0, stake_amount, False)
        if defender:
            await db.increment_defenses(target_rank)
            await db.update_player_stats(defender, 0, defender_bonus, 0, True)
        outcome = "lose"

    challenge = {
        "id": challenge_id,
        "challenger": challenger,
        "defender": defender,
        "target_rank": target_rank,
        "stake_amount": stake_amount,
        "outcome": outcome,
        "server_seed": server_seed,
        "server_seed_hash": server_seed_hash,
        "client_seed": client_seed,
        "roll": roll,
        "payout": payout,
    }

    await db.save_challenge(challenge)
    _last_challenge[challenger] = now

    return challenge
