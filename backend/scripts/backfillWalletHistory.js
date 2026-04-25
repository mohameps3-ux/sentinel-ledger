#!/usr/bin/env node
"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { randomUUID } = require("crypto");
const { getSupabase } = require("../src/lib/supabase");
const { isProbableSolanaPubkey } = require("../src/lib/solanaAddress");
const {
  fetchDexScreenerTokenPrice,
  pctFromPrices
} = require("../src/services/smartWalletSignalPrices");
const {
  getParsedTransaction,
  parseTokenBalanceDeltas,
  rpcCall
} = require("../src/services/solanaPoller");
const { detectInventoryRoundTrips } = require("../src/services/walletRoundTripDetector");

const SIGNATURE_LIMIT = Math.max(1, Math.min(100, Number(process.env.WALLET_BACKFILL_SIGNATURE_LIMIT || 50)));
const TX_DELAY_MS = Math.max(0, Number(process.env.WALLET_BACKFILL_TX_DELAY_MS || 500));
const WALLET_DELAY_MS = Math.max(0, Number(process.env.WALLET_BACKFILL_WALLET_DELAY_MS || 1500));
const SIGNAL_DEDUPE_MINUTES = Math.max(1, Number(process.env.WALLET_BACKFILL_DEDUPE_MINUTES || 5));
const PRICE_DELAY_MS = Math.max(0, Number(process.env.WALLET_BACKFILL_PRICE_DELAY_MS || 250));

function sleep(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createdMinute(timestampMs) {
  const ms = Number(timestampMs) || Date.now();
  return new Date(Math.floor(ms / 60_000) * 60_000).toISOString();
}

function confidenceFromWallet(row) {
  const smart = Number(row?.smart_score);
  if (Number.isFinite(smart) && smart > 0) return Math.max(1, Math.min(100, Math.round(smart)));
  const win = Number(row?.win_rate);
  if (Number.isFinite(win) && win > 0) return Math.max(1, Math.min(100, Math.round(win)));
  return 50;
}

function dedupeBucket(timestampMs) {
  const sec = Math.floor((Number(timestampMs) || Date.now()) / 1000);
  return Math.floor(sec / (SIGNAL_DEDUPE_MINUTES * 60));
}

async function enrichSignalPrice(row, tx, priceByMint) {
  if (!tx.tokenAddress) return row;
  let spot = priceByMint.get(tx.tokenAddress);
  if (spot === undefined) {
    try {
      spot = await fetchDexScreenerTokenPrice(tx.tokenAddress);
      if (PRICE_DELAY_MS) await sleep(PRICE_DELAY_MS);
    } catch (_) {
      spot = null;
    }
    priceByMint.set(tx.tokenAddress, spot);
  }
  const price = Number(spot?.price);
  if (!Number.isFinite(price) || price <= 0) return row;
  return {
    ...row,
    entry_price_usd: price,
    price_1h_usd: price,
    result_pct: pctFromPrices(price, price)
  };
}

function buildSignalRow(tx, walletRow) {
  const row = {
    id: randomUUID(),
    token_address: tx.tokenAddress,
    wallet_address: tx.wallet,
    last_action: tx.type === "sell" ? "sell" : "buy",
    confidence: confidenceFromWallet(walletRow),
    created_minute: createdMinute(tx.timestamp),
    created_at: new Date(Number(tx.timestamp) || Date.now()).toISOString()
  };
  return row;
}

async function getWallets() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("smart_wallets")
    .select("wallet_address, win_rate, smart_score")
    .order("smart_score", { ascending: false, nullsFirst: false })
    .order("win_rate", { ascending: false, nullsFirst: false });
  if (error) throw error;
  const seen = new Set();
  return (data || []).filter((row) => {
    const wallet = String(row?.wallet_address || "").trim();
    if (!isProbableSolanaPubkey(wallet) || seen.has(wallet)) return false;
    seen.add(wallet);
    return true;
  });
}

async function getSignatures(wallet) {
  const rows = await rpcCall("getSignaturesForAddress", [
    wallet,
    { limit: SIGNATURE_LIMIT, commitment: "confirmed" }
  ]);
  return Array.isArray(rows) ? rows.filter((row) => row?.signature) : [];
}

async function loadExistingKeys(supabase, wallet) {
  const { data, error } = await supabase
    .from("smart_wallet_signals")
    .select("token_address, wallet_address, last_action, created_at")
    .eq("wallet_address", wallet)
    .limit(5000);
  if (error) {
    console.warn(`[backfill] existing signal check skipped for ${wallet}: ${error.message}`);
    return new Set();
  }
  const keys = new Set();
  for (const row of data || []) {
    const at = Date.parse(row.created_at);
    if (!Number.isFinite(at)) continue;
    keys.add(`${row.wallet_address}:${row.token_address}:${row.last_action}:${dedupeBucket(at)}`);
  }
  return keys;
}

