"use strict";

/**
 * Ed25519 signer for sentinel:score payloads.
 *
 * Why this exists
 * ---------------
 * Every `sentinel:score` leaving this process is cryptographically signed so
 * downstream consumers (frontend, future API subscribers, backtesting
 * pipelines) can prove, byte-for-byte, that a given score was computed by
 * THIS server at the stated timestamp. Three properties we get "for free":
 *
 *  1. Integrity — tampering in transit (CDN, proxy, socket relay) flips the
 *     signature.
 *  2. Proof of Accuracy — the historical (score, timestamp, signature)
 *     triplet is forensically auditable. If Sentinel says a mint was
 *     Smart-Money at T and the chart ran up by T+N, the signature is the
 *     non-repudiable record that we called it first.
 *  3. Key rotation friendliness — the public-key fingerprint is attached to
 *     every payload. Clients notice mismatches and refetch the current key
 *     without any explicit coordination.
 *
 * Key management
 * --------------
 *  - SENTINEL_SCORE_SIGNING_KEY  → 64-byte nacl secretKey or 32-byte seed,
 *                                  hex or base64 encoded. Preferred in prod.
 *  - SENTINEL_SCORE_SIGNING_SEED → 32-byte seed, hex or base64. Convenience
 *                                  alias when you just want a deterministic
 *                                  keypair per environment.
 *  - Neither set             → generate an ephemeral keypair at boot and
 *                                  log a loud warning. Useful in dev; never
 *                                  in prod (fingerprint changes every
 *                                  restart, which invalidates the historical
 *                                  audit trail).
 *
 * Canonicalization
 * ----------------
 * We sign a stable subset of the result (NOT the whole object). `meta` is
 * intentionally excluded because its shape is observational and may evolve.
 * Signing a frozen schema means we can add debug fields to the payload
 * without breaking historical signatures.
 *
 * Canonical form:
 *   - Fixed top-level key order (alphabetical).
 *   - `scores` object with alphabetical keys (momentum, risk, smart).
 *   - Arrays preserve order (signals/insights are semantically ordered).
 *   - No whitespace. UTF-8 encoding.
 *
 * Algorithm: ed25519-v1   (64-byte signature, 32-byte pubkey).
 */

const crypto = require("crypto");
const nacl = require("tweetnacl");

const ALG = "ed25519-v1";

const SIGNABLE_FIELDS = [
  "asset",
  "confidence",
  "confidenceLabel",
  "insights",
  "network",
  "scores",
  "signals",
  "timestamp"
];

/**
 * Decode a hex-or-base64-encoded secret into a Uint8Array of the expected
 * byte length. Throws with a clear message if neither encoding produces the
 * right size, so a misconfigured env var fails loud at boot time instead of
 * silently downgrading to an ephemeral key.
 */
function decodeSecret(raw, expectedLens) {
  const s = String(raw || "").trim();
  if (!s) return null;
  // Try hex first (most common for ed25519 secrets in the wild).
  if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) {
    const buf = Buffer.from(s, "hex");
    if (expectedLens.includes(buf.length)) return new Uint8Array(buf);
  }
  // Fall back to base64 / base64url.
  try {
    const buf = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (expectedLens.includes(buf.length)) return new Uint8Array(buf);
  } catch (_) {
    /* ignore */
  }
  return null;
}

function buildKeyPair() {
  const rawKey = process.env.SENTINEL_SCORE_SIGNING_KEY;
  if (rawKey) {
    // Accept 64-byte secretKey or 32-byte seed.
    const sk64 = decodeSecret(rawKey, [64]);
    if (sk64) {
      try {
        return { kp: nacl.sign.keyPair.fromSecretKey(sk64), source: "env:signing_key_64" };
      } catch (_) {
        /* fallthrough */
      }
    }
    const seed32 = decodeSecret(rawKey, [32]);
    if (seed32) {
      try {
        return { kp: nacl.sign.keyPair.fromSeed(seed32), source: "env:signing_key_32" };
      } catch (_) {
        /* fallthrough */
      }
    }
    console.warn(
      "[scoreSigner] SENTINEL_SCORE_SIGNING_KEY is set but unreadable (expected 32- or 64-byte hex/base64). Falling back."
    );
  }

  const rawSeed = process.env.SENTINEL_SCORE_SIGNING_SEED;
  if (rawSeed) {
    const seed32 = decodeSecret(rawSeed, [32]);
    if (seed32) {
      return { kp: nacl.sign.keyPair.fromSeed(seed32), source: "env:signing_seed" };
    }
    console.warn(
      "[scoreSigner] SENTINEL_SCORE_SIGNING_SEED is set but unreadable (expected 32-byte hex/base64). Falling back."
    );
  }

  // Last resort: ephemeral key. Logs loud so it's visible in any log pipeline.
  const kp = nacl.sign.keyPair();
  console.warn(
    "[scoreSigner] No SENTINEL_SCORE_SIGNING_KEY configured; generated EPHEMERAL ed25519 keypair. Scores will be signed, but the key resets on every restart. Set SENTINEL_SCORE_SIGNING_KEY to a 64-byte hex secret key for production."
  );
  return { kp, source: "ephemeral" };
}

