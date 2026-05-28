"use strict";

const WebSocket = require("ws");
const axios = require("axios");
const { getSupabase } = require("../lib/supabase");
const { fetchLeaderboardWalletAddresses } = require("../lib/smartWalletLeaderboardPool");

const BIRDEYE_BASE = "https://public-api.birdeye.so";
const BIRDEYE_WS_BASE = "wss://public-api.birdeye.so/socket/solana";
const BACKFILL_LIMIT = Math.min(50, Math.max(5, Number(process.env.BIRDEYE_TX_BACKFILL_LIMIT || 30)));
const SMART_WALLET_POOL_LIMIT = Math.min(100, Math.max(20, Number(process.env.BIRDEYE_SMART_WALLET_POOL_LIMIT || 100)));
const SMART_WALLET_REFRESH_MS = Math.max(60_000, Number(process.env.BIRDEYE_SMART_WALLET_REFRESH_MS || 300_000));
const RECONNECT_BASE_MS = Math.max(500, Number(process.env.BIRDEYE_TX_RECONNECT_BASE_MS || 1000));
const RECONNECT_MAX_MS = Math.max(RECONNECT_BASE_MS, Number(process.env.BIRDEYE_TX_RECONNECT_MAX_MS || 30_000));
const REST_TIMEOUT_MS = Math.max(3000, Number(process.env.BIRDEYE_TX_REST_TIMEOUT_MS || 12_000));
const DEDUPE_MAX = 600;

/** @type {Set<string>} */
let smartWalletSet = new Set();
let smartWalletLoadedAt = 0;
let smartWalletRefreshTimer = null;

/** @type {Map<string, { refCount: number, ws: import("ws")|null, reconnectTimer: NodeJS.Timeout|null, reconnectAttempt: number, dedupe: Set<string>, backfilled: boolean }>} */
const mintSessions = new Map();

function birdeyeKey() {
  return String(process.env.BIRDEYE_API_KEY || "").trim();
}

function tapeEnabled() {
  return Boolean(birdeyeKey());
}

function birdeyeHeaders() {
  return {
    "X-API-KEY": birdeyeKey(),
    "x-chain": "solana"
  };
}

async function refreshSmartWalletSet() {
  try {
    const supabase = getSupabase();
    const addresses = await fetchLeaderboardWalletAddresses(supabase, { limit: SMART_WALLET_POOL_LIMIT });
    smartWalletSet = new Set(addresses);
    smartWalletLoadedAt = Date.now();
  } catch (e) {
    console.warn("[birdeye-tape] smart wallet refresh failed:", e?.message || e);
  }
}

function isSmartMoney(owner) {
  const wallet = String(owner || "").trim();
  if (!wallet) return false;
  return smartWalletSet.has(wallet);
}

function legForMint(data, mint) {
  const from = data?.from;
  const to = data?.to;
  if (from?.address === mint) return from;
  if (to?.address === mint) return to;
  if (data?.quote?.address === mint) return data.quote;
  if (data?.base?.address === mint) return data.base;
  return null;
}

function normalizeSide(rawSide) {
  const side = String(rawSide || "").toLowerCase();
  if (side === "buy" || side === "sell") return side;
  if (side === "swap") return "swap";
  return side || "swap";
}

function normalizeBirdeyeTx(raw, mint, { backfill = false } = {}) {
  if (!raw || !mint) return null;
  const tokenAddress = String(raw.tokenAddress || mint).trim();
  const wallet = String(raw.owner || "").trim();
  const signature = String(raw.txHash || raw.signature || "").trim();
  const blockUnixTime = Number(raw.blockUnixTime || raw.block_unix_time || 0);
  const timestamp = blockUnixTime > 0 ? blockUnixTime * 1000 : Date.now();
  const side = normalizeSide(raw.side);
  const type = side === "buy" || side === "sell" ? side : side;
  const leg = legForMint(raw, tokenAddress);
  const tokenUi = leg ? Math.abs(Number(leg.uiChangeAmount ?? leg.uiAmount ?? 0)) : 0;
  let amountUsd = Number(raw.volumeUSD ?? raw.volume_usd ?? 0);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    const from = raw.from;
    const to = raw.to;
    const candidates = [from, to, raw.quote, raw.base].filter(Boolean);
    for (const c of candidates) {
      const ui = Math.abs(Number(c.uiChangeAmount ?? c.uiAmount ?? 0));
      const px = Number(c.price ?? c.nearestPrice ?? 0);
      if (ui > 0 && px > 0) {
        amountUsd = ui * px;
        break;
      }
    }
  }
  const amount = Number.isFinite(tokenUi) && tokenUi > 0 ? tokenUi : amountUsd > 0 ? amountUsd : 0;
  if (!wallet || !signature) return null;

  return {
    tokenAddress,
    wallet,
    amount,
    amountUsd: Number.isFinite(amountUsd) && amountUsd > 0 ? amountUsd : null,
    signature,
    timestamp,
    type,
    side,
    dex: String(raw.source || raw.dex || "").trim() || null,
    isSmartMoney: isSmartMoney(wallet),
    source: backfill ? "birdeye-backfill" : "birdeye"
  };
}

function emitTransaction(mint, tx) {
  if (!global.io || !tx?.signature) return;
  const session = mintSessions.get(mint);
  if (!session) return;
  if (session.dedupe.has(tx.signature)) return;
  session.dedupe.add(tx.signature);
  if (session.dedupe.size > DEDUPE_MAX) {
    session.dedupe = new Set([...session.dedupe].slice(-Math.floor(DEDUPE_MAX / 2)));
  }
  global.io.to(mint).emit("transaction", tx);
}

