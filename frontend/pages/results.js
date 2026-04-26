import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHead } from "../components/seo/PageHead";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useLocale } from "../contexts/LocaleContext";

function statusBadge(status, t) {
  if (status === "WIN") return <span className="text-emerald-300 font-mono">{t("results.status.win")}</span>;
  if (status === "LOSS") return <span className="text-red-300 font-mono">{t("results.status.loss")}</span>;
  return <span className="text-gray-400 font-mono">{t("results.status.pending")}</span>;
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

export default function ResultsPage() {
  const { t } = useLocale();
  const [filter, setFilter] = useState("all");
  const [data, setData] = useState({ rows: [], winRate7d: null, count7d: 0, loading: true, error: null });

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
      if (!res.ok) throw new Error(j.error || "failed");
      setData({
        rows: j.rows || [],
        winRate7d: j.winRate7d,
        count7d: j.count7d ?? 0,
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

  const badge = useMemo(() => {
    const wr = data.winRate7d;
    const n = data.count7d;
    if (wr == null || !n) return t("results.badge.empty");
    return t("results.badge.withData", { wr, n });
  }, [data.winRate7d, data.count7d, t]);

  const resolvedRows = useMemo(() => data.rows.filter((r) => r.status === "WIN" || r.status === "LOSS"), [data.rows]);
  const wins = useMemo(() => resolvedRows.filter((r) => r.status === "WIN"), [resolvedRows]);
  const losses = useMemo(() => resolvedRows.filter((r) => r.status === "LOSS"), [resolvedRows]);
  const avgWin = wins.length
    ? wins.reduce((sum, r) => sum + Math.max(0, Number(r.resultPct || 0)), 0) / wins.length
    : null;
  const avgLoss = losses.length
    ? losses.reduce((sum, r) => sum + Math.min(0, Number(r.resultPct || 0)), 0) / losses.length
    : null;

  return (
    <>
      <PageHead title={t("results.pageTitle")} description={t("results.pageDesc")} />
      <div className="sl-container py-8 sm:py-10 pb-28 space-y-6">
        <header className="terminal-panel px-6 py-5 mb-4">
          <span className="section-title">RESULTS</span>
          <div className="flex items-end gap-4 mt-2">
            <span className="font-display text-3xl font-bold text-sl-green">
              {data.winRate7d != null ? data.winRate7d : "—"}%
            </span>
            <span className="font-mono text-sm text-sl-muted mb-1">
              WIN RATE · {data.count7d ?? 0} SIGNALS RESOLVED
            </span>
          </div>
        </header>

        <section className="kpi-strip w-full mb-4">
          <div className="kpi-block">
            <span className="kpi-label">WINS</span>
            <span className="kpi-number text-sl-green">{wins.length}</span>
          </div>
          <div className="kpi-block">
            <span className="kpi-label">LOSSES</span>
            <span className="kpi-number text-sl-red">{losses.length}</span>
          </div>
          <div className="kpi-block">
            <span className="kpi-label">AVG WIN</span>
            <span className="kpi-number text-sl-green">{avgWin == null ? "—" : `+${avgWin.toFixed(2)}%`}</span>
          </div>
          <div className="kpi-block">
            <span className="kpi-label">AVG LOSS</span>
            <span className="kpi-number text-sl-red">{avgLoss == null ? "—" : `${avgLoss.toFixed(2)}%`}</span>
          </div>
        </section>

        <section className="terminal-panel px-4 py-3 flex items-center justify-between">
          <span className="font-mono text-xs text-sl-muted">
            View complete signal history with all outcomes
          </span>
          <Link href="/graveyard" className="btn-outline no-underline">FULL TRACK RECORD</Link>
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
        {data.loading ? <p className="text-sm text-gray-500">{t("results.loading")}</p> : null}

        <section className="terminal-panel px-4 py-3">
          <span className="section-title">SIGNAL STATUS</span>
          <p className="font-mono text-sm text-sl-muted mt-2">{badge}</p>
        </section>

        <div className="terminal-panel hidden lg:block overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="data-th">{t("results.th.token")}</th>
                <th className="data-th">{t("results.th.signalTime")}</th>
                <th className="data-th">{t("results.th.entry")}</th>
                <th className="data-th">{t("results.th.1h")}</th>
                <th className="data-th">{t("results.th.4h")}</th>
                <th className="data-th">{t("results.th.result")}</th>
                <th className="data-th">{t("results.th.status")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && !data.loading ? (
                <tr>
                  <td colSpan={7} className="data-td text-center text-gray-500">
                    {t("results.empty")}
                  </td>
                </tr>
              ) : (
                data.rows.map((r) => (
                  <tr key={r.id} className="feed-row">
                    <td className="data-td font-mono text-xs text-gray-200">{r.token?.slice(0, 8)}…</td>
                    <td className="data-td font-mono text-xs">
                      {r.signalAt ? new Date(r.signalAt).toLocaleString() : "—"}
                    </td>
                    <td className="data-td font-mono">{fmtPrice(r.entryPrice)}</td>
                    <td className="data-td font-mono">{fmtPrice(r.price1h)}</td>
                    <td className="data-td font-mono">{fmtPrice(r.price4h)}</td>
                    <td className={`data-td font-mono ${Number(r.resultPct) >= 0 ? "data-pos" : "data-neg"}`}>{fmtPct(r.resultPct)}</td>
                    <td className="data-td">{statusBadge(r.status, t)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:hidden">
          {data.rows.map((r) => (
            <div
              key={r.id}
              className="terminal-card-interactive p-4 space-y-2 text-sm font-mono"
            >
              <div className="flex justify-between gap-2">
                <span className="text-gray-200">{r.token?.slice(0, 6)}…</span>
                {statusBadge(r.status, t)}
              </div>
              <p className="text-xs text-gray-500">{r.signalAt ? new Date(r.signalAt).toLocaleString() : ""}</p>
              <p>
                {t("results.mobile.entryLine", {
                  e: fmtPrice(r.entryPrice),
                  h1: fmtPrice(r.price1h),
                  h4: fmtPrice(r.price4h)
                })}
              </p>
              <p className="text-emerald-300">{fmtPct(r.resultPct)}</p>
            </div>
          ))}
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#0B0B0E]/95 backdrop-blur-md py-3 px-4 safe-bottom-pad">
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-sm">
            <span className="text-gray-300 text-center sm:text-left">{t("results.stickyLine")}</span>
            <Link href="/pricing" className="btn-pro inline-flex text-center no-underline">
              {t("results.upgradePro")}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
