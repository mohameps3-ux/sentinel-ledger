import { memo, useEffect, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { useScoreSocket } from "../../hooks/useScoreSocket";
import { useTerminalMemoryEntry } from "../../hooks/useTerminalMemoryEntry";
import { recordSeen, togglePin } from "../../lib/terminalMemory";

/**
 * Zero-Click Live Card Overlay, now with Terminal Memory.
 *
 * Phase 1 put real-time Sentinel scoring on every feed card without a
 * click. Phase 1.5 layers *user memory* on top: the browser itself
 * remembers which mints you pinned and the score you last saw per mint,
 * so when you come back the card can tell you "this broke out since you
 * were last here" or "you've been watching this for more than a day".
 *
 * New surface (additive — overlay still renders nothing for cards with
 * no live score, and skeleton cards are untouched):
 *
 *  - Pin button (Eye icon, top-right corner of the overlay). One click
 *    toggles `isWatched` for this mint in `terminalMemory`. Fully local,
 *    never touches the network.
 *
 *  - [BREAKOUT] chip. Shows when the current live Sentinel score is
 *    >= `lastSeenScore + BREAKOUT_DELTA`. The *baseline* used for this
 *    comparison is captured ONCE at mount and stashed in a ref, so the
 *    chip doesn't self-cancel as live `recordSeen` updates roll `lastSeenScore`
 *    forward during the session. This is the "since your last visit"
 *    semantic done right.
 *
 *  - [REPEATED] chip. Shows when the mint has been tracked in local memory
 *    for more than 24 h (`firstDiscoveredAt`). Surfaces mints that keep
 *    coming back across sessions — valuable pattern recognition.
 *
 * Performance
 * -----------
 *  - The live score subscription stays exactly as it was
 *    (one singleton socket, shared bootstrap queue).
 *  - The memory subscription uses `useSyncExternalStore`; cards whose
 *    memory entry didn't change don't re-render on unrelated mutations.
 *  - `recordSeen` is called on every incoming score update, but its
 *    underlying writes are debounced at the store level (250 ms) and
 *    coalesced across mints.
 *  - `React.memo` compares by mint only; parent re-renders (signal cursor
 *    tick, strategy toggle, react-query refetch) don't re-reconcile the
 *    overlay.
 *
 * Security
 * --------
 *  - Mints passed in are validated by the store (regex base58 32–44).
 *    If a bad mint slips through here, every `getEntry`/`recordSeen`/
 *    `togglePin` call is a silent no-op, so UI stays correct.
 *  - No user content is ever reflected in the DOM as raw HTML. All
 *    rendered strings come from either constants or store-sanitized
 *    numeric fields.
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

const BREAKOUT_DELTA = 10;
const REPEATED_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function clampPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

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

function MemoryChip({ variant, title }) {
  const config = {
    breakout: {
      label: "BREAKOUT",
      cls: "text-cyan-100 border-cyan-400/60 bg-cyan-500/15 shadow-[0_0_12px_rgba(34,211,238,0.25)] animate-pulse"
    },
    repeated: {
      label: "REPEATED",
      cls: "text-slate-200 border-white/20 bg-white/[0.06]"
    }
  }[variant];
  if (!config) return null;
  return (
    <span
      className={`inline-flex items-center text-[8.5px] leading-none font-bold uppercase tracking-[0.08em] px-1.5 py-[3px] rounded border ${config.cls}`}
      title={title}
    >
      [{config.label}]
    </span>
  );
}

function LiveCardOverlayImpl({ mint }) {
  const { score } = useScoreSocket(mint);
  const memEntry = useTerminalMemoryEntry(mint);

  // Capture the remembered score ONCE at mount so the BREAKOUT chip has
  // a stable baseline across the current session. Otherwise `recordSeen`
  // would roll the baseline forward on every socket update and the chip
  // would flash for a frame and then self-cancel.
  const baselineRef = useRef(null);
  const baselineCapturedRef = useRef(false);
  if (!baselineCapturedRef.current && memEntry) {
    baselineRef.current = typeof memEntry.lastSeenScore === "number" ? memEntry.lastSeenScore : null;
    baselineCapturedRef.current = true;
  }

  // Signal-change flash via key-remount (no setTimeout, no state churn).
  const prevSignalsRef = useRef("");
  const [flashKey, setFlashKey] = useState(0);
  const signalsJoined = Array.isArray(score?.signals) ? score.signals.slice(0, 4).join(",") : "";
  useEffect(() => {
    if (signalsJoined && signalsJoined !== prevSignalsRef.current) {
      prevSignalsRef.current = signalsJoined;
      setFlashKey((k) => k + 1);
    }
  }, [signalsJoined]);

  // Feed incoming scores into Terminal Memory. We track the engine's
  // `confidence` (0..100 — the aggregated evidence weight) rather than
  // any single dimension, because it moves only when actual signals
  // fire. The store debounces and coalesces writes, so firing this on
  // every socket update is cheap.
  const liveIntensity = Number.isFinite(Number(score?.confidence))
    ? Math.max(0, Math.min(100, Math.round(Number(score.confidence))))
    : null;
  useEffect(() => {
    if (liveIntensity != null && mint) recordSeen(mint, liveIntensity);
  }, [liveIntensity, mint]);

  if (!score || !score.scores) return null;

  const scores = score.scores;
  const signals = Array.isArray(score.signals) ? score.signals : [];
  const confidenceLabel = score.confidenceLabel || null;

  const isWatched = memEntry?.isWatched === true;
  const baseline = baselineRef.current;
  const breakout =
    baseline != null && liveIntensity != null && liveIntensity >= baseline + BREAKOUT_DELTA;
  const repeated = memEntry?.firstDiscoveredAt
    ? Date.now() - memEntry.firstDiscoveredAt > REPEATED_THRESHOLD_MS
    : false;

  const hasTopRowContent = signals.length > 0 || breakout || repeated || liveIntensity != null;

  const onTogglePin = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (mint) togglePin(mint);
  };

  return (
    <div
      className="mt-2 pt-2 border-t border-white/[0.06] space-y-1.5 relative"
      data-testid="live-card-overlay"
    >
      <button
        type="button"
        onClick={onTogglePin}
        aria-pressed={isWatched}
        aria-label={isWatched ? "Stop watching this token" : "Watch this token"}
        title={isWatched ? "Pinned · click to unwatch" : "Click to watch"}
        className={`absolute top-0 right-0 w-5 h-5 inline-flex items-center justify-center rounded-md border transition ${
          isWatched
            ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.35)]"
            : "border-white/12 bg-black/30 text-gray-400 hover:text-emerald-300 hover:border-emerald-500/30"
        }`}
      >
        <Eye size={10} strokeWidth={2.2} />
      </button>

      {hasTopRowContent ? (
        <div key={flashKey} className="flex flex-wrap gap-1 pr-7">
          {breakout ? (
            <MemoryChip
              variant="breakout"
              title={
                baseline != null && liveIntensity != null
                  ? `Confidence ${liveIntensity}% vs ${baseline}% when you last looked (+${liveIntensity - baseline})`
                  : undefined
              }
            />
          ) : null}
          {repeated ? (
            <MemoryChip
              variant="repeated"
              title="You've had this mint in local memory for more than 24 h"
            />
          ) : null}
          {signals.slice(0, 4).map((s) => (
            <SignalChip key={s} signal={s} flashing />
          ))}
          {liveIntensity != null ? (
            <span
              className="inline-flex items-center text-[8.5px] leading-none font-bold uppercase tracking-[0.08em] px-1.5 py-[3px] rounded border border-white/12 bg-black/30 text-gray-300 font-mono tabular-nums ml-auto"
              title={`Confidence: ${confidenceLabel || liveIntensity + "%"}`}
            >
              {confidenceLabel
                ? `${confidenceLabel.toUpperCase()} · ${liveIntensity}%`
                : `${liveIntensity}%`}
            </span>
          ) : null}
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

export const LiveCardOverlay = memo(LiveCardOverlayImpl, (a, b) => a.mint === b.mint);