async function backfillMint(mint) {
  const session = mintSessions.get(mint);
  if (!session || session.backfilled) return;
  session.backfilled = true;

  try {
    const { data, status } = await axios.get(`${BIRDEYE_BASE}/defi/txs/token`, {
      params: {
        address: mint,
        limit: BACKFILL_LIMIT,
        offset: 0,
        tx_type: "swap",
        sort_type: "desc",
        ui_amount_mode: "scaled"
      },
      headers: birdeyeHeaders(),
      timeout: REST_TIMEOUT_MS,
      validateStatus: () => true
    });
    if (status !== 200 || !data?.success) {
      console.warn("[birdeye-tape] backfill failed", { mint: mint.slice(0, 8), status, message: data?.message });
      return;
    }
    const items = Array.isArray(data?.data?.items) ? data.data.items : [];
    const normalized = items
      .map((item) => normalizeBirdeyeTx(item, mint, { backfill: true }))
      .filter(Boolean)
      .reverse();
    for (const tx of normalized) {
      emitTransaction(mint, tx);
    }
    if (normalized.length) {
      console.log(`[birdeye-tape] backfill ${normalized.length} txs for ${mint.slice(0, 8)}…`);
    }
  } catch (e) {
    console.warn("[birdeye-tape] backfill error:", e?.message || e);
  }
}

function subscribeMessage(mint) {
  return JSON.stringify({
    type: "SUBSCRIBE_TXS",
    data: {
      queryType: "simple",
      address: mint,
      txsType: "swap"
    }
  });
}

function scheduleReconnect(mint) {
  const session = mintSessions.get(mint);
  if (!session || session.refCount <= 0) return;
  if (session.reconnectTimer) return;

  const attempt = session.reconnectAttempt + 1;
  session.reconnectAttempt = attempt;
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(attempt - 1, 5));
  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = null;
    if (session.refCount > 0) {
      connectMintWs(mint);
    }
  }, delay);
}

function teardownMintWs(mint) {
  const session = mintSessions.get(mint);
  if (!session) return;
  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }
  if (session.ws) {
    try {
      session.ws.removeAllListeners();
      session.ws.close();
    } catch (_) {
      /* ignore */
    }
    session.ws = null;
  }
}

function connectMintWs(mint) {
  if (!tapeEnabled()) return;
  const session = mintSessions.get(mint);
  if (!session || session.refCount <= 0) return;

  teardownMintWs(mint);
  const key = birdeyeKey();
  const url = `${BIRDEYE_WS_BASE}?x-api-key=${encodeURIComponent(key)}`;
  const ws = new WebSocket(url, "echo-protocol", {
    headers: {
      Origin: "ws://public-api.birdeye.so",
      "Sec-WebSocket-Origin": "ws://public-api.birdeye.so",
      "Sec-WebSocket-Protocol": "echo-protocol"
    }
  });
  session.ws = ws;

  ws.on("open", () => {
    session.reconnectAttempt = 0;
    ws.send(subscribeMessage(mint));
  });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    const type = String(msg?.type || "");
    if (type === "ERROR" || type === "error") {
      console.warn("[birdeye-tape] ws error frame:", msg?.data || msg?.message || msg);
      return;
    }
    if (type !== "TXS_DATA") return;
    const tx = normalizeBirdeyeTx(msg.data, mint, { backfill: false });
    if (tx) emitTransaction(mint, tx);
  });

  ws.on("close", () => {
    if (session.ws === ws) session.ws = null;
    if (session.refCount > 0) scheduleReconnect(mint);
  });

  ws.on("error", (err) => {
    console.warn("[birdeye-tape] ws error:", err?.message || err);
  });
}

function ensureSession(mint) {
  let session = mintSessions.get(mint);
  if (!session) {
    session = {
      refCount: 0,
      ws: null,
      reconnectTimer: null,
      reconnectAttempt: 0,
      dedupe: new Set(),
      backfilled: false
    };
    mintSessions.set(mint, session);
  }
  return session;
}

function onTokenRoomJoin(mint) {
  if (!tapeEnabled()) return;
  const address = String(mint || "").trim();
  if (!address) return;

  const session = ensureSession(address);
  session.refCount += 1;
  if (session.refCount === 1) {
    if (Date.now() - smartWalletLoadedAt > SMART_WALLET_REFRESH_MS || smartWalletSet.size === 0) {
      void refreshSmartWalletSet();
    }
    void backfillMint(address);
    connectMintWs(address);
  }
}

function onTokenRoomLeave(mint) {
  if (!tapeEnabled()) return;
  const address = String(mint || "").trim();
  const session = mintSessions.get(address);
  if (!session) return;

  session.refCount = Math.max(0, session.refCount - 1);
  if (session.refCount === 0) {
    teardownMintWs(address);
    mintSessions.delete(address);
  }
}

function initBirdeyeTxTape() {
  if (!tapeEnabled()) {
    console.log("[birdeye-tape] disabled (BIRDEYE_API_KEY missing)");
    return;
  }
  void refreshSmartWalletSet();
  if (smartWalletRefreshTimer) clearInterval(smartWalletRefreshTimer);
  smartWalletRefreshTimer = setInterval(() => {
    void refreshSmartWalletSet();
  }, SMART_WALLET_REFRESH_MS);
  console.log("[birdeye-tape] live transaction feed enabled (Birdeye WS + backfill)");
}

function getBirdeyeTxTapeHealth() {
  return {
    enabled: tapeEnabled(),
    activeMints: mintSessions.size,
    smartWalletCount: smartWalletSet.size,
    smartWalletLoadedAt: smartWalletLoadedAt || null
  };
}

module.exports = {
  initBirdeyeTxTape,
  onTokenRoomJoin,
  onTokenRoomLeave,
  getBirdeyeTxTapeHealth,
  normalizeBirdeyeTx
};
