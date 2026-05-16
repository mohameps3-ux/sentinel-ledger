"use strict";

const { jsonRpcPost } = require("../lib/solanaJsonRpc");

function getHeliusRpcUrl() {
  const k = String(process.env.HELIUS_KEY || "").trim();
  if (!k) return null;
  return `https://mainnet.helius-rpc.com/?api-key=${k}`;
}

function envTreasury() {
  return String(process.env.TREASURY_WALLET || "").trim();
}

function envUsdcMint() {
  return String(process.env.USDC_MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v").trim();
}

function trialRawLamports() {
  const n = Number(process.env.TRIAL_AMOUNT_USDC || 10);
  if (!Number.isFinite(n) || n <= 0) return 10_000_000n;
  return BigInt(Math.round(n * 1_000_000));
}

function proRawLamports() {
  const n = Number(process.env.PRO_AMOUNT_USDC || 29);
  if (!Number.isFinite(n) || n <= 0) return 29_000_000n;
  return BigInt(Math.round(n * 1_000_000));
}

function aggregateTokenBalances(balanceRows) {
  const m = new Map();
  for (const b of balanceRows || []) {
    const mint = String(b?.mint || "").trim();
    const owner = String(b?.owner || "").trim();
    if (!mint || !owner) continue;
    const raw = b?.uiTokenAmount?.amount;
    if (raw == null) continue;
    const key = `${mint}|${owner}`;
    let bi;
    try {
      bi = BigInt(String(raw));
    } catch {
      continue;
    }
    m.set(key, (m.get(key) || 0n) + bi);
  }
  return m;
}

function tokenBalanceDeltas(meta) {
  const pre = aggregateTokenBalances(meta?.preTokenBalances);
  const post = aggregateTokenBalances(meta?.postTokenBalances);
  const keys = new Set([...pre.keys(), ...post.keys()]);
  const out = new Map();
  for (const k of keys) {
    const d = (post.get(k) || 0n) - (pre.get(k) || 0n);
    if (d !== 0n) out.set(k, d);
  }
  return out;
}

function looksLikeTxSignature(sig) {
  const s = String(sig || "").trim();
  if (s.length < 80 || s.length > 128) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);
}

/**
 * Verify a Solana mainnet USDC transfer to treasury for trial or pro tier.
 * @param {string} signature
 * @param {string} walletAddress — payer wallet (owner of debited USDC token account)
 * @returns {Promise<{ valid: boolean, plan?: 'trial'|'pro', amount?: number, error?: string }>}
 */
async function verifyUsdcSubscriptionTx(signature, walletAddress) {
  const treasury = envTreasury();
  const usdcMint = envUsdcMint();
  const payer = String(walletAddress || "").trim();

  if (!treasury) {
    return { valid: false, error: "treasury_not_configured" };
  }
  if (!payer) {
    return { valid: false, error: "missing_wallet" };
  }
  if (!looksLikeTxSignature(signature)) {
    return { valid: false, error: "malformed_signature" };
  }

  const url = getHeliusRpcUrl();
  if (!url) {
    return { valid: false, error: "helius_key_missing" };
  }

  const trialRaw = trialRawLamports();
  const proRaw = proRawLamports();

  let rpcResult;
  try {
    rpcResult = await jsonRpcPost(
      url,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [
          String(signature).trim(),
          {
            encoding: "jsonParsed",
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed"
          }
        ]
      },
      { timeout: 22_000, retries: 2, budgetCritical: true }
    );
  } catch (e) {
    const msg = String(e?.message || e || "rpc_error");
    if (/timeout|ETIMEDOUT|ECONNRESET/i.test(msg)) {
      return { valid: false, error: "helius_timeout" };
    }
    return { valid: false, error: `rpc_failed:${msg.slice(0, 120)}` };
  }

  const tx = rpcResult?.result;
  if (!tx) {
    return { valid: false, error: "transaction_not_found" };
  }
  if (tx.meta?.err) {
    return { valid: false, error: "transaction_failed" };
  }

  const deltas = tokenBalanceDeltas(tx.meta);
  const treasuryKey = `${usdcMint}|${treasury}`;
  const payerKey = `${usdcMint}|${payer}`;
  const toDelta = deltas.get(treasuryKey);
  const fromDelta = deltas.get(payerKey);

  if (toDelta == null || toDelta <= 0n) {
    return { valid: false, error: "no_usdc_credit_to_treasury" };
  }
  if (fromDelta == null || fromDelta >= 0n) {
    return { valid: false, error: "no_usdc_debit_from_payer" };
  }
  const credited = toDelta;
  const debited = -fromDelta;
  if (credited !== debited) {
    return { valid: false, error: "transfer_amount_mismatch" };
  }

  let plan;
  let amountUsdc;
  if (credited === trialRaw) {
    plan = "trial";
    amountUsdc = Number(process.env.TRIAL_AMOUNT_USDC || 10);
  } else if (credited === proRaw) {
    plan = "pro";
    amountUsdc = Number(process.env.PRO_AMOUNT_USDC || 29);
  } else {
    return { valid: false, error: "amount_not_trial_or_pro" };
  }

  return { valid: true, plan, amount: amountUsdc };
}

module.exports = {
  verifyUsdcSubscriptionTx,
  getHeliusRpcUrl,
  envTreasury,
  envUsdcMint,
  trialRawLamports,
  proRawLamports
};
