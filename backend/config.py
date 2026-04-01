import os
from pydantic_settings import BaseSettings
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent


class Settings(BaseSettings):
    solana_rpc_url: str = "https://api.devnet.solana.com"
    kol_token_mint: str = "8w48v3SxPqZWBgAWCPf7muTckPu5cP5UvJQ2ta8rt71s"
    host: str = "0.0.0.0"
    port: int = 9000
    env: str = "development"
    secret_key: str = "change-me"
    db_path: str = str(Path(__file__).parent / "kol.db")
    challenge_cooldown_seconds: int = 30
    cache_ttl_seconds: int = 30
    program_id: str = "aEZUE9ooMZ81eMMFppHzsPVYWxhiNMUjf7eDLATDZtT"
    game_enabled: bool = False

    class Config:
        # In production, deploy.sh copies .env.production → .env
        # Locally, use .env.production if ENV=production, else .env
        _prod = PROJECT_ROOT / ".env.production"
        _dev = PROJECT_ROOT / ".env"
        env_file = (
            _prod
            if os.environ.get("ENV", "").lower() == "production" and _prod.exists()
            else _dev
        )


settings = Settings()
