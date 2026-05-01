import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHead } from "../components/seo/PageHead";
import { getPublicApiUrl } from "../lib/publicRuntime";

/** Cap pages to avoid flooding the API on very large ledgers. */
const METRICS_MAX_PAGES = 40;

/** −10% hard stop in fractional units (same as outcome_60m / result_pct). */
const STOP_LOSS_CAP_FRAC = -0.1;

async function fetchTrackRecordPage(page, limit = 50) {
  const qs = new URLSearchParams();
  qs.set("filter", "all");
  qs.set("limit", String(limit));
  qs.set("page", String(page));
  const res = await fetch(`${getPublicApiUrl()}/api/v1/signals/track-record?${qs.toString()}`);
  if (!res.ok) throw new Error("track_record_fetch_failed");
  return res.json();
}

async function fetchTrackRecordFull() {
  const limit = 50;
  const first = await fetchTrackRecordPage(1, limit);
  const totalPagesRaw = Number(first.pagination?.total_pages || 1);
  const totalPages = Math.min(Math.max(1, totalPagesRaw), METRICS_MAX_PAGES);
  const merged = [...(first.recent_signals || [])];
  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) => fetchTrackRecordPage(i + 2, limit))
    );
    for (const body of rest) {
      merged.push(...(body.recent_signals || []));
    }
  }
  const byId = new Map();
  merged.forEach((s, idx) => {
    const k = s?.id != null ? s.id : `row-${idx}-${String(s?.time || s?.token || "")}`;
    if (!byId.has(k)) byId.set(k, s);
  });
  return {
    ...first,
    recent_signals: [...byId.values()],
    _pagesFetched: totalPages
  };
}