const { kp: KEYPAIR, source: KEY_SOURCE } = buildKeyPair();

const PUBKEY_BYTES = KEYPAIR.publicKey; // Uint8Array(32)
const SECRET_BYTES = KEYPAIR.secretKey; // Uint8Array(64)

const PUBKEY_HEX = Buffer.from(PUBKEY_BYTES).toString("hex");
const PUBKEY_FP = crypto
  .createHash("sha256")
  .update(PUBKEY_BYTES)
  .digest("hex")
  .slice(0, 16);

/**
 * Deterministic byte serialization of the signable subset of a score result.
 * Two runs with the same inputs must produce identical bytes; any client in
 * any language can reproduce this by assembling the same nested object with
 * alphabetical key ordering and JSON.stringify (no spaces).
 */
function canonicalize(result) {
  if (!result || typeof result !== "object") {
    throw new Error("canonicalize: result must be an object");
  }
  const scores = result.scores || {};
  const ordered = {
    asset: String(result.asset || ""),
    confidence: Number(result.confidence),
    confidenceLabel: String(result.confidenceLabel || ""),
    insights: Array.isArray(result.insights) ? result.insights.map((s) => String(s)) : [],
    network: String(result.network || ""),
    scores: {
      momentum: Number(scores.momentum),
      risk: Number(scores.risk),
      smart: Number(scores.smart)
    },
    signals: Array.isArray(result.signals) ? result.signals.map((s) => String(s)) : [],
    timestamp: String(result.timestamp || "")
  };
  return Buffer.from(JSON.stringify(ordered), "utf8");
}

/**
 * Attach an Ed25519 signature + pubkey fingerprint + algorithm tag to the
 * result. Returns a NEW object; never mutates the input. Fields added:
 *   - signature: hex-encoded 64-byte Ed25519 signature
 *   - pubkeyFp:  16-hex-char truncated SHA-256 of the signing pubkey
 *   - sigAlg:    "ed25519-v1"
 *
 * Safe to call twice (the second call strips prior signing fields before
 * re-signing, so re-evaluations never double-wrap).
 */
function sign(result) {
  if (!result || typeof result !== "object") return result;
  const { signature: _s, pubkeyFp: _f, sigAlg: _a, ...stripped } = result;
  const bytes = canonicalize(stripped);
  const sig = nacl.sign.detached(bytes, SECRET_BYTES);
  return {
    ...stripped,
    sigAlg: ALG,
    pubkeyFp: PUBKEY_FP,
    signature: Buffer.from(sig).toString("hex")
  };
}

/** Verify a signed result against THIS server's pubkey. Primarily for tests. */
function verify(result) {
  if (!result || result.sigAlg !== ALG) return false;
  if (typeof result.signature !== "string") return false;
  if (result.pubkeyFp !== PUBKEY_FP) return false;
  let sigBytes;
  try {
    sigBytes = Uint8Array.from(Buffer.from(result.signature, "hex"));
  } catch (_) {
    return false;
  }
  if (sigBytes.length !== 64) return false;
  const { signature: _s, pubkeyFp: _f, sigAlg: _a, ...stripped } = result;
  const msg = canonicalize(stripped);
  try {
    return nacl.sign.detached.verify(msg, sigBytes, PUBKEY_BYTES);
  } catch (_) {
    return false;
  }
}

function getPublicKeyInfo() {
  return {
    alg: ALG,
    pubkey: PUBKEY_HEX,
    pubkeyFp: PUBKEY_FP,
    source: KEY_SOURCE
  };
}

module.exports = {
  sign,
  verify,
  canonicalize,
  getPublicKeyInfo,
  ALG,
  SIGNABLE_FIELDS
};
