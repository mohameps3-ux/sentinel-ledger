"use strict";

const axios = require("axios");
const { getSupabase } = require("../lib/supabase");

const FLIPSIDE_BASE_URL = "https://api-v2.flipsidecrypto.xyz/json-rpc";
const DEFAULT_QUERY_TIMEOUT_MS = Math.max(30_000, Number(process.env.FLIPSIDE_QUERY_TIMEOUT_MS || 8 * 60_000));
const DEFAULT_POLL_MS = Math.max(1_000, Number(process.env.FLIPSIDE_POLL_MS || 5_000));
const DEFAULT_PAGE_SIZE = Math.max(10, Math.min(1000, Number(process.env.FLIPSIDE_PAGE_SIZE || 100)));

const TOP_SOLANA_TRADERS_SQL = `
SELECT 
  swapper as wallet_address,
  COUNT(*) as total_trades,
  SUM(CASE WHEN amount_out_usd > amount_in_usd THEN 1 ELSE 0 END) as wins,
  ROUND(100.0 * SUM(CASE WHEN amount_out_usd > amount_in_usd THEN 1 ELSE 0 END) / COUNT(*), 2) as win_rate,
  ROUND(AVG((amount_out_usd - amount_in_usd) / NULLIF(amount_in_usd, 0) * 100), 2) as avg_return_pct,
  MAX(block_timestamp) as last_active
FROM solana.defi.fact_swaps
WHERE block_timestamp >= DATEADD('day', -30, CURRENT_DATE)
  AND amount_in_usd > 10
  AND amount_in_usd < 50000
GROUP BY swapper
HAVING COUNT(*) >= 20
  AND win_rate >= 65
ORDER BY win_rate DESC, total_trades DESC
LIMIT 100
`;

function flipsideApiKey() {
  const key = String(process.env.FLIPSIDE_API_KEY || "").trim();
  if (!key || key === "your_flipside_key_here") return "";
  return key;
}

