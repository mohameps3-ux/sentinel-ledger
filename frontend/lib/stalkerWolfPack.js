/**
 * Wolf Pack (F3) — client-only aggregation for Wallet Stalker activity.
 *
 * Not a global / cross-device product signal: derived from this browser’s event buffer
 * (e.g. localStorage). Server still emits atomic `wallet-stalk` events.
 *
 * Rule: 2+ distinct watched wallets, same `tokenAddress`, `type` in { buy, swap },
 * all timestamps within `windowMs` of each other (anchored on the newest event in the pair).
 */

/** @typedef {{ kind: 'ATOMIC', event: object }} StalkerAtomicItem */
/** @typedef {{ kind: 'WOLF_PACK', tokenAddress: string, windowStartMs: number, windowEndMs: number, packCount: number, wallets: string[], children: object[] }} StalkerWolfPackItem */
/** @typedef {StalkerAtomicItem | StalkerWolfPackItem} StalkerGroupedItem */

export const WOLF_PACK_WINDOW_MS_DEFAULT = 10 * 60 * 1000;

function isPackableType(type) {
  return type === "buy" || type === "swap";
}

/**
 * @param {object[]} events - raw `wallet-stalk` payloads
 * @param {{ windowMs?: number }} [options]
 * @returns {StalkerGroupedItem[]}
 */
export function groupWolfPackEvents(events, options = {}) {
  const windowMs = Number.isFinite(options.windowMs) && options.windowMs > 0 ? options.windowMs : WOLF_PACK_WINDOW_MS_DEFAULT;
  if (!Array.isArray(events) || !events.length) return [];

  const out = /** @type {StalkerGroupedItem[]} */ ([]);

  const noToken = events.filter((e) => e && !e.tokenAddress);
  for (const ev of noToken) {
    out.push({ kind: "ATOMIC", event: ev });
  }

  const withToken = events.filter((e) => e && e.tokenAddress);

  for (const ev of withToken) {
    if (!isPackableType(String(ev.type || ""))) {
      out.push({ kind: "ATOMIC", event: ev });
    }
  }

  const packable = withToken.filter((e) => isPackableType(String(e.type || "")));
  if (!packable.length) {
    return sortGroupedByRecency(out);
  }

  const byToken = new Map();
  for (const ev of packable) {
    const t = String(ev.tokenAddress);
    if (!byToken.has(t)) byToken.set(t, []);
    byToken.get(t).push(ev);
  }

  for (const [token, list] of byToken) {
    out.push(...greedyPacksForToken(list, windowMs, token));
  }

  return sortGroupedByRecency(out);
}

/**
 * Newest first; window [tHigh - windowMs, tHigh] includes co-buyers.
 * @param {object[]} workMutable - same token, buy/swap only; will be mutated
 */
function greedyPacksForToken(list, windowMs, token) {
  const out = /** @type {StalkerGroupedItem[]} */ ([]);
  const work = list.slice().sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  while (work.length) {
    const tHigh = Number(work[0].timestamp) || 0;
    const tLow = tHigh - windowMs;
    const inWin = work.filter((e) => {
      const ts = Number(e.timestamp) || 0;
      return ts >= tLow && ts <= tHigh;
    });
    const wallets = new Set(inWin.map((e) => e?.wallet).filter(Boolean));
    if (wallets.size >= 2) {
      const tss = inWin.map((e) => Number(e.timestamp) || 0);
      out.push({
        kind: "WOLF_PACK",
        tokenAddress: token,
        windowStartMs: Math.min(...tss),
        windowEndMs: Math.max(...tss),
        packCount: wallets.size,
        wallets: [...wallets].sort(),
        children: inWin
      });
      for (let i = work.length - 1; i >= 0; i -= 1) {
        if (inWin.includes(work[i])) work.splice(i, 1);
      }
    } else {
      out.push({ kind: "ATOMIC", event: work.shift() });
    }
  }
  return out;
}

function sortGroupedByRecency(items) {
  return items.slice().sort((a, b) => {
    const ta = a.kind === "WOLF_PACK" ? a.windowEndMs : Number(a.event?.timestamp) || 0;
    const tb = b.kind === "WOLF_PACK" ? b.windowEndMs : Number(b.event?.timestamp) || 0;
    return tb - ta;
  });
}
