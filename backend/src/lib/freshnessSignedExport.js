"use strict";

const crypto = require("crypto");
const nacl = require("tweetnacl");

const EXPORT_TYPE = "ops_data_freshness_history_signed_export";
const PROOF_PREFIX = "sentinel-ledger|freshness-history";
const PROOF_VERSION = "v1";

const SIG_ED25519 = "ed25519";
const SIG_HMAC = "hmac-sha256";

/** @type {{ publicKey: Uint8Array; secretKey: Uint8Array } | false | null} */
let ed25519PairCache = null;

function signingSecret() {
  const raw = String(process.env.FRESHNESS_HISTORY_EXPORT_SIGNING_KEY || process.env.OMNI_BOT_OPS_KEY || "").trim();
  return raw || null;
}

function decodeBase32Or64(buf) {
  if (buf.length === 32) return new Uint8Array(buf);
  if (buf.length === 64) return new Uint8Array(buf.subarray(0, 32));
  return null;
}

function parsePublicKey32FromEnv() {
  const b64 = String(process.env.FRESHNESS_HISTORY_EXPORT_ED25519_PUBLIC_BASE64 || "").trim();
  if (!b64) return null;
  try {
    const buf = Buffer.from(b64, "base64");
    return decodeBase32Or64(buf);
  } catch {
    return null;
  }
}

function getEd25519KeyPair() {
  if (ed25519PairCache === false) return null;
  if (ed25519PairCache) return ed25519PairCache;
  const seedB64 = String(process.env.FRESHNESS_HISTORY_EXPORT_ED25519_SEED_BASE64 || "").trim();
  if (!seedB64) {
    ed25519PairCache = false;
    return null;
  }
  try {
    const seedBuf = Buffer.from(seedB64, "base64");
    const seed = decodeBase32Or64(seedBuf);
    if (!seed) {
      ed25519PairCache = false;
      return null;
    }
    ed25519PairCache = nacl.sign.keyPair.fromSeed(seed);
    return ed25519PairCache;
  } catch {
    ed25519PairCache = false;
    return null;
  }
}

/**
 * Public Ed25519 key bytes for verification (env public, else derived from seed).
 * Safe to expose via GET /api/v1/public/freshness-export-verification-key.
 */
