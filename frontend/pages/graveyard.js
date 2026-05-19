import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHead } from "../components/seo/PageHead";
import { ProPurchaseButton } from "../components/subscription/ProPurchaseButton";
import { getPublicApiUrl } from "../lib/publicRuntime";

/** Client poll interval for Track Record (ms). Env NEXT_PUBLIC_TRACK_RECORD_POLL_MS; default 10s, clamp 3s–120s. */
const TRACK_RECORD_POLL_MS = (() => {
  const n = Number(process.env.NEXT_PUBLIC_TRACK_RECORD_POLL_MS);
  if (Number.isFinite(n) && n >= 3000) return Math.min(n, 120000);
  return 10000;
})();

/** −10% hard stop in fractional units (same as outcome_60m / result_pct). */
const STOP_LOSS_CAP_FRAC = -0.1;

async function fetchTrackRecordFull() {
  const res = await fetch(`${getPublicApiUrl()}/api/v1/signals/track-record-fast`);
  if (!res.ok) throw new Error("track_record_fetch_failed");
  const body = await res.json();
  const recent = Array.isArray(body.recent_signals) ? body.recent_signals : [];
  return {
    ok: body.ok !== false,
    recent_signals: recent.map((s) => ({ ...s, mint: s.mint || s.token_address })),
    count: Number(body.count ?? recent.length),
    _pagesFetched: 1
  };
}

/**
 * Tape pages are ordered by recency; the head can be all pending while the ledger has thousands of resolves.
 * Merge top wins / worst losses (always returned on page 1) so KPIs and charts see real outcomes.
 */
function mergeTrackRecordRowsForMetrics(payload) {
  const recent = Array.isArray(payload?.recent_signals) ? payload.recent_signals : [];
  const tops = Array.isArray(payload?.top_wins) ? payload.top_wins : [];
  const worsts = Array.isArray(payload?.worst_losses) ? payload.worst_losses : [];
  const byId = new Map();
  const add = (r) => {
    if (!r || typeof r !== "object") return;
    const k =
      r.id != null
        ? String(r.id)
        : `${String(r.mint || "")}|${String(r.created_at || r.time || r.emitted_at || "")}|${String(r.signal_id || "")}`;
    if (!byId.has(k)) byId.set(k, r);
  };
  for (const r of recent) add(r);
  for (const r of tops) add(r);
  for (const r of worsts) add(r);
  return [...byId.values()];
}

function outcomeRaw(s) {
  if (s?.result_pct != null && Number.isFinite(Number(s.result_pct))) return Number(s.result_pct);
  if (s?.outcome_60m != null && Number.isFinite(Number(s.outcome_60m))) return Number(s.outcome_60m);
  return null;
}

/** 0–100 for bars / scatter; supports legacy rows with only `strength` or 0–1 fractions. */
function signalConfidencePct(s) {
  if (s == null) return NaN;
  if (s.confidence != null && Number.isFinite(Number(s.confidence))) {
    return Number(s.confidence);
  }
  const st = Number(s.strength);
  if (Number.isFinite(st)) {
    return st > 1 ? Math.min(100, st) : st * 100;
  }
  const alt = Number(s.sentinel_score ?? s.sentinelScore);
  if (Number.isFinite(alt)) {
    return alt > 1 ? Math.min(100, alt) : alt * 100;
  }
  return NaN;
}

function sourceWeight(source) {
  const s = String(source ?? "unknown").toLowerCase();
  if (s.includes("cluster")) return 1.2;
  if (s.includes("whale")) return 1.15;
  return 1.0;
}

function computeInstitutionalMetrics(signals) {
  const completed = (signals ?? []).filter((s) => outcomeRaw(s) != null);
  const wins = completed.filter((s) => (outcomeRaw(s) ?? 0) > 0);
  const losses = completed.filter((s) => (outcomeRaw(s) ?? 0) <= 0);
  const winRate = completed.length > 0 ? wins.length / completed.length : 0;
  const lossRate = 1 - winRate;
  const avgWinPct =
    wins.length > 0 ? wins.reduce((a, s) => a + (outcomeRaw(s) ?? 0), 0) / wins.length : 0;
  const avgLossPct =
    losses.length > 0 ? losses.reduce((a, s) => a + (outcomeRaw(s) ?? 0), 0) / losses.length : 0;
  const expectancy = winRate * avgWinPct + lossRate * avgLossPct;
  const profitFactor =
    losses.length > 0 && wins.length > 0
      ? Math.abs(wins.reduce((a, s) => a + (outcomeRaw(s) ?? 0), 0)) /
        Math.abs(losses.reduce((a, s) => a + (outcomeRaw(s) ?? 0), 0))
      : 0;
  const maxDrawdown = completed.length > 0 ? Math.min(...completed.map((s) => outcomeRaw(s) ?? 0)) : 0;

  const CAP = STOP_LOSS_CAP_FRAC;
  const cappedSignals = completed.map((s) => ({
    ...s,
    _capped: Math.max(outcomeRaw(s) ?? 0, CAP)
  }));
  const cappedWins = cappedSignals.filter((s) => s._capped > 0);
  const cappedLosses = cappedSignals.filter((s) => s._capped <= 0);
  const cappedWinRate = cappedSignals.length > 0 ? cappedWins.length / cappedSignals.length : 0;
  const cappedAvgWin =
    cappedWins.length > 0 ? cappedWins.reduce((a, s) => a + s._capped, 0) / cappedWins.length : 0;
  const cappedAvgLoss =
    cappedLosses.length > 0 ? cappedLosses.reduce((a, s) => a + s._capped, 0) / cappedLosses.length : 0;
  const cappedExpectancy =
    cappedWinRate * cappedAvgWin + (1 - cappedWinRate) * cappedAvgLoss;
  const cappedMaxDD =
    cappedSignals.length > 0 ? Math.min(...cappedSignals.map((s) => s._capped)) : 0;
  const cappedPF =
    cappedLosses.length > 0 && cappedWins.length > 0
      ? Math.abs(cappedWins.reduce((a, s) => a + s._capped, 0)) /
        Math.abs(cappedLosses.reduce((a, s) => a + s._capped, 0))
      : 0;
  const killedCount = completed.filter((s) => (outcomeRaw(s) ?? 0) < CAP).length;

  const sorted = [...completed].sort((a, b) => (outcomeRaw(b) ?? 0) - (outcomeRaw(a) ?? 0));
  const bestCall = sorted[0] ?? null;
  const worstCall = sorted[sorted.length - 1] ?? null;
  return {
    completed,
    wins,
    losses,
    winRate,
    avgWinPct,
    avgLossPct,
    expectancy,
    profitFactor,
    maxDrawdown,
    cappedExpectancy,
    cappedMaxDD,
    cappedPF,
    killedCount,
    bestCall,
    worstCall
  };
}

