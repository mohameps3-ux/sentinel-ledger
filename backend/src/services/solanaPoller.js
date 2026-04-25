"use strict";

const redis = require("../lib/cache");
const { getSupabase } = require("../lib/supabase");
const { isProbableSolanaPubkey } = require("../lib/solanaAddress");
const { normalizeEvent } = require("../ingestion/sentinelEvent");
const { reserveEventId } = require("../ingestion/dedupe");
const {
  recordRawReceived,
  recordEventEmitted,
  recordSourceError
} = require("../ingestion/ingestionState");
const { evaluate: evaluateScore } = require("../scoring/engine");
const { recordSignalEmission } = require("./signalPerformance");
const { getMarketData } = require("./marketData");
const { evaluateSignalEmission } = require("./signalEmissionGate");
const { buildAlphaLayer } = require("./signalAlphaLayer");
const { trackSmartBuyAndDetect } = require("./convergenceService");

const SOURCE = "solana_rpc_poller";
const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
const DEFAULT_TICK_MS = 30_000;
const DEFAULT_BATCH_SIZE = 5;
const SIGNATURE_LIMIT = 10;
const LAST_SIGNATURE_PREFIX = "solana-poller:last-signature:";
const MARKET_MEMO_TTL_MS = 60_000;
const MARKET_MEMO_MAX = 500;

let intervalRef = null;
let running = false;
let cursor = 0;
const marketMemo = new Map();

function enabled() {
  return (
    String(process.env.HELIUS_CREDITS_EXHAUSTED || "").toLowerCase() === "true" ||
    String(process.env.SOLANA_POLLER_ALWAYS_ON || "").toLowerCase() === "true"
  );
}

function rpcUrl() {
  return process.env.SOLANA_POLLER_RPC_URL || process.env.SOLANA_RPC_URL || DEFAULT_RPC_URL;
}

function tickMs() {
  const raw = Number(process.env.SOLANA_POLLER_TICK_MS || DEFAULT_TICK_MS);
  return Number.isFinite(raw) && raw >= DEFAULT_TICK_MS ? Math.floor(raw) : DEFAULT_TICK_MS;
}

function batchSize() {
  const raw = Number(process.env.SOLANA_POLLER_BATCH_SIZE || DEFAULT_BATCH_SIZE);
  return Number.isFinite(raw) && raw > 0 ? Math.min(20, Math.floor(raw)) : DEFAULT_BATCH_SIZE;
}

async function rpcCall(method, params) {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${SOURCE}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      method,
      params
    })
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.error) {
    const msg = body?.error?.message || `rpc_${method}_${res.status}`;
    throw new Error(msg);
  }
  return body?.result ?? null;
}

async function getTrackedWallets() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("smart_wallets")
    .select("wallet_address")
    .order("smart_score", { ascending: false, nullsFirst: false })
    .order("win_rate", { ascending: false, nullsFirst: false })
    .order("last_seen", { ascending: false, nullsFirst: true })
    .limit(Math.max(25, Number(process.env.SOLANA_POLLER_WALLET_LIMIT || 200)));
  if (error) throw error;
  const seen = new Set();
  return (data || [])
    .map((row) => String(row?.wallet_address || "").trim())
    .filter((wallet) => {
      if (!isProbableSolanaPubkey(wallet) || seen.has(wallet)) return false;
      seen.add(wallet);
      return true;
    });
}

function lastSignatureKey(wallet) {
  return `${LAST_SIGNATURE_PREFIX}${wallet}`;
}

async function getSignatures(wallet) {
  const rows = await rpcCall("getSignaturesForAddress", [
    wallet,
    {
      limit: SIGNATURE_LIMIT,
      commitment: "confirmed"
    }
  ]);
  return Array.isArray(rows) ? rows.filter((row) => row?.signature) : [];
}

async function getParsedTransaction(signature) {
  return rpcCall("getTransaction", [
    signature,
    {
      encoding: "jsonParsed",
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0
    }
  ]);
}

