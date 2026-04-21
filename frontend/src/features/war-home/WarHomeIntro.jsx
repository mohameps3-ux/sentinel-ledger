import Link from "next/link";
import { Volume2, VolumeX } from "lucide-react";

const DESTINATIONS = [
  { href: "/scanner", title: "Scanner", body: "Mint → full token terminal." },
  { href: "/smart-money", title: "Smart money", body: "Wallets, edge, ES/EN profiles." },
  { href: "/watchlist", title: "Watchlist", body: "Track mints + alerts." },
  { href: "/compare", title: "Compare", body: "Two tokens side by side." },
  { href: "/alerts", title: "Alerts", body: "Telegram + PRO nudges." },
  { href: "/wallet-stalker", title: "Stalker", body: "Follow wallets; badge on news." }
];

const STRATEGY_OPTIONS = [
  { id: "conservative", label: "Conservative" },
  { id: "balanced", label: "Balanced" },
  { id: "aggressive", label: "Aggressive" }
];

export default function WarHomeIntro({
  nextSignalEtaSec,
  monitoringWallets,
  clusterScanCount,
  liveSignalsDetected,
  wsBump,
  strategyMode,
  onStrategyModeChange,
  soundEnabled,
  onToggleSound
}) {
  return (
    <>
      <section className="sl-section">
        <div className="sl-home-hero sl-inset sm:p-8 md:p-10">
          <div className="sl-home-hero-inner">
            <p className="sl-label text-gray-400">Solana intelligence terminal</p>
            <h1 className="sl-display mt-3 text-white max-w-4xl">Trade with the stack, not the noise</h1>
            <p className="sl-body text-gray-400 mt-5 max-w-2xl text-[15px] leading-relaxed">
              Live smart-money feed, verified 24h outcomes, and deep token intel — one flow from scan to size.
              Always your decision; we surface structure and risk.
            </p>
            <p className="text-xs text-gray-500 mt-4 max-w-2xl leading-relaxed border-l-2 border-white/15 pl-3">
              <span className="text-gray-300 font-medium">Navigation:</span> the bar under the header on every page
              shows <strong className="text-gray-200">where you are</strong> and text links to jump anywhere. The top
              row repeats the same destinations for muscle memory.
            </p>
          </div>
        </div>
      </section>

      <section className="sl-section !mt-1" aria-labelledby="home-destinations-heading">
        <h2
          id="home-destinations-heading"
          className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 mb-2"
        >
          Pick a screen (same links as the strip under the header)
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-2.5">
          {DESTINATIONS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5 sm:p-3 transition-colors duration-150 hover:border-white/18 hover:bg-white/[0.05] active:scale-[0.99]"
            >
              <p className="text-[12px] sm:text-[13px] font-semibold text-white leading-tight group-hover:underline decoration-white/25 underline-offset-2">
                {item.title}
                <span className="text-gray-500 font-normal ml-0.5">→</span>
              </p>
              <p className="text-[10px] sm:text-[11px] text-gray-500 mt-1 leading-snug line-clamp-2">{item.body}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="sl-section !pt-2 !pb-2">
        <div className="glass-card sl-inset border border-white/[0.08]">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6">
            <div className="space-y-3 min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Sticky loop · active wait</p>
              <p className="text-[11px] text-gray-500">
                Live tension bar above tracks 24h detections. Here: pulse timing and cluster load.
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-2 text-[11px] text-gray-300">
                <span>
                  Next pulse ~{Math.max(5, Math.round(nextSignalEtaSec / 5) * 5)}s / ~
                  {Math.max(1, Math.ceil(nextSignalEtaSec / 60))} min
                </span>
                <span className="text-gray-600">|</span>
                <span>Monitoring {monitoringWallets} wallets</span>
                <span className="text-gray-600">|</span>
                <span>Clusters {clusterScanCount}</span>
                <span className="text-gray-600">|</span>
                <span className="text-gray-500">24h feed: {liveSignalsDetected}</span>
                {wsBump > 0 ? (
                  <>
                    <span className="text-gray-600">|</span>
                    <span className="text-emerald-300/90 font-mono">WS +{wsBump}</span>
                  </>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col gap-3 shrink-0 xl:min-w-[280px]">
              <p className="text-[11px] text-gray-500 uppercase tracking-wide">Strategy mode</p>
              <div className="flex flex-wrap gap-2">
                {STRATEGY_OPTIONS.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => onStrategyModeChange(mode.id)}
                    className={`text-xs px-3 py-2 rounded-lg border ${
                      strategyMode === mode.id
                        ? "border-cyan-400/45 bg-cyan-500/15 text-cyan-100 shadow-[0_0_16px_rgba(6,182,212,0.15)]"
                        : "border-white/12 bg-white/[0.04] text-gray-300 hover:text-white hover:border-white/20"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onToggleSound}
                className="text-xs px-3 py-2 rounded-lg border border-white/12 bg-white/[0.04] text-gray-300 hover:text-white w-fit"
              >
                {soundEnabled ? (
                  <span className="inline-flex items-center gap-2">
                    <Volume2 size={14} /> Sound on
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <VolumeX size={14} /> Sound off
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
