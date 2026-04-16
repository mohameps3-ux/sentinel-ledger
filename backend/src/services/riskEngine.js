const redis = require("../lib/cache");
const { getTokenSecurity, getHolderConcentration } = require("./onChainService");

const RISK_CACHE_TTL_SECONDS = 600;

async function cacheSetJson(key, ttlSeconds, value) {
  return redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
}

async function getAnalysis(address, marketData) {
  const cacheKey = `risk:${address}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  const [security, holders] = await Promise.all([
    getTokenSecurity(address),
    getHolderConcentration(address)
  ]);

  let score = 100;
  const pros = [];
  const cons = [];

  if (security.mintEnabled) {
    score = 0;
    cons.push("Mint authority enabled (can create new tokens)");
  }
  if (security.freezeEnabled) {
    score = 0;
    cons.push("Freeze authority enabled (can lock funds)");
  }

  if (score > 0) {
    if (marketData.lpLocked) {
      pros.push(`LP locked ${marketData.lpLockDuration || "?"} days`);
    } else {
      cons.push("Liquidity not locked (dev can withdraw)");
      score -= 30;
    }

    if (holders.top10Percentage > 40) {
      cons.push(
        `High holder concentration (top 10 own ${holders.top10Percentage.toFixed(1)}%)`
      );
      score -= 25;
    } else if (holders.top10Percentage > 20) {
      cons.push(`Top 10 concentration ${holders.top10Percentage.toFixed(1)}%`);
      score -= 10;
    } else {
      pros.push(`Low holder concentration (${holders.top10Percentage.toFixed(1)}%)`);
    }

    if (marketData.liquidity < 10000) {
      cons.push(`Low liquidity ($${marketData.liquidity.toLocaleString()})`);
      score -= 20;
    } else {
      pros.push(`High liquidity ($${marketData.liquidity.toLocaleString()})`);
    }
  }

  score = Math.min(100, Math.max(0, score));
  let grade = "F";
  if (score >= 90) grade = "A+";
  else if (score >= 80) grade = "A";
  else if (score >= 70) grade = "B";
  else if (score >= 55) grade = "C";
  else if (score >= 40) grade = "D";
  else grade = "F";

  const result = { grade, confidence: score, pros, cons, lastChecked: Date.now() };
  await cacheSetJson(cacheKey, RISK_CACHE_TTL_SECONDS, result);
  return result;
}

module.exports = { getAnalysis };

