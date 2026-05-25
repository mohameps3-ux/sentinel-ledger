import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHead } from "../components/seo/PageHead";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useTrackRecordLive, TRACK_RECORD_QUERY_KEY } from "../hooks/useTrackRecordLive";
import { TrackRecordShell } from "../components/layout/TrackRecordShell";

const REFRESH_MS = 30_000;
const CHART_PAGES = 6;
/** Aligned with backend signal_outcomes / oracle decisive (fraction of return). */
const TR_DECISIVE_WIN = 0.05;
const TR_DECISIVE_LOSS = -0.05;

function pct(v, d = 1) { const n = Number(v); return Number.isFinite(n) ? `${(n * 100).toFixed(d)}%` : "—"; }
/**
 * Format a fractional return (e.g., 0.05 = 5%, 22.9 = 2290%) cleanly:
 * - >= 1000% (10x)  → "+23x" (multiplier form for pump.fun outliers)
 * - >= 100%  (1x)   → "+150%"
 * - otherwise       → "+5.2%"
 */
function formatBigPct(v, sign = true) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const absN = Math.abs(n);
  const s = sign && n > 0 ? "+" : n < 0 ? "-" : "";
  if (absN >= 10) return `${s}${Math.round(absN)}x`;
  if (absN >= 1) return `${s}${(absN * 100).toFixed(0)}%`;
  return `${s}${(absN * 100).toFixed(1)}%`;
}
function shortMint(mint) { const s = String(mint || ""); return s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s || "—"; }
function clamp01(v) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; }
function outcomeState(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "pending";
  if (n > TR_DECISIVE_WIN) return "win";
  if (n < TR_DECISIVE_LOSS) return "loss";
  return "flat";
}

const FETCH_MS = 35_000;

function dedupeChartRows(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    if (!r.id && !r.created_at) continue;
    const k = String(r.id || `${r.mint}-${r.rule_id}-${r.created_at}`);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out.sort((a, b) => Date.parse(a.created_at || 0) - Date.parse(b.created_at || 0));
}

/** Fallback when API is older than chart_rows field (single-page clients). */
function mergeChartRowsFromPayload(first, pagedRecent) {
  const extra = [
    first?.best_call,
    first?.worst_call,
    ...(Array.isArray(first?.top_wins) ? first.top_wins : []),
    ...(Array.isArray(first?.worst_losses) ? first.worst_losses : [])
  ].filter(Boolean);
  return dedupeChartRows([...pagedRecent, ...extra]);
}

