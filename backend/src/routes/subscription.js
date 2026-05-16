"use strict";

const express = require("express");
const rateLimit = require("express-rate-limit");
const { getSupabase } = require("../lib/supabase");
const { isProbableSolanaPubkey } = require("../lib/solanaAddress");
const {
  verifyUsdcSubscriptionTx,
  envTreasury,
  getHeliusRpcUrl
} = require("../services/subscriptionVerifier");
const { getActiveWalletSubscription } = require("../services/subscriptionAccess");

const router = express.Router();

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "rate_limit_exceeded" }
});

function trialDays() {
  const n = Number(process.env.TRIAL_DAYS || 7);
  return Number.isFinite(n) && n > 0 ? Math.min(90, Math.floor(n)) : 7;
}

function proDays() {
  const n = Number(process.env.PRO_DAYS || 30);
  return Number.isFinite(n) && n > 0 ? Math.min(366, Math.floor(n)) : 30;
}

function httpErrorForVerify(err) {
  const e = String(err || "");
  if (e === "treasury_not_configured" || e === "helius_key_missing") {
    return { status: 503, body: { ok: false, error: e } };
  }
  return { status: 400, body: { ok: false, error: e } };
}

router.post("/verify", verifyLimiter, async (req, res) => {
  const signature = String(req.body?.signature || "").trim();
  const walletAddress = String(req.body?.walletAddress || "").trim();

  if (!envTreasury()) {
    console.warn("[subscription] rejected reason=treasury_not_configured");
    return res.status(503).json({ ok: false, error: "treasury_not_configured" });
  }
  if (!getHeliusRpcUrl()) {
    console.warn("[subscription] rejected reason=helius_key_missing");
    return res.status(503).json({ ok: false, error: "helius_key_missing" });
  }

  if (!signature || !walletAddress) {
    console.warn("[subscription] rejected reason=missing_fields");
    return res.status(400).json({ ok: false, error: "missing_signature_or_wallet" });
  }
  if (!isProbableSolanaPubkey(walletAddress)) {
    console.warn("[subscription] rejected reason=invalid_wallet");
    return res.status(400).json({ ok: false, error: "invalid_wallet_address" });
  }

  console.log(`[subscription] verify attempt wallet=${walletAddress} signature=${signature}`);

  const v = await verifyUsdcSubscriptionTx(signature, walletAddress);
  if (!v.valid) {
    const { status, body } = httpErrorForVerify(v.error);
    console.warn(`[subscription] rejected reason=${v.error}`);
    return res.status(status).json(body);
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    console.warn("[subscription] rejected reason=supabase_unconfigured");
    return res.status(503).json({ ok: false, error: "supabase_unconfigured" });
  }

  const { data: dup, error: dupErr } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("tx_signature", signature)
    .maybeSingle();
  if (dupErr) {
    console.warn("[subscription] rejected reason=dup_lookup_failed", dupErr.message);
    return res.status(500).json({ ok: false, error: "database_error" });
  }
  if (dup?.id) {
    console.warn("[subscription] rejected reason=signature_already_used");
    return res.status(409).json({ ok: false, error: "signature_already_used" });
  }

  const now = Date.now();
  const days = v.plan === "trial" ? trialDays() : proDays();
  const expiresAt = new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
  const amountUsdc = Number(v.amount);

  const { data: inserted, error: insErr } = await supabase
    .from("subscriptions")
    .insert({
      wallet_address: walletAddress,
      tx_signature: signature,
      amount_usdc: amountUsdc,
      plan: v.plan,
      expires_at: expiresAt
    })
    .select("id, expires_at, plan")
    .single();

  if (insErr) {
    const msg = String(insErr.message || "");
    const code = String(insErr.code || "");
    if (code === "23505" || /duplicate|unique/i.test(msg)) {
      console.warn("[subscription] rejected reason=signature_already_used (insert race)");
      return res.status(409).json({ ok: false, error: "signature_already_used" });
    }
    console.warn("[subscription] rejected reason=insert_failed", msg);
    return res.status(500).json({ ok: false, error: "insert_failed" });
  }

  console.log(`[subscription] verified plan=${inserted?.plan || v.plan} expires=${inserted?.expires_at || expiresAt}`);

  return res.json({
    ok: true,
    plan: inserted?.plan || v.plan,
    expires_at: inserted?.expires_at || expiresAt
  });
});

router.get("/status", async (req, res) => {
  const wallet = String(req.query.wallet || "").trim();
  if (!wallet) {
    return res.status(400).json({ ok: false, error: "missing_wallet_query", active: false, plan: null, expires_at: null });
  }
  if (!isProbableSolanaPubkey(wallet)) {
    return res.status(400).json({ ok: false, error: "invalid_wallet", active: false, plan: null, expires_at: null });
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    return res.status(503).json({ ok: false, error: "supabase_unconfigured", active: false, plan: null, expires_at: null });
  }

  const row = await getActiveWalletSubscription(supabase, wallet);
  if (!row) {
    return res.json({ ok: true, active: false, plan: null, expires_at: null });
  }
  return res.json({
    ok: true,
    active: true,
    plan: row.plan,
    expires_at: row.expires_at
  });
});

module.exports = router;