function signalKey(row) {
  return `${row.wallet_address}:${row.token_address}:${row.last_action}:${dedupeBucket(Date.parse(row.created_at))}`;
}

async function insertSignals(supabase, rows) {
  if (!rows.length) return 0;
  const { error } = await supabase.from("smart_wallet_signals").insert(rows);
  if (error) {
    console.warn(`[backfill] smart_wallet_signals insert skipped: ${error.message}`);
    return 0;
  }
  return rows.length;
}

function scoreWallet(roundTrip) {
  const metrics = roundTrip?.metrics || {};
  const totalTrades = Number(metrics.closedTrades || 0);
  const profitableTrades = Number(metrics.wins || 0);
  const winRate = Math.round(Number(metrics.winRateObserved || 0) * 10000) / 100;
  const candidateScore = Number(metrics.candidateScore || 0);
  const smartScore = Math.max(0, Math.min(100, Math.round(candidateScore * 100)));
  return {
    totalTrades,
    profitableTrades,
    winRate,
    smartScore,
    pnl30d: Number(metrics.weightedAvgSolPnl || metrics.avgSolPnl || 0),
    avgPositionSize: Number(metrics.totalSolMoved || 0) / Math.max(1, totalTrades),
    recentHits: Math.min(99, profitableTrades),
    rejectionReason: metrics.rejected ? metrics.reason || "rejected" : null,
    openPositions: Number(metrics.openPositions || 0),
    avgCycleDurationHours: Number(metrics.avgCycleDurationHours || 0)
  };
}

async function updateWalletStats(supabase, wallet, stats) {
  const { error } = await supabase
    .from("smart_wallets")
    .update({
      win_rate: stats.winRate,
      smart_score: stats.smartScore,
      total_trades: stats.totalTrades,
      profitable_trades: stats.profitableTrades,
      pnl_30d: stats.pnl30d,
      avg_position_size: stats.avgPositionSize,
      recent_hits: stats.recentHits,
      last_seen: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("wallet_address", wallet);
  if (error) console.warn(`[backfill] smart_wallets update skipped for ${wallet}: ${error.message}`);
}

async function backfillWallet(walletRow, index, total) {
  const supabase = getSupabase();
  const wallet = walletRow.wallet_address;
  let signatures = [];
  try {
    signatures = await getSignatures(wallet);
  } catch (error) {
    console.log(`Wallet ${index}/${total}: found 0 transactions (${wallet}) error=${error.message || error}`);
    return { wallet, signatures: 0, transactions: 0, inserted: 0 };
  }

  const existingKeys = await loadExistingKeys(supabase, wallet);
  const pending = [];
  const priceByMint = new Map();
  let parsedTxs = 0;
  const parsedTransactions = [];

  for (const sig of signatures.reverse()) {
    try {
      const parsed = await getParsedTransaction(sig.signature);
      await sleep(TX_DELAY_MS);
      if (parsed) parsedTransactions.push({ tx: parsed, signature: sig.signature });
      const txs = parseTokenBalanceDeltas(parsed, wallet, sig.signature);
      if (txs.length) parsedTxs += 1;
      for (const tx of txs) {
        const row = await enrichSignalPrice(buildSignalRow(tx, walletRow), tx, priceByMint);
        const key = signalKey(row);
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        pending.push(row);
      }
    } catch (error) {
      console.warn(`[backfill] tx skipped ${wallet} ${sig.signature}: ${error.message || error}`);
      await sleep(TX_DELAY_MS * 2);
    }
  }

  const inserted = await insertSignals(supabase, pending);
  const roundTrip = detectInventoryRoundTrips(parsedTransactions, wallet);
  const stats = scoreWallet(roundTrip);
  await updateWalletStats(supabase, wallet, stats);
  const reason = stats.rejectionReason ? ` rejected=${stats.rejectionReason}` : "";
  console.log(
    `Wallet ${index}/${total}: found ${parsedTxs} transactions (${wallet}) inserted ${inserted} closed_cycles=${stats.totalTrades} wins=${stats.profitableTrades} open=${stats.openPositions}${reason}`
  );
  return { wallet, signatures: signatures.length, transactions: parsedTxs, inserted };
}

async function main() {
  const wallets = await getWallets();
  console.log("[grial v5.0] SPL inventory round-trip detection active");
  console.log(`[backfill] wallets=${wallets.length} signatureLimit=${SIGNATURE_LIMIT} rpc=${process.env.SOLANA_RPC_URL ? "set" : "default"}`);
  let inserted = 0;
  let transactions = 0;
  for (let i = 0; i < wallets.length; i += 1) {
    const result = await backfillWallet(wallets[i], i + 1, wallets.length);
    inserted += result.inserted;
    transactions += result.transactions;
    await sleep(WALLET_DELAY_MS);
  }
  console.log(`[backfill] complete wallets=${wallets.length} transactions=${transactions} inserted=${inserted}`);
}

main().catch((error) => {
  console.error("[backfill] failed:", error?.message || error);
  process.exit(1);
});
