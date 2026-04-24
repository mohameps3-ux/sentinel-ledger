const { getSupabase } = require("../lib/supabase");
const { isMissingColumnError } = require("../lib/columnMissingError");
const { getMarketData } = require("./marketData");

function pctFromPrices(entry, later) {
  const e = Number(entry);
  const l = Number(later);
  if (!Number.isFinite(e) || e <= 0 || !Number.isFinite(l)) return null;
  return Math.round(((l - e) / e) * 1e6) / 1e4;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ageMs(createdAt) {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return 0;
  return Date.now() - t;
}

const SIGNAL_WINDOW_EXTREMA_MS = Math.max(
  1,
  Number(process.env.SIGNAL_PRICE_WINDOW_EXTREMA_MS || 25 * 60 * 60 * 1000)
);
/** Snapshot columns for all price-job queries (keep in sync with DB; migration 016 adds window min/max). */
const SWS_SELECT_FULL =
  "id, token_address, created_at, entry_price_usd, min_price_window_usd, max_price_window_usd, " +
  "price_5m_usd, price_30m_usd, price_1h_usd, price_2h_usd, price_4h_usd, " +
  "result_5m_pct, result_30m_pct, result_2h_pct, result_pct";
/** When 016 is not applied yet, select without window extrema (same row shape minus two columns). */
const SWS_SELECT_NO_WINDOW =
  "id, token_address, created_at, entry_price_usd, " +
  "price_5m_usd, price_30m_usd, price_1h_usd, price_2h_usd, price_4h_usd, " +
  "result_5m_pct, result_30m_pct, result_2h_pct, result_pct";

/**
 * Enriches smart_wallet_signals with spot USD from DexScreener (via getMarketData).
 * Snapshots are taken when the cron runs after the row age crosses 1h / 4h — not exact wall-clock T+1h,
 * but good enough for track-record / win-rate aggregates.
 * Also tracks min/max spot in `min_price_window_usd` / `max_price_window_usd` for ~25h after signal (DEX samples only).
 */
async function runSignalPriceEnrichmentOnce(options = {}) {
  const batch = Number(options.batch || process.env.SIGNAL_PRICE_BATCH || 30);
  const delayMs = Number(options.delayMs || process.env.SIGNAL_PRICE_DEX_DELAY_MS || 200);
  const safeBatch = Number.isFinite(batch) ? Math.min(100, Math.max(1, Math.floor(batch))) : 30;
  const safeDelay = Number.isFinite(delayMs) ? Math.min(2000, Math.max(0, Math.floor(delayMs))) : 200;

  const supabase = getSupabase();
  let selectCols = SWS_SELECT_FULL;
  let windowExtremaEnabled = true;
  {
    const { error: probe } = await supabase.from("smart_wallet_signals").select("min_price_window_usd").limit(1);
    if (probe && isMissingColumnError(probe, "min_price_window_usd")) {
      selectCols = SWS_SELECT_NO_WINDOW;
      windowExtremaEnabled = false;
      console.warn(
        "[signal-prices] min_price_window_usd not in DB (apply migration 016) — price job runs without window extrema"
      );
    } else if (probe) {
      console.warn("[signal-prices] probe min_price_window_usd:", probe.message);
    }
  }
  const now = Date.now();
  const iso1h = new Date(now - 65 * 60 * 1000).toISOString();
  const iso5m = new Date(now - 7 * 60 * 1000).toISOString();
  const iso30m = new Date(now - 35 * 60 * 1000).toISOString();
  const iso2h = new Date(now - (2 * 60 * 60 * 1000 + 10 * 60 * 1000)).toISOString();
  const iso4h = new Date(now - (4 * 60 * 60 * 1000 + 10 * 60 * 1000)).toISOString();

  const { data: needEntry, error: e1 } = await supabase
    .from("smart_wallet_signals")
    .select(selectCols)
    .is("entry_price_usd", null)
    .order("created_at", { ascending: false })
    .limit(safeBatch);
  if (e1) throw e1;

  const { data: need5m, error: e5m } = await supabase
    .from("smart_wallet_signals")
    .select(selectCols)
    .not("entry_price_usd", "is", null)
    .is("price_5m_usd", null)
    .lte("created_at", iso5m)
    .order("created_at", { ascending: false })
    .limit(safeBatch);
  if (e5m) throw e5m;

  const { data: need30m, error: e30m } = await supabase
    .from("smart_wallet_signals")
    .select(selectCols)
    .not("entry_price_usd", "is", null)
    .is("price_30m_usd", null)
    .lte("created_at", iso30m)
    .order("created_at", { ascending: false })
    .limit(safeBatch);
  if (e30m) throw e30m;

  const { data: need1h, error: e2 } = await supabase
    .from("smart_wallet_signals")
    .select(selectCols)
    .not("entry_price_usd", "is", null)
    .is("price_1h_usd", null)
    .lte("created_at", iso1h)
    .order("created_at", { ascending: false })
    .limit(safeBatch);
  if (e2) throw e2;

  const { data: need2h, error: e2h } = await supabase
    .from("smart_wallet_signals")
    .select(selectCols)
    .not("entry_price_usd", "is", null)
    .is("price_2h_usd", null)
    .lte("created_at", iso2h)
    .order("created_at", { ascending: false })
    .limit(safeBatch);
  if (e2h) throw e2h;

  const { data: need4h, error: e3 } = await supabase
    .from("smart_wallet_signals")
    .select(selectCols)
    .not("entry_price_usd", "is", null)
    .is("price_4h_usd", null)
    .lte("created_at", iso4h)
    .order("created_at", { ascending: false })
    .limit(safeBatch);
  if (e3) throw e3;

  const iso26hAgo = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  const { data: needWindow, error: ew } = await supabase
    .from("smart_wallet_signals")
    .select(selectCols)
    .not("entry_price_usd", "is", null)
    .gte("created_at", iso26hAgo)
    .order("created_at", { ascending: false })
    .limit(safeBatch);
  if (ew) throw ew;

  const byId = new Map();
  for (const row of [
    ...(needEntry || []),
    ...(need5m || []),
    ...(need30m || []),
    ...(need1h || []),
    ...(need2h || []),
    ...(need4h || []),
    ...(needWindow || [])
  ]) {
    if (row?.id) {
      const prev = byId.get(row.id);
      if (!prev) byId.set(row.id, row);
    }
  }
  const rows = [...byId.values()];
  if (!rows.length) {
    return { examined: 0, updated: 0, skipped: 0, errors: 0, tokensFetched: 0 };
  }

  const priceByMint = new Map();
  let tokensFetched = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  async function spotForMint(mint) {
    if (!mint || typeof mint !== "string") return null;
    if (priceByMint.has(mint)) return priceByMint.get(mint);
    const md = await getMarketData(mint);
    tokensFetched += 1;
    if (safeDelay) await sleep(safeDelay);
    const p = md && Number.isFinite(Number(md.price)) ? Number(md.price) : null;
    priceByMint.set(mint, p);
    return p;
  }

  for (const row of rows) {
    const mint = row.token_address;
    const spot = await spotForMint(mint);
    if (spot == null || spot <= 0) {
      skipped += 1;
      continue;
    }

    const updates = {};
    const a = ageMs(row.created_at);

    // Never fill entry + 1h snapshot in the same tick (same spot would fake the move).
    if (row.entry_price_usd == null) {
      updates.entry_price_usd = spot;
    } else if (row.price_5m_usd == null && a >= 7 * 60 * 1000) {
      updates.price_5m_usd = spot;
    } else if (row.price_30m_usd == null && a >= 35 * 60 * 1000) {
      updates.price_30m_usd = spot;
    } else if (row.price_1h_usd == null && a >= 65 * 60 * 1000) {
      updates.price_1h_usd = spot;
    } else if (row.price_2h_usd == null && a >= 2 * 60 * 60 * 1000 + 10 * 60 * 1000) {
      updates.price_2h_usd = spot;
    } else if (row.price_4h_usd == null && a >= 4 * 60 * 60 * 1000 + 10 * 60 * 1000) {
      updates.price_4h_usd = spot;
    }

    const entry = updates.entry_price_usd != null ? updates.entry_price_usd : Number(row.entry_price_usd);
    const p5 =
      updates.price_5m_usd != null ? updates.price_5m_usd : row.price_5m_usd != null ? Number(row.price_5m_usd) : null;
    const p30 =
      updates.price_30m_usd != null
        ? updates.price_30m_usd
        : row.price_30m_usd != null
          ? Number(row.price_30m_usd)
          : null;
    const p1 =
      updates.price_1h_usd != null ? updates.price_1h_usd : row.price_1h_usd != null ? Number(row.price_1h_usd) : null;
    const p2 =
      updates.price_2h_usd != null ? updates.price_2h_usd : row.price_2h_usd != null ? Number(row.price_2h_usd) : null;

    if (row.result_5m_pct == null && entry > 0 && p5 != null) {
      const pct5 = pctFromPrices(entry, p5);
      if (pct5 != null) updates.result_5m_pct = pct5;
    }
    if (row.result_30m_pct == null && entry > 0 && p30 != null) {
      const pct30 = pctFromPrices(entry, p30);
      if (pct30 != null) updates.result_30m_pct = pct30;
    }
    if (row.result_pct == null && entry > 0 && p1 != null) {
      const pct = pctFromPrices(entry, p1);
      if (pct != null) updates.result_pct = pct;
    }
    if (row.result_2h_pct == null && entry > 0 && p2 != null) {
      const pct2h = pctFromPrices(entry, p2);
      if (pct2h != null) updates.result_2h_pct = pct2h;
    }

    if (windowExtremaEnabled) {
      if (updates.entry_price_usd != null) {
        updates.min_price_window_usd = spot;
        updates.max_price_window_usd = spot;
      } else {
        const baseEntry = Number(row.entry_price_usd);
        if (Number.isFinite(baseEntry) && baseEntry > 0 && a < SIGNAL_WINDOW_EXTREMA_MS) {
          const haveWindow = row.min_price_window_usd != null && row.max_price_window_usd != null;
          const prevMin = haveWindow ? Number(row.min_price_window_usd) : baseEntry;
          const prevMax = haveWindow ? Number(row.max_price_window_usd) : baseEntry;
          const nMin = Math.min(prevMin, spot);
          const nMax = Math.max(prevMax, spot);
          if (!haveWindow || nMin < prevMin || nMax > prevMax) {
            updates.min_price_window_usd = nMin;
            updates.max_price_window_usd = nMax;
          }
        }
      }
    }

    if (!Object.keys(updates).length) {
      skipped += 1;
      continue;
    }

    const { error: upErr } = await supabase.from("smart_wallet_signals").update(updates).eq("id", row.id);
    if (upErr) {
      errors += 1;
      console.warn("signal price update failed:", row.id, upErr.message);
    } else {
      updated += 1;
    }
  }

  return { examined: rows.length, updated, skipped, errors, tokensFetched: priceByMint.size };
}

module.exports = { runSignalPriceEnrichmentOnce, pctFromPrices };
