const MAX_CACHE_ENTRIES = 400;
const store = new Map();

function now() {
  return Date.now();
}

function pruneExpired() {
  const t = now();
  for (const [key, row] of store.entries()) {
    if (!row || row.expiresAt <= t) store.delete(key);
  }
}

function evictIfNeeded() {
  if (store.size < MAX_CACHE_ENTRIES) return;
  const oldest = store.keys().next().value;
  if (oldest) store.delete(oldest);
}

function getCached(key) {
  const row = store.get(key);
  if (!row) return null;
  if (row.expiresAt <= now()) {
    store.delete(key);
    return null;
  }
  return row.value;
}

function setCached(key, value, ttlMs) {
  pruneExpired();
  evictIfNeeded();
  store.set(key, { value, expiresAt: now() + Math.max(5000, Number(ttlMs) || 30_000) });
}

module.exports = {
  getCached,
  setCached
};

