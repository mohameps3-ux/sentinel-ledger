import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { PageHead } from "../components/seo/PageHead";
import { useTrendingTokens } from "../hooks/useTrendingTokens";
import { useLocale } from "../contexts/LocaleContext";
import { ScannerStatusStrip } from "../components/scanner/ScannerStatusStrip";
import { ScannerDecisionHeader } from "../components/scanner/ScannerDecisionHeader";
import { ScannerMetricsStrip } from "../components/scanner/ScannerMetricsStrip";
import { ScannerSignalStrip } from "../components/scanner/ScannerSignalStrip";
import { ScannerNarrativeContext } from "../components/scanner/ScannerNarrativeContext";
import { ScannerTokenTable } from "../components/scanner/ScannerTokenTable";

const NARRATIVE_OPTIONS = ["ALL", "AI", "DeFi", "Gaming", "Meme", "RWA", "L2", "Dog", "Cat"];
const VENUE_FILTERS = ["all", "pump", "raydium", "new24h", "highScore"];
const TABLE_ROWS_MAX = 24;

/** Scanner universe must NOT use `useSortedTokens` (war mode + sniper/liquidity profiles strip rows). */

function tokenMatchesNarrativeClient(token, narrative) {
  if (!narrative || narrative === "ALL") return true;
  const needle = String(narrative).toUpperCase();
  const parts = [
    ...(Array.isArray(token.narrativeTags) ? token.narrativeTags : []),
    token.symbol,
    token.token,
    ...(Array.isArray(token.whyTrade) ? token.whyTrade : []),
    ...(Array.isArray(token.evidenceChips) ? token.evidenceChips : [])
  ]
    .filter(Boolean)
    .map((x) => String(x).toUpperCase());
  const hay = parts.join(" ");
  if (hay.includes(needle)) return true;
  if (needle === "L2" && (hay.includes("LAYER") || hay.includes(" ROLLUP"))) return true;
  return false;
}

function tokenMatchesVenueFilter(token, id) {
  if (id === "all") return true;
  const tags = (token.narrativeTags || []).map((x) => String(x).toLowerCase()).join(" ");
  const dex = String(token.dex || token.launchpad || token.launchPad || "").toLowerCase();
  const score = Math.round(Number(token.sentinelScore ?? token.score ?? 0));
  if (id === "pump") return tags.includes("pump") || dex.includes("pump");
  if (id === "raydium") return tags.includes("raydium") || dex.includes("raydium");
  if (id === "new24h") {
    const h = Number(token.poolAgeHours ?? token.ageHours);
    if (Number.isFinite(h) && h < 24) return true;
    const label = String(token.poolAgeLabel || token.poolAge || "").toLowerCase();
    if (label && (label.includes("min") || label.includes("hour") || label.includes("h"))) {
      if (label.includes("d") || label.includes("day")) return false;
      return true;
    }
    return false;
  }
  if (id === "highScore") return score >= 75;
  return true;
}

