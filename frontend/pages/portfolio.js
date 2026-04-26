import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useClientAuthToken } from "../hooks/useClientAuthToken";
import { formatTokenPrice } from "../lib/formatStable";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { PageHead } from "../components/seo/PageHead";
import { Loader2 } from "lucide-react";
import { useLocale } from "../contexts/LocaleContext";
import { TerminalActionIcons } from "../components/terminal/TerminalActionIcons";

function outcomeTone(outcome) {
  if (outcome === "worked") return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
  if (outcome === "failed") return "text-red-300 border-red-500/30 bg-red-500/10";
  if (outcome === "flat") return "text-gray-300 border-gray-500/30 bg-gray-500/10";
  return "text-gray-400 border-white/10 bg-white/[0.03]";
}

export default function PortfolioPage() {
  const { t } = useLocale();
  const token = useClientAuthToken();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [positions, setPositions] = useState([]);
  const [meta, setMeta] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${getPublicApiUrl()}/api/v1/portfolio/watchlist-markets?limit=24`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "portfolio_failed");
      setPositions(Array.isArray(json.positions) ? json.positions : []);
      setMeta(json.meta || null);
    } catch (e) {
      setError(e.message || "portfolio_failed");
      setPositions([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const reality = positions.reduce(
    (acc, p) => {
      const k = p.outcome24h || "unknown";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    },
    { worked: 0, failed: 0, flat: 0, unknown: 0 }
  );

  if (!token) {
    return (
      <>
        <PageHead title={t("portfolio.pageTitle")} description={t("portfolio.descSignedOut")} />
        <div className="sl-container py-10">
          <section className="terminal-panel p-6 max-w-2xl mx-auto text-center">
            <p className="sl-label">{t("portfolio.label")}</p>
            <h1 className="sl-h2 text-white mt-1">{t("portfolio.h1SignedOut")}</h1>
            <p className="text-sm text-gray-400 mt-3">{t("portfolio.pSignedOut")}</p>
            <Link href="/" className="btn-primary inline-flex mt-5 no-underline">
              {t("portfolio.goDashboard")}
            </Link>
          </section>
        </div>
      </>
    );
  }

  const changeValues = positions
    .map((p) => Number(p.change24hPct))
    .filter((n) => Number.isFinite(n));
  const change = changeValues.length
    ? changeValues.reduce((sum, n) => sum + n, 0) / changeValues.length
    : null;
  const best = positions.reduce((acc, p) => (
    Number(p.change24hPct) > Number(acc?.change24hPct ?? -Infinity) ? p : acc
  ), null);
  const worst = positions.reduce((acc, p) => (
    Number(p.change24hPct) < Number(acc?.change24hPct ?? Infinity) ? p : acc
  ), null);

  return (
    <>
      <PageHead title={t("portfolio.pageTitle")} description={t("portfolio.desc")} />
      <div className="sl-container py-10 space-y-6">
        <section className="terminal-panel px-6 py-4 mb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <span className="section-title">{t("portfolio.label")}</span>
            <h1 className="font-display text-xl font-bold text-sl-text mt-1">{t("portfolio.h1")}</h1>
            <p className="font-ui text-sm text-sl-muted mt-1 max-w-2xl">{t("portfolio.sub")}</p>
          </div>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="btn-ghost-sm inline-flex items-center gap-2 shrink-0 self-start sm:self-auto"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : null}
            {t("portfolio.refresh")}
          </button>
        </section>

        <section className="terminal-panel px-4 py-3 mb-4" style={{ borderLeft: "3px solid #F59E0B" }}>
          <span className="font-mono text-2xs text-sl-orange uppercase tracking-wider">
            NOTICE
          </span>
          <p className="font-ui text-xs text-sl-sub mt-1">
            Portfolio data is based on your watchlist — not real on-chain PnL.
            Connect your wallet for actual position tracking.
          </p>
        </section>

        <section className="kpi-strip w-full mb-4">
          <div className="kpi-block">
            <span className="kpi-label">TOTAL VALUE</span>
            <span className="kpi-number">—</span>
          </div>
          <div className="kpi-block">
            <span className="kpi-label">24H CHANGE</span>
            <span className={`kpi-number ${change == null ? "" : change >= 0 ? "text-sl-green" : "text-sl-red"}`}>
              {change == null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
            </span>
          </div>
          <div className="kpi-block">
            <span className="kpi-label">BEST PERFORMER</span>
            <span className="kpi-number text-sl-green">{best?.symbol ? `${best.symbol} ${Number(best.change24hPct).toFixed(2)}%` : "—"}</span>
          </div>
          <div className="kpi-block">
            <span className="kpi-label">WORST PERFORMER</span>
            <span className="kpi-number text-sl-red">{worst?.symbol ? `${worst.symbol} ${Number(worst.change24hPct).toFixed(2)}%` : "—"}</span>
          </div>
        </section>

        <section className="terminal-panel px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-gray-500 font-semibold">{t("portfolio.realityTitle")}</p>
              <p className="text-[11px] text-gray-500 mt-1 max-w-3xl">{t("portfolio.realityBody")}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center shrink-0">
              <div className="border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2">
                <p className="text-[9px] text-gray-500 uppercase tracking-wide">{t("portfolio.worked")}</p>
                <p className="font-mono text-lg text-emerald-200">{reality.worked}</p>
              </div>
              <div className="border border-red-500/20 bg-red-500/[0.05] px-3 py-2">
                <p className="text-[9px] text-gray-500 uppercase tracking-wide">{t("portfolio.failed")}</p>
                <p className="font-mono text-lg text-red-200">{reality.failed}</p>
              </div>
              <div className="border border-white/10 bg-white/[0.03] px-3 py-2">
                <p className="text-[9px] text-gray-500 uppercase tracking-wide">{t("portfolio.unverified")}</p>
                <p className="font-mono text-lg text-gray-300">{positions.length}</p>
              </div>
            </div>
          </div>
          {meta?.caveat ? <p className="mt-3 text-[10px] text-gray-600 font-mono">{meta.caveat}</p> : null}
        </section>

        {loading && !positions.length ? (
          <p className="text-sm text-gray-400 flex items-center gap-2">
            <Loader2 className="animate-spin" size={16} />
            {t("portfolio.loadingMarkets")}
          </p>
        ) : null}
        {error ? <p className="text-sm text-red-300">{t("portfolio.error", { err: error })}</p> : null}
        {!loading && !error && !positions.length ? (
          <section className="empty-state">
            <span className="empty-state-title">NO PORTFOLIO DATA</span>
            <p className="empty-state-sub">
              Add tokens to your watchlist to track portfolio performance.
            </p>
            <Link href="/watchlist" className="btn-primary mt-2 no-underline">GO TO WATCHLIST</Link>
          </section>
        ) : null}

        {positions.length ? (
          <section className="terminal-panel overflow-x-auto">
            <table className="data-table min-w-[780px]">
              <thead>
                <tr>
                  <th className="data-th">TOKEN</th>
                  <th className="data-th">PRICE</th>
                  <th className="data-th">24H</th>
                  <th className="data-th">VALUE</th>
                  <th className="data-th">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.tokenAddress}>
                    <td className="data-td"><span className="text-white">${p.symbol}</span><p className="font-mono text-[11px] text-gray-600">{p.tokenAddress?.slice(0, 6)}…{p.tokenAddress?.slice(-6)}</p></td>
                    <td className="data-td">${p.priceUsd != null ? formatTokenPrice(p.priceUsd) : "—"}</td>
                    <td className={`data-td ${p.change24hPct == null ? "data-neutral" : p.change24hPct >= 0 ? "data-pos" : "data-neg"}`}>
                      {p.change24hPct == null ? "—" : `${p.change24hPct >= 0 ? "+" : ""}${Number(p.change24hPct).toFixed(2)}%`}
                    </td>
                    <td className="data-td">—</td>
                    <td className="data-td"><div className="flex items-center gap-2"><span className={`text-xs px-2 py-1 border shrink-0 ${outcomeTone(p.outcome24h)}`}>{t(`portfolio.outcome.${p.outcome24h || "unknown"}`)}</span><TerminalActionIcons mint={p.tokenAddress} /><Link href={`/token/${p.tokenAddress}`} className="btn-ghost-sm inline-flex no-underline">{t("portfolio.openToken")}</Link></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </div>
    </>
  );
}