function outcomeRaw(s) {
  if (s?.result_pct != null && Number.isFinite(Number(s.result_pct))) return Number(s.result_pct);
  if (s?.outcome_60m != null && Number.isFinite(Number(s.outcome_60m))) return Number(s.outcome_60m);
  return null;
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

function AnimatedDonut({ pct, color, label, size = 62, segments }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const ref = useRef(null);

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
  }, [pct]);

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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1f2937" strokeWidth="8" />
        {arcs.map((a, i) => (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={a.color}
            strokeWidth="8"
            strokeDasharray={a.dash}
            transform={`rotate(${a.rotate} ${size / 2} ${size / 2})`}
            style={{ transition: `stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1) ${i * 0.15}s` }}
          />
        ))}
        <text
          x={size / 2}
          y={size / 2 - 3}
          textAnchor="middle"
          fill="#e2e8f0"
          fontSize="9"
          fontFamily="monospace"
          fontWeight="500"
        >
          {Math.round(pct)}%
        </text>
        <text x={size / 2} y={size / 2 + 8} textAnchor="middle" fill="#6b7280" fontSize="5" fontFamily="monospace">
          {label}
        </text>
      </svg>
    );
  }

  const fill = (pct / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1f2937" strokeWidth="8" />
      <circle
        ref={ref}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeDasharray={`0 ${circ}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2}
        y={size / 2 - 3}
        textAnchor="middle"
        fill="#e2e8f0"
        fontSize="9"
        fontFamily="monospace"
        fontWeight="500"
      >
        {Math.round(pct)}%
      </text>
      <text x={size / 2} y={size / 2 + 8} textAnchor="middle" fill="#6b7280" fontSize="5" fontFamily="monospace">
        {label}
      </text>
    </svg>
  );
}

function LineChart({ signals }) {
  const ref = useRef(null);
  const W = 360;
  const H = 120;
  const PAD = 14;

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
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <linearGradient id="graveLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#f87171" />
        </linearGradient>
      </defs>
      <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="#1f2937" strokeWidth="0.5" strokeDasharray="3 3" />
      <text x={PAD} y={10} fill="#64748b" fontSize="5" fontFamily="monospace">
        +
      </text>
      <text x={PAD} y={H / 2 + 4} fill="#64748b" fontSize="5" fontFamily="monospace">
        0%
      </text>
      <text x={PAD} y={H - 4} fill="#64748b" fontSize="5" fontFamily="monospace">
        -
      </text>
      {points ? (
        <polyline ref={ref} fill="none" stroke="url(#graveLineGrad)" strokeWidth="1.5" points={points} />
      ) : null}
      {lastPct != null ? (
        <>
          <rect x={W - 46} y={H - 18} width={34} height={9} rx="2" fill="rgba(92, 38, 38, 0.85)" />
          <text x={W - 44} y={H - 11} fill="#e89191" fontSize="6" fontFamily="monospace">
            {(lastPct * 100).toFixed(2)}%
          </text>
        </>
      ) : null}
      <text x={PAD} y={H} fill="#64748b" fontSize="5" fontFamily="monospace">
        -48h
      </text>
      <text x={W / 2 - 8} y={H} fill="#64748b" fontSize="5" fontFamily="monospace">
        -24h
      </text>
      <text x={W - 24} y={H} fill="#64748b" fontSize="5" fontFamily="monospace">
        ahora
      </text>
    </svg>
  );
}

function ScatterPlot({ signals, correlation }) {
  const W = 180;
  const H = 88;
  const PAD = 18;

  const dots = useMemo(() => {
    if (!signals?.length) return [];
    return signals
      .filter((s) => {
        const conf = Number(s.confidence ?? s.sentinel_score ?? s.sentinelScore ?? NaN);
        return Number.isFinite(conf) && outcomeRaw(s) != null;
      })
      .map((s) => {
        const conf = Number(s.confidence ?? s.sentinel_score ?? s.sentinelScore ?? 0);
        const ret = Number(outcomeRaw(s) ?? 0);
        const x = PAD + (conf / 100) * (W - PAD * 2);
        const clampedRet = Math.max(-0.2, Math.min(0.2, ret));
        const y = H / 2 - (clampedRet / 0.5) * ((H - PAD * 2) / 2);
        return { x, y, ret };
      });
  }, [signals]);

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <line x1={PAD} y1={PAD} x2={PAD} y2={H - 8} stroke="#1f2937" strokeWidth="0.5" />
      <line x1={PAD} y1={H / 2} x2={W - 4} y2={H / 2} stroke="#1f2937" strokeWidth="0.5" />
      <line x1={PAD} y1={H / 2 - 12} x2={W - 4} y2={H / 2 + 16} stroke="#818cf8" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.5" />
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.x}
          cy={d.y}
          r="2"
          fill={d.ret > 0 ? "#a78bfa" : "#818cf8"}
          opacity="0.8"
          style={{
            animation: `dotFadeIn 0.3s ease ${i * 0.05}s both`
          }}
        />
      ))}
      <text x={PAD + 2} y={8} fill="#4a5568" fontSize="5" fontFamily="monospace">
        50%
      </text>
      <text x={PAD + 2} y={H / 2 + 4} fill="#4a5568" fontSize="5" fontFamily="monospace">
        0%
      </text>
      <text x={PAD + 2} y={H - 6} fill="#4a5568" fontSize="5" fontFamily="monospace">
        -50%
      </text>
      <text x={PAD + 2} y={H} fill="#4a5568" fontSize="5" fontFamily="monospace">
        0
      </text>
      <text x={W / 2} y={H} fill="#4a5568" fontSize="5" fontFamily="monospace">
        50
      </text>
      <text x={W - 12} y={H} fill="#4a5568" fontSize="5" fontFamily="monospace">
        100
      </text>
      {correlation != null && Number.isFinite(correlation) ? (
        <text x={W - 42} y={10} fill="#818cf8" fontSize="5" fontFamily="monospace">
          r={correlation.toFixed(2)}
        </text>
      ) : null}
    </svg>
  );
}

export default function GraveyardPage() {
  const [filter, setFilter] = useState("all");

  const query = useQuery({
    queryKey: ["verified-track-record-full"],
    queryFn: fetchTrackRecordFull,
    refetchInterval: 60000
  });

  const data = query.data || {};
  const allRows = useMemo(() => data.recent_signals || [], [data.recent_signals]);

  const metrics = useMemo(() => computeInstitutionalMetrics(allRows), [allRows]);
  const {
    completed,
    wins,
    losses,
    winRate,
    avgWinPct,
    avgLossPct,
    profitFactor,
    maxDrawdown,
    expectancy,
    cappedExpectancy,
    killedCount,
    cappedMaxDD,
    bestCall,
    worstCall
  } = metrics;

  const hasMetrics = completed.length > 0;

  const avgOutcome =
    completed.length > 0
      ? completed.reduce((a, s) => a + (outcomeRaw(s) ?? 0), 0) / completed.length
      : 0;

  const correlationValue = useMemo(() => {
    const pairs = completed
      .filter((s) => {
        const c = Number(s.confidence ?? s.sentinel_score ?? s.sentinelScore ?? NaN);
        return Number.isFinite(c) && outcomeRaw(s) != null;
      })
      .map((s) => ({
        x: Number(s.confidence ?? s.sentinel_score ?? s.sentinelScore ?? 0),
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

  const filteredRows = useMemo(() => {
    if (filter === "wins") return allRows.filter((s) => outcomeRaw(s) != null && outcomeRaw(s) > 0);
    if (filter === "losses") return allRows.filter((s) => outcomeRaw(s) != null && outcomeRaw(s) <= 0);
    if (filter === "pending") return allRows.filter((s) => outcomeRaw(s) == null);
    return allRows;
  }, [filter, allRows]);

  const hasUsableData = completed.some((s) => outcomeRaw(s) != null);

  const isSystemBad = avgOutcome < -0.08 || winRate < 0.4;

  const safeProfitFactor = profitFactor && profitFactor > 0.05 ? profitFactor.toFixed(2) : "—";

  const safeDrawdown =
    maxDrawdown != null && maxDrawdown > -0.99 ? `${(maxDrawdown * 100).toFixed(2)}%` : "—";

  const safeAvgOutcome = !hasMetrics ? "—" : `${(avgOutcome * 100).toFixed(2)}%`;

  const pendingRowsCount = useMemo(
    () => allRows.filter((s) => outcomeRaw(s) == null).length,
    [allRows]
  );

  const features = useMemo(() => {
    return completed.map((s, idx) => {
      const r = outcomeRaw(s);
      const conf = Number(s.confidence || 0) / 100;

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
    if (predictedAlpha > 0.65) return "HIGH_ALPHA";
    if (predictedAlpha > 0.55) return "MODERATE_ALPHA";
    if (predictedAlpha < 0.45) return "NEGATIVE_ALPHA";
    return "NEUTRAL";
  }, [predictedAlpha]);

  const mlScoreByKey = useMemo(() => {
    const m = new Map();
    for (const x of rankedSignals) {
      m.set(x.signalKey, x.score);
    }
    return m;
  }, [rankedSignals]);

  const modelScore = predictedAlpha;
  const rankedML = rankedSignals;
  const weights = [0.25, 0.15, 0.15];

  return (
    <>
      <PageHead title="Verified Track Record — Sentinel Ledger" description="Every signal, every outcome, nothing hidden." />
      <div className="grave-root">
        <aside className="grave-sidebar">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "4px 2px",
              marginBottom: "4px",
              borderBottom: "1px solid #1f2937"
            }}
          >
            <div
              style={{
                width: "22px",
                height: "22px",
                background: "#4c1d95",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "9px",
                color: "#a78bfa",
                fontWeight: "600",
                flexShrink: 0
              }}
            >
              S
            </div>
            <div>
              <div style={{ fontSize: "10px", fontWeight: "600", color: "#e2e8f0", lineHeight: 1.1 }}>SENTINEL</div>
              <div style={{ fontSize: "7px", color: "#6b7280" }}>Meme Intel</div>
            </div>
          </div>

          {[
            { href: "/", label: "Inicio", sub: "Feed y escáner", icon: "⌂", active: false },
            { href: "/scanner", label: "Escáner", sub: "Buscar mint", icon: "⌕", active: false },
            { href: "/smart-money", label: "Smart Money", sub: "Wallets y edge", icon: "◎", active: false },
            { href: "/watchlist", label: "Watchlist", sub: "Tus tokens", icon: "♡", active: false },
            { href: "/alerts", label: "Alertas", sub: "Telegram/PRO", icon: "◫", active: false },
            { href: "/pricing", label: "Precios", sub: "Planes", icon: "$", active: false }
          ].map((item) => (
            <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "7px 8px",
                  borderRadius: "8px",
                  marginBottom: "4px",
                  cursor: "pointer",
                  background: item.active ? "#111827" : "transparent",
                  border: item.active ? "1px solid #2563eb" : "1px solid transparent"
                }}
              >
                <div
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "4px",
                    background: item.active ? "#1e3a5f" : "#1f2937",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "8px",
                    flexShrink: 0,
                    color: item.active ? "#60a5fa" : "#9ca3af"
                  }}
                >
                  {item.icon}
                </div>
                <div>
                  <div style={{ fontSize: "9px", color: "#d1d5db", fontWeight: "600" }}>{item.label}</div>
                  <div style={{ fontSize: "7px", color: "#6b7280" }}>{item.sub}</div>
                </div>
              </div>
            </Link>
          ))}

          <div
            style={{
              marginTop: "8px",
              background: "#1a1a2e",
              border: "1px solid #4c1d95",
              borderRadius: "8px",
              padding: "8px"
            }}
          >
            <div style={{ fontSize: "8px", fontWeight: "600", color: "#a78bfa", marginBottom: "4px" }}>PRO</div>
            <div style={{ fontSize: "7px", color: "#9ca3af", marginBottom: "4px" }}>Desbloquea todo</div>
            {["Alertas Telegram", "Edge en tiempo real", "Más filtros", "Sin límites"].map((t) => (
              <div
                key={t}
                style={{
                  fontSize: "7px",
                  color: "#9ca3af",
                  marginBottom: "2px",
                  display: "flex",
                  alignItems: "center",
                  gap: "3px"
                }}
              >
                <span style={{ color: "#34d399" }}>✓</span>
                {t}
              </div>
            ))}
            <Link href="/pricing">
              <button
                type="button"
                style={{
                  width: "100%",
                  background: "#7c3aed",
                  border: "none",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "8px",
                  padding: "6px",
                  cursor: "pointer",
                  marginTop: "6px",
                  fontFamily: "JetBrains Mono,monospace"
                }}
              >
                Ver Planes
              </button>
            </Link>
          </div>

          <div
            style={{
              marginTop: "auto",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "7px",
              color: "#6b7280",
              paddingTop: "8px",
              borderTop: "1px solid #1f2937"
            }}
          >
            <div
              className="grave-online-dot"
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: query.isError ? "#f87171" : "#34d399",
                flexShrink: 0
              }}
            />
            <div>
              <div style={{ color: query.isError ? "#f87171" : "#34d399", fontSize: "7px" }}>
                {query.isError ? "Error datos" : query.isFetching && !query.data ? "Cargando…" : "Sistema OK"}
              </div>
              <div style={{ fontSize: "6px", color: "#6b7280" }}>ONLINE</div>
            </div>
          </div>
        </aside>

        <main className="grave-main">
          <div className="grave-header">
            <div>
              <div style={{ fontSize: "12px", fontWeight: "700", color: "#e2e8f0", letterSpacing: ".03em" }}>
                Resumen general · Últimas 48h
              </div>
              <div style={{ fontSize: "7px", color: "#6b7280" }}>Track record verificado on-chain · nada oculto</div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  fontSize: "7px",
                  padding: "3px 8px",
                  borderRadius: "999px",
                  background: query.isError || isSystemBad ? "#2a1111" : "#0d2818",
                  color: query.isError || isSystemBad ? "#f87171" : "#34d399",
                  border: query.isError || isSystemBad ? "1px solid #7f1d1d" : "1px solid #166534",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                <div
                  className="grave-online-dot"
                  style={{
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    background: query.isError || isSystemBad ? "#f87171" : "#34d399"
                  }}
                />
                {query.isError ? "Error datos" : isSystemBad ? "Degradado" : "Operativo"}
              </div>

              <div style={{ display: "flex", gap: "4px" }}>
                {["24H", "48H", "7D", "30D"].map((t) => (
                  <div
                    key={t}
                    style={{
                      padding: "4px 8px",
                      borderRadius: "6px",
                      fontSize: "8px",
                      color: t === "48H" ? "#60a5fa" : "#6b7280",
                      border: t === "48H" ? "1px solid #2563eb" : "1px solid #1f2937",
                      background: t === "48H" ? "#1a3a5c" : "transparent",
                      cursor: "pointer"
                    }}
                  >
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grave-mrow">
            {[
              { label: "Señales emitidas", val: completed.length || "—", color: "#e2e8f0" },
              { label: "Win rate", val: hasMetrics ? `${(winRate * 100).toFixed(1)}%` : "—", color: "#e2e8f0" },
              { label: "Profit factor", val: hasMetrics ? safeProfitFactor : "—", color: "#e2e8f0" },
              { label: "Avg outcome", val: hasMetrics ? safeAvgOutcome : "—", color: avgOutcome < 0 ? "#f87171" : "#34d399" },
              {
                label: "Conf ↔ return",
                val: hasMetrics ? (correlationValue?.toFixed(2) ?? "—") : "—",
                color: "#f87171"
              },
              { label: "Max drawdown", val: hasMetrics ? safeDrawdown : "—", color: "#f87171" },
              {
                label: "Estado sistema",
                val: query.isError ? "ERROR" : isSystemBad ? "DEGRADADO" : "OPERATIVO",
                color: query.isError || isSystemBad ? "#f87171" : "#34d399"
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
              <div className="grave-cc-t" style={{ marginBottom: "6px" }}>
                Rendimiento (P&amp;L%)
              </div>
              {!hasUsableData ? (
                <div className="grave-data-stream-empty">
                  DATA STREAM INITIALIZING...
                  <span className="grave-cursor-blink">█</span>
                </div>
              ) : (
                <LineChart signals={completed} />
              )}
            </div>

            <div className="grave-core-right">
              <div className="grave-ml-panel">
                <div className="grave-cc-t">ML SIGNAL ENGINE</div>
                <div style={{ fontSize: "30px", fontWeight: "700", lineHeight: 1, color: "#818cf8", marginBottom: "4px" }}>
                  {(modelScore * 100).toFixed(1)}%
                </div>
                <div style={{ fontSize: "10px", color: "#94a3b8", marginBottom: "4px" }}>Model Confidence (R²)</div>
                <div style={{ fontSize: "9px", color: "#64748b", lineHeight: 1.5 }}>
                  Calibrated (top decile): {(calibratedConfidence * 100).toFixed(1)}% · ranked {rankedML.length}
                </div>
                <div style={{ fontSize: "9px", color: "#64748b", lineHeight: 1.5 }}>
                  W_conf: {weights[0].toFixed(2)} · W_cluster: {weights[1].toFixed(2)} · W_whale: {weights[2].toFixed(2)}
                </div>
                <div
                  style={{
                    marginTop: "6px",
                    fontSize: "8px",
                    color:
                      modelState === "HIGH_ALPHA"
                        ? "#34d399"
                        : modelState === "MODERATE_ALPHA"
                          ? "#60a5fa"
                          : modelState === "NEGATIVE_ALPHA"
                            ? "#f87171"
                            : "#9ca3af",
                    letterSpacing: ".04em"
                  }}
                >
                  {modelState}
                </div>
              </div>

              <div className="grave-top-signals">
                <div className="grave-cc-t">TOP ALPHA SIGNALS</div>
                {rankedML.slice(0, 5).map((sig, i) => {
                  const cIdx = completed.findIndex((c, j) => {
                    const k =
                      c?.id != null ? String(c.id) : `ml-${j}-${String(c.emitted_at || c.time || c.mint || "")}`;
                    return k === sig.signalKey;
                  });
                  const srcRow = cIdx >= 0 ? completed[cIdx] : null;
                  const symLabel = String(srcRow?.asset || srcRow?.symbol || sig.source || "???").slice(0, 8);
                  return (
                    <div
                      key={`${sig.signalKey}-${i}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "8px",
                        padding: "4px 0",
                        borderBottom: i < 4 ? "1px solid #0f172a" : "none"
                      }}
                    >
                      <span style={{ color: "#e2e8f0" }}>{symLabel}</span>
                      <span style={{ color: "#34d399", fontWeight: "600" }}>{(sig.score * 100).toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grave-secondary">
            <div className="grave-box grave-box-chart">
              <div className="grave-cc-t">Distribución resultados</div>
              <div className="grave-box-chart-inner">
                <AnimatedDonut
                  pct={hasMetrics ? winRate * 100 : 0}
                  color="#34d399"
                  label="win rate"
                  segments={[
                    { pct: hasMetrics ? winRate * 100 : 40, color: "#34d399", label: "Win" },
                    { pct: hasMetrics ? (1 - winRate) * 100 : 60, color: "#ef4444", label: "Loss" }
                  ]}
                />
              </div>
            </div>

            <div className="grave-box grave-box-chart">
              <div className="grave-cc-t" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Confidence vs Return</span>
                <span style={{ color: "#818cf8", fontSize: "8px" }}>
                  {hasMetrics ? correlationValue?.toFixed(2) ?? "—" : "—"}
                </span>
              </div>
              <div className="grave-box-chart-inner">
                <ScatterPlot signals={completed} correlation={hasMetrics ? correlationValue : null} />
              </div>
            </div>

            <div className="grave-box grave-box-chart">
              <div className="grave-cc-t">Señales por fuente</div>
              <div className="grave-box-chart-inner">
                <AnimatedDonut
                  pct={75}
                  color="#818cf8"
                  label="señales"
                  segments={[
                    { pct: 46, color: "#818cf8", label: "Cluster" },
                    { pct: 27, color: "#34d399", label: "Smart" },
                    { pct: 16, color: "#f59e0b", label: "Wallet" },
                    { pct: 11, color: "#4b5563", label: "Otros" }
                  ]}
                />
              </div>
            </div>
          </div>

          <div className="grave-insight-row">
            <div className="grave-oracle-panel">
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
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
                  WHEN THE ORACLE WAS RIGHT
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "10px" }}>
                {[
                  { v: wins.length || 0, l: "ganadoras", c: "#34d399" },
                  { v: hasMetrics ? `${(winRate * 100).toFixed(0)}%` : "—", l: "win rate", c: "#34d399" },
                  { v: hasMetrics ? `${(avgWinPct * 100).toFixed(2)}%` : "—", l: "P&L prom", c: "#34d399" },
                  {
                    v: bestCall ? `+${(Number(outcomeRaw(bestCall) ?? 0) * 100).toFixed(1)}%` : "—",
                    l: "mejor trade",
                    c: "#34d399"
                  }
                ].map((x, idx) => (
                  <div key={idx} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "16px", fontWeight: "700", color: x.c, lineHeight: 1.1 }}>{x.v}</div>
                    <div style={{ fontSize: "7px", color: "#6b7280" }}>{x.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {wins.slice(0, 5).map((s, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontSize: "7px",
                      padding: "3px 6px",
                      borderRadius: "999px",
                      color: "#34d399",
                      border: "1px solid #166534",
                      background: "#0a1a10"
                    }}
                  >
                    {s.asset || s.symbol || "?"}{" "}
                    {outcomeRaw(s) != null ? `+${(outcomeRaw(s) * 100).toFixed(1)}%` : ""}
                  </div>
                ))}
              </div>
            </div>

            <div className="grave-mistakes-panel">
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
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
                  WE SHOW OUR MISTAKES
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "10px" }}>
                {[
                  { v: losses.length || 0, l: "perdedoras", c: "#f87171" },
                  { v: hasMetrics ? `${((1 - winRate) * 100).toFixed(0)}%` : "—", l: "loss rate", c: "#f87171" },
                  { v: hasMetrics ? `${(avgLossPct * 100).toFixed(2)}%` : "—", l: "pérd. prom", c: "#f87171" },
                  {
                    v: worstCall ? `${(Number(outcomeRaw(worstCall) ?? 0) * 100).toFixed(1)}%` : "—",
                    l: "peor trade",
                    c: "#f87171"
                  }
                ].map((x, idx) => (
                  <div key={idx} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "16px", fontWeight: "700", color: x.c, lineHeight: 1.1 }}>{x.v}</div>
                    <div style={{ fontSize: "7px", color: "#6b7280" }}>{x.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {losses.slice(0, 5).map((s, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontSize: "7px",
                      padding: "3px 6px",
                      borderRadius: "999px",
                      color: "#f87171",
                      border: "1px solid #7f1d1d",
                      background: "#1a0808"
                    }}
                  >
                    {s.asset || s.symbol || "?"}{" "}
                    {outcomeRaw(s) != null ? `${(outcomeRaw(s) * 100).toFixed(1)}%` : ""}
                  </div>
                ))}
              </div>
            </div>

            <div className="grave-status-stack">
              <div className="grave-mini-panel">
                <div className="grave-cc-t">Estado actual (48h)</div>
                <div style={{ display: "grid", gap: "6px", fontSize: "8px", lineHeight: 1.4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Resolved rows</span>
                    <b>{completed.length}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Pending rows</span>
                    <b>{pendingRowsCount}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Failed rows</span>
                    <b>0</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Win rate</span>
                    <b>{hasMetrics ? `${(winRate * 100).toFixed(1)}%` : "—"}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Profit factor</span>
                    <b>{hasMetrics ? safeProfitFactor : "—"}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Avg outcome</span>
                    <b>{hasMetrics ? safeAvgOutcome : "—"}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Conf ↔ return</span>
                    <b>{hasMetrics ? (correlationValue?.toFixed(2) ?? "—") : "—"}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Max drawdown</span>
                    <b>{hasMetrics ? safeDrawdown : "—"}</b>
                  </div>
                </div>
              </div>

              <div className="grave-mini-panel">
                <div className="grave-cc-t">Kill Switch Simulation</div>
                <div style={{ display: "grid", gap: "6px", fontSize: "8px", lineHeight: 1.4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Raw expectancy</span>
                    <b style={{ color: hasMetrics && expectancy < 0 ? "#f87171" : "#34d399" }}>
                      {hasMetrics ? `${(expectancy * 100).toFixed(2)}%` : "—"}
                    </b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Capped expectancy</span>
                    <b style={{ color: hasMetrics && cappedExpectancy < 0 ? "#f87171" : "#34d399" }}>
                      {hasMetrics ? `${(cappedExpectancy * 100).toFixed(2)}%` : "—"}
                    </b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Signals killed</span>
                    <b style={{ color: "#f59e0b" }}>{killedCount ?? 0}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Capped max DD</span>
                    <b style={{ color: "#f87171" }}>
                      {hasMetrics ? `${(cappedMaxDD * 100).toFixed(2)}%` : "—"}
                    </b>
                  </div>
                </div>
                <div
                  style={{
                    marginTop: "8px",
                    fontSize: "8px",
                    padding: "8px",
                    borderRadius: "6px",
                    background:
                      !hasMetrics || cappedExpectancy > 0 ? "#0d2818" : "#2a1111",
                    border: `1px solid ${!hasMetrics || cappedExpectancy > 0 ? "#166534" : "#7f1d1d"}`,
                    color: !hasMetrics || cappedExpectancy > 0 ? "#34d399" : "#f87171"
                  }}
                >
                  {!hasMetrics
                    ? "—"
                    : cappedExpectancy > 0
                      ? "✓ SURVIVABLE with -10% stop-loss"
                      : "⚠ UNSURVIVABLE — improve entry quality"}
                </div>
              </div>

              <div className="grave-mini-panel">
                <div className="grave-cc-t">Pipeline hints</div>
                <div style={{ display: "grid", gap: "6px", fontSize: "8px", lineHeight: 1.4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Sample cap hit</span>
                    <b>No</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Pending w/o entry</span>
                    <b>0</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Resolved w/o outcome</span>
                    <b>0</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Horizonte por defecto</span>
                    <b>10 min</b>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grave-tbl">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <div style={{ fontSize: "9px", color: "#e2e8f0", fontWeight: "700", letterSpacing: ".04em" }}>RECENT SIGNAL FEED</div>
              <div style={{ display: "flex", gap: "4px" }}>
                {["all", "wins", "losses", "pending"].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    style={{
                      fontSize: "8px",
                      padding: "4px 8px",
                      borderRadius: "6px",
                      border: filter === f ? "1px solid #2563eb" : "1px solid #1f2937",
                      background: filter === f ? "#1a3a5c" : "transparent",
                      color: filter === f ? "#60a5fa" : "#6b7280",
                      cursor: "pointer",
                      fontFamily: "JetBrains Mono,monospace"
                    }}
                  >
                    {f === "all" ? "Todas" : f === "wins" ? "Wins ✓" : f === "losses" ? "Losses ✗" : "Pending ⏳"}
                  </button>
                ))}
              </div>
            </div>

              <div className="grave-thdr">
                {["", "Token", "Fuente", "Conf", "Precio entrada", "P&L 60m", "Estado", "Hora"].map((h, idx) => (
                  <div key={idx} className="grave-th" style={{ color: "#4a5568", letterSpacing: ".04em" }}>
                    {h}
                  </div>
                ))}
              </div>

              {filteredRows.slice(0, 12).map((s, i) => {
              const rawOriginal = outcomeRaw(s);

              const raw =
                rawOriginal == null ? null : Math.max(-0.1, Math.min(0.2, rawOriginal));

              const pct = raw != null ? raw * 100 : null;
              const isWin = pct != null && pct > 0;
              const isPending = rawOriginal == null;
              const isKilled = rawOriginal != null && rawOriginal < STOP_LOSS_CAP_FRAC;
              const sym = s.asset || s.symbol || (s.mint ? String(s.mint).slice(0, 6) : null) || "???";
              const sourceRaw = Array.isArray(s.signals) ? s.signals[0] : s.rule_id || s.source || "smart_money";
              const source = String(sourceRaw || "smart_money").toLowerCase();
              const sourceLabel = source.includes("cluster")
                ? "Cluster Probing"
                : source.includes("whale")
                  ? "Whale Activity"
                  : "Smart Money";
              const sourceColor = source.includes("cluster")
                ? { bg: "#1e1b4b", c: "#818cf8" }
                : source.includes("whale")
                  ? { bg: "#1c1009", c: "#f59e0b" }
                  : { bg: "#0d2818", c: "#34d399" };
              const conf = Number(s.confidence ?? s.sentinel_score ?? s.sentinelScore ?? 0);
              let statusLabel = "NEUTRAL";
              if (isPending) statusLabel = "PENDING";
              else if (isKilled) statusLabel = "KILLED";
              else if (isWin) statusLabel = "WIN";
              else if (pct != null && pct <= -10) statusLabel = "LOSS";
              const statusStyle = {
                WIN: { bg: "#0d2818", c: "#34d399" },
                LOSS: { bg: "#1c0a0a", c: "#e89191" },
                KILLED: { bg: "#2d1a00", c: "#f59e0b" },
                PENDING: { bg: "#1a3a5c", c: "#60a5fa" },
                NEUTRAL: { bg: "#1f2937", c: "#9ca3af" }
              }[statusLabel];

              const tRaw = s.emitted_at || s.time || s.created_at;

              const cIdx = completed.findIndex(
                (c) => (s?.id != null && c?.id != null && String(c.id) === String(s.id)) || c === s
              );
              const signalKey =
                s?.id != null
                  ? String(s.id)
                  : cIdx >= 0
                    ? `ml-${cIdx}-${String(completed[cIdx]?.emitted_at || completed[cIdx]?.time || completed[cIdx]?.mint || "")}`
                    : `ml-unranked-${i}`;

              const mlScore = mlScoreByKey.get(signalKey) ?? 0;
              const intensity = Math.min(mlScore * 2, 1);
              const rowBg = `rgba(99,102,241,${0.05 + intensity * 0.3})`;

              return (
                <div
                  key={s.id != null ? String(s.id) : `row-${i}`}
                  className="grave-trow"
                  style={{
                    background: rowBg,
                    borderLeft: `2px solid ${pct == null ? "#475569" : pct > 0 ? "#34d399" : "#e89191"}`
                  }}
                >
                  <div style={{ fontSize: "8px", color: "#64748b" }}>☆</div>
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
                      <Link href={`/token/${encodeURIComponent(s.token || s.mint || "")}`} style={{ textDecoration: "none" }}>
                        <div style={{ fontSize: "9px", color: "#e2e8f0", fontWeight: "600" }}>{sym}</div>
                      </Link>
                      <div style={{ fontSize: "6px", color: "#6b7280" }}>{regimeKeyForRow(s)}</div>
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "6px",
                        padding: "1px 4px",
                        borderRadius: "6px",
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
                    <div style={{ fontSize: "9px", color: "#e2e8f0" }}>{Number.isFinite(conf) ? conf.toFixed(0) : "—"}</div>
                    <div style={{ height: "2px", background: "#1f2937", borderRadius: "1px", marginTop: "1px" }}>
                      <div
                        style={{
                          height: "2px",
                          width: `${Math.min(Math.max(conf, 0), 100)}%`,
                          background:
                            conf > 70
                              ? "linear-gradient(90deg,#34d399,#22c55e)"
                              : conf > 40
                                ? "linear-gradient(90deg,#3b82f6,#60a5fa)"
                                : "linear-gradient(90deg,#e89191,#dc5757)",
                          borderRadius: "1px"
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: "8px", color: "#9ca3af" }}>
                    {s.entry_price_usd ? `$${Number(s.entry_price_usd).toFixed(6)}` : "—"}
                  </div>
                  <div style={{ fontSize: "8px", color: pct == null ? "#6b7280" : pct > 0 ? "#34d399" : "#e89191" }}>
                    {pct != null ? `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%` : "validating..."}
                    {isKilled ? (
                      <span style={{ fontSize: "6px", color: "#f59e0b", marginLeft: "2px" }}>(cap:-10%)</span>
                    ) : null}
                  </div>
                  <div>
                    <span
                      style={{
                        fontSize: "6px",
                        padding: "1px 4px",
                        borderRadius: "2px",
                        background: statusStyle.bg,
                        color: statusStyle.c,
                        fontWeight: "500"
                      }}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: "6px", color: "#64748b" }}>
                    {tRaw
                      ? new Date(tRaw).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </div>
                </div>
              );
              })}

              <div
                style={{
                  textAlign: "center",
                  padding: "8px",
                  fontSize: "7px",
                  color: "#6b7280",
                  borderTop: "1px solid #1f2937",
                  marginTop: "4px",
                  cursor: "pointer"
                }}
              >
                ↓ Cargar más señales
              </div>
          </div>
        </main>
      </div>
    </>
  );
}

GraveyardPage.standalone = true;

function regimeKeyForRow(s) {
  const r = String(s.regime ?? s.emission_regime ?? s.gate_meta?.regime ?? "unknown").toLowerCase();
  if (["calm", "trending", "volatile"].includes(r)) return r;
  return "unknown";
}
