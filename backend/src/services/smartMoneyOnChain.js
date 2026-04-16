const { getMarketData } = require("./marketData");
const { getLargestTokenAccountOwners } = require("./onChainService");
const {
  getCachedOrFetchTokenWalletPnl,
  enrichWalletsWithBirdeye
} = require("./birdeyeWalletPnl");
const { getHeliusMintTransactionsCached } = require("./heliusMintTxCache");

const HEIUS_TX_LIMIT = 100;

function isLikelyWallet(addr) {
  return typeof addr === "string" && addr.length >= 32 && addr.length <= 48;
}

/**
 * Aggregate Helius enhanced txs for a mint: SPL token transfers touching this mint.
 */
function aggregateActivity(txs, mint, priceUsd) {
  /** @type {Map<string, { inTok: number, outTok: number, lastTs: number, sigs: Set<string>, flowsUsd: number[] }>} */
  const byWallet = new Map();

  for (const tx of txs) {
    const sig = tx.signature || tx.transaction?.signatures?.[0] || "";
    const ts = (tx.timestamp || 0) * 1000 || Date.now();
    const transfers = tx.tokenTransfers || [];

    for (const t of transfers) {
      if (t.mint !== mint) continue;
      const amt = Math.abs(Number(t.tokenAmount || 0));
      if (!Number.isFinite(amt) || amt <= 0) continue;

      const usd = priceUsd > 0 ? amt * priceUsd : 0;
      const to = t.toUserAccount;
      const from = t.fromUserAccount;

      if (to && isLikelyWallet(to)) {
        const row = byWallet.get(to) || {
          inTok: 0,
          outTok: 0,
          lastTs: 0,
          sigs: new Set(),
          flowsUsd: []
        };
        row.inTok += amt;
        row.lastTs = Math.max(row.lastTs, ts);
        if (sig) row.sigs.add(sig);
        if (usd > 0) row.flowsUsd.push(usd);
        byWallet.set(to, row);
      }
      if (from && isLikelyWallet(from)) {
        const row = byWallet.get(from) || {
          inTok: 0,
          outTok: 0,
          lastTs: 0,
          sigs: new Set(),
          flowsUsd: []
        };
        row.outTok += amt;
        row.lastTs = Math.max(row.lastTs, ts);
        if (sig) row.sigs.add(sig);
        byWallet.set(from, row);
      }
    }
  }

  return byWallet;
}

function scoreFromActivity(netTok, txCount, lastTs) {
  const age = Date.now() - lastTs;
  const recencyBonus =
    age < 3600000 ? 12 : age < 86400000 ? 6 : age < 7 * 86400000 ? 2 : 0;
  const vol = Math.log10(1 + Math.max(0, netTok));
  const hit = Math.min(txCount, 25);
  return Math.min(
    98,
    Math.round(38 + vol * 13 + hit * 1.4 + recencyBonus)
  );
}

/**
 * Real on-chain smart-money style ranking:
 * - Helius: recent transfers / swaps involving the mint (wallet activity).
 * - RPC: largest token accounts → owners (whale concentration proxy).
 *
 * Numbers are heuristics (signal strength), not verified PnL or win rate.
 */
async function buildOnChainSmartMoney(tokenMint, options = {}) {
  const { deployerAddress = null } = options;

  let priceUsd = 0;
  try {
    const md = await getMarketData(tokenMint);
    if (md) priceUsd = Number(md.price) || 0;
  } catch (_) {
    /* optional */
  }

  const [txs, holdersPack] = await Promise.all([
    getHeliusMintTransactionsCached(tokenMint, { limit: HEIUS_TX_LIMIT }),
    getLargestTokenAccountOwners(tokenMint, 18)
  ]);

  const activityMap = aggregateActivity(txs, tokenMint, priceUsd);
  const merged = new Map();

  for (const [wallet, stat] of activityMap.entries()) {
    if (deployerAddress && wallet === deployerAddress) continue;
    const netTok = Math.max(0, stat.inTok - stat.outTok);
    const txCount = stat.sigs.size || 1;
    const score = scoreFromActivity(netTok, txCount, stat.lastTs || Date.now());
    const avgFlow =
      stat.flowsUsd.length > 0
        ? stat.flowsUsd.reduce((a, b) => a + b, 0) / stat.flowsUsd.length
        : priceUsd > 0
          ? (stat.inTok / Math.max(1, txCount)) * priceUsd
          : 0;
    const lastAction =
      stat.inTok > stat.outTok
        ? "buy"
        : stat.outTok > stat.inTok
          ? "sell"
          : "transfer";

    merged.set(wallet, {
      wallet,
      winRate: score,
      realizedPnl: 0,
      avgPositionSize: Math.round(avgFlow),
      recentHits: txCount,
      lastSeen: stat.lastTs
        ? new Date(stat.lastTs).toISOString()
        : null,
      lastAction,
      confidence: score,
      _kind: "activity"
    });
  }

  for (const h of holdersPack.owners) {
    if (deployerAddress && h.owner === deployerAddress) continue;
    const holderScore = Math.min(
      95,
      Math.round(52 + Math.min(40, h.pctSupply * 1.15))
    );
    const existing = merged.get(h.owner);
    const posUsd =
      priceUsd > 0 ? Math.round(h.uiAmount * priceUsd) : Math.round(h.uiAmount);

    if (existing) {
      const blended = Math.min(
        100,
        Math.round((existing.winRate + holderScore) / 2 + 4)
      );
      existing.winRate = blended;
      existing.confidence = blended;
      existing.avgPositionSize = Math.max(existing.avgPositionSize || 0, posUsd);
      existing._kind = "activity+whale";
    } else {
      merged.set(h.owner, {
        wallet: h.owner,
        winRate: holderScore,
        realizedPnl: 0,
        avgPositionSize: posUsd,
        recentHits: 0,
        lastSeen: null,
        lastAction: "holder",
        confidence: holderScore,
        _kind: "whale"
      });
    }
  }

  let wallets = [...merged.values()]
    .filter((w) => w.wallet && isLikelyWallet(w.wallet))
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, 20)
    .map(({ _kind, ...rest }) => rest);

  const scoreMap = new Map(wallets.map((w) => [w.wallet, w.confidence]));
  const birdeyeMap = await getCachedOrFetchTokenWalletPnl(
    tokenMint,
    wallets.map((w) => w.wallet)
  );
  wallets = enrichWalletsWithBirdeye(wallets, birdeyeMap, scoreMap);
  wallets.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  const anyBirdeye = wallets.some((w) => w.pnlSource === "birdeye");

  return {
    wallets,
    meta: {
      source: "on_chain",
      heliusTxSample: txs.length,
      whaleAccounts: holdersPack.owners.length,
      pnlProvider: anyBirdeye ? "birdeye" : null,
      metricLabel: anyBirdeye
        ? "On-chain activity + Birdeye realized PnL for this token (per wallet). Bar score blends flow + profitability."
        : process.env.BIRDEYE_API_KEY
          ? "On-chain signal (activity + size). Birdeye had no PnL rows for these wallets on this token."
          : "On-chain signal (activity + size). Set BIRDEYE_API_KEY for third-party realized PnL & richer score.",
      priceUsd
    }
  };
}

module.exports = { buildOnChainSmartMoney };
