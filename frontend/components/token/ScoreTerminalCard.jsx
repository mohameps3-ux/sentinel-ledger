import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, Radio } from "lucide-react";
import { useScoreSocket } from "../../hooks/useScoreSocket";
import { useGlobalHealth } from "../../hooks/useGlobalHealth";

/**
 * "Terminal" card that surfaces the live `sentinel:score` stream for the
 * current token: Risk / Smart / Momentum bars, confidence, signals, insights,
 * plus a LED driven by a combined state machine (score recency + socket +
 * global /health/sync).
 *
 * Design notes
 * ------------
 * - Score socket is a module-level singleton shared across consumers.
 * - `/health/sync` is polled ONCE per tab via `useGlobalHealth`, not per card.
 * - The age readout re-renders on a requestAnimationFrame loop that only
 *   commits state when the integer second changes, and pauses while the tab
 *   is hidden. It lives in an isolated `<AgeCounter />` subcomponent so the
 *   rest of the card (bars, chips, insights) stays stable across ticks.
 * - The LED recomputes on threshold crossings of score age; a lightweight
 *   hook (`useTickOnThreshold`) wakes us up exactly at those instants.
 */

const LED_THRESHOLDS = {
  LIVE_MAX_SEC: 10,
  SYNCING_MAX_SEC: 30
};

const LED_STYLES = {
  LIVE: {
    label: "LIVE",
    dot: "bg-emerald-400",
    glow: "shadow-[0_0_8px_rgba(52,211,153,0.75)]",
    pill: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
    pulse: true
  },
  SYNCING: {
    label: "SYNCING",
    dot: "bg-amber-400",
    glow: "shadow-[0_0_8px_rgba(251,191,36,0.75)]",
    pill: "text-amber-200 border-amber-500/30 bg-amber-500/10",
    pulse: true
  },
  DEGRADED: {
    label: "DEGRADED",
    dot: "bg-red-500",
    glow: "shadow-[0_0_8px_rgba(248,113,113,0.75)]",
    pill: "text-red-200 border-red-500/30 bg-red-500/10",
    pulse: false
  },
  OFFLINE: {
    label: "OFFLINE",
    dot: "bg-gray-500",
    glow: "",
    pill: "text-gray-400 border-white/12 bg-white/[0.03]",
    pulse: false
  },
  WAITING: {
    label: "WAITING",
    dot: "bg-cyan-400",
    glow: "shadow-[0_0_8px_rgba(103,232,249,0.6)]",
    pill: "text-cyan-200 border-cyan-500/30 bg-cyan-500/10",
    pulse: true
  }
};

function deriveLedKey({ isConnected, globalStatus, lastScoreAt, nowMs }) {
  if (!isConnected) return "OFFLINE";
  if (globalStatus === "DEGRADED") return "DEGRADED";
  if (!lastScoreAt) return "WAITING";
  const ageSec = Math.max(0, Math.floor((nowMs - lastScoreAt) / 1000));
  if (ageSec > LED_THRESHOLDS.SYNCING_MAX_SEC) return "DEGRADED";
  if (ageSec > LED_THRESHOLDS.LIVE_MAX_SEC) return "SYNCING";
  return "LIVE";
}

function barTone(kind, value) {
  const v = Number.isFinite(value) ? value : 0;
  if (kind === "risk") {
    if (v >= 70) return "from-red-500 to-rose-400";
    if (v >= 40) return "from-amber-400 to-orange-400";
    return "from-emerald-500 to-teal-400";
  }
  if (kind === "smart") {
    if (v >= 70) return "from-emerald-400 to-cyan-400";
    if (v >= 40) return "from-cyan-500 to-sky-500";
    return "from-slate-500 to-slate-400";
  }
  if (v >= 70) return "from-violet-400 to-fuchsia-400";
  if (v >= 40) return "from-indigo-400 to-violet-500";
  return "from-slate-500 to-slate-400";
}

function confidenceTone(c) {
  if (c >= 75) return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
  if (c >= 50) return "text-amber-200 border-amber-500/30 bg-amber-500/10";
  return "text-gray-300 border-white/12 bg-white/[0.04]";
}

/**
 * Commits a new integer age every second via requestAnimationFrame.
 * Benefits over `setInterval(…, 1000)`:
 *   - Auto-pauses when the tab is hidden (browsers throttle/suspend RAF).
 *   - No drift after sleep/hibernate: age is computed from `Date.now()` at each
 *     tick, not accumulated, so resuming from hibernate shows the true elapsed
 *     time rather than "5 minutes" when hours have passed.
 *   - Only calls setState when the integer second changes, not every frame.
 */