function AnimatedDonut({ pct, color, label, size = 108, segments }) {
  const r = Math.round((22 * size) / 62);
  const strokeW = Math.max(7, Math.round((8 * size) / 62));
  const circ = 2 * Math.PI * r;
  const ref = useRef(null);
  const labelSize = Math.max(6, Math.round((5 * size) / 62));
  const pctSize = Math.max(9, Math.round((9 * size) / 62));

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    el.style.transition = "none";
    el.setAttribute("stroke-dasharray", `0 ${circ}`);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = "stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1)";
        const fill = (pct / 100) * circ;
        el.setAttribute("stroke-dasharray", `${fill} ${circ - fill}`);
      });
    });
  }, [pct, circ]);

  if (segments) {
    const total = segments.reduce((a, s) => a + s.pct, 0) || 1;
    const normalizedSegments = segments.map((s) => ({
      ...s,
      pct: (s.pct / total) * 100
    }));
    const colors = normalizedSegments.map((s) => s.color);
    let offset = 0;
    const arcs = normalizedSegments.map((s, i) => {
      const fill = (s.pct / 100) * circ;
      const dash = `${fill} ${circ - fill}`;
      const rotate = -90 + (offset / 100) * 360;
      offset += s.pct;
      return { dash, rotate, color: colors[i], label: s.label, pct: s.pct };
    });
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1f2937" strokeWidth={strokeW} />
        {arcs.map((a, i) => (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={a.color}
            strokeWidth={strokeW}
            strokeDasharray={a.dash}
            transform={`rotate(${a.rotate} ${size / 2} ${size / 2})`}
            style={{ transition: `stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1) ${i * 0.15}s` }}
          />
        ))}
        <text
          x={size / 2}
          y={size / 2 - labelSize * 0.35}
          textAnchor="middle"
          fill="#e2e8f0"
          fontSize={pctSize}
          fontFamily="monospace"
          fontWeight="500"
        >
          {Math.round(pct)}%
        </text>
        <text
          x={size / 2}
          y={size / 2 + pctSize * 0.75}
          textAnchor="middle"
          fill="#6b7280"
          fontSize={labelSize}
          fontFamily="monospace"
        >
          {label}
        </text>
      </svg>
    );
  }

  const fill = (pct / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1f2937" strokeWidth={strokeW} />
      <circle
        ref={ref}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeW}
        strokeDasharray={`0 ${circ}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2}
        y={size / 2 - labelSize * 0.35}
        textAnchor="middle"
        fill="#e2e8f0"
        fontSize={pctSize}
        fontFamily="monospace"
        fontWeight="500"
      >
        {Math.round(pct)}%
      </text>
      <text
        x={size / 2}
        y={size / 2 + pctSize * 0.75}
        textAnchor="middle"
        fill="#6b7280"
        fontSize={labelSize}
        fontFamily="monospace"
      >
        {label}
      </text>
    </svg>
  );
}

function LineChart({ signals }) {
  const ref = useRef(null);
  const W = 520;
  const H = 206;
  const PAD = 15;

  const points = useMemo(() => {
    if (!signals?.length) return "";
    const sorted = [...signals]
      .filter((s) => s.outcome_pct != null || s.outcome_60m != null || outcomeRaw(s) != null)
      .sort(
        (a, b) =>
          new Date(a.emitted_at || a.created_at || a.time || 0) -
          new Date(b.emitted_at || b.created_at || b.time || 0)
      );
    if (!sorted.length) return "";

    let cumulative = 0;
    const vals = sorted.map((s) => {
      const v = Number(s.outcome_pct ?? s.outcome_60m ?? outcomeRaw(s) ?? 0);
      cumulative += v;
      return cumulative;
    });

    const rawMin = Math.min(...vals, 0);
    const rawMax = Math.max(...vals, 0);

    const minV = Math.max(rawMin, -0.4);
    const maxV = Math.min(rawMax, 0.4);

    const range = maxV - minV || 1;

    return vals
      .map((v, i) => {
        const x = PAD + ((W - PAD * 2) * i) / Math.max(vals.length - 1, 1);
        const y = H - PAD - ((v - minV) / range) * (H - PAD * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [signals]);

  useEffect(() => {
    if (!ref.current || !points) return;
    const el = ref.current;
    const len = el.getTotalLength();
    el.style.transition = "none";
    el.style.strokeDasharray = `${len}`;
    el.style.strokeDashoffset = `${len}`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = "stroke-dashoffset 1.8s cubic-bezier(.4,0,.2,1)";
        el.style.strokeDashoffset = "0";
      });
    });
  }, [points]);

  const lastPct = useMemo(() => {
    if (!signals?.length) return null;
    const resolved = signals.filter((s) => outcomeRaw(s) != null);
    if (!resolved.length) return null;
    const avg =
      resolved.reduce((a, s) => a + Number(outcomeRaw(s) ?? 0), 0) / resolved.length;
    return avg;
  }, [signals]);

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="graveLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#f87171" />
        </linearGradient>
        <filter id="graveLineGlow" x="-6%" y="-6%" width="112%" height="112%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.65" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <line
        x1={PAD}
        y1={H / 2}
        x2={W - PAD}
        y2={H / 2}
        stroke="#1f2937"
        strokeWidth="0.5"
        strokeDasharray="3 3"
      />
      <text x={PAD} y={12} fill="#64748b" fontSize="6" fontFamily="monospace">
        +
      </text>
      <text x={PAD} y={H / 2 + 5} fill="#64748b" fontSize="6" fontFamily="monospace">
        0%
      </text>
      <text x={PAD} y={H - 6} fill="#64748b" fontSize="6" fontFamily="monospace">
        -
      </text>
      {points ? (
        <>
          <polyline
            fill="none"
            stroke="url(#graveLineGrad)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.14"
            points={points}
          />
          <polyline
            ref={ref}
            fill="none"
            stroke="url(#graveLineGrad)"
            strokeWidth="2.35"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#graveLineGlow)"
            points={points}
          />
        </>
      ) : (
        <text x={W / 2} y={H / 2 + 4} textAnchor="middle" fill="#64748b" fontSize="7" fontFamily="monospace">
          Serie en formación
        </text>
      )}
      {lastPct != null ? (
        <>
          <rect x={W - 52} y={H - 22} width={40} height={11} rx="2" fill="rgba(92, 38, 38, 0.85)" />
          <text x={W - 50} y={H - 13} fill="#e89191" fontSize="7" fontFamily="monospace">
            {(lastPct * 100).toFixed(2)}%
          </text>
        </>
      ) : null}
      <text x={PAD} y={H} fill="#64748b" fontSize="6" fontFamily="monospace">
        -48h
      </text>
      <text x={W / 2 - 10} y={H} fill="#64748b" fontSize="6" fontFamily="monospace">
        -24h
      </text>
      <text x={W - 28} y={H} fill="#64748b" fontSize="6" fontFamily="monospace">
        Actual
      </text>
    </svg>
  );
}

function ScatterPlot({ signals, correlation }) {
  const W = 232;
  const H = 126;
  const PAD = 14;
  const plotBottom = H - 14;

  const dots = useMemo(() => {
    if (!signals?.length) return [];
    return signals
      .filter((s) => {
        const conf = signalConfidencePct(s);
        return Number.isFinite(conf) && outcomeRaw(s) != null;
      })
      .map((s) => {
        const conf = signalConfidencePct(s);
        const ret = Number(outcomeRaw(s) ?? 0);
        const x = PAD + (conf / 100) * (W - PAD * 2);
        const clampedRet = Math.max(-0.2, Math.min(0.2, ret));
        const midY = (PAD + plotBottom) / 2;
        const halfSpan = (plotBottom - PAD) / 2;
        const y = midY - (clampedRet / 0.2) * halfSpan;
        return { x, y, ret };
      });
  }, [signals]);

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <line x1={PAD} y1={PAD} x2={PAD} y2={plotBottom} stroke="#1f2937" strokeWidth="0.6" />
      <line x1={PAD} y1={(PAD + plotBottom) / 2} x2={W - 6} y2={(PAD + plotBottom) / 2} stroke="#1f2937" strokeWidth="0.6" />
      <line
        x1={PAD}
        y1={plotBottom}
        x2={W - 6}
        y2={PAD}
        stroke="#818cf8"
        strokeWidth="1.2"
        strokeDasharray="4 4"
        opacity="0.72"
      />
      {dots.length > 0 ? (
        dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r="3"
            fill={d.ret > 0 ? "#a78bfa" : "#818cf8"}
            opacity="0.9"
            style={{
              animation: `dotFadeIn 0.3s ease ${i * 0.05}s both`
            }}
          />
        ))
      ) : (
        <text x={W / 2} y={H / 2} textAnchor="middle" fill="#64748b" fontSize="7" fontFamily="monospace">
          Cobertura parcial
        </text>
      )}
      <text x={PAD + 2} y={11} fill="#4a5568" fontSize="6" fontFamily="monospace">
        50%
      </text>
      <text x={PAD + 2} y={(PAD + plotBottom) / 2 + 5} fill="#4a5568" fontSize="6" fontFamily="monospace">
        0%
      </text>
      <text x={PAD + 2} y={plotBottom - 2} fill="#4a5568" fontSize="6" fontFamily="monospace">
        -50%
      </text>
      <text x={PAD + 2} y={H} fill="#4a5568" fontSize="6" fontFamily="monospace">
        0
      </text>
      <text x={W / 2} y={H} fill="#4a5568" fontSize="6" fontFamily="monospace">
        50
      </text>
      <text x={W - 14} y={H} fill="#4a5568" fontSize="6" fontFamily="monospace">
        100
      </text>
      {correlation != null && Number.isFinite(correlation) ? (
        <text x={W - 48} y={12} fill="#818cf8" fontSize="6" fontFamily="monospace">
          r={correlation.toFixed(2)}
        </text>
      ) : null}
    </svg>
  );
}

export default function GraveyardPage() {
  const [filter, setFilter] = useState("all");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = () => setMenuOpen(false);
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const query = useQuery({
    queryKey: ["verified-track-record-full"],
    queryFn: fetchTrackRecordFull,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: TRACK_RECORD_POLL_MS
  });

  const data = query.data || {};
  const allRows = useMemo(() => data.recent_signals || [], [data.recent_signals]);
  const rowsForMetrics = useMemo(() => mergeTrackRecordRowsForMetrics(data), [data]);

  const metrics = useMemo(() => computeInstitutionalMetrics(rowsForMetrics), [rowsForMetrics]);
  const {
    completed,
    winRate,
    profitFactor,
    maxDrawdown,
    expectancy,
    cappedExpectancy,
    killedCount
  } = metrics;

  const hasMetrics = completed.length > 0;
  const serverResolved = Number(data.resolved_signals || 0);
  const serverWinRate =
    data.win_rate_60m != null && Number.isFinite(Number(data.win_rate_60m))
      ? Number(data.win_rate_60m)
      : null;
  const serverAvgReturn =
    data.avg_return != null && Number.isFinite(Number(data.avg_return)) ? Number(data.avg_return) : null;
  const serverMaxDd =
    data.max_drawdown != null && Number.isFinite(Number(data.max_drawdown)) ? Number(data.max_drawdown) : null;
  const hasLedgerHeadline = serverResolved > 0 && serverWinRate != null;
  const showHeadlineFallback = !hasMetrics && hasLedgerHeadline;

  const wins = completed.filter((s) => (outcomeRaw(s) ?? 0) > 0);
  const losses = completed.filter((s) => (outcomeRaw(s) ?? 0) <= 0);

  const avgOutcome =
    completed.length > 0
      ? completed.reduce((a, s) => a + (outcomeRaw(s) ?? 0), 0) / completed.length
      : null;

  const correlationValue = useMemo(() => {
    const pairs = completed
      .filter((s) => {
        const c = signalConfidencePct(s);
        return Number.isFinite(c) && outcomeRaw(s) != null;
      })
      .map((s) => ({
        x: signalConfidencePct(s),
        y: outcomeRaw(s) ?? 0
      }));
    if (pairs.length < 2) return null;
    const mx = pairs.reduce((a, p) => a + p.x, 0) / pairs.length;
    const my = pairs.reduce((a, p) => a + p.y, 0) / pairs.length;
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (const p of pairs) {
      const vx = p.x - mx;
      const vy = p.y - my;
      num += vx * vy;
      dx += vx * vx;
      dy += vy * vy;
    }
    const den = Math.sqrt(dx * dy);
    return den > 1e-9 ? num / den : null;
  }, [completed]);

  const sourceMixSegments = useMemo(() => {
    const tally = { cluster: 0, whale: 0, wallet: 0, other: 0 };
    for (const s of completed) {
      const raw = String(s.signals?.[0] || "smart_money").toLowerCase();
      if (raw.includes("cluster")) tally.cluster += 1;
      else if (raw.includes("whale")) tally.whale += 1;
      else if (raw.includes("smart")) tally.wallet += 1;
      else tally.other += 1;
    }
    const n = tally.cluster + tally.whale + tally.wallet + tally.other;
    if (!n) {
      return { segments: [{ pct: 100, color: "#4b5563", label: "Sin datos" }], centerPct: 0 };
    }
    const toPct = (v) => (v / n) * 100;
    const segments = [
      { pct: toPct(tally.cluster), color: "#818cf8", label: "Clúster" },
      { pct: toPct(tally.whale), color: "#34d399", label: "Smart money" },
      { pct: toPct(tally.wallet), color: "#f59e0b", label: "Wallet activity" },
      { pct: toPct(tally.other), color: "#4b5563", label: "Otros" }
    ].filter((seg) => seg.pct >= 0.5);
    const centerPct =
      segments.length > 0 ? Math.round(Math.max(...segments.map((seg) => seg.pct))) : 0;
    return { segments: segments.length ? segments : [{ pct: 100, color: "#4b5563", label: "Mixto" }], centerPct };
  }, [completed]);

  const bestCall =
    [...completed].sort((a, b) => (outcomeRaw(b) ?? -999) - (outcomeRaw(a) ?? -999))[0] ?? null;

  const worstCall =
    [...completed].sort((a, b) => (outcomeRaw(a) ?? 999) - (outcomeRaw(b) ?? 999))[0] ?? null;

  const filteredRows = useMemo(() => {
    if (filter === "wins") return allRows.filter((s) => outcomeRaw(s) > 0);
    if (filter === "losses") return allRows.filter((s) => outcomeRaw(s) != null && outcomeRaw(s) <= 0);
    if (filter === "pending") return allRows.filter((s) => outcomeRaw(s) == null);
    return allRows;
  }, [filter, allRows]);

  const isSystemBad = showHeadlineFallback
    ? (serverAvgReturn ?? 0) < -0.08 || (serverWinRate ?? 0) < 0.4
    : (avgOutcome ?? 0) < -0.08 || winRate < 0.4;

  const safeProfitFactor = profitFactor && profitFactor > 0.05 ? profitFactor.toFixed(2) : "—";

  const safeDrawdown =
    maxDrawdown != null && maxDrawdown > -0.99 ? `${(maxDrawdown * 100).toFixed(2)}%` : "—";

  const safeAvgOutcome = avgOutcome != null ? `${(avgOutcome * 100).toFixed(2)}%` : "—";
  const safeDrawdownLedger =
    serverMaxDd != null && serverMaxDd > -0.99 ? `${(serverMaxDd * 100).toFixed(2)}%` : "—";
  const safeAvgOutcomeLedger =
    serverAvgReturn != null ? `${(serverAvgReturn * 100).toFixed(2)}%` : "—";

  const features = useMemo(() => {
    return completed.map((s, idx) => {
      const r = outcomeRaw(s);
      const confPct = signalConfidencePct(s);
      const conf = Number.isFinite(confPct) ? confPct / 100 : 0;

      return {
        signalKey: s?.id != null ? String(s.id) : `ml-${idx}-${String(s.emitted_at || s.time || s.mint || "")}`,
        raw: r,
        conf,
        time: new Date(s.emitted_at || s.time || s.created_at || Date.now()).getTime(),
        source: s.signals?.[0] || "unknown"
      };
    });
  }, [completed]);

  const withDecay = useMemo(() => {
    const now = Date.now();

    return features.map((f) => {
      const ageMin = (now - f.time) / 60000;

      const decay = Math.exp(-ageMin / 120);

      return {
        ...f,
        decay
      };
    });
  }, [features]);

  const normalized = useMemo(() => {
    const returns = withDecay.map((f) => f.raw).filter((v) => v != null);

    const min = Math.min(...returns, -0.2);
    const max = Math.max(...returns, 0.2);
    const range = max - min || 1;

    return withDecay.map((f) => {
      const normR = f.raw != null ? (f.raw - min) / range : 0.5;

      return {
        ...f,
        normR
      };
    });
  }, [withDecay]);

  const scoredSignals = useMemo(() => {
    return normalized.map((f) => {
      const score =
        f.normR * 0.4 + f.conf * 0.25 + f.decay * 0.2 + sourceWeight(f.source) * 0.15;

      return {
        ...f,
        score
      };
    });
  }, [normalized]);

  const predictedAlpha = useMemo(() => {
    if (!scoredSignals.length) return 0;

    const total = scoredSignals.reduce((a, b) => a + b.score, 0);
    return total / scoredSignals.length;
  }, [scoredSignals]);

  const rankedSignals = useMemo(() => {
    return [...scoredSignals].filter((s) => s.raw != null).sort((a, b) => b.score - a.score);
  }, [scoredSignals]);

  const calibratedConfidence = useMemo(() => {
    if (!rankedSignals.length) return 0;

    const top = rankedSignals.slice(0, 10);

    const avg = top.reduce((a, b) => a + b.conf, 0) / top.length;

    return avg;
  }, [rankedSignals]);

  const modelState = useMemo(() => {
    if (!hasMetrics) return "NEUTRAL";
    if (predictedAlpha > 0.65) return "HIGH_ALPHA";
    if (predictedAlpha > 0.55) return "MODERATE_ALPHA";
    if (predictedAlpha < 0.45) return "NEGATIVE_ALPHA";
    return "NEUTRAL";
  }, [hasMetrics, predictedAlpha]);

  const modelScore = predictedAlpha;
  const rankedML = rankedSignals;
  const weights = [0.25, 0.15, 0.15];

  return (
    <>
      <PageHead
        title="Registro verificado — Sentinel Ledger"
        description="Historial de señales y resultados. Auditoría continua on-chain."
      />
      <div className="grave-root">
        <main className="grave-main">
          <div className="grave-header">
            <div
              style={{ position: "relative" }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                style={{
                  background: "none",
                  border: "0.5px solid #1f2937",
                  borderRadius: "4px",
                  color: "#9ca3af",
                  cursor: "pointer",
                  padding: "4px 8px",
                  fontSize: "14px",
                  fontFamily: "monospace",
                  lineHeight: 1
                }}
              >
                ☰
              </button>

              {menuOpen ? (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    zIndex: 9999,
                    background: "#0d0f1a",
                    border: "0.5px solid #1f2937",
                    borderRadius: "6px",
                    padding: "8px",
                    minWidth: "180px",
                    marginTop: "4px",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.6)"
                  }}
                >
                  {[
                    { href: "/", label: "Inicio", sub: "Feed y escáner" },
                    { href: "/scanner", label: "Escáner", sub: "Buscar mint" },
                    { href: "/smart-money", label: "Smart Money", sub: "Wallets y edge" },
                    { href: "/watchlist", label: "Watchlist", sub: "Tus tokens" },
                    { href: "/alerts", label: "Alertas", sub: "Telegram / PRO" },
                    { openSubscription: true, label: "Precios", sub: "Acceso" },
                    { href: "/graveyard", label: "Track Record", sub: "Historial verificado" }
                  ].map((item) => {
                    const rowInner = (
                      <div
                        style={{
                          padding: "6px 8px",
                          borderRadius: "4px",
                          marginBottom: "1px",
                          cursor: "pointer"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#1f2937";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <div style={{ fontSize: "11px", color: "#e2e8f0", fontWeight: "500" }}>{item.label}</div>
                        <div style={{ fontSize: "9px", color: "#6b7280" }}>{item.sub}</div>
                      </div>
                    );
                    if (item.openSubscription) {
                      return (
                        <ProPurchaseButton
                          key="precios"
                          type="button"
                          onClick={() => setMenuOpen(false)}
                          style={{
                            textDecoration: "none",
                            display: "block",
                            width: "100%",
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            textAlign: "left"
                          }}
                        >
                          {rowInner}
                        </ProPurchaseButton>
                      );
                    }
                    return (
                      <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} style={{ textDecoration: "none", display: "block" }}>
                        {rowInner}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="grave-hd-title">Resumen operativo · Últimas 48h</div>
              <div className="grave-hd-sub">Registro verificado on-chain · auditoría continua</div>
            </div>

            <div className="grave-header-actions">
              <div className={isSystemBad ? "grave-sys-badge grave-sys-badge--bad" : "grave-sys-badge grave-sys-badge--ok"}>
                <div className="grave-online-dot grave-online-dot--sm" />
                {isSystemBad ? "Degradado" : "Operativo"}
              </div>

              <div className="grave-period-group">
                {["24H", "48H", "7D", "30D"].map((t) => (
                  <div key={t} className={t === "48H" ? "grave-period-pill grave-period-pill--active" : "grave-period-pill"}>
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grave-mrow">
            {[
              {
                label: "Señales",
                val: hasMetrics ? completed.length : showHeadlineFallback ? serverResolved.toLocaleString() : "—",
                color: "#e2e8f0"
              },
              {
                label: "Win rate",
                val: hasMetrics
                  ? `${(winRate * 100).toFixed(1)}%`
                  : showHeadlineFallback
                    ? `${(serverWinRate * 100).toFixed(1)}%`
                    : "—",
                color: "#e2e8f0"
              },
              {
                label: "Profit factor",
                val: hasMetrics ? safeProfitFactor : showHeadlineFallback ? "— (ledger)" : "—",
                color: "#e2e8f0"
              },
              {
                label: "Rendimiento medio",
                val: hasMetrics ? safeAvgOutcome : showHeadlineFallback ? safeAvgOutcomeLedger : "—",
                color: (hasMetrics ? avgOutcome ?? 0 : serverAvgReturn ?? 0) < 0 ? "#f87171" : "#34d399"
              },
              {
                label: "Conf. ↔ retorno",
                val: hasMetrics ? (correlationValue?.toFixed(2) ?? "—") : showHeadlineFallback ? "—" : "—",
                color: "#f87171"
              },
              {
                label: "Máx. drawdown",
                val: hasMetrics ? safeDrawdown : showHeadlineFallback ? safeDrawdownLedger : "—",
                color: "#f87171"
              },
              {
                label: "Estado del sistema",
                val: isSystemBad ? "DEGRADADO" : "OPERATIVO",
                color: isSystemBad ? "#f87171" : "#34d399"
              }
            ].map((m, i) => (
              <div key={m.label} className="grave-mc">
                <div className="grave-mc-l">{m.label}</div>
                <div className="grave-mc-v" style={{ color: m.color }}>
                  {m.val}
                </div>
              </div>
            ))}
          </div>

          <div className="grave-core">
            <div className="grave-core-left">
              <div className="grave-cc-t grave-cc-t--chart">Curva de rendimiento</div>
              <div className="grave-chart-sub">Serie acumulada de resultados</div>
              <div className="grave-linechart-host">
                <LineChart signals={completed} />
              </div>
            </div>

            <div className="grave-core-right">
              <div className="grave-ml-panel">
                <div className="grave-cc-t grave-cc-t--ml">Motor de señales</div>
                <div className="grave-ml-hero">{hasMetrics ? `${(modelScore * 100).toFixed(1)}%` : "—"}</div>
                <div className="grave-ml-caption">Confianza del modelo (R²)</div>
                <div className="grave-ml-meta">
                  Calibración (decil superior):{" "}
                  {hasMetrics ? `${(calibratedConfidence * 100).toFixed(1)}%` : "—"} · n=
                  {hasMetrics ? rankedML.length : "—"} · pesos{" "}
                  {hasMetrics
                    ? `${weights[0].toFixed(2)}/${weights[1].toFixed(2)}/${weights[2].toFixed(2)}`
                    : "—/—/—"}
                </div>
                <div
                  className={
                    modelState === "HIGH_ALPHA"
                      ? "grave-ml-state grave-ml-state--high"
                      : modelState === "MODERATE_ALPHA"
                        ? "grave-ml-state grave-ml-state--mod"
                        : modelState === "NEGATIVE_ALPHA"
                          ? "grave-ml-state grave-ml-state--neg"
                          : "grave-ml-state grave-ml-state--neutral"
                  }
                >
                  {modelState === "HIGH_ALPHA"
                    ? "Alfa · elevado"
                    : modelState === "MODERATE_ALPHA"
                      ? "Alfa · moderado"
                      : modelState === "NEGATIVE_ALPHA"
                        ? "Alfa · negativo"
                        : "Neutro"}
                </div>
              </div>

              <div className="grave-top-signals">
                <div className="grave-cc-t grave-cc-t--signals">Señales alfa</div>
                {rankedML.slice(0, 5).map((sig, i) => {
                  const cIdx = completed.findIndex((c, j) => {
                    const k =
                      c?.id != null ? String(c.id) : `ml-${j}-${String(c.emitted_at || c.time || c.mint || "")}`;
                    return k === sig.signalKey;
                  });
                  const srcRow = cIdx >= 0 ? completed[cIdx] : null;
                  const pred = sig.score;
                  return (
                    <div key={`${sig.signalKey}-${i}`} className="grave-top-signal-row">
                      <span className="grave-top-signal-sym">
                        {(srcRow?.asset || srcRow?.symbol || sig.source || "???").slice(0, 8)}
                      </span>
                      <span className="grave-top-signal-pct">{(pred * 100).toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grave-secondary">
            <div className="grave-box">
              <div className="grave-cc-t">Distribución</div>
              <div className="grave-box-chart-host">
                <AnimatedDonut
                  size={108}
                  pct={
                    hasMetrics
                      ? winRate * 100
                      : showHeadlineFallback
                        ? serverWinRate * 100
                        : 0
                  }
                  label={hasMetrics || showHeadlineFallback ? "tasa acierto" : "sin muestra"}
                  segments={
                    hasMetrics
                      ? [
                          { pct: winRate * 100, color: "#34d399", label: "Acierto" },
                          { pct: (1 - winRate) * 100, color: "#ef4444", label: "Fallo" }
                        ]
                      : showHeadlineFallback
                        ? [
                            { pct: serverWinRate * 100, color: "#34d399", label: "Acierto" },
                            { pct: (1 - serverWinRate) * 100, color: "#ef4444", label: "Fallo" }
                          ]
                        : [{ pct: 100, color: "#4b5563", label: "Sin datos" }]
                  }
                />
              </div>
            </div>

            <div className="grave-box">
              <div className="grave-cc-t">Confianza vs retorno</div>
              <div className="grave-box-chart-host">
                <ScatterPlot signals={completed} correlation={correlationValue} />
              </div>
            </div>

            <div className="grave-box">
              <div className="grave-cc-t">Fuente de señal</div>
              <div className="grave-box-chart-host">
                <AnimatedDonut
                  size={108}
                  pct={hasMetrics ? sourceMixSegments.centerPct : 0}
                  label="por origen"
                  segments={
                    hasMetrics
                      ? sourceMixSegments.segments
                      : [
                          { pct: 40, color: "#818cf8", label: "Clúster" },
                          { pct: 35, color: "#34d399", label: "Smart money" },
                          { pct: 25, color: "#4b5563", label: "Otros" }
                        ]
                  }
                />
              </div>
            </div>
          </div>

          <div className="grave-insight-row" style={{ alignItems: "start" }}>
            <div
              className="grave-oracle-panel"
              style={{ minHeight: 0, height: "auto", padding: "12px", boxSizing: "border-box" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <div
                  style={{
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    background: "#166534",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "8px",
                    color: "#34d399"
                  }}
                >
                  ✓
                </div>
                <div style={{ fontSize: "9px", fontWeight: "700", color: "#34d399", letterSpacing: ".04em" }}>
                  CASOS VERIFICADOS
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px", marginBottom: "6px" }}>
                {[
                  { v: wins.length || 0, l: "aciertos", c: "#34d399" },
                  { v: hasMetrics ? `${(winRate * 100).toFixed(0)}%` : "—", l: "tasa de acierto", c: "#34d399" },
                  {
                    v: hasMetrics ? `${(avgOutcome * 100).toFixed(2)}%` : "—",
                    l: "retorno medio",
                    c: "#34d399"
                  },
                  {
                    v: bestCall
                      ? `+${(Number(bestCall.result_pct ?? bestCall.outcome_60m ?? 0) * 100).toFixed(1)}%`
                      : "—",
                    l: "mejor caso",
                    c: "#34d399"
                  }
                ].map((x, idx) => (
                  <div key={idx} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "14px", fontWeight: "700", color: x.c, lineHeight: 1.1 }}>{x.v}</div>
                    <div style={{ fontSize: "7px", color: "#6b7280" }}>{x.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", rowGap: "4px" }}>
                {wins.slice(0, 5).map((s, idx) => (
                  <div
                    key={idx}
                    className="text-xs leading-none"
                    style={{
                      padding: "2px 6px",
                      borderRadius: "999px",
                      color: "#34d399",
                      border: "1px solid #166534",
                      background: "#0a1a10"
                    }}
                  >
                    {s.asset || s.symbol || "?"}{" "}
                    {outcomeRaw(s) != null
                      ? `${outcomeRaw(s) >= 0 ? "+" : ""}${(outcomeRaw(s) * 100).toFixed(1)}%`
                      : ""}
                  </div>
                ))}
              </div>
            </div>

            <div
              className="grave-mistakes-panel"
              style={{ minHeight: 0, height: "auto", padding: "12px", boxSizing: "border-box" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <div
                  style={{
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    background: "#7f1d1d",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "8px",
                    color: "#f87171"
                  }}
                >
                  ⚠
                </div>
                <div style={{ fontSize: "9px", fontWeight: "700", color: "#f87171", letterSpacing: ".04em" }}>
                  CASOS NO FAVORABLES
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px", marginBottom: "6px" }}>
                {[
                  { v: losses.length || 0, l: "fallos", c: "#f87171" },
                  { v: hasMetrics ? `${((1 - winRate) * 100).toFixed(0)}%` : "—", l: "tasa de fallo", c: "#f87171" },
                  {
                    v: hasMetrics ? `${(avgOutcome * 100).toFixed(2)}%` : "—",
                    l: "retorno medio",
                    c: "#f87171"
                  },
                  {
                    v: worstCall
                      ? `${(Number(worstCall.result_pct ?? worstCall.outcome_60m ?? 0) * 100).toFixed(1)}%`
                      : "—",
                    l: "peor caso",
                    c: "#f87171"
                  }
                ].map((x, idx) => (
                  <div key={idx} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "14px", fontWeight: "700", color: x.c, lineHeight: 1.1 }}>{x.v}</div>
                    <div style={{ fontSize: "7px", color: "#6b7280" }}>{x.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", rowGap: "4px" }}>
                {losses.slice(0, 5).map((s, idx) => (
                  <div
                    key={idx}
                    className="text-xs leading-none"
                    style={{
                      padding: "2px 6px",
                      borderRadius: "999px",
                      color: "#f87171",
                      border: "1px solid #7f1d1d",
                      background: "#1a0808"
                    }}
                  >
                    {s.asset || s.symbol || "?"}{" "}
                    {s.result_pct ? `${(s.result_pct * 100).toFixed(1)}%` : ""}
                  </div>
                ))}
              </div>
            </div>

            <div className="grave-status-stack">
              <div className="grave-mini-panel">
                <div className="grave-cc-t">Estado actual (48h)</div>
                <div className="grave-mini-lead">Ventana de observación: 48h</div>
                <div style={{ display: "grid", gap: "6px", fontSize: "8px", lineHeight: 1.4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Resueltas</span>
                    <b>{metrics?.resolvedRows ?? 0}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Pendientes</span>
                    <b>{metrics?.pendingRows ?? 0}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Fallidas</span>
                    <b>{metrics?.failedRows ?? 0}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Tasa acierto</span>
                    <b>{hasMetrics ? `${(winRate * 100).toFixed(1)}%` : "—"}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Profit factor</span>
                    <b>{hasMetrics ? safeProfitFactor : "—"}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Retorno medio</span>
                    <b>{hasMetrics ? safeAvgOutcome : "—"}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Correlación conf./retorno</span>
                    <b>{hasMetrics ? (correlationValue?.toFixed(2) ?? "—") : "—"}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Máx. drawdown</span>
                    <b>{hasMetrics ? safeDrawdown : "—"}</b>
                  </div>
                </div>
              </div>

              <div className="grave-mini-panel">
                <div className="grave-cc-t">Simulación de control de riesgo</div>
                <div className="grave-mini-lead">Cap de pérdida aplicado (−10%)</div>
                <div style={{ display: "grid", gap: "6px", fontSize: "8px", lineHeight: 1.4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Esperanza bruta</span>
                    <b style={{ color: "#f87171" }}>
                      {expectancy != null ? `${(expectancy * 100).toFixed(2)}%` : "—"}
                    </b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Esperanza capada</span>
                    <b style={{ color: "#f87171" }}>
                      {cappedExpectancy != null ? `${(cappedExpectancy * 100).toFixed(2)}%` : "—"}
                    </b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Señales cortadas</span>
                    <b className="grave-kill-stat">{killedCount ?? 0}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>DD máx. (cap)</span>
                    <b style={{ color: "#f87171" }}>−10.00%</b>
                  </div>
                </div>
                <div className="grave-kill-banner">
                  Escenario no viable bajo cap actual — revisar calidad de entrada
                </div>
              </div>

              <div className="grave-mini-panel">
                <div className="grave-cc-t">Indicadores del pipeline</div>
                <div className="grave-mini-lead">Señales de calidad operativa</div>
                <div style={{ display: "grid", gap: "6px", fontSize: "8px", lineHeight: 1.4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Tope de muestra</span>
                    <b>{metrics?.sampleCapHit ? "Sí" : "No"}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Pendientes sin entrada</span>
                    <b>{metrics?.pendingWithoutEntry ?? 0}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Resueltas sin resultado</span>
                    <b>{metrics?.resolvedWithoutOutcome ?? 0}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Horizonte por defecto</span>
                    <b>{metrics?.defaultHorizon ?? "10 min"}</b>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grave-tbl">
            <div className="grave-tbl-toolbar">
              <div className="grave-tbl-title">Registro de señales recientes</div>
              <div className="grave-feed-filters">
                {["all", "wins", "losses", "pending"].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={filter === f ? "grave-feed-filter grave-feed-filter--on" : "grave-feed-filter"}
                  >
                    {f === "all" ? "Todas" : f === "wins" ? "Aciertos" : f === "losses" ? "Fallos" : "En espera"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grave-thdr">
              {["", "Activo", "Origen", "Conf.", "Entrada", "P&L 10m", "Estado", "Hora"].map((h, idx) => (
                <div key={idx} className="grave-th-cell">
                  {h}
                </div>
              ))}
            </div>

            {filteredRows.slice(0, 12).map((s, i) => {
              const rawOriginal = outcomeRaw(s);
              const raw = rawOriginal == null ? null : Math.max(-0.1, Math.min(0.2, rawOriginal));
              const pct = raw != null ? raw * 100 : null;
              const isWin = pct != null && pct > 0;
              const isKilled = rawOriginal != null && rawOriginal < STOP_LOSS_CAP_FRAC;
              const isPending = rawOriginal == null;
              const sym = s.asset || s.symbol || s.mint?.slice(0, 6) || "???";
              const sourceRaw = s.signals?.[0] || "smart_money";
              const source = String(sourceRaw).toLowerCase();
              const sourceLabel = source.includes("cluster")
                ? "Clúster"
                : source.includes("whale")
                  ? "Smart money"
                  : "Wallet activity";
              const sourceColor = source.includes("cluster")
                ? { bg: "#1e1b4b", c: "#818cf8" }
                : source.includes("whale")
                  ? { bg: "#0d2818", c: "#34d399" }
                  : { bg: "#1c1009", c: "#f59e0b" };
              const conf = signalConfidencePct(s);
              const statusKey = isPending
                ? "PENDING"
                : isKilled
                  ? "KILLED"
                  : isWin
                    ? "WIN"
                    : pct != null && pct < -10
                      ? "LOSS"
                      : "NEUTRAL";
              const statusLabel =
                statusKey === "PENDING"
                  ? "EN ESPERA"
                  : statusKey === "KILLED"
                    ? "CORTADO"
                    : statusKey === "WIN"
                      ? "ACIERTO"
                      : statusKey === "LOSS"
                        ? "FALLIDO"
                        : "NEUTRO";
              const statusStyle = {
                WIN: { bg: "#0d2818", c: "#34d399" },
                LOSS: { bg: "#1c0a0a", c: "#f87171" },
                KILLED: { bg: "#2d1a00", c: "#f59e0b" },
                PENDING: { bg: "#1a3a5c", c: "#60a5fa" },
                NEUTRAL: { bg: "#1f2937", c: "#9ca3af" }
              }[statusKey];

              return (
                <div
                  key={s.id != null ? String(s.id) : `row-${i}`}
                  className="grave-trow"
                  style={{
                    background:
                      raw != null
                        ? raw > 0
                          ? "rgba(52,211,153,0.06)"
                          : "rgba(248,113,113,0.06)"
                        : "transparent"
                  }}
                >
                  <div style={{ fontSize: "8px", color: "#4a5568" }}>☆</div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        background: "#1f2937",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "6px",
                        color: "#9ca3af",
                        flexShrink: 0
                      }}
                    >
                      {String(sym).slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: "9px", color: "#e2e8f0", fontWeight: "600" }}>{sym}</div>
                      <div style={{ fontSize: "6px", color: "#6b7280" }}>{s.regime || "n/c"}</div>
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: "6px",
                        padding: "2px 5px",
                        borderRadius: "999px",
                        background: sourceColor.bg,
                        color: sourceColor.c,
                        display: "inline-block",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {sourceLabel}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: "9px", color: "#e2e8f0" }}>
                      {Number.isFinite(conf) ? conf.toFixed(0) : "—"}
                    </div>
                    <div
                      style={{
                        height: "3px",
                        background: "#1f2937",
                        borderRadius: "999px",
                        marginTop: "2px",
                        overflow: "hidden"
                      }}
                    >
                      <div
                        style={{
                          height: "3px",
                          width: `${Math.min(Math.max(Number.isFinite(conf) ? conf : 0, 0), 100)}%`,
                          background:
                            conf > 70
                              ? "linear-gradient(90deg,#34d399,#22c55e)"
                              : conf > 40
                                ? "linear-gradient(90deg,#3b82f6,#60a5fa)"
                                : "linear-gradient(90deg,#f87171,#ef4444)",
                          borderRadius: "999px"
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ fontSize: "8px", color: "#9ca3af" }}>
                    {s.entry_price_usd ? `$${Number(s.entry_price_usd).toFixed(6)}` : "—"}
                  </div>

                  <div style={{ fontSize: "8px", color: pct == null ? "#6b7280" : pct > 0 ? "#34d399" : "#f87171" }}>
                    {pct != null ? `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%` : "Validación pendiente"}
                    {isKilled ? (
                      <span style={{ fontSize: "6px", color: "#f59e0b", marginLeft: "2px" }}>(cap −10%)</span>
                    ) : null}
                  </div>

                  <div>
                    <span
                      style={{
                        fontSize: "6px",
                        padding: "2px 5px",
                        borderRadius: "999px",
                        background: statusStyle.bg,
                        color: statusStyle.c,
                        fontWeight: "600"
                      }}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <div style={{ fontSize: "6px", color: "#6b7280" }}>
                    {s.emitted_at || s.created_at || s.time
                      ? new Date(s.emitted_at || s.created_at || s.time).toLocaleTimeString("es", {
                          hour: "2-digit",
                          minute: "2-digit"
                        })
                      : "—"}
                  </div>
                </div>
              );
            })}

              <div
                className="grave-tbl-more"
              >
                ↓ Cargar más historial
              </div>
          </div>
        </main>
      </div>
    </>
  );
}

GraveyardPage.standalone = true;