function isFlipsideConfigured() {
  return Boolean(flipsideApiKey());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRow(row) {
  if (!row || typeof row !== "object") return null;
  const wallet = String(row.wallet_address || row.WALLET_ADDRESS || row.swapper || row.SWAPPER || "").trim();
  if (!wallet) return null;
  const totalTrades = Math.max(0, Math.round(clampNumber(row.total_trades ?? row.TOTAL_TRADES)));
  const wins = Math.max(0, Math.round(clampNumber(row.wins ?? row.WINS)));
  const winRate = Math.max(0, Math.min(100, clampNumber(row.win_rate ?? row.WIN_RATE)));
  const avgReturnPct = clampNumber(row.avg_return_pct ?? row.AVG_RETURN_PCT);
  const lastActiveRaw = row.last_active ?? row.LAST_ACTIVE;
  const lastActive = lastActiveRaw && Number.isFinite(Date.parse(lastActiveRaw)) ? new Date(lastActiveRaw).toISOString() : null;
  return {
    wallet_address: wallet,
    total_trades: totalTrades,
    profitable_trades: wins,
    win_rate: Number(winRate.toFixed(2)),
    avg_return_pct: Number(avgReturnPct.toFixed(4)),
    pnl_30d: Number(avgReturnPct.toFixed(2)),
    recent_hits: wins,
    smart_score: Number(Math.min(100, Math.max(0, winRate)).toFixed(2)),
    source: "flipside",
    flipside_last_active: lastActive,
    last_seen: lastActive || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function extractQueryRunId(data) {
  return (
    data?.result?.queryId ||
    data?.queryId ||
    data?.result?.queryRun?.id ||
    data?.result?.queryRunId ||
    data?.result?.id ||
    data?.queryRunId ||
    data?.id ||
    null
  );
}

function extractRows(data) {
  const candidates = [
    data?.result?.records,
    data?.records,
    data?.result?.rows,
    data?.result?.data?.rows,
    data?.result?.queryRun?.rows,
    data?.rows
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    if (candidate.length && Array.isArray(candidate[0])) {
      const columns = data?.result?.columns || data?.columns || [];
      return candidate.map((row) => {
        const out = {};
        columns.forEach((col, idx) => {
          out[col] = row[idx];
        });
        return out;
      });
    }
    return candidate;
  }
  return [];
}

function extractState(data) {
  return String(
      data?.result?.status ||
      data?.status ||
      data?.result?.queryRun?.state ||
      data?.result?.state ||
      data?.state ||
      ""
  ).toUpperCase();
}

async function flipsideRpc(method, params) {
  const apiKey = flipsideApiKey();
  if (!apiKey) throw new Error("flipside_api_key_missing");
  const { data } = await axios.post(
    FLIPSIDE_BASE_URL,
    {
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params
    },
    {
      timeout: 30_000,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey
      }
    }
  );
  if (data?.error) throw new Error(data.error?.message || "flipside_rpc_error");
  return data;
}

async function createQueryRun(sql = TOP_SOLANA_TRADERS_SQL) {
  const query = {
    sql,
    ttlMinutes: 60,
    maxAgeMinutes: 60,
    dataSource: "snowflake-default",
    dataProvider: "flipside"
  };
  let data;
  try {
    data = await flipsideRpc("query.run", query);
  } catch (error) {
    data = await flipsideRpc("createQueryRun", [query]);
  }
  const queryRunId = extractQueryRunId(data);
  if (!queryRunId) throw new Error("flipside_query_run_id_missing");
  return queryRunId;
}

async function getQueryRunResults(queryRunId, pageNumber = 1, pageSize = DEFAULT_PAGE_SIZE) {
  const queryParams = { queryRunId, pageNumber, pageSize };
  try {
    return await flipsideRpc("query.getQueryResults", queryParams);
  } catch (error) {
    return flipsideRpc("getQueryRunResults", [
      {
        queryRunId,
        page: { number: pageNumber, size: pageSize }
      }
    ]);
  }
}

async function fetchTopSolanaTraders() {
  const started = Date.now();
  const queryRunId = await createQueryRun();
  let lastState = "UNKNOWN";
  while (Date.now() - started < DEFAULT_QUERY_TIMEOUT_MS) {
    const data = await getQueryRunResults(queryRunId);
    const state = extractState(data);
    lastState = state || lastState;
    const rows = extractRows(data);
    if (rows.length && (!state || ["FINISHED", "QUERY_STATE_SUCCESS", "SUCCESS"].includes(state))) {
      return rows.map(normalizeRow).filter(Boolean);
    }
    if (["FAILED", "CANCELED", "CANCELLED"].includes(state)) {
      throw new Error(`flipside_query_${state.toLowerCase()}`);
    }
    await sleep(DEFAULT_POLL_MS);
  }
  throw new Error(`flipside_query_timeout_${lastState.toLowerCase()}`);
}

async function syncFlipsideSmartWallets() {
  if (!isFlipsideConfigured()) {
    return { ok: false, reason: "flipside_api_key_missing", fetched: 0, inserted: 0, updated: 0 };
  }
  const supabase = getSupabase();
  const wallets = await fetchTopSolanaTraders();
  if (!wallets.length) return { ok: true, fetched: 0, inserted: 0, updated: 0 };

  const addresses = wallets.map((w) => w.wallet_address);
  const { data: existing, error: existingError } = await supabase
    .from("smart_wallets")
    .select("wallet_address")
    .in("wallet_address", addresses);
  if (existingError) throw new Error(`smart_wallets_lookup_failed:${existingError.message}`);
  const existingSet = new Set((existing || []).map((row) => row.wallet_address));

  const { error } = await supabase.from("smart_wallets").upsert(wallets, { onConflict: "wallet_address" });
  if (error) throw new Error(`smart_wallets_upsert_failed:${error.message}`);

  const inserted = wallets.filter((w) => !existingSet.has(w.wallet_address)).length;
  return {
    ok: true,
    fetched: wallets.length,
    inserted,
    updated: wallets.length - inserted
  };
}

module.exports = {
  TOP_SOLANA_TRADERS_SQL,
  isFlipsideConfigured,
  fetchTopSolanaTraders,
  syncFlipsideSmartWallets,
  _normalizeRow: normalizeRow
};
