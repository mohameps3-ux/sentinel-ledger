import { useMemo } from "react";
import Link from "next/link";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { PageHead } from "../components/seo/PageHead";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useTrackRecordLive, TRACK_RECORD_QUERY_KEY } from "../hooks/useTrackRecordLive";

const REFRESH_MS = 30_000;
const CHART_PAGES = 6;
/** Aligned with backend signal_outcomes / oracle decisive (fraction of return). */
const TR_DECISIVE_WIN = 0.05;
const TR_DECISIVE_LOSS = -0.05;

const nav = [
  ["Home", "/"], ["Scanner", "/scanner"], ["Smart Money", "/smart-money"], ["Watchlist", "/watchlist"],
  ["Alerts", "/alerts"], ["Pricing", "/pricing"], ["Compare", "/compare"], ["Portfolio", "/portfolio"],
  ["Track Record", "/track-record", "active"], ["Alpha Radar", "/scanner"], ["Settings", "/settings"], ["Docs", "/docs"]
];

function pct(v, d = 1) { const n = Number(v); return Number.isFinite(n) ? `${(n * 100).toFixed(d)}%` : "—"; }
function shortMint(mint) { const s = String(mint || ""); return s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s || "—"; }
function clamp01(v) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; }
function outcomeState(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "pending";
  if (n > TR_DECISIVE_WIN) return "win";
  if (n < TR_DECISIVE_LOSS) return "loss";
  return "flat";
}

