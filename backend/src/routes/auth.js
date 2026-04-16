const express = require("express");
const jwt = require("jsonwebtoken");
const nacl = require("tweetnacl");
const bs58 = require("bs58");
const crypto = require("crypto");
const { PublicKey } = require("@solana/web3.js");
const { getSupabase } = require("../lib/supabase");

const authRouter = express.Router();
const nonceStore = new Map();

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

authRouter.post("/nonce", async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress)
      return res.status(400).json({ error: "walletAddress required" });

    const nonce = makeNonce();
    const message = buildLoginMessage(walletAddress, nonce);
    nonceStore.set(walletAddress, {
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
    const { walletAddress, publicKey, signature, message } = req.body;
    if (!walletAddress || !publicKey || !signature || !message) {
      return res.status(400).json({ error: "missing_fields" });
    }

    const entry = nonceStore.get(walletAddress);
    if (!entry) return res.status(400).json({ error: "nonce_not_found_or_expired" });
    if (Date.now() > entry.expiresAt) {
      nonceStore.delete(walletAddress);
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
    const referralCode = crypto.randomBytes(3).toString("hex").toUpperCase();

    const supabase = getSupabase();
    const { data: user, error } = await supabase
      .from("users")
      .upsert(
        { wallet_address: wallet, referral_code: referralCode },
        { onConflict: "wallet_address" }
      )
      .select("*")
      .single();
    if (error) throw error;

    const token = jwt.sign(
      { userId: user.id, wallet: user.wallet_address, plan: user.plan },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    nonceStore.delete(walletAddress);
    return res.json({ token, user });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "login_failed" });
  }
});

function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
      return res.status(401).json({ error: "missing_token" });
    const token = header.slice("Bearer ".length);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "invalid_token" });
  }
}

module.exports = { authRouter, authMiddleware };

