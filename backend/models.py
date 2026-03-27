from pydantic import BaseModel
from typing import Optional
from enum import Enum


class ChallengeOutcome(str, Enum):
    WIN = "win"
    LOSE = "lose"
    PENDING = "pending"


class TokenInfo(BaseModel):
    name: str = "KOL"
    symbol: str = "KOL"
    mint: str = ""
    supply: Optional[float] = None
    price: Optional[float] = None
    market_cap: Optional[float] = None


class Player(BaseModel):
    address: str
    username: Optional[str] = None
    total_staked: float = 0.0
    total_won: float = 0.0
    total_lost: float = 0.0
    wins: int = 0
    losses: int = 0
    ladder_position: Optional[int] = None
    created_at: Optional[str] = None


class LadderPosition(BaseModel):
    rank: int
    holder: Optional[str] = None
    stake_amount: float = 0.0
    defenses: int = 0
    min_challenge_stake: float = 0.0


class ChallengeRequest(BaseModel):
    challenger: str
    target_rank: int
    stake_amount: float
    client_seed: str


class ChallengeResult(BaseModel):
    challenge_id: str
    challenger: str
    defender: Optional[str] = None
    target_rank: int
    stake_amount: float
    outcome: ChallengeOutcome
    server_seed: Optional[str] = None
    server_seed_hash: str = ""
    client_seed: str = ""
    roll: Optional[int] = None
    payout: float = 0.0


class LeaderboardEntry(BaseModel):
    rank: int
    address: str
    username: Optional[str] = None
    total_won: float = 0.0
    wins: int = 0
    win_rate: float = 0.0


class WalletVerification(BaseModel):
    address: str
    message: str
    signature: str
