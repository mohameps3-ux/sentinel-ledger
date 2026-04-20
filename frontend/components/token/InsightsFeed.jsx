import { memo, useMemo } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Dot } from "lucide-react";
import { useInsightsLog } from "../../hooks/useInsightsLog";

/**
 * Rolling "flight recorder" of insight events for a single asset.
 *
 * Reads from the local `insightsLog` store (fed by `useInsightsRecorder`
 * on the detail page). Renders a reverse-chronological list styled as a
 * system log: mono font, terse lines, colour-coded by event type.
 *
 * Layout rules
 * ------------
 *  - Max 20 rows rendered; anything older stays in the store but
 *    collapses into a "+N earlier" footer. The store itself caps at 30
 *    per asset, so the footer maxes out at "+10 earlier".
 *  - Each row carries a fixed-width timestamp `HH:MM:SS` in local time
 *    so sibling rows align without jitter.
 *  - Empty state narrates the fact rather than showing a blank box,
 *    keeping the terminal feel.
 *
 * Perf
 * ----
 *  - `React.memo` shallow-compares on `asset`, `maxRows`.
 *  - Row rendering iterates at most 20 entries; no per-row hooks so
 *    React can reconcile in a single pass.
 *  - Timestamp formatting is pre-computed via `useMemo` on the log
 *    reference (stable identity from the store means the memo holds
 *    across unrelated re-renders of the parent).
 */

const SIGNAL_LABEL = {
  whale_accumulation: "WHALE",
  liquidity_shock: "LIQ-SHOCK",
  cluster_buy: "CLUSTER",
  new_wallet_confidence: "FRESH-SM",
  velocity_spike: "VELOCITY"
};

const SIGNAL_TONE = {
  whale_accumulation: "text-emerald-200",
  liquidity_shock: "text-amber-200",
  cluster_buy: "text-cyan-200",
  new_wallet_confidence: "text-violet-200",
  velocity_spike: "text-orange-200"
};

function signalLabel(signal) {
  return (
    SIGNAL_LABEL[signal] ||
    String(signal || "")
      .replace(/[^a-z0-9]+/gi, "_")
      .toUpperCase()
      .slice(0, 12)
  );
}

function signalTone(signal) {
  return SIGNAL_TONE[signal] || "text-gray-200";
}

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

function formatTime(ms) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function Row({ entry }) {
  if (entry.type === "signal_fired") {
    return (
      <li className="flex items-baseline gap-2 leading-snug">
        <span className="text-[10px] text-gray-500 font-mono tabular-nums shrink-0">
          {entry._time}
        </span>
        <span className="inline-flex items-center gap-1 shrink-0">
          <Dot size={12} className="text-emerald-400 -mx-1" strokeWidth={6} />
          <span className={`text-[11px] font-mono font-semibold ${signalTone(entry.signal)}`}>
            [{signalLabel(entry.signal)}]
          </span>
        </span>
        <span className="text-[11px] text-gray-300 truncate">detected</span>
      </li>
    );
  }
  if (entry.type === "signal_faded") {
    return (
      <li className="flex items-baseline gap-2 leading-snug opacity-70">
        <span className="text-[10px] text-gray-500 font-mono tabular-nums shrink-0">
          {entry._time}
        </span>
        <span className="inline-flex items-center gap-1 shrink-0">
          <Dot size={12} className="text-gray-500 -mx-1" strokeWidth={6} />
          <span className="text-[11px] font-mono font-semibold text-gray-400">
            [{signalLabel(entry.signal)}]
          </span>
        </span>
        <span className="text-[11px] text-gray-500 truncate">faded</span>
      </li>
    );
  }
  if (entry.type === "confidence_jump") {
    return (
      <li className="flex items-baseline gap-2 leading-snug">
        <span className="text-[10px] text-gray-500 font-mono tabular-nums shrink-0">
          {entry._time}
        </span>
        <ArrowUpRight size={11} className="text-cyan-300 shrink-0 self-center" strokeWidth={2.4} />
        <span className="text-[11px] font-mono font-semibold text-cyan-200">
          CONFIDENCE BOOST
        </span>
        <span className="text-[11px] font-mono tabular-nums text-gray-300">
          {entry.from} → {entry.to}
        </span>
        <span className="text-[10px] font-mono tabular-nums text-cyan-300/80">
          +{entry.delta}
        </span>
      </li>
    );
  }
  if (entry.type === "confidence_drop") {
    return (
      <li className="flex items-baseline gap-2 leading-snug">
        <span className="text-[10px] text-gray-500 font-mono tabular-nums shrink-0">
          {entry._time}
        </span>
        <ArrowDownRight size={11} className="text-rose-300 shrink-0 self-center" strokeWidth={2.4} />
        <span className="text-[11px] font-mono font-semibold text-rose-200">
          CONFIDENCE DIP
        </span>
        <span className="text-[11px] font-mono tabular-nums text-gray-300">
          {entry.from} → {entry.to}
        </span>
        <span className="text-[10px] font-mono tabular-nums text-rose-300/80">
          {entry.delta}
        </span>
      </li>
    );
  }
  return null;
}

function InsightsFeedImpl({ asset, maxRows = 20 }) {
  const log = useInsightsLog(asset);
  const visible = useMemo(() => {
    if (!Array.isArray(log) || log.length === 0) return [];
    const slice = log.slice(0, maxRows);
    return slice.map((entry) => ({ ...entry, _time: formatTime(entry.t) }));
  }, [log, maxRows]);

  const overflow = Array.isArray(log) ? Math.max(0, log.length - visible.length) : 0;

  return (
    <div className="rounded-md border border-white/[0.08] bg-black/60 px-3 py-2">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[9px] text-gray-500 uppercase tracking-[0.16em] font-semibold inline-flex items-center gap-1.5">
          <Activity size={10} className="text-emerald-400/80" />
          Activity Log
        </p>
        {visible.length > 0 ? (
          <span className="text-[9px] font-mono text-gray-500 tabular-nums">
            {visible.length}/{Array.isArray(log) ? log.length : 0}
          </span>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="text-[11px] text-gray-500 font-mono leading-snug">
          Awaiting signal activity on this asset…
        </p>
      ) : (
        <>
          <ul className="space-y-1">
            {visible.map((entry) => (
              <Row key={entry.id} entry={entry} />
            ))}
          </ul>
          {overflow > 0 ? (
            <p className="mt-1.5 text-[9px] text-gray-600 font-mono">
              +{overflow} earlier · buffer max {30}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export const InsightsFeed = memo(
  InsightsFeedImpl,
  (a, b) => a.asset === b.asset && (a.maxRows || 20) === (b.maxRows || 20)
);
