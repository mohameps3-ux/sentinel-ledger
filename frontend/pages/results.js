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

  return (
    <>
      <PageHead title={t("results.pageTitle")} description={t("results.pageDesc")} />
      <div className="sl-container py-8 sm:py-10 pb-28 space-y-6">
        <header className="space-y-2">
          <p className="sl-label">{t("results.label")}</p>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">{t("results.h1")}</h1>
          <p className="text-gray-400 max-w-2xl">{t("results.sub")}</p>
          <p className="text-sm font-mono text-emerald-300/90 border border-emerald-500/25 rounded-lg px-3 py-2 inline-block bg-emerald-500/10">
            {badge}
          </p>
        </header>

        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                filter === f.id
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                  : "border-white/10 bg-white/[0.03] text-gray-300 hover:border-white/20"
              }`}
              aria-pressed={filter === f.id}
            >
              {f.label}
            </button>
          ))}
        </div>

        {data.error ? <p className="text-sm text-red-300">{data.error}</p> : null}
        {data.loading ? <p className="text-sm text-gray-500">{t("results.loading")}</p> : null}

        <div className="hidden lg:block overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-white/10">
                <th className="py-3 pr-3">{t("results.th.token")}</th>
                <th className="py-3 pr-3">{t("results.th.signalTime")}</th>
                <th className="py-3 pr-3">{t("results.th.entry")}</th>
                <th className="py-3 pr-3">{t("results.th.1h")}</th>
                <th className="py-3 pr-3">{t("results.th.4h")}</th>
                <th className="py-3 pr-3">{t("results.th.result")}</th>
                <th className="py-3">{t("results.th.status")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && !data.loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500">
                    {t("results.empty")}
                  </td>
                </tr>
              ) : (
                data.rows.map((r) => (
                  <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-3 pr-3 font-mono text-xs text-gray-200">{r.token?.slice(0, 8)}…</td>
                    <td className="py-3 pr-3 font-mono text-xs text-gray-400">
                      {r.signalAt ? new Date(r.signalAt).toLocaleString() : "—"}
                    </td>
                    <td className="py-3 pr-3 font-mono">{fmtPrice(r.entryPrice)}</td>
                    <td className="py-3 pr-3 font-mono">{fmtPrice(r.price1h)}</td>
                    <td className="py-3 pr-3 font-mono">{fmtPrice(r.price4h)}</td>
                    <td className="py-3 pr-3 font-mono">{fmtPct(r.resultPct)}</td>
                    <td className="py-3">{statusBadge(r.status, t)}</td>
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
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2 text-sm font-mono"
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
