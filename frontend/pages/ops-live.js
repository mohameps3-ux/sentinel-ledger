import { useEffect, useState } from "react";
import { PageHead } from "../components/seo/PageHead";
import { withOpsBridge } from "../lib/opsBridgeClient";

const CHECKS = [
  ["Health", "/health/live"],
  ["Guard", "/api/v1/ops/entropy-guard/snapshot"],
  ["Performance", "/api/v1/ops/signal-performance/summary?lookbackHours=48&maxRows=2000"],
  ["Freshness", "/api/v1/ops/data-freshness"],
  ["Signal Gate", "/api/v1/ops/signal-gate/status"],
  ["Oracle", "/api/v1/ops/validation-oracle/rules?limit=100"],
  ["Auto Discovery", "/api/v1/ops/auto-discovery/status"],
  ["Wallet Behavior", "/api/v1/ops/wallet-behavior/status"]
];

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? new Intl.NumberFormat("en-US").format(x) : "—";
}

function p(v) {
  const x = Number(v);
  return Number.isFinite(x) ? `${x.toFixed(1)}%` : "—";
}

function Kpi({ label, value, ok }) {
  return (
    <div className={`rounded-xl border ${ok ? "border-emerald-400/20" : "border-slate-700"} bg-[#071019] p-4`}>
      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black text-slate-100 tabular-nums">{value}</div>
    </div>
  );
}

export default function OpsLive() {
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(false);
  const [last, setLast] = useState(null);

  async function load() {
    setLoading(true);
    const out = {};
    const settled = await Promise.allSettled(CHECKS.map(([, url]) => withOpsBridge(url)));
    settled.forEach((r, i) => {
      const [name, url] = CHECKS[i];
      out[name] = r.status === "fulfilled" ? { ok: true, url, data: r.value } : { ok: false, url, error: r.reason?.message || "failed" };
    });
    setRows(out);
    setLast(new Date().toLocaleString());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const online = Object.values(rows).filter((x) => x.ok).length;
  const perf = rows.Performance?.data?.data;
  const gate = rows["Signal Gate"]?.data?.data;
  const guard = rows.Guard?.data;

  return (
    <>
      <PageHead title="Ops Live — Sentinel Ledger" description="Sentinel live operations console." />
      <main className="mx-auto min-h-screen max-w-7xl px-5 py-8 font-mono text-slate-100">
        <section className="rounded-2xl border border-cyan-400/15 bg-[#05070a] p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.26em] text-cyan-400">Sentinel Internal</div>
              <h1 className="mt-3 text-4xl font-black">OPS LIVE CONSOLE</h1>
              <p className="mt-3 text-sm text-slate-400">Railway-backed diagnostics. Partial endpoint failures no longer break the whole page.</p>
            </div>
            <button onClick={load} disabled={loading} className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-5 py-3 text-sm font-bold text-cyan-100">
              {loading ? "Loading" : "Refresh"}
            </button>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <Kpi label="API" value={online ? "READY" : "LOCKED"} ok={online > 0} />
            <Kpi label="Oracle" value={rows.Oracle?.ok ? "ONLINE" : "PENDING"} ok={rows.Oracle?.ok} />
            <Kpi label="Auto Discovery" value={rows["Auto Discovery"]?.ok ? "ONLINE" : "PENDING"} ok={rows["Auto Discovery"]?.ok} />
            <Kpi label="Updated" value={last || "—"} ok={online > 0} />
          </div>
        </section>
        <section className="mt-5 grid gap-3 md:grid-cols-4">
          <Kpi label="Win Rate 48h" value={p(perf?.metrics?.winRatePct)} ok={Boolean(perf)} />
          <Kpi label="Profit Factor" value={perf?.metrics?.profitFactor ?? "—"} ok={Boolean(perf)} />
          <Kpi label="Guard Drops" value={n(guard?.metrics?.totalDrops)} ok={Boolean(guard)} />
          <Kpi label="Gate Emitted" value={n(gate?.stats?.emitted)} ok={Boolean(gate)} />
        </section>
        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-800 bg-[#05070a]">
          <div className="border-b border-slate-800 px-4 py-3 text-xs uppercase tracking-[0.22em] text-slate-500">Endpoint diagnostics</div>
          {CHECKS.map(([name]) => {
            const r = rows[name];
            return <div key={name} className="grid grid-cols-[170px_100px_1fr] gap-3 border-b border-slate-800 px-4 py-3 text-sm"><div>{name}</div><div className={r?.ok ? "text-emerald-300" : "text-rose-300"}>{r?.ok ? "ONLINE" : "FAILED"}</div><div className="truncate text-xs text-slate-500">{r?.ok ? r.url : r?.error || "waiting"}</div></div>;
          })}
        </section>
      </main>
    </>
  );
}
