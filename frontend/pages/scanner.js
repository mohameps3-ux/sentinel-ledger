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
    "shrink-0 border-b-2 border-transparent px-2.5 pb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500 transition-colors";
  const tabActive = "border-zinc-400/80 text-zinc-100";
  const tabInactive = "hover:text-zinc-400";

  const venueTabBase =
    "rounded-sm border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.14em] transition-colors";
  const venueInactive = "border-zinc-800 bg-zinc-950/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400";
  const venueActive = "border-white/15 bg-white/[0.06] text-zinc-200";

  return (
    <>
      <PageHead title={t("scanner.pageTitle")} description={t("scanner.pageDesc")} />
      <div className="min-h-screen bg-[#050505] font-sans text-zinc-200 antialiased">
        <ScannerStatusStrip />
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-5">
          <header className="mb-6">
            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500">SCANNER</p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-zinc-50 sm:text-xl">{t("scanner.h1")}</h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">{t("scanner.body")}</p>
          </header>

          <div className="mb-6 rounded-sm border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md sm:p-5">
            <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="So11111111111111111111111111111111111111112"
                className="min-h-10 w-full rounded-sm border border-zinc-800 bg-zinc-950/60 px-3 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-700 focus:outline-none"
              />
              <button
                type="submit"
                className="shrink-0 rounded-sm border border-zinc-700 bg-transparent px-4 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400 transition-colors hover:border-zinc-600 hover:bg-zinc-900 hover:text-zinc-200"
              >
                {t("scanner.scanBtn")}
              </button>
            </form>
            {error ? <p className="mt-2 font-mono text-xs text-red-500">{error}</p> : null}
            <button
              type="button"
              onClick={() => router.push("/")}
              className="mt-3 text-[11px] font-mono uppercase tracking-wide text-zinc-600 transition-colors hover:text-zinc-400"
            >
              {t("scanner.backDashboard")}
            </button>
          </div>

          <section className="mb-4 overflow-hidden rounded-sm border border-white/10 bg-white/[0.025] backdrop-blur-md">
            <ScannerDecisionHeader token={focusedToken} t={t} />
            {focusedToken ? (
              <>
                <ScannerMetricsStrip token={focusedToken} universeRows={tableRows} t={t} />
                <ScannerSignalStrip token={focusedToken} t={t} />
              </>
            ) : null}
            <ScannerNarrativeContext token={focusedToken} t={t} />
          </section>

          <section className="mb-2 px-1">
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">{t("scanner.filters.heading")}</p>
            <p className="mt-0.5 text-[11px] text-zinc-600">{t("scanner.narrativeH2")}</p>
            <div className="mt-3 flex gap-1 overflow-x-auto border-b border-zinc-800/80 pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
            <div className="mt-3 flex flex-wrap gap-1.5">
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

          <section className="overflow-hidden rounded-sm border border-white/10 bg-white/[0.025] backdrop-blur-md">
            <div className="border-b border-white/10 px-4 py-3 sm:px-5">
              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">{t("scanner.universe.title")}</p>
              <p className="mt-0.5 text-xs text-zinc-600">{t("scanner.universe.sub")}</p>
            </div>
            <ScannerTokenTable
              rows={tableRows}
              focusedMint={focusedMint}
              onFocusMint={(mint) => setFocusedMint(mint)}
              t={t}
            />
          </section>
        </div>
      </div>
    </>
  );
}
