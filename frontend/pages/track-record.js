import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHead } from "../components/seo/PageHead";
import { getPublicApiUrl } from "../lib/publicRuntime";

const REFRESH_MS = 30_000;

const nav = [
  ["Home", "/"],
  ["Scanner", "/scanner"],
  ["Smart Money", "/smart-money"],
  ["Watchlist", "/watchlist"],
  ["Alerts", "/alerts"],
  ["Pricing", "/pricing"],
  ["Compare", "/compare"],
  ["Portfolio", "/portfolio"],
  ["Track Record", "/track-record", "active"],
  ["Alpha Radar", "/scanner"],
  ["Settings", "/settings"],
  ["Docs", "/docs"]
];

function pct(v, d = 1) {
  const n = Number(v);
  return Number.isFinite(n) ? `${(n * 100).toFixed(d)}%` : "—";
}
function shortMint(mint) {
  const s = String(mint || "");
  return s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s || "—";
}
function clamp01(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

async function fetchTrackRecord() {
  const qs = new URLSearchParams({ filter: "all", limit: "50", page: "1" });
  const res = await fetch(`${getPublicApiUrl()}/api/v1/signals/track-record?${qs}`, { headers: { Accept: "application/json" } });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) throw new Error(body?.error || `track_record_http_${res.status}`);
  return body;
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-[#030712] text-slate-100">
      <PageHead title="Track Record — Sentinel Ledger" description="Institutional Sentinel validation terminal." />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[276px] border-r border-slate-800/80 bg-[#050b12]/95 backdrop-blur-xl xl:block">
        <div className="flex h-20 items-center gap-3 border-b border-slate-800/70 px-7">
          <div className="grid h-10 w-10 place-items-center rounded-full border border-cyan-400/40 bg-cyan-400/5 text-cyan-300">◎</div>
          <div className="leading-tight">
            <div className="text-sm font-black tracking-[0.22em]">SENTINEL</div>
            <div className="text-sm font-black tracking-[0.22em]">LEDGER</div>
          </div>
        </div>
        <div className="space-y-7 px-5 py-6">
          <NavGroup title="MAIN" items={nav.slice(0, 8)} />
          <NavGroup title="INTELLIGENCE" items={nav.slice(8, 10)} />
          <NavGroup title="SYSTEM" items={nav.slice(10)} />
        </div>
        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-800/70 p-6">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">System Status</div>
          <div className="mt-3 text-2xl font-black text-emerald-300">LIVE</div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400"><span>All systems operational</span><span className="h-2 w-2 rounded-full bg-emerald-400" /></div>
        </div>
      </aside>
      <main className="xl:pl-[276px]">{children}</main>
    </div>
  );
}
function NavGroup({ title, items }) {
  return (
    <div>
      <div className="mb-3 px-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="space-y-1">
        {items.map(([label, href, active]) => (
          <Link key={`${label}-${href}`} href={href} className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-400/15" : "text-slate-300 hover:bg-slate-800/50 hover:text-white"}`}>
            <span>{label}</span>
            {active ? <span className="text-[10px] uppercase tracking-[0.14em] text-cyan-300">Oracle</span> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, detail, tone = "default" }) {
  const color = tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : tone === "blue" ? "text-sky-300" : "text-slate-100";
  const dot = tone === "bad" ? "bg-rose-400" : tone === "blue" ? "bg-sky-400" : "bg-emerald-400";
  return (
    <div className="rounded-xl border border-slate-800 bg-[#08111a]/85 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.03)]">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
        <span className={`h-2 w-2 rounded-full ${dot}`} />
      </div>
      <div className={`mt-4 font-mono text-2xl font-black ${color}`}>{value}</div>
      <div className="mt-2 text-sm text-slate-400">{detail}</div>
    </div>
  );
}

function makeSeries(rows, mode) {
  const resolved = [...(rows || [])].reverse().filter((r) => Number.isFinite(Number(r?.outcome_60m))).slice(-36);
  if (resolved.length < 2) return [];
  let acc = 0;
  let wins = 0;
  return resolved.map((r, i) => {
    const out = Number(r.outcome_60m || 0);
    acc += out;
    if (out > 0) wins += 1;
    if (mode === "win") return wins / (i + 1);
    if (mode === "avg") return acc / (i + 1);
    return acc;
  });
}
function pathFrom(values, w = 420, h = 150, pad = 18) {
  if (!values.length) return "";
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0.001);
  const range = max - min || 1;
  return values.map((v, i) => {
    const x = pad + (i / Math.max(values.length - 1, 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}
function LineChart({ title, subtitle, value, rows, mode = "equity", color = "#22d3ee" }) {
  const values = useMemo(() => makeSeries(rows, mode), [rows, mode]);
  const d = pathFrom(values);
  return (
    <div className="rounded-xl border border-slate-800 bg-[#08111a]/85 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-300">{title}</div><div className="text-sm text-slate-500">{subtitle}</div></div>
        <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-2.5 py-1 font-mono text-sm text-cyan-200">{value}</div>
      </div>
      <svg viewBox="0 0 420 150" className="h-[150px] w-full overflow-visible">
        {[0,1,2,3].map((i)=><line key={i} x1="18" x2="402" y1={22+i*34} y2={22+i*34} stroke="rgba(148,163,184,.12)" />)}
        {d ? <path d={d} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" /> : <text x="210" y="80" textAnchor="middle" fill="rgba(148,163,184,.55)" fontSize="12">awaiting series</text>}
      </svg>
    </div>
  );
}
function Donut({ resolved, winRate }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const win = clamp01(winRate);
  const loss = 1 - win;
  const wins = Math.round((resolved || 0) * win);
  const losses = Math.max(0, Math.round((resolved || 0) * loss));
  return (
    <div className="rounded-xl border border-slate-800 bg-[#08111a]/85 p-4">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-300">Resolved Outcomes</div>
      <div className="grid grid-cols-[150px_1fr] items-center gap-4">
        <svg viewBox="0 0 150 150" className="h-[150px] w-[150px] -rotate-90">
          <circle cx="75" cy="75" r={r} fill="none" stroke="rgba(148,163,184,.18)" strokeWidth="22" />
          <circle cx="75" cy="75" r={r} fill="none" stroke="#10b981" strokeWidth="22" strokeDasharray={`${c*win} ${c}`} strokeLinecap="butt" />
          <circle cx="75" cy="75" r={r} fill="none" stroke="#fb7185" strokeWidth="22" strokeDasharray={`${c*loss} ${c}`} strokeDashoffset={-c*win} strokeLinecap="butt" />
        </svg>
        <div className="space-y-3 text-sm">
          <div className="font-mono text-2xl font-black text-white">{Number(resolved || 0).toLocaleString()}</div>
          <div className="text-slate-500">Resolved</div>
          <div className="flex justify-between gap-4"><span className="text-emerald-300">Wins</span><span className="font-mono">{wins.toLocaleString()}</span></div>
          <div className="flex justify-between gap-4"><span className="text-rose-300">Loss/Flat</span><span className="font-mono">{losses.toLocaleString()}</span></div>
        </div>
      </div>
    </div>
  );
}

function SignalRow({ row }) {
  const outcome = Number(row?.outcome_60m);
  const status = !Number.isFinite(outcome) ? "PENDING" : outcome > 0 ? "WIN" : outcome < 0 ? "LOSS" : "FLAT";
  return (
    <tr className="border-b border-slate-800/70 hover:bg-slate-800/30">
      <td className="px-4 py-3"><div className="flex items-center gap-3"><span className="rounded-md bg-sky-400/10 px-2 py-1 font-mono text-xs text-sky-300">{(row?.symbol || "?").slice(0,2).toUpperCase()}</span><span>{row?.symbol || row?.asset || shortMint(row?.mint)}</span></div></td>
      <td className="px-4 py-3 font-mono text-slate-400">{shortMint(row?.mint || row?.token_address)}</td>
      <td className="px-4 py-3"><span className="text-sky-300">●</span> {row?.regime || "unknown"}</td>
      <td className="px-4 py-3 text-slate-300">{Array.isArray(row?.signals) ? row.signals.join("+") : "whale_signal"}</td>
      <td className="px-4 py-3 font-mono">{Number(row?.confidence || 0).toFixed(0)}</td>
      <td className="px-4 py-3"><span className="rounded-md bg-sky-400/10 px-2 py-1 font-mono text-xs text-sky-200">{status}</span></td>
      <td className={`px-4 py-3 font-mono ${outcome < 0 ? "text-rose-300" : outcome > 0 ? "text-emerald-300" : "text-slate-300"}`}>{Number.isFinite(outcome) ? pct(outcome, 2) : "—"}</td>
      <td className="px-4 py-3 font-mono text-slate-500">{row?.created_at ? new Date(row.created_at).toLocaleString() : "—"}</td>
    </tr>
  );
}

function TrackRecordPage() {
  const query = useQuery({ queryKey: ["track-record-real-data-v2"], queryFn: fetchTrackRecord, staleTime: 15_000, refetchInterval: REFRESH_MS, refetchIntervalInBackground: false, refetchOnWindowFocus: true, retry: 2 });
  const data = query.data || {};
  const rows = Array.isArray(data.recent_signals) ? data.recent_signals : [];
  const resolved = Number(data.resolved_signals || 0);
  const total = Number(data.total_signals || 0);
  const pending = Math.max(0, total - resolved);
  const winRate = Number(data.win_rate_60m || 0);
  const avgReturn = Number(data.avg_return || 0);
  return (
    <Shell>
      <div className="border-b border-slate-800 bg-[#030712]/85 px-6 py-4 backdrop-blur-xl xl:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400"><span>YOU ARE HERE&nbsp;&nbsp; <b className="text-slate-200">Sentinel</b> › <b className="text-slate-200">Track Record</b></span><span>Monitoring 0 wallets · 0 signals today · Oracle active&nbsp;&nbsp;&nbsp; SOL $88.17 · <span className="text-emerald-300">●</span> Supabase</span></div>
      </div>
      <div className="space-y-4 p-6 xl:p-8">
        <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div>
            <span className="rounded border border-cyan-400/30 bg-cyan-400/5 px-3 py-1 font-mono text-xs uppercase tracking-[0.16em] text-cyan-300">Oracle Verified</span>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-white">Sentinel Validation Engine</h1>
            <h2 className="mt-2 text-2xl font-black text-cyan-300">Track Record Institutional</h2>
            <p className="mt-3 max-w-2xl text-slate-400">Real backend validation data, stabilized into a single oracle stream. No frontend pagination storms, no noisy dashboards — only verified signal performance and operational truth.</p>
          </div>
          <div className="flex items-center justify-end gap-3"><button onClick={() => query.refetch()} className="rounded border border-cyan-400/40 bg-cyan-400/5 px-8 py-4 font-mono text-xs font-bold uppercase tracking-[0.18em] text-cyan-200 hover:bg-cyan-400/10">↻ Refresh</button><Link href="/scanner" className="rounded border border-slate-700 px-8 py-4 font-mono text-xs font-bold uppercase tracking-[0.18em] text-slate-200 hover:border-cyan-400/40">Alpha Radar</Link></div>
        </section>
        <section className="rounded-2xl border border-slate-800 bg-[#06101a]/80 p-4">
          <div className="mb-4 flex flex-wrap gap-4 text-sm"><b className="text-cyan-300">LIVE ORACLE</b><span>Validation Engine · Institutional View</span><span className="font-mono text-slate-500">STATUS <b className="text-emerald-300">LIVE</b></span><span className="font-mono text-slate-500">SOURCE supabase:validation_oracle</span><span className="font-mono text-slate-500">UPDATED {data.last_updated ? new Date(data.last_updated).toLocaleTimeString() : "—"}</span></div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Total Signals" value={total.toLocaleString()} detail="validation ledger" />
            <Kpi label="Resolved" value={resolved.toLocaleString()} detail="oracle closed" tone="blue" />
            <Kpi label="Pending" value={pending.toLocaleString()} detail="awaiting horizon" />
            <Kpi label="Win Rate 60m" value={pct(winRate,1)} detail="decisive rows" tone="good" />
            <Kpi label="Avg Return" value={pct(avgReturn,2)} detail="mean outcome" tone="good" />
            <Kpi label="Max Drawdown" value={pct(data.max_drawdown,2)} detail="raw validation floor" tone="bad" />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1fr_360px]">
            <LineChart title="Win Rate Over Time (60m)" subtitle="Rolling 60m win rate" value={pct(winRate,1)} rows={rows} mode="win" color="#22d3ee" />
            <LineChart title="Avg Return Over Time" subtitle="Rolling average return" value={pct(avgReturn,2)} rows={rows} mode="avg" color="#3b82f6" />
            <Donut resolved={resolved} winRate={winRate} />
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#06101a]/80">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4"><div><h3 className="text-lg font-bold">Live Signal Tape</h3><p className="text-sm text-slate-500">Recent validated signals</p></div><div className="flex gap-2 text-sm"><span className="rounded-full bg-slate-800 px-3 py-1">{rows.length} rows</span><span className="rounded-full bg-emerald-400/10 px-3 py-1 text-emerald-300">{Math.round(resolved*winRate).toLocaleString()} wins</span><span className="rounded-full bg-sky-400/10 px-3 py-1 text-sky-300">{pending} pending</span></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-left text-sm"><thead className="border-b border-slate-800 text-[11px] uppercase tracking-[0.16em] text-slate-500"><tr><th className="px-4 py-3">Token</th><th className="px-4 py-3">Mint</th><th className="px-4 py-3">Regime</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Confidence</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Outcome 60m</th><th className="px-4 py-3">Timestamp</th></tr></thead><tbody>{rows.length ? rows.map((r) => <SignalRow key={r.id || `${r.mint}-${r.created_at}`} row={r} />) : <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Sin datos actuales.</td></tr>}</tbody></table></div>
        </section>
      </div>
    </Shell>
  );
}

TrackRecordPage.standalone = true;
export default TrackRecordPage;