export default function ScannerPage() {
  const { t } = useLocale();
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [narrative, setNarrative] = useState("ALL");
  const [venueFilter, setVenueFilter] = useState("all");
  const [focusedMint, setFocusedMint] = useState(null);
  const router = useRouter();
  // Always fetch full /hot universe; narrative is filtered client-side (API narrativeTags are often empty).
  const trending = useTrendingTokens([], {}, "", { limit: 24 });

  const scannerSource = useMemo(() => trending.data?.data || [], [trending.data?.data]);
  const normalizedScanner = useMemo(
    () =>
      scannerSource.map((row) => ({
        ...row,
        mint: row.mint ?? row.address ?? row.tokenAddress,
        tokenAddress: row.tokenAddress ?? row.mint ?? row.address,
        sentinelScore: row.sentinelScore ?? row.score ?? row.signalStrength ?? 0,
        smartMoneyCount: row.smartMoneyCount ?? row.smartWallets ?? 0,
        liquidityUsd: row.liquidityUsd ?? row.liquidity ?? 0,
        priceChange24h: row.priceChange24h ?? row.change24h ?? row.priceChange ?? row.change ?? 0
      })),
    [scannerSource]
  );
  const sorted = useMemo(() => {
    const rows = normalizedScanner.filter((row) => tokenMatchesNarrativeClient(row, narrative));
    return [...rows].sort((a, b) => (Number(b.sentinelScore) || 0) - (Number(a.sentinelScore) || 0));
  }, [normalizedScanner, narrative]);
  const filteredSorted = useMemo(
    () => sorted.filter((row) => tokenMatchesVenueFilter(row, venueFilter)),
    [sorted, venueFilter]
  );

  useEffect(() => {
    if (!filteredSorted.length) {
      setFocusedMint(null);
      return;
    }
    setFocusedMint((prev) => {
      const stillHere = prev && filteredSorted.some((r) => (r.tokenAddress || r.mint) === prev);
      if (stillHere) return prev;
      return filteredSorted[0].tokenAddress || filteredSorted[0].mint || null;
    });
  }, [filteredSorted]);

  const focusedToken = useMemo(
    () => filteredSorted.find((r) => (r.tokenAddress || r.mint) === focusedMint) || null,
    [filteredSorted, focusedMint]
  );

  const tableRows = useMemo(() => filteredSorted.slice(0, TABLE_ROWS_MAX), [filteredSorted]);
  const scannerStatus = useMemo(() => {
    if (trending.isError) {
      const err = trending.error || {};
      return {
        kind: err.kind || "request_error",
        status: err.status ?? null
      };
    }
    if (!trending.isLoading && tableRows.length === 0) return { kind: "no_data", status: 200 };
    return null;
  }, [trending.error, trending.isError, trending.isLoading, tableRows.length]);

  const onSubmit = (e) => {
    e.preventDefault();
    const v = address.trim();
    if (v.length < 32 || v.length > 64) {
      setError(t("scanner.errorMint"));
      return;
    }
    setError("");
    router.push(`/token/${v}`);
  };

  const tabBase =
    "shrink-0 rounded-md border px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-[0.14em] transition-colors";
  const tabActive = "border-cyan-300/35 bg-cyan-300/10 text-cyan-100";
  const tabInactive = "border-white/[0.08] bg-white/[0.025] text-zinc-500 hover:border-white/15 hover:text-zinc-300";

  const venueTabBase =
    "rounded-md border px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-[0.14em] transition-colors";
  const venueInactive = "border-white/[0.08] bg-black/20 text-zinc-500 hover:border-white/15 hover:text-zinc-300";
  const venueActive = "border-emerald-300/35 bg-emerald-300/10 text-emerald-100";

  return (
    <>
      <PageHead title={t("scanner.pageTitle")} description={t("scanner.pageDesc")} />
      <div className="min-h-screen bg-[#05070a] font-sans text-zinc-200 antialiased">
        <ScannerStatusStrip />
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-5">
          <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-300/70">SCANNER</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">{t("scanner.h1")}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">{t("scanner.body")}</p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="inline-flex h-9 w-fit items-center rounded-md border border-white/[0.08] bg-white/[0.03] px-3 text-[10px] font-mono uppercase tracking-wide text-zinc-500 transition-colors hover:border-white/15 hover:text-zinc-300"
            >
              {t("scanner.backDashboard")}
            </button>
          </header>

          <div className="mb-4 rounded-md border border-white/10 bg-white/[0.035] p-3 backdrop-blur-md sm:p-4">
            <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="So11111111111111111111111111111111111111112"
                className="min-h-10 w-full rounded-md border border-white/[0.08] bg-black/30 px-3 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-300/35 focus:outline-none"
              />
              <button
                type="submit"
                className="shrink-0 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-cyan-100 transition-colors hover:border-cyan-300/45 hover:bg-cyan-300/15"
              >
                {t("scanner.scanBtn")}
              </button>
            </form>
            {error ? <p className="mt-2 font-mono text-xs text-red-500">{error}</p> : null}
          </div>

          <section className="mb-4 overflow-hidden rounded-md border border-white/10 bg-white/[0.025] shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <ScannerDecisionHeader token={focusedToken} t={t} />
            {focusedToken ? (
              <>
                <ScannerMetricsStrip token={focusedToken} universeRows={tableRows} t={t} />
                <ScannerSignalStrip token={focusedToken} t={t} />
              </>
            ) : null}
            <ScannerNarrativeContext token={focusedToken} t={t} />
          </section>

          <section className="mb-3 rounded-md border border-white/[0.08] bg-white/[0.025] p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">{t("scanner.filters.heading")}</p>
                <p className="mt-0.5 text-[11px] text-zinc-600">{t("scanner.narrativeH2")}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {NARRATIVE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setNarrative(opt)}
                  className={`${tabBase} ${narrative === opt ? tabActive : tabInactive}`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {VENUE_FILTERS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setVenueFilter(id)}
                  className={`${venueTabBase} ${venueFilter === id ? venueActive : venueInactive}`}
                >
                  {t(`scanner.filter.${id}`)}
                </button>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-md border border-white/10 bg-white/[0.025] backdrop-blur-md">
            <div className="border-b border-white/10 bg-white/[0.02] px-4 py-3 sm:px-5">
              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">{t("scanner.universe.title")}</p>
              <p className="mt-0.5 text-xs text-zinc-600">{t("scanner.universe.sub")}</p>
            </div>
            <ScannerTokenTable
              rows={tableRows}
              focusedMint={focusedMint}
              onFocusMint={(mint) => setFocusedMint(mint)}
              t={t}
              status={scannerStatus}
            />
          </section>
        </div>
      </div>
    </>
  );
}
