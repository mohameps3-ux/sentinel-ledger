import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHead } from "../components/seo/PageHead";
import { ProPurchaseButton } from "../components/subscription/ProPurchaseButton";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useLocale } from "../contexts/LocaleContext";

function normalizeResultStatus(row = {}) {
  const raw = String(row.status ?? row.result ?? "").trim().toUpperCase();
  if (raw === "WIN" || raw === "LOSS") return raw;
  if (raw === "NEUTRAL" || raw === "FLAT") return "FLAT";
  const pct = normalizedResultPct(row);
  if (pct == null) return "PENDING";
  if (pct > 5) return "WIN";
  if (pct < -5) return "LOSS";
  return "FLAT";
}

function statusBadge(status, t) {
  if (status === "WIN") return <span className="text-emerald-300 font-mono">{t("results.status.win")}</span>;
  if (status === "LOSS") return <span className="text-red-300 font-mono">{t("results.status.loss")}</span>;
  if (status === "FLAT") return <span className="text-slate-300 font-mono">FLAT</span>;
  return <span className="text-sl-sub font-mono">{t("results.status.pending")}</span>;
}

function fmtPrice(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  if (n < 0.0001) return n.toExponential(2);
  if (n < 1) return n.toFixed(6);
  return n.toFixed(4);
}

