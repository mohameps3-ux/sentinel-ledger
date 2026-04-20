import { useEffect, useRef } from "react";
import { appendEntry } from "../lib/insightsLog";

const CONFIDENCE_JUMP_DELTA = 10;

/**
 * Diff engine that turns the raw `sentinel:score` stream for one asset
 * into discrete activity-log entries. Meant to be called from the token
 * detail page (NOT the home feed) so we only pay the bookkeeping cost
 * for the asset the user is actually inspecting.
 *
 * Why accept `score` as an argument instead of subscribing internally?
 * -------------------------------------------------------------------
 * The token detail page already calls `useScoreSocket(asset)` for its
 * rendering needs. If this hook also subscribed, we'd have two parallel
 * setState pairs tracking the same underlying singleton socket for the
 * same mint. Taking `score` as a param keeps the recorder a pure
 * side-effect and collapses to one subscription per page.
 *
 * Contract
 * --------
 *  - Caller provides `asset` and the current `score` object from
 *    `useScoreSocket` (or any equivalent source).
 *  - Maintains the previous-observed snapshot in a ref (signals Set +
 *    confidence + timestamp).
 *  - On each new score:
 *      * signals in new but not in prev  -> append "signal_fired".
 *      * signals in prev but not in new  -> append "signal_faded".
 *      * confidence delta >= +10          -> append "confidence_jump".
 *      * confidence delta <= -10          -> append "confidence_drop".
 *  - The FIRST score the recorder sees has no baseline: every currently-
 *    active signal is emitted as "signal_fired" using the backend's
 *    own `score.timestamp`, so the user arriving mid-activity sees the
 *    right context. This is safe because the log dedups by
 *    (type, signal, floor(t/1000)) — refreshing the page does not
 *    duplicate these bootstrap entries.
 *
 * Safety
 * ------
 *  - `appendEntry` re-validates every field and silently drops bad
 *    payloads, so malformed socket frames cannot pollute the log.
 *  - The recorder does nothing if `asset` is falsy (SSR / detail page
 *    without a mint yet).
 *  - No state is written to React: the hook is side-effect-only. The
 *    UI reads via `useInsightsLog`.
 */
export function useInsightsRecorder(asset, score) {
  const prevRef = useRef({ signals: null, confidence: null, timestamp: null });

  useEffect(() => {
    // Reset the baseline when the asset changes so we don't diff across
    // different tokens.
    prevRef.current = { signals: null, confidence: null, timestamp: null };
  }, [asset]);

  useEffect(() => {
    if (!asset || !score) return;

    const ts = parseTimestamp(score.timestamp) ?? Date.now();
    const nextSignals = toSignalSet(score.signals);
    const nextConfidence = Number.isFinite(Number(score.confidence))
      ? Math.round(Number(score.confidence))
      : null;

    const prev = prevRef.current;

    if (prev.signals == null) {
      // First observation of this asset: synthesise fired events for
      // every currently-active signal at the backend's timestamp. The
      // log's dedup by canonical id makes this idempotent across
      // refreshes, so bootstrap doesn't balloon the log.
      for (const signal of nextSignals) {
        appendEntry(asset, { type: "signal_fired", signal, t: ts });
      }
    } else {
      // Signal diff — additions.
      for (const signal of nextSignals) {
        if (!prev.signals.has(signal)) {
          appendEntry(asset, { type: "signal_fired", signal, t: ts });
        }
      }
      // Signal diff — removals. `signal_faded` is valuable context:
      // "the whale left the room" is tradeable information.
      for (const signal of prev.signals) {
        if (!nextSignals.has(signal)) {
          appendEntry(asset, { type: "signal_faded", signal, t: ts });
        }
      }
      // Confidence jumps — only record meaningful moves. The ±10
      // threshold matches the BREAKOUT chip in `LiveCardOverlay` so
      // the two surfaces tell the same story.
      if (prev.confidence != null && nextConfidence != null) {
        const delta = nextConfidence - prev.confidence;
        if (delta >= CONFIDENCE_JUMP_DELTA) {
          appendEntry(asset, {
            type: "confidence_jump",
            from: prev.confidence,
            to: nextConfidence,
            t: ts
          });
        } else if (delta <= -CONFIDENCE_JUMP_DELTA) {
          appendEntry(asset, {
            type: "confidence_drop",
            from: prev.confidence,
            to: nextConfidence,
            t: ts
          });
        }
      }
    }

    prevRef.current = {
      signals: nextSignals,
      confidence: nextConfidence,
      timestamp: ts
    };
  }, [asset, score]);
}

// --- helpers ---

function parseTimestamp(raw) {
  if (!raw) return null;
  const n = typeof raw === "number" ? raw : Date.parse(raw);
  return Number.isFinite(n) ? n : null;
}

function toSignalSet(raw) {
  if (!Array.isArray(raw)) return new Set();
  const set = new Set();
  for (const s of raw) {
    if (typeof s === "string") {
      const trimmed = s.trim().toLowerCase();
      if (trimmed) set.add(trimmed);
    }
  }
  return set;
}