async function fetchTrackRecordPage(page) {
  const qs = new URLSearchParams({ filter: "all", limit: "50", page: String(page) });
  const res = await fetch(`${getPublicApiUrl()}/api/v1/signals/track-record?${qs}`, { headers: { Accept: "application/json" } });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) throw new Error(body?.error || `track_record_http_${res.status}`);
  return body;
}
async function fetchTrackRecord() {
  const first = await fetchTrackRecordPage(1);
  const maxPages = Math.min(CHART_PAGES, Number(first?.pagination?.total_pages || CHART_PAGES));
  const extraPages = maxPages > 1 ? Array.from({ length: maxPages - 1 }, (_, i) => i + 2) : [];
  const settled = await Promise.allSettled(extraPages.map((p) => fetchTrackRecordPage(p)));
  const rest = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
  const allRows = [first, ...rest].flatMap((p) => (Array.isArray(p?.recent_signals) ? p.recent_signals : []));
  const seen = new Set();
  const chartRows = allRows
    .filter((r) => r?.id || r?.created_at)
    .filter((r) => { const k = String(r.id || `${r.mint}-${r.rule_id}-${r.created_at}`); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => Date.parse(a.created_at || 0) - Date.parse(b.created_at || 0));
  const resolvedRows = chartRows.filter((r) => Number.isFinite(Number(r?.outcome_60m)));
  const wins = resolvedRows.filter((r) => outcomeState(r.outcome_60m) === "win").length;
  const losses = resolvedRows.filter((r) => outcomeState(r.outcome_60m) === "loss").length;
  const flats = resolvedRows.filter((r) => outcomeState(r.outcome_60m) === "flat").length;
  return { ...first, chart_rows: chartRows, real_distribution: { wins, losses, flats, resolved: resolvedRows.length } };
}

function Shell({ children }) { return <div className="min-h-screen bg-[#030712] text-slate-100"><PageHead title="Track Record — Sentinel Ledger" description="Institutional Sentinel validation terminal." /><aside className="fixed inset-y-0 left-0 z-30 hidden w-[276px] border-r border-slate-800/80 bg-[#050b12]/95 backdrop-blur-xl xl:block"><div className="flex h-20 items-center gap-3 border-b border-slate-800/70 px-7"><div className="grid h-10 w-10 place-items-center rounded-full border border-cyan-400/40 bg-cyan-400/5 text-cyan-300">◎</div><div className="leading-tight"><div className="text-sm font-black tracking-[0.22em]">SENTINEL</div><div className="text-sm font-black tracking-[0.22em]">LEDGER</div></div></div><div className="space-y-7 px-5 py-6"><NavGroup title="MAIN" items={nav.slice(0, 8)} /><NavGroup title="INTELLIGENCE" items={nav.slice(8, 10)} /><NavGroup title="SYSTEM" items={nav.slice(10)} /></div><div className="absolute bottom-0 left-0 right-0 border-t border-slate-800/70 p-6"><div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">System Status</div><div className="mt-3 text-2xl font-black text-emerald-300">LIVE</div><div className="mt-2 flex items-center justify-between text-xs text-slate-400"><span>All systems operational</span><span className="h-2 w-2 rounded-full bg-emerald-400" /></div></div></aside><main className="xl:pl-[276px]">{children}</main></div>; }
function NavGroup({ title, items }) { return <div><div className="mb-3 px-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">{title}</div><div className="space-y-1">{items.map(([label, href, active]) => <Link key={`${label}-${href}`} href={href} className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-400/15" : "text-slate-300 hover:bg-slate-800/50 hover:text-white"}`}><span>{label}</span>{active ? <span className="text-[10px] uppercase tracking-[0.14em] text-cyan-300">Oracle</span> : null}</Link>)}</div></div>; }
function Kpi({ label, value, detail, tone = "default" }) { const color = tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : tone === "blue" ? "text-sky-300" : "text-slate-100"; const dot = tone === "bad" ? "bg-rose-400" : tone === "blue" ? "bg-sky-400" : "bg-emerald-400"; return <div className="rounded-xl border border-slate-800 bg-[#08111a]/85 p-4"><div className="flex items-start justify-between gap-3"><div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{label}</div><span className={`h-2 w-2 rounded-full ${dot}`} /></div><div className={`mt-4 font-mono text-2xl font-black ${color}`}>{value}</div><div className="mt-2 text-sm text-slate-400">{detail}</div></div>; }

function makeSeries(rows, mode) {
  const resolved = [...(rows || [])].filter((r) => Number.isFinite(Number(r?.outcome_60m))).slice(-160);
  if (resolved.length < 2) return [];
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
function pathFrom(values, w = 420, h = 150, pad = 18) { if (!values.length) return ""; const min = Math.min(...values, 0); const max = Math.max(...values, 0.001); const range = max - min || 1; return values.map((v, i) => { const x = pad + (i / Math.max(values.length - 1, 1)) * (w - pad * 2); const y = h - pad - ((v - min) / range) * (h - pad * 2); return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`; }).join(" "); }
function LineChart({ title, subtitle, value, rows, mode = "equity", color = "#22d3ee" }) { const values = useMemo(() => makeSeries(rows, mode), [rows, mode]); const d = pathFrom(values); return <div className="rounded-xl border border-slate-800 bg-[#08111a]/85 p-4"><div className="mb-3 flex items-start justify-between gap-3"><div><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-300">{title}</div><div className="text-sm text-slate-500">{subtitle}</div></div><div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-2.5 py-1 font-mono text-sm text-cyan-200">{value}</div></div><svg viewBox="0 0 420 150" className="h-[150px] w-full overflow-visible">{[0,1,2,3].map((i)=><line key={i} x1="18" x2="402" y1={22+i*34} y2={22+i*34} stroke="rgba(148,163,184,.12)" />)}{d ? <path d={d} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" /> : <text x="210" y="80" textAnchor="middle" fill="rgba(148,163,184,.55)" fontSize="12">insufficient real series</text>}</svg></div>; }
function Donut({ distribution }) { const r = 54, c = 2 * Math.PI * r; const wins = Number(distribution?.wins || 0), losses = Number(distribution?.losses || 0), flats = Number(distribution?.flats || 0); const total = Math.max(1, wins + losses + flats); const w = wins / total, l = losses / total, f = flats / total; return <div className="rounded-xl border border-slate-800 bg-[#08111a]/85 p-4"><div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-300">Resolved Outcomes</div><div className="grid grid-cols-[150px_1fr] items-center gap-4"><svg viewBox="0 0 150 150" className="h-[150px] w-[150px] -rotate-90"><circle cx="75" cy="75" r={r} fill="none" stroke="rgba(148,163,184,.18)" strokeWidth="22" /><circle cx="75" cy="75" r={r} fill="none" stroke="#10b981" strokeWidth="22" strokeDasharray={`${c*w} ${c}`} /><circle cx="75" cy="75" r={r} fill="none" stroke="#fb7185" strokeWidth="22" strokeDasharray={`${c*l} ${c}`} strokeDashoffset={-c*w} /><circle cx="75" cy="75" r={r} fill="none" stroke="#64748b" strokeWidth="22" strokeDasharray={`${c*f} ${c}`} strokeDashoffset={-c*(w+l)} /></svg><div className="space-y-3 text-sm"><div className="font-mono text-2xl font-black text-white">{(wins+losses+flats).toLocaleString()}</div><div className="text-slate-500">Real chart sample</div><div className="flex justify-between"><span className="text-emerald-300">Wins</span><span className="font-mono">{wins.toLocaleString()}</span></div><div className="flex justify-between"><span className="text-rose-300">Losses</span><span className="font-mono">{losses.toLocaleString()}</span></div><div className="flex justify-between"><span className="text-slate-400">Flat</span><span className="font-mono">{flats.toLocaleString()}</span></div></div></div></div>; }
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
    retry: 2,
    placeholderData: keepPreviousData
  });
  const data = query.data || {};
  const meta = data.meta || {};
  const loadFailed = query.isError;
  const errMsg = query.error instanceof Error ? query.error.message : String(query.error || "request_failed");
  const perfMirror = meta.track_record_row_source === "signal_performance";
  const rows = Array.isArray(data.recent_signals) ? data.recent_signals : [];
  const chartRows = Array.isArray(data.chart_rows) ? data.chart_rows : rows;
  const resolved = Number(data.resolved_signals || 0);
  const total = Number(data.total_signals || 0);
  const pending = Math.max(0, total - resolved);
  const winRate = Number(data.win_rate_60m || 0);
  const avgReturn = Number(data.avg_return || 0);
  const flatNeutral = Number(data.flat_resolved_signals);
  const avgRows = Number(meta.avg_return_sample_rows || 0);
  const exactLedger = meta.stats_basis === "exact_ledger_sql";
  const perfMirrorAgg = meta.stats_basis === "signal_performance_mirror";
  const winDetail = "win ÷ (win+loss), move ±5%, all ledger rows";
  const avgDetail = exactLedger
    ? "mean of every resolved row (Postgres)"
    : perfMirrorAgg
      ? "mean from resolved `signal_performance` rows (mirror — `signal_outcomes` empty)"
      : avgRows > 0
        ? `fallback: last ${avgRows.toLocaleString()} resolved (apply migration 029)`
        : "aggregate oracle";
  const ddDetail = exactLedger ? "worst 60m among all resolved (Postgres)" : "fallback: min in recent sample";
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
      {perfMirror ? (
        <div className="border-b border-sky-500/35 bg-sky-950/35 px-6 py-3 text-sm text-sky-100 xl:px-8">
          KPIs and tape are mirrored from <code className="text-sky-200">signal_performance</code> because{" "}
          <code className="text-sky-200">signal_outcomes</code> returned zero rows. Restore ledger sync so the canonical
          table drives this page.
        </div>
      ) : null}
      <div className="border-b border-slate-800 bg-[#030712]/85 px-6 py-4 backdrop-blur-xl xl:px-8"><div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400"><span>YOU ARE HERE&nbsp;&nbsp; <b className="text-slate-200">Sentinel</b> › <b className="text-slate-200">Track Record</b></span><span>
            Oracle · KPIs {exactLedger ? "full-table SQL" : perfMirror ? "perf mirror" : "fallback sample"} · chart {chartRows.length} paged rows ·{" "}
            <span className="text-emerald-300">●</span> Supabase
          </span></div></div><div className="space-y-4 p-6 xl:p-8"><section className="grid gap-6 xl:grid-cols-[1fr_360px]"><div><span className="rounded border border-cyan-400/30 bg-cyan-400/5 px-3 py-1 font-mono text-xs uppercase tracking-[0.16em] text-cyan-300">Oracle Verified</span><h1 className="mt-4 text-4xl font-black tracking-tight text-white">Sentinel Validation Engine</h1><h2 className="mt-2 text-2xl font-black text-cyan-300">Track Record Institutional</h2><p className="mt-3 max-w-2xl text-slate-400">
            {perfMirror ? (
              <>
                Headline metrics are mirrored from <code className="text-slate-300">signal_performance</code> because
                the validation ledger (<code className="text-slate-300">signal_outcomes</code>) is empty. Charts use the
                same resolved outcomes as the KPI strip.
              </>
            ) : (
              <>
                Headline metrics mirror <code className="text-slate-300">signal_outcomes</code> in Supabase (no demo curves).
                With the stream connected, KPIs refetch as soon as the ledger updates — not only on the poll timer.
                Charts roll up the same oracle outcomes from paged rows only; totals above use the full ledger when migration 029 is applied.
              </>
            )}
          </p></div><div className="flex items-center justify-end gap-3"><button onClick={() => query.refetch()} className="rounded border border-cyan-400/40 bg-cyan-400/5 px-8 py-4 font-mono text-xs font-bold uppercase tracking-[0.18em] text-cyan-200 hover:bg-cyan-400/10">↻ Refresh</button><Link href="/scanner" className="rounded border border-slate-700 px-8 py-4 font-mono text-xs font-bold uppercase tracking-[0.18em] text-slate-200 hover:border-cyan-400/40">Alpha Radar</Link></div></section><section className="rounded-2xl border border-slate-800 bg-[#06101a]/80 p-4"><div className="mb-4 flex flex-wrap items-center gap-3 text-sm"><b className="text-cyan-300">LIVE ORACLE</b><span>Validation Engine · Real Chart Series</span>{wsConnected ? (<span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-300">Real-time stream</span>) : (<span className="rounded-full border border-slate-600 bg-slate-800/60 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Stream idle · poll only</span>)}{lastLivePushAt ? (<span className={`font-mono text-[11px] uppercase tracking-[0.12em] ${Date.now() - lastLivePushAt < 15000 ? "animate-pulse text-emerald-300" : "text-slate-500"}`}>Ledger push {new Date(lastLivePushAt).toLocaleTimeString()}</span>) : null}<span className="font-mono text-slate-500">HTTP {data.last_updated ? new Date(data.last_updated).toLocaleTimeString() : "—"}</span></div><div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6"><Kpi label="Total Signals" value={total.toLocaleString()} detail={perfMirror ? "signal_performance mirror" : "validation ledger"} /><Kpi label="Resolved" value={resolved.toLocaleString()} detail={Number.isFinite(flatNeutral) ? `oracle closed · ±5% neutral: ${flatNeutral.toLocaleString()}` : "oracle closed"} tone="blue" /><Kpi label="Pending" value={pending.toLocaleString()} detail="awaiting horizon" /><Kpi label="Win Rate 60m" value={pct(winRate,1)} detail={winDetail} tone="good" /><Kpi label="Avg Return" value={pct(avgReturn,2)} detail={avgDetail} tone="good" /><Kpi label="Worst 60m" value={pct(data.max_drawdown,2)} detail={ddDetail} tone="bad" /></div><div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1fr_360px]"><LineChart title="Win Rate Over Time (60m)" subtitle={`${chartRows.length} real paged oracle rows`} value={pct(winRate,1)} rows={chartRows} mode="win" color="#22d3ee" /><LineChart title="Avg Return Over Time" subtitle="rolling average from real outcomes" value={pct(avgReturn,2)} rows={chartRows} mode="avg" color="#3b82f6" /><Donut distribution={data.real_distribution} /></div></section><section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#06101a]/80"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4"><div><h3 className="text-lg font-bold">Live Signal Tape</h3><p className="text-sm text-slate-500">Recent validated signals</p></div><div className="flex gap-2 text-sm"><span className="rounded-full bg-slate-800 px-3 py-1">{rows.length} visible</span><span className="rounded-full bg-cyan-400/10 px-3 py-1 text-cyan-300">{chartRows.length} chart rows</span><span className="rounded-full bg-sky-400/10 px-3 py-1 text-sky-300">{pending} pending</span></div></div><div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-left text-sm"><thead className="border-b border-slate-800 text-[11px] uppercase tracking-[0.16em] text-slate-500"><tr><th className="px-4 py-3">Token</th><th className="px-4 py-3">Mint</th><th className="px-4 py-3">Regime</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Confidence</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Outcome 60m</th><th className="px-4 py-3">Timestamp</th></tr></thead><tbody>{rows.length ? rows.map((r) => <SignalRow key={r.id || `${r.mint}-${r.created_at}`} row={r} />) : <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">{loadFailed ? "Fix the error above — zeros here are not a real ledger read." : !total ? "No rows in signal_outcomes and no resolved signal_performance to mirror — check workers, RLS, and Supabase." : "No rows on this page."}</td></tr>}</tbody></table></div></section></div>
    </Shell>
  );
}
TrackRecordPage.standalone = true;
export default TrackRecordPage;
