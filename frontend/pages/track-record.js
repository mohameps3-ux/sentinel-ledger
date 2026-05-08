import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHead } from "../components/seo/PageHead";
import { getPublicApiUrl } from "../lib/publicRuntime";

const REFRESH_MS = 30_000;

function pct(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function num(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function shortMint(mint) {
  const s = String(mint || "");
  if (s.length <= 12) return s || "—";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

async function fetchTrackRecord() {
  const qs = new URLSearchParams();
  qs.set("filter", "all");
  qs.set("limit", "50");
  qs.set("page", "1");

  const res = await fetch(`${getPublicApiUrl()}/api/v1/signals/track-record?${qs.toString()}`, {
    headers: { Accept: "application/json" }
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    const err = new Error(body?.error || `track_record_http_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

function toneClasses(tone) {
  if (tone === "good") return "text-emerald-300 border-emerald-400/20 bg-emerald-400/5";
  if (tone === "bad") return "text-rose-300 border-rose-400/20 bg-rose-400/5";
  if (tone === "warn") return "text-amber-300 border-amber-400/20 bg-amber-400/5";
  if (tone === "whale") return "text-yellow-200 border-yellow-300/20 bg-yellow-300/5";
  return "text-cyan-100 border-white/10 bg-white/[0.03]";
}

function Kpi({ label, value, detail, tone = "neutral", pulse = false }) {
  return (
    <div className={`sl-obsidian-panel p-4 ${pulse ? "sl-alpha-event" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">{label}</div>
          <div className={`mt-3 font-mono text-[26px] font-black leading-none ${tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : tone === "warn" ? "text-amber-300" : tone === "whale" ? "text-yellow-200" : "text-white"}`}>
            {value}
          </div>
        </div>
        <div className={`h-2.5 w-2.5 rounded-full ${tone === "good" ? "bg-emerald-400 shadow-[0_0_18px_rgba(16,185,129,.55)]" : tone === "bad" ? "bg-rose-400 shadow-[0_0_18px_rgba(239,68,68,.45)]" : tone === "warn" ? "bg-amber-400 shadow-[0_0_18px_rgba(245,158,11,.45)]" : tone === "whale" ? "bg-yellow-200 shadow-[0_0_18px_rgba(214,194,138,.45)]" : "bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,.45)]"}`} />
      </div>
      {detail ? <div className="mt-3 font-mono text-[11px] text-white/42">{detail}</div> : null}
    </div>
  );
}

function TacticalRibbon({ status, source, lastUpdated, isFetching, isError }) {
  const state = isError ? "DATA DEGRADED" : isFetching ? "SYNCING ORACLE" : "LIVE ORACLE";
  const tone = isError ? "sl-pill--amber" : isFetching ? "sl-pill--cyan" : "sl-pill--emerald";
  return (
    <div className="sl-tactical-ribbon flex-wrap justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`sl-pill ${tone}`}>{state}</span>
        <span className="sl-pill sl-pill--cyan">Validation Engine</span>
        <span className="sl-pill sl-pill--whale">Institutional View</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/42">
        <span>Status {status}</span>
        <span>Source {source || "backend"}</span>
        <span>Updated {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "—"}</span>
      </div>
    </div>
  );
}

function EquityMicroChart({ rows }) {
  const points = useMemo(() => {
    const resolved = [...(rows || [])]
      .filter((r) => Number.isFinite(Number(r?.outcome_60m)))
      .reverse()
      .slice(-42);
    if (resolved.length < 2) return "";
    let acc = 0;
    const values = resolved.map((r) => {
      acc += Number(r.outcome_60m || 0);
      return acc;
    });
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const range = max - min || 1;
    return values
      .map((v, i) => {
        const x = 24 + (i / Math.max(values.length - 1, 1)) * 552;
        const y = 168 - ((v - min) / range) * 132;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [rows]);

  return (
    <div className="sl-obsidian-panel min-h-[236px] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-200/60">Sentinel Alpha Curve</div>
          <h2 className="mt-1 text-xl font-black tracking-tight text-white">Validation equity stream</h2>
        </div>
        <span className="sl-pill sl-pill--emerald">real data</span>
      </div>
      <svg width="100%" height="160" viewBox="0 0 600 190" preserveAspectRatio="none" className="overflow-visible">
        <defs>
          <linearGradient id="sentinelAlphaLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="55%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#D6C28A" />
          </linearGradient>
          <filter id="sentinelAlphaGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1="24" x2="576" y1={36 + i * 38} y2={36 + i * 38} stroke="rgba(255,255,255,.06)" strokeDasharray="4 8" />
        ))}
        {points ? (
          <>
            <polyline points={points} fill="none" stroke="url(#sentinelAlphaLine)" strokeWidth="8" opacity="0.12" />
            <polyline points={points} fill="none" stroke="url(#sentinelAlphaLine)" strokeWidth="2.5" filter="url(#sentinelAlphaGlow)" />
          </>
        ) : (
          <text x="300" y="96" textAnchor="middle" fill="rgba(255,255,255,.38)" fontFamily="monospace" fontSize="12">
            Awaiting resolved oracle rows
          </text>
        )}
      </svg>
    </div>
  );
}

function SignalRow({ row }) {
  const outcome = Number(row?.outcome_60m);
  const status = !Number.isFinite(outcome) ? "PENDING" : outcome > 0 ? "WIN" : outcome < 0 ? "LOSS" : "FLAT";
  const statusTone = status === "WIN" ? "good" : status === "LOSS" ? "bad" : "warn";
  const confidence = Number(row?.confidence);
  const conf01 = clamp01(Number.isFinite(confidence) ? confidence / 100 : 0);

  return (
    <tr className="group border-b border-white/[0.04] transition-colors hover:bg-white/[0.035]">
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <div className={`grid h-9 w-9 place-items-center rounded-xl border ${statusTone === "good" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : statusTone === "bad" ? "border-rose-400/25 bg-rose-400/10 text-rose-200" : "border-cyan-300/20 bg-cyan-300/10 text-cyan-100"} font-mono text-xs font-black`}>
            {(row?.symbol || row?.asset || "?").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-white">{row?.symbol || row?.asset || shortMint(row?.mint)}</div>
            <div className="font-mono text-[10px] text-white/35">{shortMint(row?.mint || row?.token_address)}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 font-mono text-xs text-white/60">{row?.regime || "unknown"}</td>
      <td className="px-4 py-4">
        <span className="rounded-full border border-cyan-300/15 bg-cyan-300/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-100/80">
          {Array.isArray(row?.signals) ? row.signals.slice(0, 2).join(" + ") : "smart_money"}
        </span>
      </td>
      <td className="px-4 py-4">
        <div className="flex min-w-[110px] items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300" style={{ width: `${Math.round(conf01 * 100)}%` }} />
          </div>
          <span className="font-mono text-xs text-white/70">{num(row?.confidence, 0)}</span>
        </div>
      </td>
      <td className="px-4 py-4">
        <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] ${toneClasses(statusTone)}`}>{status}</span>
      </td>
      <td className={`px-4 py-4 font-mono text-sm font-black ${Number.isFinite(outcome) && outcome >= 0 ? "text-emerald-300" : Number.isFinite(outcome) ? "text-rose-300" : "text-white/40"}`}>
        {Number.isFinite(outcome) ? pct(outcome, 2) : "—"}
      </td>
      <td className="px-4 py-4 font-mono text-[11px] text-white/35">
        {row?.created_at ? new Date(row.created_at).toLocaleString() : "—"}
      </td>
    </tr>
  );
}

export default function TrackRecordPage() {
  const query = useQuery({
    queryKey: ["track-record-real-data-v1"],
    queryFn: fetchTrackRecord,
    staleTime: 15_000,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 2
  });

  const data = query.data || {};
  const rows = Array.isArray(data.recent_signals) ? data.recent_signals : [];
  const resolved = Number(data.resolved_signals || 0);
  const total = Number(data.total_signals || 0);
  const pending = Math.max(0, total - resolved);
  const status = query.isError ? "DEGRADED" : query.isFetching ? "SYNCING" : "LIVE";

  const decisiveRows = useMemo(() => rows.filter((r) => Number.isFinite(Number(r?.outcome_60m))), [rows]);
  const localWins = decisiveRows.filter((r) => Number(r.outcome_60m) > 0).length;
  const localLosses = decisiveRows.filter((r) => Number(r.outcome_60m) <= 0).length;
  const winRate = Number(data.win_rate_60m);
  const avgReturn = Number(data.avg_return);
  const systemTone = query.isError ? "bad" : Number.isFinite(winRate) && winRate >= 0.5 ? "good" : "warn";

  return (
    <>
      <PageHead
        title="Track Record — Sentinel Ledger"
        description="Verified Sentinel signal history from the backend validation oracle."
      />
      <main className="relative min-h-screen overflow-hidden bg-[#030712] px-4 py-6 text-white md:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,.14),transparent_34%),radial-gradient(circle_at_86%_12%,rgba(214,194,138,.08),transparent_30%),linear-gradient(180deg,#071019_0%,#030712_70%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent" />

        <div className="relative mx-auto max-w-7xl space-y-5">
          <header className="apex-card rounded-[28px] p-6 md:p-7" data-apex-state={systemTone === "good" ? "active" : systemTone === "bad" ? "critical" : "idle"}>
            <div className="relative z-[1] flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-4xl">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="apex-seal-verified">Oracle Verified</span>
                  <span className="sl-pill sl-pill--cyan">Sentinel Validation Engine</span>
                </div>
                <h1 className="font-display text-4xl font-black tracking-[-0.04em] text-white md:text-6xl">
                  Track Record <span className="apex-iridescent">Institutional</span>
                </h1>
                <p className="mt-4 max-w-3xl text-sm leading-6 text-white/58 md:text-base">
                  Real backend validation data, stabilized into a single oracle stream. No frontend pagination storms, no noisy dashboards — only verified signal performance and operational truth.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => query.refetch()} className="apex-btn" disabled={query.isFetching}>
                  {query.isFetching ? "SYNCING" : "REFRESH"}
                </button>
                <Link href="/scanner" className="apex-btn-secondary">Alpha Radar</Link>
              </div>
            </div>
          </header>

          <TacticalRibbon
            status={status}
            source={data?.meta?.source}
            lastUpdated={data.last_updated}
            isFetching={query.isFetching}
            isError={query.isError}
          />

          {query.isError ? (
            <div className="sl-obsidian-panel border border-amber-400/25 bg-amber-400/5 p-4 text-sm text-amber-100/85">
              Track Record no ha podido refrescar ahora mismo: {query.error?.message || "unknown_error"}. Si Vercel acaba de desplegar, espera unos segundos y vuelve a refrescar.
            </div>
          ) : null}

          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
            <Kpi label="System State" value={status} tone={systemTone} pulse={systemTone === "good"} />
            <Kpi label="Total Signals" value={Number.isFinite(total) ? total.toLocaleString() : "—"} detail="validation ledger" />
            <Kpi label="Resolved" value={Number.isFinite(resolved) ? resolved.toLocaleString() : "—"} tone="good" detail="oracle closed" />
            <Kpi label="Pending" value={Number.isFinite(pending) ? pending.toLocaleString() : "—"} tone={pending > 0 ? "warn" : "neutral"} detail="awaiting horizon" />
            <Kpi label="Win Rate 60m" value={pct(data.win_rate_60m, 1)} tone={Number(data.win_rate_60m) >= 0.5 ? "good" : "warn"} detail="decisive rows" />
            <Kpi label="Avg Return" value={pct(data.avg_return, 2)} tone={Number(data.avg_return) >= 0 ? "good" : "bad"} detail="mean outcome" />
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.45fr_.85fr]">
            <EquityMicroChart rows={rows} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Kpi label="Max Drawdown" value={pct(data.max_drawdown, 2)} tone="bad" detail="raw validation floor" />
              <Kpi label="Visible Window" value={`${rows.length} rows`} tone="whale" detail="latest stable page" />
              <Kpi label="Wins / Losses" value={`${localWins} / ${localLosses}`} tone={localWins >= localLosses ? "good" : "warn"} detail="current viewport" />
            </div>
          </section>

          <section className="sl-obsidian-panel overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-white/[0.06] p-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-200/60">Live Signal Tape</div>
                <h2 className="mt-1 text-xl font-black tracking-tight text-white">Recent validated signals</h2>
                <p className="mt-1 text-xs text-white/42">
                  Source {data?.meta?.source || "backend"} · last update {data.last_updated ? new Date(data.last_updated).toLocaleString() : "—"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="sl-pill sl-pill--cyan">{rows.length} rows</span>
                <span className="sl-pill sl-pill--emerald">{localWins} wins</span>
                <span className="sl-pill sl-pill--amber">{pending} pending</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[960px] w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.018] text-left font-mono text-[10px] uppercase tracking-[0.16em] text-white/38">
                    <th className="px-4 py-3">Token</th>
                    <th className="px-4 py-3">Regime</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Confidence</th>
                    <th className="px-4 py-3">State</th>
                    <th className="px-4 py-3">Outcome 60m</th>
                    <th className="px-4 py-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? rows.map((row) => <SignalRow key={row.id || `${row.mint}-${row.created_at}`} row={row} />) : (
                    <tr>
                      <td className="px-4 py-8 text-center font-mono text-sm text-white/38" colSpan={7}>
                        Sin filas en la respuesta actual del backend. Verifica Railway/Supabase si esto persiste después del deploy.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
