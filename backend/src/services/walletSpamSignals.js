const { getHeliusMintTransactionsCached } = require("./heliusMintTxCache");

function isLikelyWallet(addr) {
  return typeof addr === "string" && addr.length >= 32 && addr.length <= 48;
}

/**
 * Free heuristics on Helius enhanced txs: fee-payer clustering, dust spam, wash churn.
 * Not a guarantee of malice — UI must label as "suspicious pattern".
 */
function bumpLevel(current, bump) {
  const order = ["none", "low", "medium", "high"];
  const i = Math.max(order.indexOf(current), 0);
  const j = Math.max(order.indexOf(bump), 0);
  return order[Math.max(i, j)];
}

function analyzeTxsForWalletThreats(mint, txs, deployerAddress) {
  if (!txs?.length) {
    return {
      level: "none",
      summary: "",
      signals: [],
      txSampleSize: 0,
      method: "helius_heuristic_v1"
    };
  }

  const feePayerCounts = new Map();
  const walletTouchCounts = new Map();
  const dustTouchCounts = new Map();
  const amounts = [];

  for (const tx of txs) {
    const fp = tx.feePayer;
    if (fp && isLikelyWallet(fp)) {
      feePayerCounts.set(fp, (feePayerCounts.get(fp) || 0) + 1);
    }
    for (const t of tx.tokenTransfers || []) {
      if (t.mint !== mint) continue;
      const amt = Math.abs(Number(t.tokenAmount || 0));
      if (Number.isFinite(amt) && amt > 0) amounts.push(amt);
    }
  }

  const sorted = [...amounts].sort((a, b) => a - b);
  const p10 = sorted.length ? sorted[Math.floor(sorted.length * 0.1)] : 0;
  const dustThreshold =
    p10 > 0 ? Math.max(1e-15, p10 * 0.02) : sorted.length ? sorted[0] * 0.5 : 0.0001;

  for (const tx of txs) {
    for (const t of tx.tokenTransfers || []) {
      if (t.mint !== mint) continue;
      const amt = Math.abs(Number(t.tokenAmount || 0));
      const to = t.toUserAccount;
      const from = t.fromUserAccount;
      for (const w of [to, from]) {
        if (!w || !isLikelyWallet(w)) continue;
        if (deployerAddress && w === deployerAddress) continue;
        walletTouchCounts.set(w, (walletTouchCounts.get(w) || 0) + 1);
        if (amt > 0 && amt < dustThreshold) {
          dustTouchCounts.set(w, (dustTouchCounts.get(w) || 0) + 1);
        }
      }
    }
  }

  /** @type {{ wallet: string, severity: string, type: string, detail: string }[]} */
  const signals = [];

  for (const [wallet, c] of feePayerCounts) {
    if (c >= Math.max(8, Math.floor(txs.length * 0.12))) {
      signals.push({
        type: "fee_payer_cluster",
        wallet,
        severity: "high",
        detail: `Same wallet paid fees for ${c} / ${txs.length} sampled txs`
      });
    }
  }

  for (const [wallet, c] of dustTouchCounts) {
    if (c >= 14) {
      signals.push({
        type: "dust_spam",
        wallet,
        severity: "medium",
        detail: `Many micro transfers involving this wallet (${c} touches)`
      });
    }
  }

  for (const [wallet, c] of walletTouchCounts) {
    if (c >= 28) {
      signals.push({
        type: "extreme_churn",
        wallet,
        severity: "medium",
        detail: `Wallet appears in ${c} token transfer legs in the sample`
      });
    }
  }

  const dedup = new Map();
  for (const s of signals) {
    const k = `${s.type}:${s.wallet}`;
    if (!dedup.has(k)) dedup.set(k, s);
  }
  const unique = [...dedup.values()];

  let level = "none";
  if (unique.some((s) => s.severity === "high")) level = "high";
  else if (unique.length >= 2) level = "medium";
  else if (unique.length === 1) level = "low";

  let summary = "";
  if (level === "high") {
    summary =
      "High-suspicion wallet activity on-chain (fee clustering / spam-like patterns). Extra caution.";
  } else if (level === "medium") {
    summary =
      "Several wallets show suspicious flow patterns (dust or extreme churn) in recent activity.";
  } else if (level === "low") {
    summary = "One low-confidence suspicious pattern detected in recent transfers.";
  }

  return {
    level,
    summary,
    signals: unique.slice(0, 12),
    txSampleSize: txs.length,
    method: "helius_heuristic_v1"
  };
}

function mergeDeployerHistoryThreat(base, deployerAddress, deployerHistory) {
  if (!deployerAddress || !deployerHistory) return base;
  const rugs = Number(deployerHistory.rugCount || 0);
  if (rugs < 2) return base;

  const sig = {
    type: "deployer_rug_history",
    wallet: deployerAddress,
    severity: "high",
    detail: `Deployer linked to ${rugs} rug(s) in Sentinel history (not on-chain proof of this token)`
  };
  const signals = [sig, ...base.signals.filter((s) => s.type !== "deployer_rug_history")].slice(
    0,
    12
  );
  const level = bumpLevel(base.level, "high");
  let summary = base.summary;
  if (level === "high" && !summary) {
    summary =
      "Deployer shows repeated high-risk history in our database. Treat as elevated scam risk.";
  } else if (level === "high") {
    summary = `${summary} Deployer history also elevated.`;
  }
  return { ...base, level, summary, signals };
}

async function getWalletSpamIntel(mint, options = {}) {
  const deployerAddress = options.deployerAddress || null;
  const deployerHistory = options.deployerHistory || null;
  try {
    const txs = await getHeliusMintTransactionsCached(mint, { limit: 100 });
    const base = analyzeTxsForWalletThreats(mint, txs, deployerAddress);
    return mergeDeployerHistoryThreat(base, deployerAddress, deployerHistory);
  } catch (e) {
    console.warn("walletSpamSignals:", e.message);
    return {
      level: "none",
      summary: "",
      signals: [],
      txSampleSize: 0,
      method: "helius_heuristic_v1",
      error: "unavailable"
    };
  }
}

module.exports = { getWalletSpamIntel, analyzeTxsForWalletThreats };
