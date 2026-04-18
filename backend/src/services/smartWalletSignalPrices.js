const { getSupabase } = require("../lib/supabase");
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

/**
 * Enriches smart_wallet_signals with spot USD from DexScreener (via getMarketData).
 * Snapshots are taken when the cron runs after the row age crosses 1h / 4h — not exact wall-clock T+1h,
 * but good enough for track-record / win-rate aggregates.
 */
async function runSignalPriceEnrichmentOnce(options = {}) {
  const batch = Number(options.batch || process.env.SIGNAL_PRICE_BATCH || 30);
  const delayMs = Number(options.delayMs || process.env.SIGNAL_PRICE_DEX_DELAY_MS || 200);
  const safeBatch = Number.isFinite(batch) ? Math.min(100, Math.max(1, Math.floor(batch))) : 30;
  const safeDelay = Number.isFinite(delayMs) ? Math.min(2000, Math.max(0, Math.floor(delayMs))) : 200;

  const supabase = getSupabase();
  const now = Date.now();
  const iso1h = new Date(now - 65 * 60 * 1000).toISOString();
  const iso4h = new Date(now - (4 * 60 * 60 * 1000 + 10 * 60 * 1000)).toISOString();

  const { data: needEntry, error: e1 } = await supabase
    .from("smart_wallet_signals")
    .select("id, token_address, created_at, entry_price_usd, price_1h_usd, price_4h_usd, result_pct")
    .is("entry_price_usd", null)
    .order("created_at", { ascending: false })
    .limit(safeBatch);
  if (e1) throw e1;

  const { data: need1h, error: e2 } = await supabase
    .from("smart_wallet_signals")
    .select("id, token_address, created_at, entry_price_usd, price_1h_usd, price_4h_usd, result_pct")
    .not("entry_price_usd", "is", null)
    .is("price_1h_usd", null)
    .lte("created_at", iso1h)
    .order("created_at", { ascending: false })
    .limit(safeBatch);
  if (e2) throw e2;

  const { data: need4h, error: e3 } = await supabase
    .from("smart_wallet_signals")
    .select("id, token_address, created_at, entry_price_usd, price_1h_usd, price_4h_usd, result_pct")
    .not("entry_price_usd", "is", null)
    .is("price_4h_usd", null)
    .lte("created_at", iso4h)
    .order("created_at", { ascending: false })
    .limit(safeBatch);
  if (e3) throw e3;

  const byId = new Map();
  for (const row of [...(needEntry || []), ...(need1h || []), ...(need4h || [])]) {
    if (row?.id) byId.set(row.id, row);
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
    } else if (row.price_1h_usd == null && a >= 65 * 60 * 1000) {
      updates.price_1h_usd = spot;
    } else if (row.price_4h_usd == null && a >= 4 * 60 * 60 * 1000 + 10 * 60 * 1000) {
      updates.price_4h_usd = spot;
    }

    const entry = updates.entry_price_usd != null ? updates.entry_price_usd : Number(row.entry_price_usd);
    const p1 =
      updates.price_1h_usd != null ? updates.price_1h_usd : row.price_1h_usd != null ? Number(row.price_1h_usd) : null;
    if (row.result_pct == null && entry > 0 && p1 != null) {
      const pct = pctFromPrices(entry, p1);
      if (pct != null) updates.result_pct = pct;
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
