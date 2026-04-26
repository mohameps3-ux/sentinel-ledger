import { useState } from "react";
import { useRouter } from "next/router";
import { ProButton } from "../components/ui/ProButton";
import { PageHead } from "../components/seo/PageHead";
import { useTrendingTokens } from "../hooks/useTrendingTokens";
import { useLocale } from "../contexts/LocaleContext";
import { TerminalActionIcons } from "../components/terminal/TerminalActionIcons";

const NARRATIVE_OPTIONS = ["ALL", "AI", "DeFi", "Gaming", "Meme", "RWA", "L2", "Dog", "Cat"];
const FILTER_CHIPS = ["All", "Pump.fun", "Raydium", "New (<24h)", "High Score"];

function SparklineBars({ seed = 50 }) {
  const base = Math.max(8, Math.min(100, Number(seed) || 50));
  const points = [0.42, 0.62, 0.36, 0.78, 0.56].map((x, i) => Math.max(8, Math.min(34, Math.round(base * x) + i * 2)));
  return (
    <div className="flex h-9 items-end gap-1" aria-hidden>
      {points.map((h, i) => (
        <span key={i} className="sl-sparkbar" style={{ height: `${h}px`, opacity: 0.45 + i * 0.1 }} />
      ))}
    </div>
  );
}

export default function ScannerPage() {
  const { t } = useLocale();
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [narrative, setNarrative] = useState("ALL");
  const router = useRouter();
  const trending = useTrendingTokens([], {}, narrative === "ALL" ? "" : narrative);

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
        <section className="sl-card-elevated sl-inset max-w-5xl mx-auto sm:p-8 sl-glow-indigo">
          <p className="sl-label text-violet-300/90">{t("scanner.label")}</p>
          <h1 className="text-3xl font-semibold text-white mt-1">Token Scanner</h1>
          <p className="sl-body sl-muted mt-2">{t("scanner.body")}</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="So11111111111111111111111111111111111111112"
              className="sl-input h-14 font-mono text-sm"
            />
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <ProButton type="submit">{t("scanner.scanBtn")}</ProButton>
              <button type="button" className="btn-ghost" onClick={() => router.push("/")}>
                {t("scanner.backDashboard")}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8 glass-card sl-inset max-w-6xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="sl-label">{t("scanner.narrativeLabel")}</p>
              <h2 className="text-white font-semibold text-lg mt-1">{t("scanner.narrativeH2")}</h2>
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
          <div className="mt-4 flex flex-wrap gap-2">
            {FILTER_CHIPS.map((chip) => (
              <span key={chip} className={`sl-badge ${chip === "All" ? "sl-badge-indigo" : "border-white/10 bg-white/[0.03] text-gray-400"}`}>
                {chip}
              </span>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(trending.data?.data || []).slice(0, 12).map((token) => {
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
                className="group text-left rounded-xl border border-white/10 bg-[var(--sl-bg-surface)] hover:bg-[var(--sl-bg-elevated)] px-4 py-3 cursor-pointer"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{token.token || token.symbol || "TOKEN"}</p>
                    <p className="mono text-[11px] text-gray-500 mt-1">
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
                <div className="mt-3 sl-score-bar"><span style={{ width: `${score}%` }} /></div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                  <div><p className="sl-metric-label">Liquidity</p><p className="font-mono text-gray-300">${Number(token.liquidity || 0).toLocaleString()}</p></div>
                  <div><p className="sl-metric-label">Volume</p><p className="font-mono text-gray-300">${Number(token.volume24h || 0).toLocaleString()}</p></div>
                  <div className="flex justify-end"><SparklineBars seed={score} /></div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(token.narrativeTags || []).slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded border border-violet-500/30 bg-violet-500/10 text-[10px] text-violet-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <TerminalActionIcons mint={mint} className="justify-end opacity-80 transition group-hover:opacity-100" />
                </div>
              </div>
            );})}
          </div>
        </section>
      </div>
    </>
  );
}
