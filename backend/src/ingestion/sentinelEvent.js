"use strict";

/**
 * SentinelEvent contract — internal, source-agnostic.
 *
 * Every external feed (Helius webhook, Helius enhanced WS, future Alchemy / Base nodes)
 * MUST be normalized into this exact shape before touching cache, DB or sockets.
 *
 * This module is pure: no Redis, no DB. It only validates / builds events and
 * computes deterministic IDs. Tests can run it without any infra.
 *
 * @typedef {"solana" | "ethereum" | "base"} SentinelNetwork
 * @typedef {"TRANSFER" | "SWAP" | "LIQUIDITY_CHANGE" | "MINT"} SentinelEventType
 *
 * @typedef {Object} SentinelEventData
 * @property {string} actor       - On-chain address performing the action.
 * @property {string} asset       - Asset / mint identifier.
 * @property {string} amount      - Amount as string (avoid JS float drift).
 * @property {string} [quoteAsset]
 * @property {string} [quoteAmount]
 *
 * @typedef {Object} SentinelEventMetadata
 * @property {number} confidence       - 0..1 quality score from the normalizer.
 * @property {string[]} labels         - e.g. ["smart-money", "new-wallet"].
 * @property {number} processingTime   - ms spent in normalization (for L1 telemetry).
 *
 * @typedef {Object} SentinelEvent
 * @property {string} id                 - Deterministic dedup id.
 * @property {SentinelNetwork} network
 * @property {SentinelEventType} type
 * @property {string} source             - e.g. "helius_webhook", "alchemy_ws".
 * @property {number} timestamp          - Unix ms.
 * @property {number} blockNumber
 * @property {string} signature
 * @property {SentinelEventData} data
 * @property {SentinelEventMetadata} metadata
 */

const crypto = require("crypto");

const VALID_NETWORKS = new Set(["solana", "ethereum", "base"]);
const VALID_TYPES = new Set(["TRANSFER", "SWAP", "LIQUIDITY_CHANGE", "MINT"]);

/** Stable string for dedup hashing. Using `block_hash` if present, else block number + signature. */
function buildDedupSeed({ source, blockHash, blockNumber, signature, logIndex }) {
  const parts = [
    String(source || ""),
    String(blockHash || ""),
    blockNumber != null ? String(blockNumber) : "",
    String(signature || ""),
    logIndex != null ? String(logIndex) : ""
  ];
  return parts.join("|");
}

/**
 * Deterministic event id. Same inputs → same id, even after re-processing (replays).
 * SHA-256 is overkill cryptographically but trivially fast and avoids any collision risk in practice.
 */
function computeEventId(seedParts) {
  const seed = buildDedupSeed(seedParts);
  return crypto.createHash("sha256").update(seed).digest("hex");
}

function asString(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "bigint") return v.toString();
  return String(v);
}

/**
 * Validate and normalize a partial SentinelEvent input. Throws on hard errors;
 * returns a fully populated SentinelEvent with deterministic id + metadata defaults.
 *
 * Required by caller (the per-source adapter):
 *  - network, type, source, signature, blockNumber, data.actor, data.asset, data.amount
 *  - blockHash OR signature (used in id seed; both is best)
 *
 * Optional:
 *  - logIndex (recommended when one tx emits multiple events)
 *  - timestamp (defaults to Date.now())
 *  - metadata.confidence (defaults to 0.7), labels ([]), processingTime (0)
 */
function normalizeEvent(input, { processingStartedAt } = {}) {
  if (!input || typeof input !== "object") {
    throw new Error("sentinel_event_invalid_input");
  }

  const network = String(input.network || "").toLowerCase();
  if (!VALID_NETWORKS.has(network)) {
    throw new Error(`sentinel_event_invalid_network:${network || "missing"}`);
  }

  const type = String(input.type || "").toUpperCase();
  if (!VALID_TYPES.has(type)) {
    throw new Error(`sentinel_event_invalid_type:${type || "missing"}`);
  }

  const source = String(input.source || "").trim();
  if (!source) throw new Error("sentinel_event_missing_source");

  const signature = String(input.signature || "").trim();
  const blockHash = String(input.blockHash || "").trim();
  const blockNumber = Number(input.blockNumber);
  if (!Number.isFinite(blockNumber)) {
    throw new Error("sentinel_event_invalid_block_number");
  }
  if (!signature && !blockHash) {
    throw new Error("sentinel_event_missing_signature_or_block_hash");
  }

  const data = input.data || {};
  const actor = String(data.actor || "").trim();
  const asset = String(data.asset || "").trim();
  const amount = asString(data.amount);
  if (!actor) throw new Error("sentinel_event_missing_actor");
  if (!asset) throw new Error("sentinel_event_missing_asset");
  if (!amount) throw new Error("sentinel_event_missing_amount");

  const tsRaw = Number(input.timestamp);
  const timestamp = Number.isFinite(tsRaw) && tsRaw > 0 ? tsRaw : Date.now();

  const metaIn = input.metadata || {};
  const confidenceRaw = Number(metaIn.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.min(1, Math.max(0, confidenceRaw))
    : 0.7;
  const labels = Array.isArray(metaIn.labels)
    ? metaIn.labels.filter((l) => typeof l === "string" && l.length).slice(0, 16)
    : [];

  const processingTime =
    typeof processingStartedAt === "number" && processingStartedAt > 0
      ? Math.max(0, Date.now() - processingStartedAt)
      : Number.isFinite(metaIn.processingTime)
        ? Math.max(0, Number(metaIn.processingTime))
        : 0;

  const id = computeEventId({
    source,
    blockHash,
    blockNumber,
    signature,
    logIndex: input.logIndex
  });

  /** @type {SentinelEvent} */
  const event = {
    id,
    network,
    type,
    source,
    timestamp,
    blockNumber,
    signature,
    data: {
      actor,
      asset,
      amount,
      ...(data.quoteAsset ? { quoteAsset: String(data.quoteAsset) } : null),
      ...(data.quoteAmount ? { quoteAmount: asString(data.quoteAmount) } : null)
    },
    metadata: {
      confidence,
      labels,
      processingTime
    }
  };

  return event;
}

/**
 * Lightweight assertion for downstream consumers (worker, sockets, DB inserts).
 * Returns true or throws — useful in tests and when deserializing from queues.
 */
function assertSentinelEvent(evt) {
  if (!evt || typeof evt !== "object") throw new Error("sentinel_event_not_object");
  if (typeof evt.id !== "string" || evt.id.length !== 64) {
    throw new Error("sentinel_event_bad_id");
  }
  if (!VALID_NETWORKS.has(evt.network)) throw new Error("sentinel_event_bad_network");
  if (!VALID_TYPES.has(evt.type)) throw new Error("sentinel_event_bad_type");
  if (!evt.data || typeof evt.data !== "object") throw new Error("sentinel_event_bad_data");
  if (!evt.metadata || typeof evt.metadata !== "object") {
    throw new Error("sentinel_event_bad_metadata");
  }
  return true;
}

module.exports = {
  normalizeEvent,
  assertSentinelEvent,
  computeEventId,
  VALID_NETWORKS,
  VALID_TYPES
};
