import { memo, useEffect, useRef, useState } from "react";
import { useScoreSocket } from "../../hooks/useScoreSocket";

/**
 * Zero-Click Live Card Overlay.
 *
 * Phase 1 of the "Zero-Click" paradigm: put Sentinel scoring output directly
 * on home-feed cards so the user can discover *why* a token is moving
 * without ever entering a detail page. The overlay is intentionally
 * additive — it renders *nothing* when no score data is available, so
 * cards in the list that haven't been scored in the last 10 minutes keep
 * their existing layout untouched.
 *
 * Design
 * ------
 *  - Subscribes to `useScoreSocket(mint)`, which:
 *      · shares one WebSocket across the whole page (singleton),
 *      · ref-counts `join-token` / `leave-token` so the same mint is never
 *        joined twice even if it appears in multiple grids,
 *      · bootstraps from `/scoring/latest/:mint` through the shared queue
 *        (`lib/scoreBootstrapQueue.js`) to cap concurrency and deduplicate.
 *  - Wrapped in `React.memo` so a parent re-render (signal cursor tick,
 *    strategy toggle, etc.) doesn't force the overlay to re-reconcile.
 *  - All three score bars animate their width via pure CSS `transition`,
 *    so incoming socket updates produce smooth visual change with zero JS
 *    animation tick.
 *  - A `flashKey` briefly lights up the signal chips when a *new* set of
 *    signals arrives, so the user's eye catches the moment an on-chain
 *    signal fires. No timers per card; pure CSS via key remounting.
 *
 * The component has ONE dependency on the larger app: the shape of the
 * payload returned by the scoring engine (`{ scores, signals, confidence }`).
 * That contract is already exercised by `/token/[address]`'s terminal.
 */

const SIGNAL_TAGS = {
  whale_accumulation: { label: "WHALE", tone: "emerald" },
  liquidity_shock: { label: "LIQ-SHOCK", tone: "amber" },
  cluster_buy: { label: "CLUSTER", tone: "cyan" },
  new_wallet_confidence: { label: "FRESH-SM", tone: "violet" },
  velocity_spike: { label: "VELOCITY", tone: "orange" }
};

const TONE_CLASS = {
  emerald: "text-emerald-200 border-emerald-500/40 bg-emerald-500/10",
  amber: "text-amber-200 border-amber-500/40 bg-amber-500/10",
  cyan: "text-cyan-200 border-cyan-500/40 bg-cyan-500/10",
  violet: "text-violet-200 border-violet-500/40 bg-violet-500/10",
  orange: "text-orange-200 border-orange-500/40 bg-orange-500/10",
  slate: "text-slate-200 border-white/15 bg-white/[0.04]"
};

function clampPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/**
 * Pure CSS bar. Width animates with `transition`. No JS ticking.
 * The gradient encodes the dimension (risk = red→orange, smart = green,
 * momentum = amber→orange) so color alone conveys meaning, which matters
 * at the 30 px scale where text labels can be skipped by the eye.
 */
function MiniBar({ label, value, gradient, title }) {
  const v = clampPct(value);
  return (
    <div className="flex items-center gap-1.5" title={title}>
      <span className="w-6 text-[8px] uppercase tracking-[0.14em] text-gray-500 font-semibold shrink-0">
        {label}
      </span>
      <div className="flex-1 h-[3px] rounded-full bg-black/50 overflow-hidden ring-1 ring-white/5">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-[width] duration-700 ease-out`}
          style={{ width: `${v}%` }}
        />
      </div>
      <span className="w-5 text-right font-mono tabular-nums text-[9px] text-gray-300 shrink-0">
        {v}
      </span>
    </div>
  );
}

function SignalChip({ signal, flashing }) {
  const def = SIGNAL_TAGS[signal] || {
    label: String(signal).replace(/[^a-z0-9]+/gi, "_").toUpperCase().slice(0, 10),
    tone: "slate"
  };
  return (
    <span
      className={`inline-flex items-center text-[8.5px] leading-none font-bold uppercase tracking-[0.08em] px-1.5 py-[3px] rounded border ${TONE_CLASS[def.tone]} ${
        flashing ? "animate-pulse" : ""
      }`}
      title={`On-chain signal: ${signal}`}
    >
      [{def.label}]
    </span>
  );
}

function LiveCardOverlayImpl({ mint }) {
  const { score } = useScoreSocket(mint);

  // When the *set* of signals changes, remount the chips row via `flashKey`
  // so the CSS animate-pulse fires exactly once per signal change. No setTimeout,
  // no state churn after the flash — React unmounts the old key and the new
  // one mounts with the animation class fresh. The next render clears it.
  const prevSignalsRef = useRef("");
  const [flashKey, setFlashKey] = useState(0);
  const signalsJoined = Array.isArray(score?.signals) ? score.signals.slice(0, 4).join(",") : "";
  useEffect(() => {
    if (signalsJoined && signalsJoined !== prevSignalsRef.current) {
      prevSignalsRef.current = signalsJoined;
      setFlashKey((k) => k + 1);
    }
  }, [signalsJoined]);

  if (!score || !score.scores) return null;

  const scores = score.scores;
  const signals = Array.isArray(score.signals) ? score.signals : [];
  const confidenceLabel = score.confidenceLabel || null;
  const confidence = Number.isFinite(Number(score.confidence)) ? Math.round(Number(score.confidence)) : null;

  return (
    <div
      className="mt-2 pt-2 border-t border-white/[0.06] space-y-1.5"
      data-testid="live-card-overlay"
    >
      {signals.length > 0 ? (
        <div key={flashKey} className="flex flex-wrap gap-1">
          {signals.slice(0, 4).map((s) => (
            <SignalChip key={s} signal={s} flashing />
          ))}
          {confidence != null && (
            <span
              className="inline-flex items-center text-[8.5px] leading-none font-bold uppercase tracking-[0.08em] px-1.5 py-[3px] rounded border border-white/12 bg-black/30 text-gray-300 font-mono tabular-nums ml-auto"
              title={`Confidence: ${confidenceLabel || confidence + "%"}`}
            >
              {confidenceLabel ? `${confidenceLabel.toUpperCase()} · ${confidence}%` : `${confidence}%`}
            </span>
          )}
        </div>
      ) : null}
      <div className="space-y-[3px]">
        <MiniBar
          label="RSK"
          value={scores.risk}
          gradient="from-rose-500 via-red-500 to-orange-400"
          title={`Risk ${clampPct(scores.risk)} / 100`}
        />
        <MiniBar
          label="SMT"
          value={scores.smart}
          gradient="from-emerald-400 via-lime-400 to-cyan-400"
          title={`Smart Money ${clampPct(scores.smart)} / 100`}
        />
        <MiniBar
          label="MOM"
          value={scores.momentum}
          gradient="from-amber-300 via-amber-400 to-orange-400"
          title={`Momentum ${clampPct(scores.momentum)} / 100`}
        />
      </div>
    </div>
  );
}

/**
 * `mint` is the only meaningful prop; memoization means the overlay skips
 * reconciliation on every parent re-render that doesn't change the mint.
 * Internal hook state (score, lastScoreAt) is separate from props and
 * continues to update normally.
 */
export const LiveCardOverlay = memo(LiveCardOverlayImpl, (a, b) => a.mint === b.mint);
