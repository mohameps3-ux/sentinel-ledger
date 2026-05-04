import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { PageHead } from "../components/seo/PageHead";
import { useTrendingTokens } from "../hooks/useTrendingTokens";
import { useLocale } from "../contexts/LocaleContext";
import { TerminalActionIcons } from "../components/terminal/TerminalActionIcons";
import { useSortedTokens } from "@/hooks/useSortedTokens";
import { ScannerStatusStrip } from "../components/scanner/ScannerStatusStrip";

const NARRATIVE_OPTIONS = ["ALL", "AI", "DeFi", "Gaming", "Meme", "RWA", "L2", "Dog", "Cat"];

const VENUE_FILTERS = ["all", "pump", "raydium", "new24h", "highScore"];

function tokenMatchesVenueFilter(token, id) {
  if (id === "all") return true;
  const tags = (token.narrativeTags || []).map((x) => String(x).toLowerCase()).join(" ");
  const dex = String(token.dex || token.launchpad || token.launchPad || "").toLowerCase();
  const score = Math.round(Number(token.sentinelScore ?? token.score ?? 0));
  if (id === "pump") return tags.includes("pump") || dex.includes("pump");
  if (id === "raydium") return tags.includes("raydium") || dex.includes("raydium");
  if (id === "new24h") {
    const h = Number(token.poolAgeHours ?? token.ageHours);
    if (Number.isFinite(h)) return h < 24;
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
  const router = useRouter();
  const trending = useTrendingTokens([], {}, narrative === "ALL" ? "" : narrative);

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
  const sorted = useSortedTokens(normalizedScanner);
  const filteredSorted = useMemo(
    () => sorted.filter((row) => tokenMatchesVenueFilter(row, venueFilter)),
    [sorted, venueFilter]
  );

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
    "shrink-0 border-b-2 border-transparent px-2 pb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500 transition-colors";
  const tabActive = "border-amber-500/70 text-zinc-100";
  const tabInactive = "hover:text-zinc-300";

  const venueTabBase =
    "rounded-sm border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.14em] transition-colors";
  const venueInactive = "border-zinc-800/90 bg-zinc-900/30 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400";
  const venueActive = "border-amber-600/40 bg-amber-500/10 text-amber-500/95";

  return (
    <>
      <PageHead title={t("scanner.pageTitle")} description={t("scanner.pageDesc")} />
      <div className="min-h-screen bg-[#050505] text-zinc-200 antialiased">
        <ScannerStatusStrip />
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-8 sm:px-5">
          <header className="mb-6 border-b border-white/10 pb-5">
            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500">SCANNER</p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">{t("scanner.h1")}</h1>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-zinc-500">{t("scanner.body")}</p>
          </header>

          <div className="mb-6 rounded-sm border border-white/10 bg-white/[0.035] p-4 backdrop-blur-md sm:p-5">
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="So11111111111111111111111111111111111111112"
                  className="min-h-10 w-full rounded-sm border border-zinc-800 bg-zinc-950/50 px-3 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600/40"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-sm border border-zinc-700 bg-transparent px-4 py-2 text-[11px] font-mono uppercase tracking-[0.14em] text-zinc-300 transition-all hover:border-zinc-600 hover:bg-zinc-800/80 hover:text-zinc-100"
                >
                  {t("scanner.scanBtn")}
                </button>
              </div>
              {error ? <p className="font-mono text-xs text-red-500">{error}</p> : null}
              <button
                type="button"
                onClick={() => router.push("/")}
                className="text-[11px] font-mono uppercase tracking-wide text-zinc-500 underline-offset-4 transition-colors hover:text-zinc-300"
              >
                {t("scanner.backDashboard")}
              </button>
            </form>
          </div>

          <section className="rounded-sm border border-white/10 bg-white/[0.03] backdrop-blur-md">
            <div className="border-b border-white/10 px-4 py-4 sm:px-5">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">{t("scanner.narrativeLabel")}</p>
              <p className="mt-1 text-[11px] leading-snug text-zinc-600">{t("scanner.narrativeH2")}</p>

              <div className="mt-4 flex gap-1 overflow-x-auto border-b border-zinc-800/80 pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
            </div>

            <div className="grid gap-2 p-3 sm:grid-cols-2 sm:gap-3 sm:p-4">
              {filteredSorted.slice(0, 12).map((token) => {
                const mint = token.tokenAddress || token.mint;
                const score = Math.max(0, Math.min(100, Math.round(Number(token.sentinelScore || 0))));
                const change = Number(token.change ?? token.change24h ?? token.priceChange24h);
                const sym = token.token || token.symbol || "TOKEN";
                return (
                  <div
                    key={mint || sym}
                    role="button"
                    tabIndex={0}
                    onClick={() => mint && router.push(`/token/${mint}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (mint) router.push(`/token/${mint}`);
                      }
                    }}
                    className="group relative cursor-pointer rounded-sm border border-white/10 bg-zinc-900/40 p-3 backdrop-blur-md transition-colors hover:border-white/[0.14] hover:bg-zinc-900/55 sm:p-4"
                  >
                    <div className="absolute right-3 top-3 sm:right-4 sm:top-4">
                      <span className="font-mono text-xs tabular-nums text-zinc-50">{score}/100</span>
                    </div>
                    <div className="pr-14">
                      <p className="text-sm font-semibold tracking-tight text-zinc-100">{sym}</p>
                      <p className="mt-1 font-mono text-[10px] leading-tight text-zinc-500">
                        {String(mint || "").slice(0, 6)}…{String(mint || "").slice(-6)}
                      </p>
                      <p
                        className={`mt-1 font-mono text-[11px] tabular-nums ${
                          !Number.isFinite(change) ? "text-zinc-600" : change >= 0 ? "text-emerald-500" : "text-red-500"
                        }`}
                      >
                        {Number.isFinite(change) ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "—"}
                      </p>
                    </div>

                    <div className="mt-3 h-[2px] w-full bg-zinc-800/90">
                      <div
                        className={`h-full ${
                          score >= 60 ? "bg-emerald-500/45" : score >= 40 ? "bg-amber-500/40" : "bg-red-500/35"
                        }`}
                        style={{ width: `${Math.min(score, 100)}%` }}
                      />
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-1 border-t border-white/[0.06] pt-3">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">Liquidity</p>
                        <p className="font-mono text-[11px] tabular-nums text-zinc-50">
                          ${Number(token.liquidityUsd ?? token.liquidity ?? 0).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">Volume</p>
                        <p className="font-mono text-[11px] tabular-nums text-zinc-50">
                          ${Number(token.volume24h || 0).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">Score</p>
                        <p className="font-mono text-[11px] tabular-nums text-zinc-50">{score}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t border-white/[0.06] pt-3">
                      <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                        {(token.narrativeTags || []).slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-sm border border-white/10 bg-white/[0.02] px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-zinc-400"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      <TerminalActionIcons
                        mint={mint}
                        variant="institutional"
                        className="justify-end opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
