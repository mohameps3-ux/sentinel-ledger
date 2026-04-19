const { TTL_BY_INTENT_MS } = require("./constants");
const { getCached, setCached } = require("./cache");
const { runIntentHandler } = require("./handlers");

function cacheKey(intent, entities) {
  return `nlu:${String(intent || "UNKNOWN")}:${JSON.stringify(entities || {})}`;
}

async function executeIntent(intent, entities = {}) {
  const ttlMs = TTL_BY_INTENT_MS[intent] || 30_000;
  const key = cacheKey(intent, entities);
  const hit = getCached(key);
  if (hit) return { ...hit, meta: { ...(hit.meta || {}), cache: "memory" } };

  const result = await runIntentHandler(intent, entities);
  const output = { ...result, meta: { cache: "miss", ttlMs } };
  if (result?.ok) setCached(key, output, ttlMs);
  return output;
}

module.exports = {
  executeIntent
};