function fmtPct(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function pctFromFraction(v) {
  if (v == null || Number.isNaN(Number(v))) return null;
  return Number(v) * 100;
}

function normalizedResultPct(row = {}) {
  if (row.resultPct != null && !Number.isNaN(Number(row.resultPct))) return Number(row.resultPct);
  if (row.outcome60m != null && !Number.isNaN(Number(row.outcome60m))) return pctFromFraction(row.outcome60m);
  if (row.outcome_60m != null && !Number.isNaN(Number(row.outcome_60m))) return pctFromFraction(row.outcome_60m);
  return null;
}

function normalizedTime(row = {}) {
  return row.signalAt ?? row.timestamp ?? row.created_at ?? row.time ?? null;
}

function normalizedToken(row = {}) {
  return row.symbol || row.asset || row.token || row.mint || row.token_address || "—";
}

function shortToken(value) {
  const s = String(value || "");
  if (!s) return "—";
  if (s.length <= 16) return s;
  return `${s.slice(0, 8)}…`;
}

function ResultsMetric({ label, value, sub, tone = "default" }) {
  const toneClass =
    tone === "good"
      ? "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-100"
      : tone === "bad"
        ? "border-red-500/25 bg-red-500/[0.06] text-red-100"
        : tone === "accent"
          ? "border-cyan-400/25 bg-cyan-500/[0.06] text-cyan-100"
          : "border-white/10 bg-white/[0.025] text-sl-text";
  return (
    <div className={`border px-4 py-3 ${toneClass}`}>
      <p className="text-[9px] font-mono font-semibold uppercase tracking-[0.2em] text-sl-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-current">{value}</p>
      {sub ? <p className="mt-1 text-[11px] text-sl-muted">{sub}</p> : null}
    </div>
  );
}

export default function ResultsPage() {
  const { t } = useLocale();
  const [filter, setFilter] = useState("all");
  const [data, setData] = useState({ rows: [], loading: true, error: null, stats: null, meta: null });

  const filters = useMemo(
    () => [
      { id: "all", label: t("results.filter.all") },
      { id: "win", label: t("results.filter.win") },
      { id: "loss", label: t("results.filter.loss") },
      { id: "24h", label: t("results.filter.24h") },
      { id: "week", label: t("results.filter.week") }
    ],
    [t]
  );

  const load = useCallback(async () => {
    setData((d) => ({ ...d, loading: true, error: null }));
    try {
      const res = await fetch(`${getPublicApiUrl()}/api/v1/public/track-record?filter=${encodeURIComponent(filter)}`);
      const j = await res.json();
      if (!res.ok || j?.ok === false) throw new Error(j.error || "failed");
      setData({
        rows: Array.isArray(j.rows) ? j.rows : [],
        stats: j.stats || null,
        meta: j.meta || null,
        loading: false,
        error: null
      });
    } catch (e) {
      setData((d) => ({ ...d, loading: false, error: e.message }));
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  /** Keep /results aligned with DB without manual refresh. */
  useEffect(() => {
    const id = setInterval(() => {
      load();
    }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const normalizedRows = useMemo(
    () =>
      data.rows.map((row) => ({
        ...row,
        _status: normalizeResultStatus(row),
        _resultPct: normalizedResultPct(row),
        _time: normalizedTime(row),
        _token: normalizedToken(row)
      })),
    [data.rows]
  );

  const resolvedRows = useMemo(() => normalizedRows.filter((r) => r._status === "WIN" || r._status === "LOSS"), [normalizedRows]);
  const wins = useMemo(() => resolvedRows.filter((r) => r._status === "WIN"), [resolvedRows]);
  const losses = useMemo(() => resolvedRows.filter((r) => r._status === "LOSS"), [resolvedRows]);
  const pendingRows = useMemo(() => normalizedRows.filter((r) => r._status === "PENDING"), [normalizedRows]);
  const flatRows = useMemo(() => normalizedRows.filter((r) => r._status === "FLAT"), [normalizedRows]);
  const avgWin = wins.length
    ? wins.reduce((sum, r) => sum + Math.max(0, Number(r._resultPct || 0)), 0) / wins.length
    : null;
  const avgLoss = losses.length
    ? losses.reduce((sum, r) => sum + Math.min(0, Number(r._resultPct || 0)), 0) / losses.length
    : null;
  const winRate = resolvedRows.length ? (wins.length / resolvedRows.length) * 100 : null;
  const headlineWinRate = data.stats?.winRate != null ? Number(data.stats.winRate) * 100 : winRate;
  const totalSignals = data.stats?.totalSignals ?? data.meta?.totalRows ?? normalizedRows.length;

  const badge = useMemo(() => {
    if (data.loading) return "Loading saved outcomes…";
    if (data.error) return "Results API degraded — review the request error below.";
    if (!resolvedRows.length && pendingRows.length) {
      return `${pendingRows.length} pending rows visible · no resolved outcomes in this public sample yet`;
    }
    if (!resolvedRows.length) return "No resolved outcomes in this public sample yet";
    return `Win rate ${headlineWinRate == null ? "—" : `${headlineWinRate.toFixed(1)}%`} · ${resolvedRows.length} resolved rows visible`;
  }, [data.loading, data.error, resolvedRows.length, pendingRows.length, headlineWinRate]);

  return (
    <>
      <PageHead title={t("results.pageTitle")} description={t("results.pageDesc")} />
      <div className="sl-container py-8 sm:py-10 pb-28 space-y-6">
        <header className="terminal-panel relative overflow-hidden px-6 py-6 mb-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <span className="section-title">RESULTS · SAVED OUTCOMES</span>
              <h1 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-sl-text">
                Validation tape
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-sl-muted">
                Public signal outcomes from Sentinel&apos;s validation ledger. Pending rows are still awaiting outcome data; resolved rows drive win/loss metrics.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={load} className="btn-ghost-sm">
                REFRESH
              </button>
              <Link href="/track-record" className="btn-outline no-underline">
                FULL TRACK RECORD
              </Link>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ResultsMetric
            label="Win rate"
            value={headlineWinRate == null ? "—" : `${headlineWinRate.toFixed(1)}%`}
            sub={`${resolvedRows.length} resolved visible`}
            tone="good"
          />
          <ResultsMetric label="Wins" value={wins.length} sub="Decisive positive outcomes" tone="good" />
          <ResultsMetric label="Losses" value={losses.length} sub="Decisive negative outcomes" tone="bad" />
          <ResultsMetric label="Pending" value={pendingRows.length} sub={`${totalSignals} total ledger rows`} tone="accent" />
        </section>

        <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="terminal-panel px-4 py-3">
            <span className="section-title">AVG WIN</span>
            <p className="mt-2 font-mono text-xl text-emerald-300">{avgWin == null ? "—" : `+${avgWin.toFixed(2)}%`}</p>
          </div>
          <div className="terminal-panel px-4 py-3">
            <span className="section-title">AVG LOSS</span>
            <p className="mt-2 font-mono text-xl text-red-300">{avgLoss == null ? "—" : `${avgLoss.toFixed(2)}%`}</p>
          </div>
          <div className="terminal-panel px-4 py-3">
            <span className="section-title">NEUTRAL / FLAT</span>
            <p className="mt-2 font-mono text-xl text-slate-200">{flatRows.length}</p>
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={filter === f.id ? "btn-pill-active" : "btn-pill"}
              aria-pressed={filter === f.id}
            >
              {f.label}
            </button>
          ))}
        </div>

        {data.error ? <p className="text-sm text-red-300">{data.error}</p> : null}
        {data.loading ? <p className="text-sm text-sl-muted">{t("results.loading")}</p> : null}

        <section className="terminal-panel px-4 py-3">
          <span className="section-title">SIGNAL STATUS</span>
          <p className="font-mono text-sm text-sl-muted mt-2">{badge}</p>
        </section>

        <div className="terminal-panel hidden lg:block overflow-x-auto">
          <table className="w-full min-w-[1040px] table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col className="w-[13%]" />
              <col className="w-[18%]" />
              <col className="w-[9%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-sl-border text-[10px] uppercase tracking-[0.18em] text-sl-muted">
                <th className="px-4 py-3 text-left font-mono font-semibold">TOKEN</th>
                <th className="px-4 py-3 text-left font-mono font-semibold">SIGNAL TIME</th>
                <th className="px-4 py-3 text-left font-mono font-semibold">RULE</th>
                <th className="px-4 py-3 text-left font-mono font-semibold">CONFIDENCE</th>
                <th className="px-4 py-3 text-left font-mono font-semibold">5M</th>
                <th className="px-4 py-3 text-left font-mono font-semibold">15M</th>
                <th className="px-4 py-3 text-left font-mono font-semibold">60M</th>
                <th className="px-4 py-3 text-left font-mono font-semibold">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {normalizedRows.length === 0 && !data.loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sl-muted">
                    {t("results.empty")}
                  </td>
                </tr>
              ) : (
                normalizedRows.map((r) => (
                  <tr key={r.id} className="border-b border-sl-border/80 hover:bg-white/[0.025]">
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-sl-sub" title={String(r.token || r.mint || "")}>{shortToken(r._token)}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-sl-text">
                      {r._time ? new Date(r._time).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-sl-text">{r.rule || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-sl-text">{r.signalStrength != null ? Number(r.signalStrength).toFixed(0) : "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-sl-text">{fmtPct(pctFromFraction(r.outcome5m ?? r.outcome_5m))}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-sl-text">{fmtPct(pctFromFraction(r.outcome15m ?? r.outcome_15m))}</td>
                    <td className={`px-4 py-3 whitespace-nowrap font-mono ${Number(r._resultPct) >= 0 ? "data-pos" : "data-neg"}`}>{fmtPct(r._resultPct)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{statusBadge(r._status, t)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:hidden">
          {normalizedRows.map((r) => (
            <div
              key={r.id}
              className="terminal-card-interactive p-4 space-y-2 text-sm font-mono"
            >
              <div className="flex justify-between gap-2">
                <span className="text-sl-sub">{shortToken(r._token)}</span>
                {statusBadge(r._status, t)}
              </div>
              <p className="text-xs text-sl-muted">{r._time ? new Date(r._time).toLocaleString() : ""}</p>
              <p className="text-xs text-sl-muted">Rule {r.rule || "—"} · confidence {r.signalStrength != null ? Number(r.signalStrength).toFixed(0) : "—"}</p>
              <p className="text-emerald-300">60m {fmtPct(r._resultPct)}</p>
            </div>
          ))}
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-sl-border bg-[#0B0B0E]/95 backdrop-blur-md py-3 px-4 safe-bottom-pad">
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-sm">
            <span className="text-sl-sub text-center sm:text-left">{t("results.stickyLine")}</span>
            <ProPurchaseButton className="btn-pro inline-flex text-center no-underline">
              {t("results.upgradePro")}
            </ProPurchaseButton>
          </div>
        </div>
      </div>
    </>
  );
}