function getFreshnessExportEd25519PublicKeyBytes() {
  const fromEnv = parsePublicKey32FromEnv();
  if (fromEnv) return fromEnv;
  const pair = getEd25519KeyPair();
  return pair ? pair.publicKey : null;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hmacSha256Hex(secret, value) {
  return crypto.createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

function stableStringifyRows(rows) {
  return JSON.stringify(Array.isArray(rows) ? rows : []);
}

function buildProofInput({ payloadHash, endpoint, hours, rowCount, generatedAtIso }) {
  const ep = endpoint == null || endpoint === "" ? "all" : String(endpoint);
  const h = Number.isFinite(Number(hours)) ? Number(hours) : 24;
  const n = Math.max(0, Math.floor(Number(rowCount) || 0));
  return `${PROOF_PREFIX}|${PROOF_VERSION}|${payloadHash}|${ep}|${h}|${n}|${String(generatedAtIso || "")}`;
}

function proofMessageBytes(proofInput) {
  return Buffer.from(String(proofInput || ""), "utf8");
}

function timingSafeEqualBytes(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function timingSafeEqualHex(a, b) {
  const bufA = Buffer.from(String(a || ""), "hex");
  const bufB = Buffer.from(String(b || ""), "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function timingSafeEqualUtf8(a, b) {
  const bufA = Buffer.from(String(a || ""), "utf8");
  const bufB = Buffer.from(String(b || ""), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Build signed export (prefers Ed25519 when seed is configured; else HMAC).
 * @param {{ rows: unknown[], endpoint: string|null, hours: number, generatedAtIso: string }} params
 */
function signFreshnessHistoryExport(params) {
  const pair = getEd25519KeyPair();
  const rows = Array.isArray(params.rows) ? params.rows : [];
  const endpoint = params.endpoint == null ? "all" : params.endpoint;
  const hours = Number.isFinite(Number(params.hours)) ? Number(params.hours) : 24;
  const generatedAtIso = String(params.generatedAtIso || new Date().toISOString());

  const rowsJson = stableStringifyRows(rows);
  const payloadHash = sha256Hex(rowsJson);
  const proofInput = buildProofInput({
    payloadHash,
    endpoint: endpoint || "all",
    hours,
    rowCount: rows.length,
    generatedAtIso
  });

  if (pair) {
    const msg = proofMessageBytes(proofInput);
    const sig = nacl.sign.detached(msg, pair.secretKey);
    const pubHex = Buffer.from(pair.publicKey).toString("hex");
    return {
      ok: true,
      generatedAtIso,
      endpoint: endpoint || "all",
      hours,
      rowsCount: rows.length,
      integrity: {
        hashAlgorithm: "sha256",
        signatureAlgorithm: SIG_ED25519,
        keyHint: "FRESHNESS_HISTORY_EXPORT_ED25519_SEED_BASE64",
        publicKeyHex: pubHex,
        payloadHash,
        proofInput,
        signature: Buffer.from(sig).toString("hex")
      },
      data: rows
    };
  }

  const secret = signingSecret();
  if (!secret) return { ok: false, reason: "export_signing_key_missing" };

  const signature = hmacSha256Hex(secret, proofInput);
  return {
    ok: true,
    generatedAtIso,
    endpoint: endpoint || "all",
    hours,
    rowsCount: rows.length,
    integrity: {
      hashAlgorithm: "sha256",
      signatureAlgorithm: SIG_HMAC,
      keyHint: "FRESHNESS_HISTORY_EXPORT_SIGNING_KEY",
      payloadHash,
      proofInput,
      signature
    },
    data: rows
  };
}

const VERIFY_MAX_ROWS = Math.min(10_000, Math.max(100, Math.floor(Number(process.env.FRESHNESS_HISTORY_VERIFY_MAX_ROWS || 6000))));

function parseHexToUint8(hex, expectedLen) {
  const s = String(hex || "").trim();
  if (!s || s.length !== expectedLen * 2) return null;
  try {
    return new Uint8Array(Buffer.from(s, "hex"));
  } catch {
    return null;
  }
}

function resolveEd25519PublicForVerify(integ) {
  const envPub = parsePublicKey32FromEnv();
  const docHex = String(integ.publicKeyHex || "").trim();
  const docPub = docHex ? parseHexToUint8(docHex, 32) : null;
  if (envPub && docPub) {
    if (!timingSafeEqualBytes(envPub, docPub)) return { ok: false, reason: "ed25519_public_key_mismatch" };
    return { ok: true, publicKey: envPub };
  }
  if (envPub) return { ok: true, publicKey: envPub };
  if (docPub) return { ok: true, publicKey: docPub };
  const derived = getEd25519KeyPair();
  if (derived) return { ok: true, publicKey: derived.publicKey };
  return { ok: false, reason: "ed25519_public_key_missing" };
}

function verifyEd25519Export(doc, data, integ, hashMatches, proofInputMatches) {
  const pubRes = resolveEd25519PublicForVerify(integ);
  if (!pubRes.ok) {
    return {
      ok: true,
      valid: false,
      reason: pubRes.reason || "ed25519_public_key_missing",
      hashMatches,
      proofInputMatches,
      signatureMatches: false,
      exportType: EXPORT_TYPE,
      signatureAlgorithm: SIG_ED25519
    };
  }
  const sigBytes = parseHexToUint8(integ.signature, 64);
  if (!sigBytes) {
    return {
      ok: true,
      valid: false,
      reason: "invalid_ed25519_signature_encoding",
      hashMatches,
      proofInputMatches,
      signatureMatches: false,
      exportType: EXPORT_TYPE,
      signatureAlgorithm: SIG_ED25519
    };
  }
  const msg = proofMessageBytes(integ.proofInput);
  const rawOk =
    proofInputMatches &&
    nacl.sign.detached.verify(msg, sigBytes, pubRes.publicKey);
  const signatureMatches = Boolean(hashMatches && rawOk);
  const valid = Boolean(hashMatches && proofInputMatches && rawOk);
  return {
    ok: true,
    valid,
    reason: valid ? null : "verification_failed",
    hashMatches,
    proofInputMatches,
    signatureMatches,
    exportType: EXPORT_TYPE,
    signatureAlgorithm: SIG_ED25519
  };
}

function verifyHmacExport(doc, data, integ, hashMatches, proofInputMatches) {
  const secret = signingSecret();
  if (!secret) {
    return { ok: false, valid: false, reason: "export_signing_key_missing" };
  }
  const expectedSig = hmacSha256Hex(secret, String(integ.proofInput || ""));
  const signatureOk = proofInputMatches && timingSafeEqualHex(expectedSig, String(integ.signature || ""));
  const signatureMatches = Boolean(hashMatches && signatureOk);
  const valid = Boolean(hashMatches && proofInputMatches && signatureOk);
  return {
    ok: true,
    valid,
    reason: valid ? null : "verification_failed",
    hashMatches,
    proofInputMatches,
    signatureMatches,
    exportType: EXPORT_TYPE,
    signatureAlgorithm: SIG_HMAC
  };
}

/**
 * Verify a signed freshness history export document (no DB calls).
 * Ed25519: public key from env and/or embedded `publicKeyHex` (must match env when both present).
 * HMAC: requires server secret.
 * @param {unknown} doc
 */
function verifyFreshnessHistorySignedExport(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { ok: true, valid: false, reason: "invalid_document", hashMatches: false, proofInputMatches: false, signatureMatches: false };
  }
  if (String(doc.type || "") !== EXPORT_TYPE) {
    return { ok: true, valid: false, reason: "wrong_type", hashMatches: false, proofInputMatches: false, signatureMatches: false };
  }
  const data = doc.data;
  if (!Array.isArray(data)) {
    return { ok: true, valid: false, reason: "data_not_array", hashMatches: false, proofInputMatches: false, signatureMatches: false };
  }
  if (data.length > VERIFY_MAX_ROWS) {
    return {
      ok: true,
      valid: false,
      reason: "payload_too_large",
      hashMatches: false,
      proofInputMatches: false,
      signatureMatches: false
    };
  }
  const integ = doc.integrity;
  if (!integ || typeof integ !== "object") {
    return { ok: true, valid: false, reason: "missing_integrity", hashMatches: false, proofInputMatches: false, signatureMatches: false };
  }

  const rowsJson = stableStringifyRows(data);
  const recalculatedHash = sha256Hex(rowsJson);
  const declaredHash = String(integ.payloadHash || "");
  const hashMatches = timingSafeEqualHex(recalculatedHash, declaredHash);

  const generatedAtIso = String(doc.generatedAt || "");
  const endpoint = doc.endpoint == null ? "all" : String(doc.endpoint);
  const hours = Number.isFinite(Number(doc.hours)) ? Number(doc.hours) : 24;
  const rowsCountDoc = Number.isFinite(Number(doc.rowsCount)) ? Number(doc.rowsCount) : data.length;
  if (rowsCountDoc !== data.length) {
    return {
      ok: true,
      valid: false,
      reason: "rows_count_mismatch",
      hashMatches,
      proofInputMatches: false,
      signatureMatches: false
    };
  }

  const expectedProofInput = buildProofInput({
    payloadHash: declaredHash,
    endpoint,
    hours,
    rowCount: data.length,
    generatedAtIso
  });
  const proofInputMatches = timingSafeEqualUtf8(expectedProofInput, String(integ.proofInput || ""));

  const algo = String(integ.signatureAlgorithm || SIG_HMAC).toLowerCase();
  if (algo === SIG_ED25519) {
    return verifyEd25519Export(doc, data, integ, hashMatches, proofInputMatches);
  }
  return verifyHmacExport(doc, data, integ, hashMatches, proofInputMatches);
}

module.exports = {
  EXPORT_TYPE,
  SIG_ED25519,
  SIG_HMAC,
  signFreshnessHistoryExport,
  verifyFreshnessHistorySignedExport,
  getFreshnessExportEd25519PublicKeyBytes
};
