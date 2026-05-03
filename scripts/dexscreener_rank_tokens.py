"""
Ad-hoc ranking of DexScreener pairs (liquidity / volume / momentum heuristics).
Requires: pip install requests
Run: python scripts/dexscreener_rank_tokens.py
"""
import math
from datetime import datetime, timezone

import requests

urls = [
    "https://api.dexscreener.com/latest/dex/search/?q=USDT",
    "https://api.dexscreener.com/latest/dex/search/?q=SOL",
    "https://api.dexscreener.com/latest/dex/search/?q=WETH",
]

pairs = []
seen = set()
for u in urls:
    try:
        r = requests.get(u, timeout=20)
        r.raise_for_status()
        data = r.json().get("pairs", []) or []
        for p in data:
            addr = p.get("pairAddress")
            if not addr or addr in seen:
                continue
            seen.add(addr)
            pairs.append(p)
    except Exception:
        pass

cands = []
for p in pairs:
    liq = (p.get("liquidity") or {}).get("usd") or 0
    vol1h = (p.get("volume") or {}).get("h1") or 0
    ch1h = (p.get("priceChange") or {}).get("h1") or 0
    ch5m = (p.get("priceChange") or {}).get("m5") or 0
    buys = (p.get("txns") or {}).get("h1", {}).get("buys") or 0
    sells = (p.get("txns") or {}).get("h1", {}).get("sells") or 0
    mcap = p.get("marketCap") or p.get("fdv") or 0

    if liq < 150000:
        continue
    if vol1h < 80000:
        continue
    if mcap and liq and mcap / liq > 120:
        continue

    net = max(buys - sells, 0)
    tx = max(buys + sells, 1)
    buy_ratio = buys / tx
    momentum_raw = (
        0.45 * max(min(ch5m, 25), -10)
        + 0.55 * max(min(ch1h, 60), -25)
        + 20 * (buy_ratio - 0.5)
    )
    momentum = max(0, min(100, 50 + momentum_raw))

    vr = vol1h / max(liq, 1)
    vol_score = max(0, 100 - abs(vr - 0.8) * 80)

    liq_score = max(0, min(100, (math.log10(max(liq, 1)) - 5) * 50))

    holders_proxy = max(0, min(100, (tx / 120) * 100))
    risk_proxy = 70
    if p.get("labels"):
        risk_proxy += 10
    if p.get("dexId") in {"raydium", "uniswap", "pancakeswap", "aerodrome"}:
        risk_proxy += 10
    risk_proxy = min(risk_proxy, 95)

    score = (
        0.30 * momentum
        + 0.25 * vol_score
        + 0.20 * liq_score
        + 0.15 * holders_proxy
        + 0.10 * risk_proxy
    )
    cands.append(
        {
            "score": round(score, 2),
            "symbol": (p.get("baseToken") or {}).get("symbol") or "N/A",
            "name": (p.get("baseToken") or {}).get("name") or "N/A",
            "chain": p.get("chainId"),
            "dex": p.get("dexId"),
            "url": p.get("url"),
            "liq": liq,
            "vol1h": vol1h,
            "ch1h": ch1h,
            "ch5m": ch5m,
            "buys": buys,
            "sells": sells,
        }
    )

cands = sorted(cands, key=lambda x: x["score"], reverse=True)
print("timestamp_utc", datetime.now(timezone.utc).isoformat())
print("count", len(cands))
for i, c in enumerate(cands[:10], 1):
    print(
        f"{i}|{c['symbol']}|{c['name']}|{c['chain']}|{c['dex']}|{c['score']}|"
        f"{c['liq']:.0f}|{c['vol1h']:.0f}|{c['ch1h']}|{c['ch5m']}|{c['buys']}/{c['sells']}|{c['url']}"
    )