function useAgeSec(since) {
  const [ageSec, setAgeSec] = useState(() =>
    since ? Math.max(0, Math.floor((Date.now() - since) / 1000)) : null
  );
  const rafRef = useRef(null);
  const lastEmittedRef = useRef(-1);

  useEffect(() => {
    if (!since) {
      setAgeSec(null);
      lastEmittedRef.current = -1;
      return undefined;
    }
    const loop = () => {
      const current = Math.max(0, Math.floor((Date.now() - since) / 1000));
      if (current !== lastEmittedRef.current) {
        lastEmittedRef.current = current;
        setAgeSec(current);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [since]);

  return ageSec;
}

/** Isolated child so the age tick does not re-render the whole card body. */
function AgeCounter({ since }) {
  const age = useAgeSec(since);
  if (!since) return <span className="text-[10px] text-gray-500">awaiting…</span>;
  return <span className="text-[10px] text-gray-500">{age ?? 0}s ago</span>;
}

/**
 * Wakes the LED at the next threshold crossing (10s, 30s) after `since`, so
 * the LED transitions LIVE → SYNCING → DEGRADED even in the absence of new
 * events, without forcing a 1Hz re-render of the whole card.
 */
function useTickOnThreshold(since) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!since) return undefined;
    let tid = null;
    const schedule = () => {
      const ageSec = Math.max(0, (Date.now() - since) / 1000);
      let delayMs;
      if (ageSec < LED_THRESHOLDS.LIVE_MAX_SEC) {
        delayMs = (LED_THRESHOLDS.LIVE_MAX_SEC - ageSec) * 1000 + 50;
      } else if (ageSec < LED_THRESHOLDS.SYNCING_MAX_SEC) {
        delayMs = (LED_THRESHOLDS.SYNCING_MAX_SEC - ageSec) * 1000 + 50;
      } else {
        return;
      }
      tid = setTimeout(() => {
        setTick((n) => n + 1);
        schedule();
      }, Math.max(100, delayMs));
    };
    schedule();
    return () => {
      if (tid) clearTimeout(tid);
    };
  }, [since]);
}

function ScoreBar({ label, value, kind }) {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-semibold">
          {label}
        </span>
        <span className="text-[11px] font-mono tabular-nums text-white">{v}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-900 overflow-hidden ring-1 ring-white/[0.06]">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barTone(kind, v)} transition-all duration-500 ease-out`}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

export function ScoreTerminalCard({ asset }) {
  const { score, isConnected, lastScoreAt } = useScoreSocket(asset);
  const { status: globalStatus, reason: globalReason } = useGlobalHealth();
  useTickOnThreshold(lastScoreAt);

  const ledKey = useMemo(
    () => deriveLedKey({ isConnected, globalStatus, lastScoreAt, nowMs: Date.now() }),
    // Recompute when inputs change; useTickOnThreshold forces a re-render at
    // LIVE→SYNCING and SYNCING→DEGRADED boundaries.
    [isConnected, globalStatus, lastScoreAt]
  );
  const led = LED_STYLES[ledKey] || LED_STYLES.WAITING;

  const scores = score?.scores || { risk: 50, smart: 50, momentum: 50 };
  const confidence = Number.isFinite(score?.confidence) ? score.confidence : null;
  const confidenceLabel = score?.confidenceLabel || "—";
  const signals = Array.isArray(score?.signals) ? score.signals : [];
  const insights = Array.isArray(score?.insights) ? score.insights : [];
  const ledTooltip = globalReason || (ledKey === "OFFLINE" ? "socket disconnected" : undefined);

  return (
    <section className="rounded-xl border border-white/10 bg-[#0a0d12]/80 backdrop-blur-sm p-3 sm:p-4 space-y-3 font-mono">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Radio size={14} className="text-emerald-400 shrink-0" />
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400 font-semibold truncate">
            Sentinel Score Terminal
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${led.pill}`}
          title={ledTooltip}
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${led.dot} ${led.glow} ${led.pulse ? "animate-pulse" : ""}`}
            aria-hidden
          />
          {led.label}
        </span>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <ScoreBar label="Risk" value={scores.risk} kind="risk" />
        <ScoreBar label="Smart" value={scores.smart} kind="smart" />
        <ScoreBar label="Momentum" value={scores.momentum} kind="momentum" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`text-[10px] px-2 py-0.5 rounded border ${confidenceTone(confidence ?? 0)}`}
        >
          Confidence · {confidence != null ? `${confidence}%` : "—"} · {confidenceLabel}
        </span>
        {signals.slice(0, 4).map((s) => (
          <span
            key={s}
            className="text-[10px] px-1.5 py-0.5 rounded border border-white/12 bg-white/[0.03] text-gray-300"
            title={s}
          >
            {s}
          </span>
        ))}
        {signals.length > 4 ? (
          <span className="text-[10px] text-gray-500">+{signals.length - 4}</span>
        ) : null}
      </div>

      <div className="rounded-md border border-white/[0.08] bg-black/40 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[9px] text-gray-500 uppercase tracking-wide font-semibold">
            Insights
          </p>
          <AgeCounter since={lastScoreAt} />
        </div>
        {insights.length === 0 ? (
          <p className="text-[11px] text-gray-500 mt-1 leading-snug inline-flex items-center gap-1.5">
            <Activity size={10} className="shrink-0" />
            {score
              ? "Scores refreshed — no rule fired this window."
              : "Listening for on-chain activity on this asset…"}
          </p>
        ) : (
          <ul className="text-[11px] text-gray-200 mt-1 space-y-1 leading-snug">
            {insights.slice(0, 4).map((line, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="text-emerald-500/80 shrink-0">›</span>
                <span className="break-words">{line}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {ledKey === "DEGRADED" ? (
        <p className="text-[10px] text-red-200 inline-flex items-center gap-1.5">
          <AlertTriangle size={10} />
          Sync degraded{ledTooltip ? `: ${ledTooltip}` : ""}
        </p>
      ) : null}
    </section>
  );
}

export default ScoreTerminalCard;
