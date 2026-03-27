import sys
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

import asyncio

from config import settings
import database as db
import game_engine
import solana_client
import indexer
from pydantic import BaseModel
from models import ChallengeRequest, WalletVerification

STATIC_DIR = Path(__file__).parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_db()
    print(f"[KOL] Database initialized at {settings.db_path}")
    print(f"[KOL] Serving static files from {STATIC_DIR}")

    # Start on-chain indexer in background
    indexer_task = asyncio.create_task(indexer.run_indexer())
    yield
    indexer_task.cancel()
    try:
        await indexer_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="KOL - King of the Oil Lines", docs_url="/api/docs", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────── Health ────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "game": "KOL - King of the Oil Lines"}


# ──────────────────────────── Token ─────────────────────────────

@app.get("/api/token-info")
async def token_info():
    return await solana_client.get_token_info()


# ──────────────────────────── Wallet ────────────────────────────

@app.post("/api/verify-wallet")
async def verify_wallet(data: WalletVerification):
    # For MVP, trust the client-signed message; full verification with nacl later
    player = await db.get_player(data.address)
    if not player:
        player = await db.create_player(data.address)
    return {"player": player, "verified": True}


@app.get("/api/player/{address}")
async def get_player(address: str):
    player = await db.get_player(address)
    if not player:
        raise HTTPException(404, "Player not found")
    return player


# ──────────────────────────── Game ──────────────────────────────

@app.get("/api/pipeline")
async def get_pipeline():
    return await game_engine.get_ladder_state()


@app.get("/api/challenge/{challenge_id}")
async def get_challenge(challenge_id: str):
    challenge = await db.get_challenge(challenge_id)
    if not challenge:
        raise HTTPException(404, "Challenge not found")
    return challenge


# ──────────────────────────── Sync ────────────────────────────


class SyncTxRequest(BaseModel):
    signature: str


@app.post("/api/sync-tx")
async def sync_tx(req: SyncTxRequest):
    """Immediately sync on-chain state after a frontend transaction."""
    success = await indexer.sync_transaction(req.signature)
    if not success:
        raise HTTPException(500, "Sync failed")
    return {"synced": True, "signature": req.signature}


# ──────────────────────────── Leaderboard ───────────────────────

@app.get("/api/leaderboard")
async def leaderboard():
    return await db.get_leaderboard()


@app.get("/api/history/{address}")
async def player_history(address: str):
    return await db.get_player_history(address)


# ──────────────────────────── Pages ─────────────────────────────

@app.get("/")
async def landing():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/app")
async def game_app():
    return FileResponse(STATIC_DIR / "app.html")


# ──────────────────────────── Static ────────────────────────────

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=True)
