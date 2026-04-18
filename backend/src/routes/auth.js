const express = require("express");
const jwt = require("jsonwebtoken");
const nacl = require("tweetnacl");
/** bs58@6 re-exports the codec as default only (CommonJS). */
const bs58 = require("bs58").default || require("bs58");
const crypto = require("crypto");
const { PublicKey } = require("@solana/web3.js");
const { getSupabase } = require("../lib/supabase");
const redis = require("../lib/cache");
const { getSubscriptionAuthContext } = require("../services/subscriptionService");

const authRouter = express.Router();

function makeNonce() {
  return crypto.randomBytes(16).toString("hex");
}

function buildLoginMessage(walletAddress, nonce) {
  return [
    "Sentinel Ledger Login",
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `IssuedAt: ${new Date().toISOString()}`
  ].join("\n");
}

function nonceKey(walletAddress) {
  return `auth:nonce:${walletAddress}`;
}

async function saveNonce(walletAddress, entry) {
  await redis.set(nonceKey(walletAddress), JSON.stringify(entry), { ex: 5 * 60 });
}

async function loadNonce(walletAddress) {
  const raw = await redis.get(nonceKey(walletAddress));
  if (!raw) return null;
  if (typeof raw === "string") return JSON.parse(raw);
  return raw;
}

async function deleteNonce(walletAddress) {
  await redis.del(nonceKey(walletAddress));
}

authRouter.post("/nonce", async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress)
      return res.status(400).json({ error: "walletAddress required" });

    const nonce = makeNonce();
    const message = buildLoginMessage(walletAddress, nonce);
    await saveNonce(walletAddress, {
      nonce,
      message,
      expiresAt: Date.now() + 5 * 60 * 1000
    });
    return res.json({ nonce, message });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "failed_to_create_nonce" });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) {
      console.error("[auth/login] JWT_SECRET is not set");
      return res.status(503).json({ error: "server_misconfigured" });
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[auth/login] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
      return res.status(503).json({ error: "server_misconfigured" });
    }

    const { walletAddress, publicKey, signature, message } = req.body;
    if (!walletAddress || !publicKey || !signature || !message) {
      return res.status(400).json({ error: "missing_fields" });
    }

    const entry = await loadNonce(walletAddress);
    if (!entry) return res.status(400).json({ error: "nonce_not_found_or_expired" });
    if (Date.now() > entry.expiresAt) {
      await deleteNonce(walletAddress);
      return res.status(400).json({ error: "nonce_expired" });
    }
    if (message !== entry.message) return res.status(400).json({ error: "invalid_message" });

    const pubKey = new PublicKey(publicKey);
    const verified = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      bs58.decode(signature),
      pubKey.toBytes()
    );
    if (!verified) return res.status(401).json({ error: "invalid_signature" });

    const wallet = pubKey.toBase58();

    const supabase = getSupabase();
    const { data: existing, error: findErr } = await supabase
      .from("users")
      .select("*")
      .eq("wallet_address", wallet)
      .maybeSingle();
    if (findErr) throw findErr;

    let user = existing;
    if (!user) {
      const referralCode = crypto.randomBytes(3).toString("hex").toUpperCase();
      const { data: created, error: insErr } = await supabase
        .from("users")
        .insert({ wallet_address: wallet, referral_code: referralCode })
        .select("*")
        .single();
      if (insErr?.code === "23505") {
        const { data: again, error: retryErr } = await supabase
          .from("users")
          .select("*")
          .eq("wallet_address", wallet)
          .single();
        if (retryErr) throw retryErr;
        user = again;
      } else if (insErr) {
        throw insErr;
      } else {
        user = created;
      }
    }

    const token = jwt.sign({ userId: user.id, wallet: user.wallet_address }, process.env.JWT_SECRET, {
      expiresIn: "7d"
    });

    await deleteNonce(walletAddress);
    return res.json({ token, user });
  } catch (error) {
    console.error("[auth/login]", error?.message || error, error?.code || "");
    return res.status(500).json({ error: "login_failed" });
  }
});

async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
      return res.status(401).json({ error: "missing_token" });
    const token = header.slice("Bearer ".length);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const sub = await getSubscriptionAuthContext(decoded.userId).catch(() => ({
      plan: "free",
      subscriptionStatus: null,
      planExpiresAt: null,
      isLifetime: false,
      hasProAccess: false
    }));
    req.user = {
      ...decoded,
      plan: sub.plan,
      planExpiresAt: sub.planExpiresAt,
      subscriptionStatus: sub.subscriptionStatus,
      isLifetime: sub.isLifetime,
      hasProAccess: sub.hasProAccess
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: "invalid_token" });
  }
}

/** Paid PRO access (not free, not expired). */
function requirePro(req, res, next) {
  if (!req.user?.hasProAccess) {
    if (req.user?.subscriptionStatus === "expired") {
      return res.status(403).json({
        ok: false,
        error: "Your PRO subscription has expired. Renew to continue."
      });
    }
    return res.status(403).json({ ok: false, error: "Upgrade to PRO to access this feature" });
  }
  return next();
}

module.exports = { authRouter, authMiddleware, requirePro };
