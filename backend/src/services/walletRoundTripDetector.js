"use strict";

const WSOL_MINT = "So11111111111111111111111111111111111111112";
const DUST_TOLERANCE_BPS = 50; // 0.5%
const BPS_DENOMINATOR = 10_000n;
const MIN_ABSOLUTE_DUST_RAW = 1000n;
const LAMPORTS_PER_SOL = 1_000_000_000;

function asRawAmount(balance) {
  const raw = balance?.uiTokenAmount?.amount;
  if (raw == null || raw === "") return 0n;
  try {
    return BigInt(String(raw));
  } catch (_) {
    return 0n;
  }
}

function addBalance(map, mint, amount) {
  if (!mint) return;
  map.set(mint, (map.get(mint) || 0n) + amount);
}

function ownerTokenBalances(meta, walletAddress, side) {
  const out = new Map();
  const rows = side === "pre" ? meta?.preTokenBalances : meta?.postTokenBalances;
  for (const entry of Array.isArray(rows) ? rows : []) {
    if (entry?.owner !== walletAddress || !entry?.mint) continue;
    addBalance(out, entry.mint, asRawAmount(entry));
  }
  return out;
}

function accountKeyToString(accountKey) {
  if (typeof accountKey === "string") return accountKey;
  return String(accountKey?.pubkey || accountKey?.toString?.() || "");
}

function walletAccountIndex(tx, walletAddress) {
  const keys = tx?.transaction?.message?.accountKeys;
  if (!Array.isArray(keys)) return -1;
  return keys.findIndex((key) => accountKeyToString(key) === walletAddress);
}

function nativeSolDelta(tx, walletAddress) {
  const idx = walletAccountIndex(tx, walletAddress);
  if (idx < 0) return 0;
  const pre = Number(tx?.meta?.preBalances?.[idx]);
  const post = Number(tx?.meta?.postBalances?.[idx]);
  if (!Number.isFinite(pre) || !Number.isFinite(post)) return 0;
  return (post - pre) / LAMPORTS_PER_SOL;
}

function buildInventoryEvent(tx, walletAddress, signature = null) {
  if (!tx || tx?.meta?.err) return null;
  const meta = tx.meta || {};
  const preBalances = ownerTokenBalances(meta, walletAddress, "pre");
  const postBalances = ownerTokenBalances(meta, walletAddress, "post");
  const mints = new Set([...preBalances.keys(), ...postBalances.keys()]);
  const tokenDeltas = new Map();

  for (const mint of mints) {
    const pre = preBalances.get(mint) || 0n;
    const post = postBalances.get(mint) || 0n;
    const delta = post - pre;
    if (delta !== 0n) tokenDeltas.set(mint, delta);
  }

  const wsolPre = preBalances.get(WSOL_MINT) || 0n;
  const wsolPost = postBalances.get(WSOL_MINT) || 0n;
  const wsolDelta = Number(wsolPost - wsolPre) / LAMPORTS_PER_SOL;
  tokenDeltas.delete(WSOL_MINT);

  return {
    signature: signature || tx?.transaction?.signatures?.[0] || null,
    blockTime: Number(tx?.blockTime) || 0,
    slot: Number(tx?.slot) || 0,
    tokenDeltas,
    realSolDelta: nativeSolDelta(tx, walletAddress) + wsolDelta
  };
}

