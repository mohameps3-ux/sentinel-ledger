import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useClientAuthToken } from "../hooks/useClientAuthToken";
import { formatUsdWhole, formatTokenPrice } from "../lib/formatStable";
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

        <section className="border border-white/[0.08] bg-[#07080b] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-gray-500 font-semibold">{t("portfolio.realityTitle")}</p>
              <p className="text-[11px] text-gray-500 mt-1 max-w-3xl">{t("portfolio.realityBody")}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center shrink-0">
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2">
                <p className="text-[9px] text-gray-500 uppercase tracking-wide">{t("portfolio.worked")}</p>
                <p className="font-mono text-lg text-emerald-200">{reality.worked}</p>
              </div>
              <div className="rounded-md border border-red-500/20 bg-red-500/[0.05] px-3 py-2">
                <p className="text-[9px] text-gray-500 uppercase tracking-wide">{t("portfolio.failed")}</p>
                <p className="font-mono text-lg text-red-200">{reality.failed}</p>
              </div>
              <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
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
                  <span className={`text-xs px-2 py-1 rounded border shrink-0 ${outcomeTone(p.outcome24h)}`}>
                    {t(`portfolio.outcome.${p.outcome24h || "unknown"}`)}
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
                <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">{t("portfolio.pnlReality")}</p>
                  <p className="text-xs text-gray-300 mt-1">{t("portfolio.pnlUnverified")}</p>
                </div>
                {p.note ? <p className="text-xs text-gray-500 mt-2 border-t border-white/10 pt-2">{p.note}</p> : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <TerminalActionIcons mint={p.tokenAddress} />
                  <Link href={`/token/${p.tokenAddress}`} className="btn-ghost inline-flex text-xs no-underline">
                    {t("portfolio.openToken")}
                  </Link>
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </>
  );
}
