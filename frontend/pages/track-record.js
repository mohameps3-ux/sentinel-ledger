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

function Kpi({ label, value, tone = "neutral" }) {
  const toneClass =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
        ? "text-rose-300"
        : tone === "warn"
          ? "text-amber-300"
          : "text-sl-text";

  return (
    <div className="terminal-panel p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-sl-muted">{label}</div>
      <div className={`mt-2 font-display text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function SignalRow({ row }) {
  const outcome = Number(row?.outcome_60m);
  const status = !Number.isFinite(outcome) ? "PENDING" : outcome > 0 ? "WIN" : outcome < 0 ? "LOSS" : "FLAT";
  const statusClass =
    status === "WIN"
      ? "text-emerald-300"
      : status === "LOSS"
        ? "text-rose-300"
        : "text-amber-300";

  return (
    <tr className="feed-row">
      <td className="data-td-name">
        <div className="font-semibold text-sl-text">{row?.symbol || row?.asset || shortMint(row?.mint)}</div>
        <div className="font-mono text-[10px] text-sl-muted">{shortMint(row?.mint || row?.token_address)}</div>
      </td>
      <td className="data-td">{row?.regime || "—"}</td>
      <td className="data-td">{Array.isArray(row?.signals) ? row.signals.join(" + ") : "smart_money"}</td>
      <td className="data-td">{num(row?.confidence, 0)}</td>
      <td className={`data-td font-bold ${statusClass}`}>{status}</td>
      <td className={`data-td font-bold ${Number.isFinite(outcome) && outcome >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
        {Number.isFinite(outcome) ? pct(outcome, 2) : "—"}
      </td>
      <td className="data-td text-sl-muted">
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
  const statusTone = query.isError ? "bad" : query.isFetching ? "warn" : "good";

  const decisiveRows = useMemo(
    () => rows.filter((r) => Number.isFinite(Number(r?.outcome_60m))),
    [rows]
  );
  const localWins = decisiveRows.filter((r) => Number(r.outcome_60m) > 0).length;
  const localLosses = decisiveRows.filter((r) => Number(r.outcome_60m) <= 0).length;

  return (
    <>
      <PageHead
        title="Track Record — Sentinel Ledger"
        description="Verified Sentinel signal history from the backend validation oracle."
      />
      <main className="min-h-screen bg-sl-bg px-4 py-6 text-sl-text md:px-8">
        <div className="mx-auto max-w-7xl space-y-5">
          <header className="terminal-panel p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-sl-muted">
                  Sentinel Ledger · Verified Track Record
                </div>
                <h1 className="mt-2 font-display text-3xl font-bold">Registro verificado</h1>
                <p className="mt-2 max-w-3xl text-sm text-sl-sub">
                  Datos reales servidos desde el backend. Esta vista usa una sola llamada agregada y cacheada para evitar
                  tormentas de paginación, rate limits y pantallas vacías.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border border-white/10 px-3 py-1 font-mono text-xs ${
                  statusTone === "good" ? "text-emerald-300" : statusTone === "warn" ? "text-amber-300" : "text-rose-300"
                }`}>
                  {status}
                </span>
                <Link href="/" className="btn-ghost-sm">Home</Link>
              </div>
            </div>
          </header>

          {query.isError ? (
            <div className="terminal-panel border border-rose-500/30 p-4 text-sm text-rose-200">
              Track Record no ha podido refrescar ahora mismo: {query.error?.message || "unknown_error"}. Si había datos previos,
              React Query los mantiene hasta el siguiente refresh válido.
            </div>
          ) : null}

          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
            <Kpi label="Estado" value={status} tone={statusTone} />
            <Kpi label="Señales totales" value={Number.isFinite(total) ? total.toLocaleString() : "—"} />
            <Kpi label="Resueltas" value={Number.isFinite(resolved) ? resolved.toLocaleString() : "—"} tone="good" />
            <Kpi label="Pendientes" value={Number.isFinite(pending) ? pending.toLocaleString() : "—"} tone={pending > 0 ? "warn" : "neutral"} />
            <Kpi label="Win rate 60m" value={pct(data.win_rate_60m, 1)} tone={Number(data.win_rate_60m) >= 0.5 ? "good" : "warn"} />
            <Kpi label="Retorno medio" value={pct(data.avg_return, 2)} tone={Number(data.avg_return) >= 0 ? "good" : "bad"} />
          </section>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Kpi label="Máx. drawdown bruto" value={pct(data.max_drawdown, 2)} tone="bad" />
            <Kpi label="Página actual" value={`${rows.length} filas reales`} />
            <Kpi label="Wins visibles" value={localWins.toLocaleString()} tone="good" />
            <Kpi label="Losses visibles" value={localLosses.toLocaleString()} tone="bad" />
          </section>

          <section className="terminal-panel p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-mono text-sm font-bold uppercase tracking-[0.16em]">Señales recientes</h2>
                <p className="mt-1 text-xs text-sl-muted">
                  Fuente: {data?.meta?.source || "backend"} · último update {data.last_updated ? new Date(data.last_updated).toLocaleString() : "—"}
                </p>
              </div>
              <button type="button" onClick={() => query.refetch()} className="btn-ghost-sm" disabled={query.isFetching}>
                {query.isFetching ? "Actualizando…" : "Refrescar"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table min-w-[900px]">
                <thead>
                  <tr>
                    <th className="data-th">Token</th>
                    <th className="data-th">Regime</th>
                    <th className="data-th">Fuente</th>
                    <th className="data-th">Conf</th>
                    <th className="data-th">Estado</th>
                    <th className="data-th">Outcome 60m</th>
                    <th className="data-th">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? rows.map((row) => <SignalRow key={row.id || `${row.mint}-${row.created_at}`} row={row} />) : (
                    <tr>
                      <td className="data-td text-sl-muted" colSpan={7}>
                        Sin filas en la respuesta actual del backend.
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
