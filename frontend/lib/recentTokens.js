/**
 * Recent token visits — localStorage with TTL.
 *
 * Tracks every token detail page the user opens, keeping only entries
 * from the last 24h. Powers the left sidebar on /token/[address] so
 * users can quickly jump back to anything they analyzed today.
 *
 * Storage:
 *  - Key: "sentinel-recent-tokens"
 *  - Shape: { [mint]: { mint, viewedAt, symbol, name } }
 *  - TTL:   24h (entries older than this are dropped on every read).
 *
 * Capacity:
 *  - Hard cap of 60 entries (LRU). Anything beyond is evicted on write.
 *
 * SSR-safe: every function returns gracefully when window is undefined.
 */
const STORAGE_KEY = "sentinel-recent-tokens";
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 60;

function safeParse(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    return {};
  } catch {
    return {};
  }
}

function pruneAndSort(map) {
  const now = Date.now();
  const out = [];
  for (const key of Object.keys(map)) {
    const entry = map[key];
    if (!entry || typeof entry !== "object") continue;
    const ts = Number(entry.viewedAt);
    if (!Number.isFinite(ts)) continue;
    if (now - ts > TTL_MS) continue;
    out.push({
      mint: String(entry.mint || key),
      viewedAt: ts,
      symbol: typeof entry.symbol === "string" ? entry.symbol : "",
      name: typeof entry.name === "string" ? entry.name : ""
    });
  }
  out.sort((a, b) => b.viewedAt - a.viewedAt);
  return out;
}

export function readRecentTokens() {
  if (typeof window === "undefined") return [];
  try {
    const map = safeParse(localStorage.getItem(STORAGE_KEY));
    return pruneAndSort(map);
  } catch {
    return [];
  }
}

export function recordRecentToken({ mint, symbol, name }) {
  if (typeof window === "undefined") return;
  if (!mint || typeof mint !== "string" || mint.length < 32) return;
  try {
    const map = safeParse(localStorage.getItem(STORAGE_KEY));
    map[mint] = {
      mint,
      viewedAt: Date.now(),
      symbol: symbol || map[mint]?.symbol || "",
      name: name || map[mint]?.name || ""
    };

    const sorted = pruneAndSort(map);
    if (sorted.length > MAX_ENTRIES) {
      const trimmed = {};
      for (const entry of sorted.slice(0, MAX_ENTRIES)) {
        trimmed[entry.mint] = entry;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      return;
    }

    const compact = {};
    for (const entry of sorted) {
      compact[entry.mint] = entry;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
  } catch {
    /* localStorage quota or disabled — ignore */
  }
}

export function formatRelativeTime(viewedAt) {
  const diff = Date.now() - Number(viewedAt || 0);
  if (!Number.isFinite(diff) || diff < 0) return "—";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

export const RECENT_TOKEN_TTL_HOURS = 24;
export const RECENT_TOKEN_MAX = MAX_ENTRIES;
