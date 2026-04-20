"use strict";

/**
 * Process-local ingestion telemetry. Read by `/health/ingestion` (L2) and
 * `/health/sync` (L3). The worker / webhook layer must call:
 *
 *   recordRawReceived(source)            // before normalization
 *   recordEventEmitted(event, latencyMs) // after a SentinelEvent is dispatched
 *   recordChainTip(network, blockNumber) // when we learn the chain head
 *   updateBufferDepth(n)                 // periodically from queue / batch
 *
 * State is intentionally simple and serializable — it is what the health endpoints
 * surface to ops dashboards.
 */

const networks = new Map(); // network -> { lastEventAt, lastBlockProcessed, chainTipBlock, eventsTotal }
const sources = new Map(); // source -> { lastEventAt, eventsTotal, lastError }
let lastEventAtAny = null;
let lastEventTypeAny = null;
let bufferDepth = 0;
let totalEventsEmitted = 0;
let totalRawReceived = 0;
let normalizationLatencyEmaMs = null; // exponential moving average

function getNetworkState(network) {
  if (!networks.has(network)) {
    networks.set(network, {
      lastEventAt: null,
      lastBlockProcessed: null,
      chainTipBlock: null,
      eventsTotal: 0
    });
  }
  return networks.get(network);
}

function getSourceState(source) {
  if (!sources.has(source)) {
    sources.set(source, { lastEventAt: null, eventsTotal: 0, lastError: null });
  }
  return sources.get(source);
}

function recordRawReceived(source) {
  totalRawReceived += 1;
  if (source) {
    const s = getSourceState(source);
    s.eventsTotal = (s.eventsTotal || 0) + 0; // touch
  }
}

function recordSourceError(source, error) {
  const s = getSourceState(source || "unknown");
  s.lastError = {
    at: Date.now(),
    message: String(error?.message || error || "error").slice(0, 240)
  };
}

function recordEventEmitted(event, latencyMs) {
  if (!event) return;
  const now = Date.now();
  totalEventsEmitted += 1;
  lastEventAtAny = now;
  lastEventTypeAny = event.type || null;

  const net = getNetworkState(event.network);
  net.lastEventAt = now;
  net.eventsTotal += 1;
  if (Number.isFinite(event.blockNumber)) {
    if (net.lastBlockProcessed == null || event.blockNumber > net.lastBlockProcessed) {
      net.lastBlockProcessed = event.blockNumber;
    }
  }

  if (event.source) {
    const s = getSourceState(event.source);
    s.lastEventAt = now;
    s.eventsTotal += 1;
  }

  if (Number.isFinite(latencyMs) && latencyMs >= 0) {
    if (normalizationLatencyEmaMs == null) {
      normalizationLatencyEmaMs = latencyMs;
    } else {
      // alpha 0.2 — smooths spikes but reacts within ~10 events.
      normalizationLatencyEmaMs = normalizationLatencyEmaMs * 0.8 + latencyMs * 0.2;
    }
  }
}

function recordChainTip(network, blockNumber) {
  if (!network || !Number.isFinite(blockNumber)) return;
  const net = getNetworkState(network);
  if (net.chainTipBlock == null || blockNumber > net.chainTipBlock) {
    net.chainTipBlock = blockNumber;
  }
}

function updateBufferDepth(depth) {
  const n = Number(depth);
  bufferDepth = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function snapshotNetworks() {
  const out = {};
  const now = Date.now();
  for (const [name, net] of networks.entries()) {
    const lag =
      net.chainTipBlock != null && net.lastBlockProcessed != null
        ? Math.max(0, net.chainTipBlock - net.lastBlockProcessed)
        : null;
    const ageMs = net.lastEventAt ? now - net.lastEventAt : null;
    const healthyByLag = lag == null ? null : lag <= 50;
    const healthyByFreshness = ageMs == null ? null : ageMs <= 30_000;
    const healthy =
      healthyByLag == null || healthyByFreshness == null
        ? null
        : healthyByLag && healthyByFreshness;
    out[name] = {
      lastEventAt: net.lastEventAt,
      lastEventAgeMs: ageMs,
      lastBlockProcessed: net.lastBlockProcessed,
      chainTipBlock: net.chainTipBlock,
      lag,
      eventsTotal: net.eventsTotal,
      healthy
    };
  }
  return out;
}

function snapshotSources() {
  const out = {};
  for (const [name, s] of sources.entries()) {
    out[name] = { ...s };
  }
  return out;
}

/**
 * Aggregate snapshot used by the health endpoints. Cheap to call (O(networks + sources)).
 */
function getIngestionSnapshot() {
  const now = Date.now();
  const lastEventAgeMs = lastEventAtAny ? now - lastEventAtAny : null;
  const networkSnap = snapshotNetworks();

  // L2 status: degrade if no event in last 60s on any network
  let ingestionStatus = "OK";
  if (lastEventAtAny == null) {
    ingestionStatus = "WAITING";
  } else if (lastEventAgeMs > 60_000) {
    ingestionStatus = "DEGRADED";
  }

  // L3 status: combine lag, freshness and buffer
  let syncStatus = "SYNCED";
  let syncReason = null;
  const lagViolators = Object.entries(networkSnap).filter(([, v]) => v.lag != null && v.lag > 50);
  const freshnessViolated = lastEventAgeMs != null && lastEventAgeMs > 30_000;
  if (lagViolators.length) {
    syncStatus = "LAGGING";
    syncReason = `chain_lag:${lagViolators.map(([n, v]) => `${n}=${v.lag}`).join(",")}`;
  }
  if (freshnessViolated) {
    syncStatus = syncStatus === "SYNCED" ? "STALE" : syncStatus;
    syncReason = syncReason || `data_freshness_ms:${lastEventAgeMs}`;
  }
  if (bufferDepth > 5000) {
    syncStatus = syncStatus === "SYNCED" ? "BACKPRESSURE" : `${syncStatus}+BACKPRESSURE`;
    syncReason = syncReason
      ? `${syncReason};buffer:${bufferDepth}`
      : `buffer_saturation:${bufferDepth}`;
  }

  return {
    now,
    ingestionStatus,
    syncStatus,
    syncReason,
    lastEventAt: lastEventAtAny,
    lastEventAgeMs,
    lastEventType: lastEventTypeAny,
    totalEventsEmitted,
    totalRawReceived,
    normalizationLatencyEmaMs:
      normalizationLatencyEmaMs == null ? null : Math.round(normalizationLatencyEmaMs * 100) / 100,
    bufferDepth,
    networks: networkSnap,
    sources: snapshotSources()
  };
}

function _resetIngestionState() {
  networks.clear();
  sources.clear();
  lastEventAtAny = null;
  lastEventTypeAny = null;
  bufferDepth = 0;
  totalEventsEmitted = 0;
  totalRawReceived = 0;
  normalizationLatencyEmaMs = null;
}

module.exports = {
  recordRawReceived,
  recordSourceError,
  recordEventEmitted,
  recordChainTip,
  updateBufferDepth,
  getIngestionSnapshot,
  _resetIngestionState
};
