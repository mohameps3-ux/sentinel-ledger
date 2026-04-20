/**
 * Ed25519 verifier for `sentinel:score` payloads.
 *
 * Parity contract with backend/src/lib/scoreSigner.js
 * ---------------------------------------------------
 * The canonical bytes produced here MUST match byte-for-byte what the backend
 * signs. Any divergence silently turns every score into "tampered" and breaks
 * the trust layer. Keep `canonicalize()` in lockstep with its Node twin.
 *
 * Trust model
 * -----------
 *  1. First verification lazily fetches `GET /api/v1/scoring/public-key`.
 *  2. Pubkey is cached in-module along with its `pubkeyFp` fingerprint.
 *  3. Every incoming score carries its signer's `pubkeyFp`. If that value
 *     does not match the cached key (deployment rotated the signing key),
 *     the verifier transparently refetches — no user action required.
 *  4. Verification is always best-effort. A verifier failure NEVER blocks
 *     score rendering; the UI downgrades to an `unknown` badge.
 *
 * Statuses emitted
 * ----------------
 *   "verified" — signature matched the current signer's pubkey.
 *   "tampered" — signature present but failed verification. Treat payload
 *                as hostile (dev-only console.warn; no user-facing alarm
 *                yet — to be wired into the UI once the signed-pipeline is
 *                fully rolled out and the false-positive rate is confirmed).
 *   "unsigned" — payload carries no signature. Legacy emitter or older
 *                backend. Tolerated gracefully.
 *   "unknown"  — network error fetching the pubkey, library failed to
 *                load, or pubkey endpoint returned 5xx. Re-attempted on
 *                the next score arrival.
 *
 * Security notes
 * --------------
 *  - Pubkey is served over HTTPS (same origin as the rest of the API). The
 *    browser's TLS chain is the root of trust here; no additional pinning.
 *  - We cache negative results (fetch failures) for a short window to avoid
 *    spamming the endpoint on repeated socket pushes.
 *  - We do NOT cache cross-tabs (localStorage). The module cache lives for
 *    the tab's lifetime, which is sufficient; a redundant network fetch on
 *    a new tab is cheaper than the attack surface of a poisoned cache.
 */

const SIG_ALG = "ed25519-v1";
const NEGATIVE_CACHE_MS = 30_000;

let edPromise = null;
async function loadEd() {
  if (edPromise) return edPromise;
  edPromise = import("@noble/ed25519").catch((err) => {
    edPromise = null;
    throw err;
  });
  return edPromise;
}

let pubkeyState = {
  pubkey: null, // Uint8Array(32) | null
  pubkeyFp: null, // 16-hex chars | null
  fetchedAt: 0,
  negativeUntil: 0
};

let fetchInFlight = null;

/** Hex → Uint8Array. Returns null on malformed input (instead of throwing). */
function hexToBytes(hex) {
  if (typeof hex !== "string") return null;
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Deterministic UTF-8 bytes of the signable subset of a score result.
 * MUST match backend/src/lib/scoreSigner.js `canonicalize()` byte-for-byte.
 */
function canonicalize(result) {
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
  return new TextEncoder().encode(JSON.stringify(ordered));
}

async function fetchPublicKey(apiBase) {
  const now = Date.now();
  if (now < pubkeyState.negativeUntil) return null;
  if (fetchInFlight) return fetchInFlight;
  fetchInFlight = (async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/scoring/public-key`, {
        cache: "no-store"
      });
      if (!res.ok) {
        pubkeyState.negativeUntil = Date.now() + NEGATIVE_CACHE_MS;
        return null;
      }
      const body = await res.json();
      if (!body || body.alg !== SIG_ALG) {
        pubkeyState.negativeUntil = Date.now() + NEGATIVE_CACHE_MS;
        return null;
      }
      const bytes = hexToBytes(body.pubkey);
      if (!bytes || bytes.length !== 32) {
        pubkeyState.negativeUntil = Date.now() + NEGATIVE_CACHE_MS;
        return null;
      }
      pubkeyState = {
        pubkey: bytes,
        pubkeyFp: String(body.pubkeyFp || ""),
        fetchedAt: Date.now(),
        negativeUntil: 0
      };
      return pubkeyState;
    } catch (_) {
      pubkeyState.negativeUntil = Date.now() + NEGATIVE_CACHE_MS;
      return null;
    } finally {
      fetchInFlight = null;
    }
  })();
  return fetchInFlight;
}

async function resolvePubkey(score, apiBase) {
  const incomingFp = typeof score?.pubkeyFp === "string" ? score.pubkeyFp : null;
  if (pubkeyState.pubkey && (!incomingFp || pubkeyState.pubkeyFp === incomingFp)) {
    return pubkeyState;
  }
  // Either we have no pubkey yet, or the score was signed by a fingerprint
  // we don't recognize (deployment rotation). Refetch.
  pubkeyState.negativeUntil = 0;
  return fetchPublicKey(apiBase);
}

/**
 * Verify one score payload. Never throws.
 * @param {object} score   The `sentinel:score` object from socket or REST.
 * @param {string} apiBase Public API base URL.
 * @returns {Promise<"verified"|"tampered"|"unsigned"|"unknown">}
 */
export async function verifyScore(score, apiBase) {
  if (!score || typeof score !== "object") return "unknown";
  if (!score.signature || score.sigAlg !== SIG_ALG) return "unsigned";

  const sigBytes = hexToBytes(score.signature);
  if (!sigBytes || sigBytes.length !== 64) return "tampered";

  let pk;
  try {
    pk = await resolvePubkey(score, apiBase);
  } catch (_) {
    return "unknown";
  }
  if (!pk || !pk.pubkey) return "unknown";

  // Strip signing fields before canonicalizing — MUST match backend exactly.
  const { signature: _s, pubkeyFp: _f, sigAlg: _a, ...stripped } = score;
  const msg = canonicalize(stripped);

  let ed;
  try {
    ed = await loadEd();
  } catch (_) {
    return "unknown";
  }

  try {
    const ok = await ed.verifyAsync(sigBytes, msg, pk.pubkey);
    return ok ? "verified" : "tampered";
  } catch (_) {
    return "tampered";
  }
}

/**
 * Synchronous snapshot of the currently trusted public key info. Useful for
 * debugging / dev overlays. Returns null before the first fetch completes.
 */
export function getTrustedKeyInfo() {
  if (!pubkeyState.pubkey) return null;
  return {
    pubkeyFp: pubkeyState.pubkeyFp,
    fetchedAt: pubkeyState.fetchedAt,
    alg: SIG_ALG
  };
}

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  window.__sentinelTrustedKey = () => getTrustedKeyInfo();
}
