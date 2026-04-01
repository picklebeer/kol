"""
On-chain indexer: polls Solana for KOL program accounts and syncs to local SQLite.
Runs as a background task inside the FastAPI lifespan.
"""
from __future__ import annotations

import asyncio
import struct
from typing import Optional

import httpx

from config import settings
import database as db

# Program ID — read from settings so it follows the env file
PROGRAM_ID = settings.program_id

# Account discriminators (first 8 bytes of SHA-256("account:<AccountName>"))
# These are pre-computed for Anchor account types
GAME_STATE_DISC = None  # Will be computed on first run
OIL_LINE_DISC = None
PLAYER_DISC = None

POLL_INTERVAL = 15  # seconds


async def fetch_program_accounts(rpc_url: str, program_id: str) -> list:
    """Fetch all accounts owned by the KOL program."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            rpc_url,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getProgramAccounts",
                "params": [
                    program_id,
                    {"encoding": "base64", "commitment": "confirmed"},
                ],
            },
        )
        data = resp.json()
        if "error" in data:
            print(f"[Indexer] RPC error: {data['error']}")
            return []
        return data.get("result", [])


async def fetch_account(rpc_url: str, address: str) -> Optional[dict]:
    """Fetch a single account."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            rpc_url,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getAccountInfo",
                "params": [
                    address,
                    {"encoding": "base64", "commitment": "confirmed"},
                ],
            },
        )
        data = resp.json()
        result = data.get("result", {})
        return result.get("value")


def decode_oil_line(data: bytes) -> Optional[dict]:
    """Decode an OilLine account from raw bytes."""
    if len(data) < 62:  # 8 disc + 1 rank + 32 holder + 8 stake + 4 defenses + 8 claimed_at + 1 bump
        return None

    try:
        # Skip 8-byte discriminator
        rank = data[8]
        holder_bytes = data[9:41]
        holder = None
        # Check if holder is all zeros (unclaimed)
        if holder_bytes != b"\x00" * 32:
            import base58
            holder = base58.b58encode(holder_bytes).decode()

        stake_amount = struct.unpack_from("<Q", data, 41)[0]
        defenses = struct.unpack_from("<I", data, 49)[0]
        claimed_at = struct.unpack_from("<q", data, 53)[0]

        return {
            "rank": rank,
            "holder": holder,
            "stake_amount": stake_amount / 1e6,  # Convert from base units
            "defenses": defenses,
            "claimed_at": claimed_at,
        }
    except Exception as e:
        print(f"[Indexer] Failed to decode OilLine: {e}")
        return None


def decode_player(data: bytes) -> Optional[dict]:
    """Decode a PlayerAccount from raw bytes."""
    if len(data) < 81:  # 8 + 32 + 4 + 4 + 8 + 8 + 8 + 8 + 1
        return None

    try:
        import base58

        authority = base58.b58encode(data[8:40]).decode()
        wins = struct.unpack_from("<I", data, 40)[0]
        losses = struct.unpack_from("<I", data, 44)[0]
        total_won = struct.unpack_from("<Q", data, 48)[0]
        total_staked = struct.unpack_from("<Q", data, 56)[0]
        last_challenge_at = struct.unpack_from("<q", data, 64)[0]
        pending_withdraw = struct.unpack_from("<Q", data, 72)[0]

        return {
            "address": authority,
            "wins": wins,
            "losses": losses,
            "total_won": total_won / 1e6,
            "total_staked": total_staked / 1e6,
            "last_challenge_at": last_challenge_at,
            "pending_withdraw": pending_withdraw / 1e6,
        }
    except Exception as e:
        print(f"[Indexer] Failed to decode Player: {e}")
        return None


async def sync_on_chain_state():
    """One sync cycle: fetch all program accounts and update local DB."""
    try:
        accounts = await fetch_program_accounts(settings.solana_rpc_url, PROGRAM_ID)

        oil_line_count = 0
        player_count = 0

        for acct in accounts:
            import base64

            raw = base64.b64decode(acct["account"]["data"][0])

            # Try to decode as OilLine (check data length)
            oil_line = decode_oil_line(raw)
            if oil_line and 1 <= oil_line["rank"] <= 10:
                await db.set_ladder_position(
                    rank=oil_line["rank"],
                    holder=oil_line["holder"],
                    stake_amount=oil_line["stake_amount"],
                )
                oil_line_count += 1
                continue

            # Try to decode as Player
            player = decode_player(raw)
            if player and player["address"]:
                existing = await db.get_player(player["address"])
                if not existing:
                    await db.create_player(player["address"])
                await db.update_player_stats(
                    address=player["address"],
                    won=player["wins"] > (existing["wins"] if existing else 0),
                    stake_amount=0,
                    payout=0,
                )
                player_count += 1

        if oil_line_count > 0 or player_count > 0:
            print(f"[Indexer] Synced {oil_line_count} oil lines, {player_count} players")

    except Exception as e:
        print(f"[Indexer] Sync error: {e}")


async def sync_transaction(signature: str) -> bool:
    """Immediately sync state after a known on-chain transaction.
    Fetches all program accounts and updates the DB — same as a poll cycle
    but triggered instantly by the frontend after a successful tx."""
    try:
        print(f"[Indexer] Sync triggered for tx: {signature[:16]}...")
        await sync_on_chain_state()
        return True
    except Exception as e:
        print(f"[Indexer] Sync-tx error: {e}")
        return False


async def run_indexer():
    """Background indexer loop."""
    print(f"[Indexer] Starting (poll every {POLL_INTERVAL}s)")
    while True:
        await sync_on_chain_state()
        await asyncio.sleep(POLL_INTERVAL)