function absSol(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function dustThreshold(peak) {
  if (peak <= 0n) return MIN_ABSOLUTE_DUST_RAW;
  const relative = (peak * BigInt(DUST_TOLERANCE_BPS)) / BPS_DENOMINATOR;
  return relative > MIN_ABSOLUTE_DUST_RAW ? relative : MIN_ABSOLUTE_DUST_RAW;
}

function emptyTracker() {
  return {
    tokenInventory: 0n,
    tokenInventoryPeak: 0n,
    solSpentAcc: 0,
    solReceivedAcc: 0,
    firstBuyAt: null,
    lastEventAt: null
  };
}

function mean(rows, pick) {
  if (!rows.length) return 0;
  return rows.reduce((sum, row) => sum + Number(pick(row) || 0), 0) / rows.length;
}

function scoreClosedCycles({ closedCycles, openPositions }) {
  const closedTrades = closedCycles.length;
  const wins = closedCycles.filter((cycle) => cycle.is_win).length;
  const winningCycles = closedCycles.filter((cycle) => cycle.is_win);
  const winRateObserved = closedTrades > 0 ? wins / closedTrades : 0;
  const avgSolPnl = mean(winningCycles, (cycle) => cycle.net_sol);
  const weightedDenominator = winningCycles.reduce((sum, cycle) => sum + Number(cycle.sol_spent || 0), 0);
  const weightedAvgSolPnl =
    weightedDenominator > 0
      ? winningCycles.reduce((sum, cycle) => sum + Number(cycle.net_sol || 0) * Number(cycle.sol_spent || 0), 0) /
        weightedDenominator
      : 0;
  const totalSolMoved = closedCycles.reduce((sum, cycle) => sum + Number(cycle.sol_spent || 0), 0);
  const avgCycleDurationHours = mean(closedCycles, (cycle) => cycle.duration_hours);

  if (closedTrades < 3) {
    return {
      rejected: true,
      reason: "insufficient_closed_cycles",
      closedTrades,
      wins,
      winRateObserved,
      avgSolPnl,
      weightedAvgSolPnl,
      totalSolMoved,
      avgCycleDurationHours,
      openPositions,
      candidateScore: 0
    };
  }

  let baseScore = winRateObserved * 0.6 + (Math.min(closedTrades, 20) / 20) * 0.4;
  if (openPositions > closedTrades * 2) baseScore *= 0.7;
  if (avgCycleDurationHours > 0.1 && avgCycleDurationHours < 4) baseScore *= 1.1;
  if (closedTrades < 5) baseScore *= 0.6;

  return {
    rejected: false,
    reason: null,
    closedTrades,
    wins,
    winRateObserved,
    avgSolPnl,
    weightedAvgSolPnl,
    totalSolMoved,
    avgCycleDurationHours,
    openPositions,
    candidateScore: Math.min(baseScore, 1)
  };
}

function detectInventoryRoundTrips(parsedTransactions, walletAddress) {
  const events = (parsedTransactions || [])
    .map((entry) => buildInventoryEvent(entry?.tx || entry, walletAddress, entry?.signature || null))
    .filter((event) => event && event.blockTime && event.tokenDeltas.size)
    .sort((a, b) => a.blockTime - b.blockTime || a.slot - b.slot);

  const inventoryTracker = new Map();
  const closedCycles = [];

  for (const event of events) {
    for (const [mint, delta] of event.tokenDeltas.entries()) {
      if (delta === 0n) continue;
      if (!inventoryTracker.has(mint)) inventoryTracker.set(mint, emptyTracker());
      const tracker = inventoryTracker.get(mint);

      if (delta > 0n) {
        tracker.tokenInventory += delta;
        if (tracker.tokenInventory > tracker.tokenInventoryPeak) {
          tracker.tokenInventoryPeak = tracker.tokenInventory;
        }
        tracker.solSpentAcc += absSol(event.realSolDelta);
        if (!tracker.firstBuyAt) tracker.firstBuyAt = event.blockTime;
      } else {
        tracker.tokenInventory += delta;
        tracker.solReceivedAcc += absSol(event.realSolDelta);
        tracker.lastEventAt = event.blockTime;
      }

      const threshold = dustThreshold(tracker.tokenInventoryPeak);
      if (tracker.tokenInventoryPeak > 0n && tracker.tokenInventory <= threshold) {
        if (tracker.firstBuyAt && tracker.lastEventAt && tracker.solSpentAcc > 0) {
          const netSol = tracker.solReceivedAcc - tracker.solSpentAcc;
          closedCycles.push({
            mint,
            net_sol: netSol,
            sol_spent: tracker.solSpentAcc,
            sol_received: tracker.solReceivedAcc,
            duration_hours: (tracker.lastEventAt - tracker.firstBuyAt) / 3600,
            is_win: netSol > 0
          });
        }
        inventoryTracker.set(mint, emptyTracker());
      }
    }
  }

  let openPositions = 0;
  for (const tracker of inventoryTracker.values()) {
    if (tracker.tokenInventoryPeak > 0n && tracker.tokenInventory > dustThreshold(tracker.tokenInventoryPeak)) {
      openPositions += 1;
    }
  }

  return {
    closedCycles,
    openPositions,
    metrics: scoreClosedCycles({ closedCycles, openPositions })
  };
}

module.exports = {
  WSOL_MINT,
  DUST_TOLERANCE: 0.005,
  buildInventoryEvent,
  detectInventoryRoundTrips
};
