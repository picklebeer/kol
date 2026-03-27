from __future__ import annotations

import time
from typing import Optional, Dict, Tuple, Any

import httpx
from config import settings

_cache: Dict[str, Tuple[float, Any]] = {}


def _get_cached(key: str):
    if key in _cache:
        ts, val = _cache[key]
        if time.time() - ts < settings.cache_ttl_seconds:
            return val
    return None


def _set_cached(key: str, val):
    _cache[key] = (time.time(), val)


async def get_token_supply() -> Optional[float]:
    if not settings.kol_token_mint:
        return None

    cached = _get_cached("supply")
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                settings.solana_rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getTokenSupply",
                    "params": [settings.kol_token_mint],
                },
                timeout=10,
            )
            data = resp.json()
            amount = float(data["result"]["value"]["uiAmount"])
            _set_cached("supply", amount)
            return amount
    except Exception:
        return None


async def get_token_price() -> Optional[float]:
    if not settings.kol_token_mint:
        return None

    cached = _get_cached("price")
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://api.dexscreener.com/latest/dex/tokens/{settings.kol_token_mint}",
                timeout=10,
            )
            data = resp.json()
            pairs = data.get("pairs", [])
            if pairs:
                price = float(pairs[0]["priceUsd"])
                _set_cached("price", price)
                return price
    except Exception:
        return None

    return None


async def get_token_info() -> dict:
    supply = await get_token_supply()
    price = await get_token_price()
    market_cap = supply * price if supply and price else None

    return {
        "name": "KOL",
        "symbol": "KOL",
        "mint": settings.kol_token_mint or "TBD",
        "supply": supply,
        "price": price,
        "market_cap": market_cap,
    }