function uiAmount(balance) {
  const raw = balance?.uiTokenAmount;
  const s = raw?.uiAmountString;
  if (s != null && s !== "") {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(raw?.uiAmount);
  return Number.isFinite(n) ? n : 0;
}

function balanceKey(balance) {
  return `${balance?.owner || ""}:${balance?.mint || ""}`;
}

function parseTokenBalanceDeltas(tx, wallet, signature) {
  if (!tx || typeof tx !== "object") return [];
  const meta = tx.meta || {};
  if (meta.err) return [];
  const pre = new Map();
  for (const b of Array.isArray(meta.preTokenBalances) ? meta.preTokenBalances : []) {
    if (b?.owner === wallet && b?.mint) pre.set(balanceKey(b), uiAmount(b));
  }
  const post = new Map();
  for (const b of Array.isArray(meta.postTokenBalances) ? meta.postTokenBalances : []) {
    if (b?.owner === wallet && b?.mint) post.set(balanceKey(b), uiAmount(b));
  }

  const keys = new Set([...pre.keys(), ...post.keys()]);
  const timestamp = (Number(tx.blockTime) || Math.floor(Date.now() / 1000)) * 1000;
  const out = [];
  for (const key of keys) {
    const [owner, mint] = key.split(":");
    if (owner !== wallet || !mint) continue;
    const before = pre.get(key) || 0;
    const after = post.get(key) || 0;
    const delta = after - before;
    if (!Number.isFinite(delta) || Math.abs(delta) <= 0) continue;
    out.push({
      tokenAddress: mint,
      wallet,
      amount: Math.abs(delta),
      signature,
      timestamp,
      type: delta > 0 ? "buy" : "sell",
      slot: Number(tx.slot) || 0,
      blockHash: tx.transaction?.message?.recentBlockhash || ""
    });
  }
  return out;
}

async function getMarketDataMemoized(asset) {
  if (!asset) return null;
  const now = Date.now();
  const hit = marketMemo.get(asset);
  if (hit && hit.expiresAt > now) return hit.value;
  let value = null;
  try {
    value = await getMarketData(asset);
  } catch (_) {
    value = null;
  }
  if (marketMemo.size >= MARKET_MEMO_MAX) {
    const firstKey = marketMemo.keys().next().value;
    if (firstKey !== undefined) marketMemo.delete(firstKey);
  }
  marketMemo.set(asset, { value, expiresAt: now + MARKET_MEMO_TTL_MS });
  return value;
}

function buildScoringContext(market, tokenAmount) {
  const priceUsd = market && Number(market.price) > 0 ? Number(market.price) : null;
  const liquidityUsd =
    market && Number(market.liquidity) > 0 ? Number(market.liquidity) : null;
  const amt = Number(tokenAmount);
  const amountUsd =
    priceUsd != null && Number.isFinite(amt) && amt > 0 ? amt * priceUsd : null;
  const priceChange24h =
    market && Number.isFinite(Number(market.priceChange24h))
      ? Number(market.priceChange24h)
      : null;
  const volume24h =
    market && Number.isFinite(Number(market.volume24h)) ? Number(market.volume24h) : null;
  return { priceUsd, liquidityUsd, amountUsd, priceChange24h, volume24h };
}

async function emitScore(tx, sentinelEvent) {
  const market = await getMarketDataMemoized(tx.tokenAddress);
  const ctx = buildScoringContext(market, tx.amount);
  const score = await evaluateScore(sentinelEvent, ctx);
  if (!score || !global.io) return;
  const alphaLayer = buildAlphaLayer(score, ctx);
  if (alphaLayer) score.meta = { ...(score.meta || {}), alphaLayer };
  const gate = evaluateSignalEmission(score, {
    liquidityUsd: ctx?.liquidityUsd,
    priceChange24h: ctx?.priceChange24h,
    volume24h: ctx?.volume24h
  });
  if (!gate.allow) return;
  score.meta = {
    ...(score.meta || {}),
    emissionGate: {
      passed: true,
      unifiedScore: gate.unifiedScore,
      components: gate.components,
      regime: gate.regime,
      effectiveGate: gate.effectiveGate,
      alphaLayer: score.meta?.alphaLayer || null
    }
  };
  global.io.to(tx.tokenAddress).emit("sentinel:score", score);
  recordSignalEmission(score).catch(() => {});
}

async function emitConvergence(tx) {
  if (!global.io || !(tx.type === "buy" || tx.type === "swap")) return;
  const conv = await trackSmartBuyAndDetect(tx.tokenAddress, tx.wallet, tx.timestamp, tx.type);
  if (conv?.detected) {
    global.io.to(tx.tokenAddress).emit("convergence", {
      tokenAddress: tx.tokenAddress,
      wallets: conv.wallets,
      detectedAt: new Date().toISOString(),
      windowMinutes: conv.windowMinutes
    });
  }
  if (conv?.redPrepare) {
    global.io.to(tx.tokenAddress).emit("coordination:red-signal", {
      redSignal: "RED_PREPARE",
      tokenAddress: tx.tokenAddress,
      detectedAt: conv.redPrepare.detectedAt,
      severity: conv.redPrepare.severity || "ORANGE",
      score: conv.redPrepare.score,
      wallets: conv.redPrepare.wallets,
      clusterKey: conv.redPrepare.clusterKey,
      reason: conv.redPrepare.reason,
      meta: conv.redPrepare.meta || {}
    });
  }
  if (conv?.redAbort) {
    global.io.to(tx.tokenAddress).emit("coordination:red-signal", {
      redSignal: "RED_ABORT",
      tokenAddress: tx.tokenAddress,
      clusterKey: conv.redAbort.clusterKey,
      severity: conv.redAbort.severity || "DIM",
      reason: conv.redAbort.reason,
      detectedAt: conv.redAbort.detectedAt
    });
  }
  if (conv?.redAlert) {
    const confirmPayload = {
      redSignal: "RED_CONFIRM",
      tokenAddress: tx.tokenAddress,
      detectedAt: conv.redAlert.detectedAt,
      severity: conv.redAlert.severity || "RED",
      score: conv.redAlert.score,
      wallets: conv.redAlert.wallets,
      clusterKey: conv.redAlert.clusterKey,
      latencyFromDeployMin: conv.redAlert.latencyFromDeployMin,
      reason: conv.redAlert.reason,
      meta: conv.redAlert.meta || {}
    };
    global.io.to(tx.tokenAddress).emit("coordination:red-signal", confirmPayload);
    global.io.to(tx.tokenAddress).emit("coordination:red-alert", confirmPayload);
  }
}

async function emitTransaction(tx, logIndex) {
  if (!tx.tokenAddress || !global.io) return false;
  recordRawReceived(SOURCE);
  const startedAt = Date.now();
  let sentinelEvent = null;
  try {
    sentinelEvent = normalizeEvent(
      {
        network: "solana",
        type: tx.type === "buy" || tx.type === "sell" || tx.type === "swap" ? "SWAP" : "TRANSFER",
        source: SOURCE,
        signature: tx.signature,
        blockNumber: tx.slot || 0,
        blockHash: tx.blockHash || "",
        logIndex,
        timestamp: tx.timestamp,
        data: {
          actor: tx.wallet,
          asset: tx.tokenAddress,
          amount: String(tx.amount ?? "0")
        },
        metadata: { confidence: 0.8, labels: [tx.type, "rpc-poll"].filter(Boolean) }
      },
      { processingStartedAt: startedAt }
    );
  } catch (e) {
    recordSourceError(SOURCE, e);
  }
  if (sentinelEvent) {
    const r = await reserveEventId(sentinelEvent.id);
    if (r.duplicate) return false;
  }
  global.io.to(tx.tokenAddress).emit("transaction", tx);
  if (sentinelEvent) {
    global.io.to(tx.tokenAddress).emit("sentinel:event", sentinelEvent);
    recordEventEmitted(sentinelEvent, Date.now() - startedAt);
    emitScore(tx, sentinelEvent).catch(() => {});
  }
  await emitConvergence(tx);
  return true;
}

async function processWallet(wallet) {
  const signatures = await getSignatures(wallet);
  if (!signatures.length) return { wallet, seen: 0, emitted: 0 };
  const lastKnown = await redis.get(lastSignatureKey(wallet));
  const latest = signatures[0]?.signature;
  const candidates = [];
  for (const row of signatures) {
    if (lastKnown && row.signature === lastKnown) break;
    candidates.push(row.signature);
  }
  if (!lastKnown && latest) {
    await redis.set(lastSignatureKey(wallet), latest);
  }
  let emitted = 0;
  let logIndex = 0;
  for (const signature of candidates.reverse()) {
    const parsed = await getParsedTransaction(signature);
    const txs = parseTokenBalanceDeltas(parsed, wallet, signature);
    for (const tx of txs) {
      if (await emitTransaction(tx, logIndex)) emitted += 1;
      logIndex += 1;
    }
    await redis.set(lastSignatureKey(wallet), signature);
  }
  return { wallet, seen: candidates.length, emitted };
}

async function runSolanaPollerTick() {
  if (running) return { skipped: true, reason: "already_running" };
  running = true;
  try {
    const wallets = await getTrackedWallets();
    if (!wallets.length) return { ok: true, wallets: 0, emitted: 0 };
    if (cursor >= wallets.length) cursor = 0;
    const size = batchSize();
    const batch = wallets.slice(cursor, cursor + size);
    if (batch.length < size && wallets.length > batch.length) {
      batch.push(...wallets.slice(0, size - batch.length));
    }
    cursor = (cursor + size) % wallets.length;

    let emitted = 0;
    for (const wallet of batch) {
      try {
        const result = await processWallet(wallet);
        emitted += Number(result?.emitted || 0);
      } catch (e) {
        console.warn(`[solana-poller] wallet skipped ${wallet}:`, e?.message || e);
      }
    }
    if (emitted > 0) console.log(`[solana-poller] emitted=${emitted} wallets=${batch.length}`);
    return { ok: true, wallets: batch.length, emitted };
  } finally {
    running = false;
  }
}

function startSolanaPoller() {
  if (intervalRef) return;
  if (!enabled()) {
    console.log("[solana-poller] disabled (set HELIUS_CREDITS_EXHAUSTED=true or SOLANA_POLLER_ALWAYS_ON=true)");
    return;
  }
  console.log(`[solana-poller] enabled rpc=${rpcUrl()} tickMs=${tickMs()} batchSize=${batchSize()}`);
  runSolanaPollerTick().catch((e) => console.warn("[solana-poller] bootstrap tick:", e?.message || e));
  intervalRef = setInterval(() => {
    runSolanaPollerTick().catch((e) => console.warn("[solana-poller] scheduled tick:", e?.message || e));
  }, tickMs());
}

module.exports = {
  getParsedTransaction,
  parseTokenBalanceDeltas,
  processWallet,
  rpcCall,
  runSolanaPollerTick,
  startSolanaPoller
};
