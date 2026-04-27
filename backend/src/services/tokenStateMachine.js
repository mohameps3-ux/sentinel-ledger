"use strict";

/**
 * Sentinel token state machine (Phase 3 of the Sentinel Engine roadmap).
 *
 * Additive, deterministic, in-memory. No external infra, no DB schema,
 * no Redis dependency: the orchestrator runs as a single process so a
 * Map with TTL eviction is enough today. If we ever scale horizontally
 * the persistence layer can be plugged behind the same `getState` /
 * `applyEvent` API without touching callers.
 *
 * States
 * ------
 *   IDLE        no actionable signal; nothing to show
 *   WATCH       early signs (mid score, low conviction, scout setup)
 *   ACCUMULATE  smart-money + score >= 65 + entry window open
 *   OVERHEAT    big move + score decay (suggests momentum exhaustion)
 *   EXIT        action says TOO LATE / STAY OUT
 *   LEDGER      terminal — outcome was recorded; signal is historical
 *
 * Transitions are pure functions of the incoming event so the same
 * input always produces the same next state. There is no LLM and no
 * probabilistic component; this purely organizes the existing scoring
 * stream into a coherent narrative timeline per token.
 */

const STATES = Object.freeze({
  IDLE: "IDLE",
  WATCH: "WATCH",
  ACCUMULATE: "ACCUMULATE",
  OVERHEAT: "OVERHEAT",
  EXIT: "EXIT",
  LEDGER: "LEDGER"
});

const TTL_MS = Math.max(60_000, Number(process.env.SENTINEL_STATE_TTL_MS || 6 * 60 * 60 * 1000));
const MAX_TRACKED_TOKENS = Math.max(100, Number(process.env.SENTINEL_STATE_MAX_TOKENS || 5_000));

const tokenStates = new Map();

function nowMs() {
  return Date.now();
}

function asConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? Math.min(100, Math.max(0, n)) / 100 : Math.min(1, Math.max(0, n));
}

function asScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? Math.round(n * 100) : Math.round(Math.max(0, Math.min(100, n)));
}

function normalizedAction(value) {
  return String(value || "").trim().toUpperCase();
}

function pruneStaleEntries() {
  if (tokenStates.size <= MAX_TRACKED_TOKENS) return;
  const cutoff = nowMs() - TTL_MS;
  for (const [mint, entry] of tokenStates) {
    if (!entry || entry.updatedAt < cutoff) tokenStates.delete(mint);
  }
  if (tokenStates.size > MAX_TRACKED_TOKENS) {
    const overflow = tokenStates.size - MAX_TRACKED_TOKENS;
    let removed = 0;
    for (const mint of tokenStates.keys()) {
      tokenStates.delete(mint);
      removed += 1;
      if (removed >= overflow) break;
    }
  }
}

/**
 * Decide the next state from the previous state and the incoming event.
 * Pure function — no I/O.
 *
 * @param {object|null} prev current entry { state, since, updatedAt }
 * @param {object} ctx normalized event context
 * @returns {string} next state from STATES
 */
function decideNextState(prev, ctx) {
  const prevState = prev?.state || STATES.IDLE;

  if (ctx.action === "TOO LATE" || ctx.action === "TOO_LATE" || ctx.action === "STAY OUT" || ctx.action === "STAY_OUT") {
    return STATES.EXIT;
  }

  if (ctx.outcomeResolved === true) {
    return STATES.LEDGER;
  }

  if (prevState === STATES.LEDGER || prevState === STATES.EXIT) {
    return prevState;
  }

  if (ctx.score != null && ctx.score >= 65 && ctx.confidence >= 0.5 && (ctx.severity === "URGENT" || ctx.severity === "TACTICAL")) {
    return STATES.ACCUMULATE;
  }

  if (ctx.priceChange24h != null && ctx.priceChange24h >= 35 && ctx.scoreDelta != null && ctx.scoreDelta < -3) {
    return STATES.OVERHEAT;
  }

  if (ctx.priceChange24h != null && ctx.priceChange24h >= 60) {
    return STATES.OVERHEAT;
  }

  if (prevState === STATES.OVERHEAT && ctx.scoreDelta != null && ctx.scoreDelta >= 0 && ctx.priceChange24h != null && ctx.priceChange24h < 25) {
    return STATES.WATCH;
  }

  if (ctx.score != null && ctx.score >= 40 && ctx.confidence >= 0.3) {
    return STATES.WATCH;
  }

  if (ctx.confidence < 0.25) {
    return STATES.IDLE;
  }

  return prevState;
}

/**
 * Read the current state for a mint without modifying it.
 * @param {string} mint
 * @returns {{ state: string, since: number, updatedAt: number } | null}
 */
function getState(mint) {
  if (!mint) return null;
  const entry = tokenStates.get(String(mint));
  if (!entry) return null;
  if (entry.updatedAt + TTL_MS < nowMs()) {
    tokenStates.delete(String(mint));
    return null;
  }
  return { ...entry };
}

/**
 * Apply an observed event to the per-token state machine and return the
 * new state. Always succeeds; on bad input it falls back to IDLE without
 * persisting noise.
 *
 * @param {string} mint
 * @param {object} eventCtx event context (severity, action, score, confidence,
 *                          scoreDelta, priceChange24h, outcomeResolved)
 * @returns {{ state: string, since: number, prev: string }}
 */
function applyEvent(mint, eventCtx = {}) {
  const key = String(mint || "").trim();
  if (!key) return { state: STATES.IDLE, since: nowMs(), prev: STATES.IDLE };

  pruneStaleEntries();

  const ctx = {
    severity: String(eventCtx.severity || "INFO").toUpperCase(),
    action: normalizedAction(eventCtx.action),
    score: asScore(eventCtx.score),
    confidence: asConfidence(eventCtx.confidence),
    scoreDelta: Number.isFinite(Number(eventCtx.scoreDelta)) ? Number(eventCtx.scoreDelta) : null,
    priceChange24h: Number.isFinite(Number(eventCtx.priceChange24h)) ? Number(eventCtx.priceChange24h) : null,
    outcomeResolved: eventCtx.outcomeResolved === true
  };

  const previous = getState(key);
  const prevState = previous?.state || STATES.IDLE;
  const nextState = decideNextState(previous, ctx);

  const now = nowMs();
  const since = nextState === prevState && previous?.since ? previous.since : now;
  const entry = { state: nextState, since, updatedAt: now };
  tokenStates.set(key, entry);

  return { state: nextState, since, prev: prevState };
}

/**
 * Reset state for tests / ops. Not exposed via routes.
 */
function _reset() {
  tokenStates.clear();
}

module.exports = {
  STATES,
  applyEvent,
  getState,
  decideNextState,
  _reset
};
