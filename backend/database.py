from __future__ import annotations

import aiosqlite
from typing import Optional, List, Dict

from config import settings

DB_PATH = settings.db_path


async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    return db


async def init_db():
    db = await get_db()
    try:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS players (
                address TEXT PRIMARY KEY,
                username TEXT,
                total_staked REAL DEFAULT 0,
                total_won REAL DEFAULT 0,
                total_lost REAL DEFAULT 0,
                wins INTEGER DEFAULT 0,
                losses INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS ladder (
                rank INTEGER PRIMARY KEY,
                holder TEXT,
                stake_amount REAL DEFAULT 0,
                defenses INTEGER DEFAULT 0,
                FOREIGN KEY (holder) REFERENCES players(address)
            );

            CREATE TABLE IF NOT EXISTS challenges (
                id TEXT PRIMARY KEY,
                challenger TEXT NOT NULL,
                defender TEXT,
                target_rank INTEGER NOT NULL,
                stake_amount REAL NOT NULL,
                outcome TEXT DEFAULT 'pending',
                server_seed TEXT,
                server_seed_hash TEXT,
                client_seed TEXT,
                roll INTEGER,
                payout REAL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (challenger) REFERENCES players(address)
            );
        """)

        # Initialize ladder with 10 empty positions
        for rank in range(1, 11):
            await db.execute(
                "INSERT OR IGNORE INTO ladder (rank) VALUES (?)", (rank,)
            )

        await db.commit()
    finally:
        await db.close()


async def get_player(address: str) -> Optional[dict]:
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM players WHERE address = ?", (address,))
        row = await cursor.fetchone()
        if row:
            return dict(row)
        return None
    finally:
        await db.close()


async def create_player(address: str, username: Optional[str] = None) -> dict:
    db = await get_db()
    try:
        await db.execute(
            "INSERT OR IGNORE INTO players (address, username) VALUES (?, ?)",
            (address, username),
        )
        await db.commit()
        return await get_player(address)
    finally:
        await db.close()


async def update_player_stats(address: str, staked: float, won: float, lost: float, is_win: bool):
    db = await get_db()
    try:
        await db.execute(
            """UPDATE players SET
                total_staked = total_staked + ?,
                total_won = total_won + ?,
                total_lost = total_lost + ?,
                wins = wins + ?,
                losses = losses + ?
            WHERE address = ?""",
            (staked, won, lost, 1 if is_win else 0, 0 if is_win else 1, address),
        )
        await db.commit()
    finally:
        await db.close()


async def get_ladder() -> List[dict]:
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT l.rank, l.holder, l.stake_amount, l.defenses, p.username
            FROM ladder l LEFT JOIN players p ON l.holder = p.address
            ORDER BY l.rank ASC"""
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def set_ladder_position(rank: int, holder: Optional[str], stake_amount: float = 0):
    db = await get_db()
    try:
        await db.execute(
            "UPDATE ladder SET holder = ?, stake_amount = ? WHERE rank = ?",
            (holder, stake_amount, rank),
        )
        await db.commit()
    finally:
        await db.close()


async def increment_defenses(rank: int):
    db = await get_db()
    try:
        await db.execute(
            "UPDATE ladder SET defenses = defenses + 1 WHERE rank = ?", (rank,)
        )
        await db.commit()
    finally:
        await db.close()


async def save_challenge(challenge: dict):
    db = await get_db()
    try:
        await db.execute(
            """INSERT INTO challenges
            (id, challenger, defender, target_rank, stake_amount, outcome,
             server_seed, server_seed_hash, client_seed, roll, payout)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                challenge["id"], challenge["challenger"], challenge.get("defender"),
                challenge["target_rank"], challenge["stake_amount"], challenge["outcome"],
                challenge.get("server_seed"), challenge.get("server_seed_hash"),
                challenge.get("client_seed"), challenge.get("roll"), challenge.get("payout", 0),
            ),
        )
        await db.commit()
    finally:
        await db.close()


async def get_challenge(challenge_id: str) -> Optional[dict]:
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM challenges WHERE id = ?", (challenge_id,))
        row = await cursor.fetchone()
        return dict(row) if row else None
    finally:
        await db.close()


async def get_player_history(address: str, limit: int = 20) -> List[dict]:
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM challenges WHERE challenger = ? ORDER BY created_at DESC LIMIT ?",
            (address, limit),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def get_leaderboard(limit: int = 10) -> List[dict]:
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT address, username, total_won, wins, losses,
            CASE WHEN (wins + losses) > 0 THEN ROUND(CAST(wins AS REAL) / (wins + losses) * 100, 1) ELSE 0 END as win_rate
            FROM players WHERE (wins + losses) > 0
            ORDER BY total_won DESC LIMIT ?""",
            (limit,),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()
