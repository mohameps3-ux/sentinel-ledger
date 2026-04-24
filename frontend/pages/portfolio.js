import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useClientAuthToken } from "../hooks/useClientAuthToken";
import { formatUsdWhole, formatTokenPrice } from "../lib/formatStable";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { PageHead } from "../components/seo/PageHead";
import { Loader2 } from "lucide-react";
import { useLocale } from "../contexts/LocaleContext";

export default function PortfolioPage() {
  const { t } = useLocale();
  const token = useClientAuthToken();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [positions, setPositions] = useState([]);

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
    } catch (e) {
      setError(e.message || "portfolio_failed");
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (!token) {
    return (
      <>
        <PageHead title={t("portfolio.pageTitle")} description={t("portfolio.descSignedOut")} />
        <div className="sl-container py-10">
          <section className="glass-card sl-inset max-w-2xl mx-auto text-center">
            <p className="sl-label">{t("portfolio.label")}</p>
            <h1 className="sl-h2 text-white mt-1">{t("portfolio.h1SignedOut")}</h1>
            <p className="text-sm text-gray-400 mt-3">{t("portfolio.pSignedOut")}</p>
            <Link href="/" className="btn-pro inline-flex mt-5 no-underline">
              {t("portfolio.goDashboard")}
            </Link>
          </section>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead title={t("portfolio.pageTitle")} description={t("portfolio.desc")} />
      <div className="sl-container py-10 space-y-6">
        <section className="glass-card sl-inset flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="sl-label">{t("portfolio.label")}</p>
            <h1 className="sl-h2 text-white mt-1">{t("portfolio.h1")}</h1>
            <p className="text-sm text-gray-400 mt-2 max-w-2xl">{t("portfolio.sub")}</p>
          </div>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="btn-ghost inline-flex items-center gap-2 shrink-0 self-start sm:self-auto"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : null}
            {t("portfolio.refresh")}
          </button>
        </section>

        {loading && !positions.length ? (
          <p className="text-sm text-gray-400 flex items-center gap-2">
            <Loader2 className="animate-spin" size={16} />
            {t("portfolio.loadingMarkets")}
          </p>
        ) : null}
        {error ? <p className="text-sm text-red-300">{t("portfolio.error", { err: error })}</p> : null}
        {!loading && !error && !positions.length ? (
          <section className="glass-card sl-inset text-center py-10">
            <p className="text-gray-300">{t("portfolio.empty")}</p>
            <Link href="/watchlist" className="btn-pro inline-flex mt-4 no-underline">
              {t("portfolio.openWatchlist")}
            </Link>
          </section>
        ) : null}

        {positions.length ? (
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {positions.map((p) => (
              <article
                key={p.tokenAddress}
                className="glass-card p-4 rounded-2xl border border-white/10 hover:border-purple-500/40 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-white">${p.symbol}</h2>
                    <p className="mono text-xs text-gray-500 mt-1 break-all">{p.tokenAddress}</p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded border shrink-0 ${
                      p.score >= 85
                        ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
                        : p.score >= 70
                          ? "text-amber-300 border-amber-500/30 bg-amber-500/10"
                          : "text-red-300 border-red-500/30 bg-red-500/10"
                    }`}
                  >
                    {t("portfolio.score", { s: p.score ?? "—" })}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-3">
                  {t("portfolio.price")} ${p.priceUsd != null ? formatTokenPrice(p.priceUsd) : "—"}
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  {t("portfolio.liq")} ${formatUsdWhole(p.liquidityUsd || 0)}
                </p>
                <p
                  className={`text-sm mt-1 ${
                    p.change24hPct == null
                      ? "text-gray-500"
                      : p.change24hPct >= 0
                        ? "text-emerald-300"
                        : "text-red-300"
                  }`}
                >
                  {t("portfolio.change24h")}{" "}
                  {p.change24hPct == null
                    ? "—"
                    : `${p.change24hPct >= 0 ? "+" : ""}${Number(p.change24hPct).toFixed(2)}%`}
                </p>
                {p.note ? <p className="text-xs text-gray-500 mt-2 border-t border-white/10 pt-2">{p.note}</p> : null}
                <Link href={`/token/${p.tokenAddress}`} className="btn-ghost inline-flex mt-3 text-xs no-underline">
                  {t("portfolio.openToken")}
                </Link>
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </>
  );
}
