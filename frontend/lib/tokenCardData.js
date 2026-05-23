"use strict";

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstFinite(...values) {
  for (const value of values) {
    const n = finiteNumber(value);
    if (n !== null) return n;
  }
  return null;
}

function valueAt(obj, key) {
  if (!obj || typeof obj !== "object") return null;
  return obj[key] ?? null;
}

function tickerFor(sig, tickerByMint) {
  const mint = sig?.mint || sig?.token?.mint || sig?._api?.mint || sig?._api?.tokenAddress;
  if (!mint || !tickerByMint || typeof tickerByMint !== "object") return null;
  return tickerByMint[mint] || null;
}

export function getTokenImage(sig) {
  return (
    sig?.token?.imageUrl ||
    sig?._api?.imageUrl ||
    sig?.imageUrl ||
    sig?.logoURI ||
    null
  );
}

export function getMarketCap(sig) {
  const marketCap = firstFinite(sig?.marketCap, sig?._api?.marketCap);
  if (marketCap !== null) return { value: marketCap, source: "mc" };

  const fdv = firstFinite(sig?.fdv, sig?._api?.fdv);
  if (fdv !== null) return { value: fdv, source: "fdv" };

  const price = firstFinite(sig?.price, sig?.token?.price, sig?._api?.price, sig?._api?.spotPriceUsd);
  const supply = firstFinite(sig?.supply, sig?.token?.supply, sig?._api?.supply);
  if (price !== null && supply !== null) {
    return { value: price * supply, source: "computed" };
  }

  return { value: null, source: null };
}

export function getLiquidity(sig, tickerByMint = {}) {
  const ticker = tickerFor(sig, tickerByMint);
  return firstFinite(
    valueAt(ticker, "liquidity"),
    valueAt(ticker, "liquidityUsd"),
    sig?._api?.liquidity,
    sig?._api?.liquidityUsd,
    sig?.liquidity,
    sig?.liquidityUsd,
    sig?.token?.liquidity
  );
}

export function getVolume24h(sig, tickerByMint = {}) {
  const ticker = tickerFor(sig, tickerByMint);
  return firstFinite(
    valueAt(ticker, "volume24h"),
    valueAt(ticker, "volume"),
    sig?._api?.volume24h,
    sig?._api?.volume,
    sig?.volume24h,
    sig?.volume,
    sig?.token?.volume24h,
    sig?.token?.volume
  );
}

export function getPrice(sig, tickerByMint = {}) {
  const ticker = tickerFor(sig, tickerByMint);
  return firstFinite(
    valueAt(ticker, "price"),
    valueAt(ticker, "priceUsd"),
    sig?._api?.price,
    sig?._api?.priceUsd,
    sig?._api?.spotPriceUsd,
    sig?.price,
    sig?.priceUsd,
    sig?.token?.price
  );
}

export function getChange(sig, window, tickerByMint = {}) {
  const ticker = tickerFor(sig, tickerByMint);
  const keyByWindow = {
    "5m": ["priceChange5m", "change5m"],
    "15m": ["priceChange15m", "change15m"],
    "60m": ["priceChange60m", "change60m", "priceChange1h", "change1h"],
    "24h": ["priceChange24h", "change24h", "spotChange24h", "change"]
  };

  const keys = keyByWindow[window] || [];
  for (const key of keys) {
    const value = firstFinite(
      valueAt(ticker, key),
      sig?._api?.[key],
      sig?.[key],
      sig?.token?.[key]
    );
    if (value !== null) return value;
  }

  return null;
}

export function getActionBucket(sig) {
  const score = Number(sig?.signalStrength ?? sig?.sentinelScore ?? 0);
  const liquidity = Number(sig?._api?.liquidity ?? sig?.liquidity ?? 0);
  const chg24 = Number(sig?._api?.change ?? sig?.change ?? 0);
  const redFlags = Array.isArray(sig?._api?.redFlags) ? sig._api.redFlags : [];

  // RISK takes precedence
  if (redFlags.length > 0) return { key: "RISK", rank: 4 };
  if (liquidity > 0 && liquidity < 15000) return { key: "RISK", rank: 4 };
  if (chg24 < -25) return { key: "RISK", rank: 4 };

  // Then by score
  if (score >= 80) return { key: "BUILD", rank: 1 };
  if (score >= 55) return { key: "WATCH", rank: 2 };
  return { key: "LOW EDGE", rank: 3 };
}