async function fetchTrackRecord() {
  const qs = new URLSearchParams({
    filter: "all",
    limit: "50",
    page: "1",
    chart_pages: String(CHART_PAGES)
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(`${getPublicApiUrl()}/api/v1/signals/track-record?${qs}`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) throw new Error(body?.error || `track_record_http_${res.status}`);
    const chartRows =
      Array.isArray(body.chart_rows) && body.chart_rows.length > 0
        ? body.chart_rows
        : mergeChartRowsFromPayload(body, body.recent_signals || []);
    const resolvedRows = chartRows.filter((r) => Number.isFinite(Number(r?.outcome_60m)));
    const wins = resolvedRows.filter((r) => outcomeState(r.outcome_60m) === "win").length;
    const losses = resolvedRows.filter((r) => outcomeState(r.outcome_60m) === "loss").length;
    const flats = resolvedRows.filter((r) => outcomeState(r.outcome_60m) === "flat").length;
    return { ...body, chart_rows: chartRows, real_distribution: { wins, losses, flats, resolved: resolvedRows.length } };
  } finally {
    clearTimeout(timer);
  }
}

function Shell({ children }) {
  return <TrackRecordShell>{children}</TrackRecordShell>;
}
function Kpi({ label, value, detail, tone = "default", tooltip }) {
  const color = tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : tone === "blue" ? "text-sky-300" : "text-slate-100";
  const dot = tone === "bad" ? "bg-rose-400" : tone === "blue" ? "bg-sky-400" : "bg-emerald-400";
  return (
    <div className="rounded-xl border border-slate-800 bg-[#08111a]/85 p-4 transition hover:border-slate-700" title={tooltip || undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
        <span className={`h-2 w-2 rounded-full ${dot} ${tone === "good" || tone === "blue" ? "animate-pulse" : ""}`} />
      </div>
      <div className={`mt-4 font-mono text-2xl font-black ${color}`}>{value}</div>
      <div className="mt-2 text-sm text-slate-400">{detail}</div>
    </div>
  );
}

/**
 * Hero card showing the top recent win prominently. This is the emotional anchor
 * — "Sentinel just made someone +X% on $TOKEN." Photon/GMGN don't show this.
 */
function BestSignalHero({ topWin, lastUpdated }) {
  if (!topWin || !Number.isFinite(Number(topWin.outcome_60m))) return null;
  const outcomeFrac = Number(topWin.outcome_60m);
  const ageMs = topWin.created_at ? Date.now() - Date.parse(topWin.created_at) : null;
  const ageStr = ageMs != null ? (ageMs < 60_000 ? `${Math.round(ageMs / 1000)}s` : ageMs < 3600_000 ? `${Math.round(ageMs / 60_000)}m` : `${Math.round(ageMs / 3600_000)}h`) : "—";
  const symbol = topWin.symbol || topWin.asset || (topWin.mint ? String(topWin.mint).slice(0, 6) : "?");
  const ruleId = String(topWin.rule_id || topWin.rule_snapshot?.ruleId || "—").toUpperCase();
  const regime = String(topWin.regime || topWin.emission_regime || "—").toLowerCase();
  const moveDisplay = formatBigPct(outcomeFrac);
  const isExtreme = Math.abs(outcomeFrac) >= 10; // 1000%+ — usually pump.fun microcap
  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-[#06101a] to-[#06101a] p-5">
      <div className="absolute right-4 top-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-emerald-300/80">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        <span>BEST SIGNAL · LAST 7D</span>
      </div>
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Token</div>
          <div className="mt-1 text-3xl font-black text-white">${symbol}</div>
          <div className="mt-1 font-mono text-xs text-slate-500">{shortMint(topWin.mint)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Resolved Move</div>
          <div className="mt-1 font-mono text-4xl font-black text-emerald-300">
            {moveDisplay}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            vs entry · 30m {isExtreme ? <span className="text-amber-300/80">· microcap pump</span> : null}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Signal Age</div>
          <div className="mt-1 font-mono text-2xl font-black text-slate-200">{ageStr}</div>
          <div className="mt-1 text-xs text-slate-500">since emission</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Source</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-base font-bold text-cyan-200">{ruleId}</span>
            <span className="text-xs text-slate-500">· {regime}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">rule · regime</div>
        </div>
        <div className="ml-auto">
          <Link
            href={`/token/${topWin.mint || ""}`}
            className="inline-block rounded border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-emerald-200 hover:bg-emerald-400/20"
          >
            View Token →
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Differentiator strip — what makes Sentinel different vs competitors.
 * Photon, GMGN, BullX don't expose this kind of resolved-outcome track record.
 */
function DifferentiatorStrip() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {[
        { label: "Photon", value: "no public WR", note: "no resolved outcomes" },
        { label: "GMGN.ai", value: "no public WR", note: "smart-money only" },
        { label: "DexScreener", value: "no signals", note: "data aggregator" },
        { label: "Sentinel", value: "verified", note: "this page · live data", highlight: true }
      ].map((item) => (
        <div
          key={item.label}
          className={`rounded-lg border p-3 ${item.highlight ? "border-cyan-400/40 bg-cyan-400/[0.06]" : "border-slate-800 bg-[#08111a]/60"}`}
        >
          <div className={`text-[10px] font-bold uppercase tracking-[0.12em] ${item.highlight ? "text-cyan-300" : "text-slate-500"}`}>
            {item.label}
          </div>
          <div className={`mt-1 font-mono text-sm font-black ${item.highlight ? "text-cyan-200" : "text-slate-400"}`}>
            {item.value}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">{item.note}</div>
        </div>
      ))}
    </div>
  );
}

function makeSeries(rows, mode) {
  const resolved = [...(rows || [])].filter((r) => Number.isFinite(Number(r?.outcome_60m))).slice(-160);
  if (resolved.length < 1) return [];
  let acc = 0;
  let wins = 0;
  let decisive = 0;
  return resolved.map((r) => {
    const out = Number(r.outcome_60m);
    acc += out;
    const isWin = out > TR_DECISIVE_WIN;
    const isLoss = out < TR_DECISIVE_LOSS;
    if (isWin || isLoss) decisive += 1;
    if (isWin) wins += 1;
    if (mode === "win") return decisive ? wins / decisive : 0;
    if (mode === "avg") return acc / Math.max(1, resolved.indexOf(r) + 1);
    return acc;
  });
}
function pathFrom(values, w = 420, h = 150, pad = 18) {
  if (!values.length) return "";
  const vals = values.length === 1 ? [values[0], values[0]] : values;
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0.001);
  const range = max - min || 1;
  return vals
    .map((v, i) => {
      const x = pad + (i / Math.max(vals.length - 1, 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
function LineChart({ title, subtitle, value, rows, mode = "equity", color = "#22d3ee" }) { const values = useMemo(() => makeSeries(rows, mode), [rows, mode]); const d = pathFrom(values); return <div className="rounded-xl border border-slate-800 bg-[#08111a]/85 p-4"><div className="mb-3 flex items-start justify-between gap-3"><div><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-300">{title}</div><div className="text-sm text-slate-500">{subtitle}</div></div><div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-2.5 py-1 font-mono text-sm text-cyan-200">{value}</div></div><svg viewBox="0 0 420 150" className="h-[150px] w-full overflow-visible">{[0,1,2,3].map((i)=><line key={i} x1="18" x2="402" y1={22+i*34} y2={22+i*34} stroke="rgba(148,163,184,.12)" />)}{d ? <path d={d} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" /> : <text x="210" y="80" textAnchor="middle" fill="rgba(148,163,184,.55)" fontSize="12">insufficient real series</text>}</svg></div>; }
function Donut({ distribution }) { const r = 54, c = 2 * Math.PI * r; const wins = Number(distribution?.wins || 0), losses = Number(distribution?.losses || 0), flats = Number(distribution?.flats || 0); const total = Math.max(1, wins + losses + flats); const w = wins / total, l = losses / total, f = flats / total; return <div className="rounded-xl border border-slate-800 bg-[#08111a]/85 p-4"><div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-300">Resolved Outcomes</div><div className="grid grid-cols-[150px_1fr] items-center gap-4"><svg viewBox="0 0 150 150" className="h-[150px] w-[150px] -rotate-90"><circle cx="75" cy="75" r={r} fill="none" stroke="rgba(148,163,184,.18)" strokeWidth="22" /><circle cx="75" cy="75" r={r} fill="none" stroke="#10b981" strokeWidth="22" strokeDasharray={`${c*w} ${c}`} /><circle cx="75" cy="75" r={r} fill="none" stroke="#fb7185" strokeWidth="22" strokeDasharray={`${c*l} ${c}`} strokeDashoffset={-c*w} /><circle cx="75" cy="75" r={r} fill="none" stroke="#64748b" strokeWidth="22" strokeDasharray={`${c*f} ${c}`} strokeDashoffset={-c*(w+l)} /></svg><div className="space-y-3 text-sm"><div className="font-mono text-2xl font-black text-white">{(wins+losses+flats).toLocaleString()}</div><div className="text-slate-500">{distribution?.fromLedger ? "Ledger (±5%)" : "Chart sample"}</div><div className="flex justify-between"><span className="text-emerald-300">Wins</span><span className="font-mono">{wins.toLocaleString()}</span></div><div className="flex justify-between"><span className="text-rose-300">Losses</span><span className="font-mono">{losses.toLocaleString()}</span></div><div className="flex justify-between"><span className="text-slate-400">Flat</span><span className="font-mono">{flats.toLocaleString()}</span></div></div></div></div>; }
function SignalRow({ row }) {
  const outcome = Number(row?.outcome_60m);
  const status = !Number.isFinite(outcome)
    ? "PENDING"
    : outcome > TR_DECISIVE_WIN
      ? "WIN"
      : outcome < TR_DECISIVE_LOSS
        ? "LOSS"
        : "FLAT";
  const tone =
    outcome < TR_DECISIVE_LOSS ? "text-rose-300" : outcome > TR_DECISIVE_WIN ? "text-emerald-300" : "text-slate-300";
  return (
    <tr className="border-b border-slate-800/70 hover:bg-slate-800/30">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-sky-400/10 px-2 py-1 font-mono text-xs text-sky-300">
            {(row?.symbol || "?").slice(0, 2).toUpperCase()}
          </span>
          <span>{row?.symbol || row?.asset || shortMint(row?.mint)}</span>
        </div>
      </td>
      <td className="px-4 py-3 font-mono text-slate-400">{shortMint(row?.mint || row?.token_address)}</td>
      <td className="px-4 py-3">
        <span className="text-sky-300">●</span> {row?.regime || "unknown"}
      </td>
      <td className="px-4 py-3 text-slate-300">{Array.isArray(row?.signals) ? row.signals.join("+") : "whale_signal"}</td>
      <td className="px-4 py-3 font-mono">{Number(row?.confidence || 0).toFixed(0)}</td>
      <td className="px-4 py-3">
        <span className="rounded-md bg-sky-400/10 px-2 py-1 font-mono text-xs text-sky-200">{status}</span>
      </td>
      <td className={`px-4 py-3 font-mono ${tone}`}>{Number.isFinite(outcome) ? pct(outcome, 2) : "—"}</td>
      <td className="px-4 py-3 font-mono text-slate-500">{row?.created_at ? new Date(row.created_at).toLocaleString() : "—"}</td>
    </tr>
  );
}

function TrackRecordPage() {
  const queryClient = useQueryClient();
  const { wsConnected, lastLivePushAt } = useTrackRecordLive(queryClient);
  const query = useQuery({
    queryKey: TRACK_RECORD_QUERY_KEY,
    queryFn: fetchTrackRecord,
    staleTime: 25_000,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: (failureCount, err) => {
      const m = String(err?.message || err || "");
      if (/rate_limit|429|rate limit/i.test(m)) return false;
      return failureCount < 2;
    }
  });
  const data = query.isSuccess ? query.data : null;
  const loadFailed = query.isError;
  const errMsg = query.error instanceof Error ? query.error.message : String(query.error || "request_failed");
  const showSkeleton = !query.isSuccess && !query.isError;
  const hideNumericKpis = loadFailed || showSkeleton;
  const emptyLedger =
    Boolean(query.isSuccess && data && Number(data.total_signals || 0) === 0 && Number(data.resolved_signals || 0) === 0);
  const meta = (data && data.meta) || {};
  const perfMirror = meta.track_record_row_source === "signal_performance";
  const rows = data && Array.isArray(data.recent_signals) ? data.recent_signals : [];
  const chartRows = data && Array.isArray(data.chart_rows) ? data.chart_rows : rows;
  const resolved = data ? Number(data.resolved_signals || 0) : 0;
  const total = data ? Number(data.total_signals || 0) : 0;
  const pending = Math.max(0, total - resolved);
  const winRate = data && data.win_rate_60m != null && Number.isFinite(Number(data.win_rate_60m)) ? Number(data.win_rate_60m) : 0;
  const avgReturn = data && data.avg_return != null && Number.isFinite(Number(data.avg_return)) ? Number(data.avg_return) : 0;
  const medianReturn = data && data.median_return != null && Number.isFinite(Number(data.median_return)) ? Number(data.median_return) : null;
  const flatNeutral = data && Number.isFinite(Number(data.flat_resolved_signals)) ? Number(data.flat_resolved_signals) : NaN;
  const avgRows = Number(meta.avg_return_sample_rows || 0);
  const perfMirrorAgg = meta.stats_basis === "signal_performance_mirror";
  const rollingDays = Number(meta.rolling_metrics_days || 7);
  const winDetail = `win ÷ (win+loss), move ±5%, last ${rollingDays}d`;
  // Median is the headline (robust to pump.fun outliers); mean is shown as secondary context.
  const useMedian = medianReturn != null;
  const headlineReturn = useMedian ? medianReturn : avgReturn;
  const avgDetail = useMedian
    ? `median · mean ${formatBigPct(avgReturn)} (incl. outliers)`
    : perfMirrorAgg
      ? `mean resolved outcomes · last ${rollingDays}d`
      : avgRows > 0
        ? `last ${rollingDays}d · sample ${avgRows.toLocaleString()} rows`
        : `mean resolved · last ${rollingDays}d`;
  const ddDetail = `worst case at 30m · last ${rollingDays}d`;
  // Track Record uses institutional ±5% threshold; Home banner uses ±1% — both honest, different lens.
  const winTooltip = "Institutional methodology: a signal counts as WIN only if the token moves +5% or more within 30 minutes of emission. Smaller moves count as flat (excluded from WR denominator), losses as -5% or worse. This is stricter than Home banner (±1%).";
  const avgTooltip = "MEDIAN return — the typical signal outcome at 30m. Robust to pump.fun outliers (a single +2000x microcap doesn't distort the headline). The MEAN is shown as a secondary number for transparency: it includes those extreme winners and is naturally much higher.";
  const ddTooltip = "Single worst realized outcome at 30m in the rolling window — captures the rug-pull risk you're exposed to if you blindly chase every signal.";

  const topWin = useMemo(() => {
    const wins = Array.isArray(data?.top_wins) ? data.top_wins : [];
    if (wins.length) return wins[0];
    const sorted = chartRows.filter((r) => Number.isFinite(Number(r?.outcome_60m))).sort((a, b) => Number(b.outcome_60m) - Number(a.outcome_60m));
    return sorted[0] || null;
  }, [data, chartRows]);
  const lastUpdatedAgo = useMemo(() => {
    const ts = lastLivePushAt || (data?.last_updated ? Date.parse(data.last_updated) : null);
    if (!ts) return null;
    const diff = Date.now() - ts;
    if (diff < 0 || !Number.isFinite(diff)) return null;
    if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))}s ago`;
    return `${Math.round(diff / 60_000)}m ago`;
  }, [lastLivePushAt, data?.last_updated]);
  const apiBase = getPublicApiUrl();
  const donutDistribution = useMemo(() => {
    if (!data) return { wins: 0, losses: 0, flats: 0, resolved: 0 };
    const sample = data.real_distribution || {};
    const resN = Number(data.resolved_signals || 0);
    const flatN = Number(data.flat_resolved_signals ?? 0);
    const wr =
      data.win_rate_60m != null && Number.isFinite(Number(data.win_rate_60m))
        ? Number(data.win_rate_60m)
        : null;
    if ((sample.resolved || 0) > 0) return { ...sample, fromLedger: false };
    if (resN > 0 && wr != null && Number.isFinite(flatN) && !Number.isNaN(flatN)) {
      const decisive = Math.max(0, resN - flatN);
      const winC = Math.round(wr * decisive);
      const lossC = Math.max(0, decisive - winC);
      return { wins: winC, losses: lossC, flats: flatN, resolved: resN, fromLedger: true };
    }
    return { ...sample, fromLedger: false };
  }, [data]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !data?.meta) return;
    if (data.meta.track_record_row_source === "signal_performance") {
      console.debug("[track-record] dev: row_source=signal_performance", data.meta);
    }
  }, [data]);

  return (
    <Shell>
      {loadFailed ? (
        <div className="border-b border-amber-500/35 bg-amber-950/35 px-6 py-3 text-sm text-amber-50 xl:px-8">
          <b className="text-amber-200">Track record request failed.</b>{" "}
          <span className="font-mono text-amber-100/90">{errMsg}</span>
          {" · "}
          <button
            type="button"
            onClick={() => query.refetch()}
            className="text-amber-200 underline decoration-amber-400/70 hover:text-white"
          >
            Retry
          </button>
        </div>
      ) : null}
      {showSkeleton ? (
        <div className="border-b border-cyan-500/35 bg-[#06101a] px-6 py-3 text-sm text-cyan-100 xl:px-8">
          <b className="text-cyan-200">Cargando ledger…</b>{" "}
          <span className="font-mono text-slate-400">conectando con {apiBase}</span>
        </div>
      ) : null}
      {emptyLedger ? (
        <div className="border-b border-amber-500/35 bg-amber-950/40 px-6 py-3 text-sm text-amber-50 xl:px-8">
          <b className="text-amber-200">El API devolvió cero filas en el ledger.</b> Si en Supabase sí hay datos en{" "}
          <code className="text-amber-100/90">signal_outcomes</code>, en Vercel revisa{" "}
          <code className="text-amber-100/90">NEXT_PUBLIC_API_URL</code> (debe ser el Railway donde corre el oráculo). Base
          usada: <span className="font-mono text-amber-100/80">{apiBase}</span>
        </div>
      ) : null}
      {perfMirror && !emptyLedger && query.isSuccess ? (
        <div className="border-b border-cyan-500/25 bg-cyan-950/20 px-6 py-3 text-sm text-cyan-50 xl:px-8">
          <b className="text-cyan-200">Automated resolution.</b> Metrics resolve at 30m using live DEX prices—every
          number on this page reflects real post-signal market moves, not back-tested curves.
        </div>
      ) : null}
      <div className="border-b border-slate-800 bg-[#030712]/85 px-6 py-4 backdrop-blur-xl xl:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
          <span>YOU ARE HERE&nbsp;&nbsp; <b className="text-slate-200">Sentinel</b> › <b className="text-slate-200">Track Record</b></span>
          <span className="flex items-center gap-2">
            Oracle · KPIs {hideNumericKpis ? "…" : "live"} · chart {hideNumericKpis ? "—" : chartRows.length} rows ·
            {wsConnected ? (
              <span className="flex items-center gap-1 text-emerald-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                live stream
              </span>
            ) : (
              <span className="text-slate-500">poll only</span>
            )}
            {lastUpdatedAgo ? <span className="font-mono text-[11px] text-slate-500">· updated {lastUpdatedAgo}</span> : null}
          </span>
        </div>
      </div>
      <div className="space-y-4 p-6 xl:p-8">
        <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div>
            <span className="rounded border border-cyan-400/30 bg-cyan-400/5 px-3 py-1 font-mono text-xs uppercase tracking-[0.16em] text-cyan-300">Performance Verified · 30m</span>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-white">Sentinel Validation Engine</h1>
            <h2 className="mt-2 text-2xl font-black text-cyan-300">Track Record Institutional</h2>
            <p className="mt-3 max-w-2xl text-slate-400">
              {perfMirror ? (
                <>
                  Every headline metric and chart row is backed by automated 30-minute resolution against live DEX
                  prices. Win rate uses the institutional ±5% threshold — a signal only counts as a win if the token moves
                  +5% or more after emission. <b className="text-slate-200">This is the dataset competitors hide.</b>
                </>
              ) : (
                <>
                  Headline KPIs and charts use signal outcomes resolved at 30m with live DEX prices. The WebSocket
                  stream refreshes numbers when new resolutions land — not only on the HTTP poll.
                </>
              )}
            </p>
          </div>
          <div className="flex items-center justify-end gap-3">
            <button onClick={() => query.refetch()} className="rounded border border-cyan-400/40 bg-cyan-400/5 px-8 py-4 font-mono text-xs font-bold uppercase tracking-[0.18em] text-cyan-200 hover:bg-cyan-400/10">↻ Refresh</button>
            <Link href="/scanner" className="rounded border border-slate-700 px-8 py-4 font-mono text-xs font-bold uppercase tracking-[0.18em] text-slate-200 hover:border-cyan-400/40">Alpha Radar</Link>
          </div>
        </section>

        {!hideNumericKpis && topWin ? <BestSignalHero topWin={topWin} lastUpdated={data?.last_updated} /> : null}

        <section className="rounded-2xl border border-slate-800 bg-[#06101a]/80 p-4">
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            <b className="text-cyan-300">LIVE ORACLE</b>
            <span>Validation Engine · Real Chart Series</span>
            {wsConnected ? (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-300">Real-time stream</span>
            ) : (
              <span className="rounded-full border border-slate-600 bg-slate-800/60 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Stream idle · poll only</span>
            )}
            {lastLivePushAt ? (
              <span className={`font-mono text-[11px] uppercase tracking-[0.12em] ${Date.now() - lastLivePushAt < 15000 ? "animate-pulse text-emerald-300" : "text-slate-500"}`}>Ledger push {new Date(lastLivePushAt).toLocaleTimeString()}</span>
            ) : null}
            <span className="font-mono text-slate-500">HTTP {data?.last_updated ? new Date(data.last_updated).toLocaleTimeString() : "—"}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi
              label="Total Signals"
              value={hideNumericKpis ? "…" : total.toLocaleString()}
              detail={perfMirror ? "automated 30m resolution" : "resolved at 30m"}
              tooltip="Lifetime count of signals emitted and tracked in the validation ledger."
            />
            <Kpi
              label="Resolved"
              value={hideNumericKpis ? "…" : resolved.toLocaleString()}
              detail={hideNumericKpis ? "—" : Number.isFinite(flatNeutral) ? `resolved @ 30m · ±5% neutral: ${flatNeutral.toLocaleString()}` : "resolved @ 30m"}
              tone="blue"
              tooltip="Signals that have completed the 30m resolution window. Each one has a real, live-DEX outcome."
            />
            <Kpi
              label="Pending"
              value={hideNumericKpis ? "…" : pending.toLocaleString()}
              detail="awaiting 30m resolution"
              tooltip="Signals emitted in the last 30 minutes, still being scored against live DEX prices."
            />
            <Kpi
              label="Win Rate (7d)"
              value={hideNumericKpis ? "…" : pct(winRate, 1)}
              detail={winDetail}
              tone="good"
              tooltip={winTooltip}
            />
            <Kpi
              label={useMedian ? "Median Return (7d)" : "Avg Return (7d)"}
              value={hideNumericKpis ? "…" : formatBigPct(headlineReturn)}
              detail={avgDetail}
              tone={Math.abs(headlineReturn) < 0.005 ? "default" : headlineReturn >= 0 ? "good" : "bad"}
              tooltip={avgTooltip}
            />
            <Kpi
              label="Worst 30m (7d)"
              value={hideNumericKpis ? "…" : formatBigPct(data?.max_drawdown)}
              detail={ddDetail}
              tone="bad"
              tooltip={ddTooltip}
            />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1fr_360px]">
            <LineChart title="Win Rate Over Time (30m)" subtitle={hideNumericKpis ? "cargando…" : `${chartRows.length} oracle rows (tape + top wins)`} value={hideNumericKpis ? "…" : pct(winRate, 1)} rows={chartRows} mode="win" color="#22d3ee" />
            <LineChart title="Avg Return Over Time" subtitle="rolling average from real outcomes" value={hideNumericKpis ? "…" : formatBigPct(avgReturn)} rows={chartRows} mode="avg" color="#3b82f6" />
            {hideNumericKpis ? (
              <div className="rounded-xl border border-slate-800 bg-[#08111a]/85 p-4 flex min-h-[170px] items-center justify-center font-mono text-slate-500">
                …
              </div>
            ) : (
              <Donut distribution={donutDistribution} />
            )}
          </div>
        </section>

        {!hideNumericKpis ? (
          <section className="rounded-2xl border border-slate-800 bg-[#06101a]/80 p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">Why Sentinel</h3>
                <p className="text-xs text-slate-500">No competitor publishes a verified, live-resolved track record. Sentinel does.</p>
              </div>
              <span className="hidden rounded-full border border-cyan-400/30 bg-cyan-400/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300 md:inline-block">
                Differentiator
              </span>
            </div>
            <DifferentiatorStrip />
          </section>
        ) : null}<section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#06101a]/80"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4"><div><h3 className="text-lg font-bold">Live Signal Tape</h3><p className="text-sm text-slate-500">Recent validated signals</p></div><div className="flex gap-2 text-sm"><span className="rounded-full bg-slate-800 px-3 py-1">{rows.length} visible</span><span className="rounded-full bg-cyan-400/10 px-3 py-1 text-cyan-300">{chartRows.length} chart rows</span><span className="rounded-full bg-sky-400/10 px-3 py-1 text-sky-300">{hideNumericKpis ? "…" : pending} pending</span></div></div><div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-left text-sm"><thead className="border-b border-slate-800 text-[11px] uppercase tracking-[0.16em] text-slate-500"><tr><th className="px-4 py-3">Token</th><th className="px-4 py-3">Mint</th><th className="px-4 py-3">Regime</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Confidence</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Outcome 30m</th><th className="px-4 py-3">Timestamp</th></tr></thead><tbody>{rows.length ? rows.map((r) => <SignalRow key={r.id || `${r.mint}-${r.created_at}`} row={r} />) : <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">{loadFailed ? "Fix the error above — zeros here are not a real ledger read." : showSkeleton ? "Cargando señales…" : emptyLedger ? "Ledger vacío en este API — revisa NEXT_PUBLIC_API_URL en Vercel y el backend Railway." : !total ? "No verified signals on this page yet. Metrics update automatically as outcomes resolve." : "No rows on this page."}</td></tr>}</tbody></table></div></section></div>
    </Shell>
  );
}
TrackRecordPage.standalone = true;
export default TrackRecordPage;
