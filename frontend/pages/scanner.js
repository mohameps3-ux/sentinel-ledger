import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { PageHead } from "../components/seo/PageHead";
import { useTrendingTokens } from "../hooks/useTrendingTokens";
import { useLocale } from "../contexts/LocaleContext";
import { TerminalActionIcons } from "../components/terminal/TerminalActionIcons";
import { useSortedTokens } from "@/hooks/useSortedTokens";

const NARRATIVE_OPTIONS = ["ALL", "AI", "DeFi", "Gaming", "Meme", "RWA", "L2", "Dog", "Cat"];
const FILTER_CHIPS = ["All", "Pump.fun", "Raydium", "New (<24h)", "High Score"];

export default function ScannerPage() {
  const { t } = useLocale();
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [narrative, setNarrative] = useState("ALL");
  const router = useRouter();
  const trending = useTrendingTokens([], {}, narrative === "ALL" ? "" : narrative);

  const scannerSource = useMemo(() => trending.data?.data || [], [trending.data?.data]);
  const normalizedScanner = useMemo(
    () =>
      scannerSource.map((t) => ({
        ...t,
        mint: t.mint ?? t.address ?? t.tokenAddress,
        sentinelScore: t.sentinelScore ?? t.score ?? t.signalStrength ?? 0,
        smartMoneyCount: t.smartMoneyCount ?? t.smartWallets ?? 0,
        liquidityUsd: t.liquidityUsd ?? t.liquidity ?? 0,
        priceChange24h: t.priceChange24h ?? t.change24h ?? t.priceChange ?? t.change ?? 0
      })),
    [scannerSource]
  );
  const sorted = useSortedTokens(normalizedScanner);

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

  return (
    <>
      <PageHead title={t("scanner.pageTitle")} description={t("scanner.pageDesc")} />
      <div className="sl-container py-10">
        <section className="terminal-panel px-6 py-5 mb-4">
          <span className="section-title">SCANNER</span>
          <h1 className="font-display text-2xl font-bold text-sl-text mt-1">
            Token Scanner
          </h1>
          <p className="font-ui text-sm text-sl-muted mt-1">
            Paste any Solana mint to open the full Decision Engine
          </p>
        </section>

        <div className="terminal-panel px-4 py-4 mb-4">
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="flex items-center">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="So11111111111111111111111111111111111111112"
              className="w-full h-10 px-4 bg-sl-root border border-sl-border font-mono text-sm text-sl-text placeholder:text-sl-muted focus:border-sl-violet focus:outline-none transition-colors duration-150"
            />
              <button type="submit" className="btn-primary ml-2">
                {t("scanner.scanBtn")}
              </button>
            </div>
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost-sm" onClick={() => router.push("/")}>
                {t("scanner.backDashboard")}
              </button>
            </div>
          </form>
        </div>

        <section className="terminal-panel px-4 py-4 max-w-6xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="sl-label">{t("scanner.narrativeLabel")}</p>
              <h2 className="text-sl-text font-semibold text-lg mt-1">{t("scanner.narrativeH2")}</h2>
            </div>
            <select
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              className="sl-input h-10 max-w-[220px]"
            >
              {NARRATIVE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {FILTER_CHIPS.map((chip) => (
              <button key={chip} type="button" className={chip === "All" ? "btn-pill-active" : "btn-pill"}>
                {chip}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {sorted.slice(0, 12).map((token) => {
              const mint = token.tokenAddress;
              const score = Math.max(0, Math.min(100, Math.round(Number(token.sentinelScore || 0))));
              const change = Number(token.change ?? token.change24h);
              return (
              <div
                key={token.tokenAddress}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/token/${mint}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/token/${mint}`);
                  }
                }}
                className="terminal-card-interactive group mb-2 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-sl-text">{token.token || token.symbol || "TOKEN"}</p>
                    <p className="mono text-[11px] text-sl-muted mt-1">
                      {String(mint || "").slice(0, 6)}...{String(mint || "").slice(-6)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="sl-metric text-xl">{score}/100</p>
                    <p className={`font-mono text-xs ${change >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                      {Number.isFinite(change) ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "—"}
                    </p>
                  </div>
                </div>
                <div className="score-track mx-3 mb-2">
                  <div
                    className={score >= 60 ? "score-fill-high" : score >= 40 ? "score-fill-mid" : "score-fill-low"}
                    style={{ width: `${Math.min(score, 100)}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                  <div><p className="sl-metric-label">Liquidity</p><p className="font-mono text-sl-sub">${Number(token.liquidity || 0).toLocaleString()}</p></div>
                  <div><p className="sl-metric-label">Volume</p><p className="font-mono text-sl-sub">${Number(token.volume24h || 0).toLocaleString()}</p></div>
                  <div><p className="sl-metric-label">Score</p><p className="font-mono text-sl-sub">{score}</p></div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(token.narrativeTags || []).slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 border border-violet-500/30 bg-violet-500/10 text-[10px] text-violet-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <TerminalActionIcons mint={mint} className="justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                </div>
              </div>
            );})}
          </div>
        </section>
      </div>
    </>
  );
}
