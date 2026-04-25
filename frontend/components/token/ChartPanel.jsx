import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import {
  buildDexscreenerSolanaEmbedUrl,
  buildDexscreenerSolanaTokenUrl,
  EXTERNAL_ANCHOR_REL
} from "../../lib/terminalLinks";

export function ChartPanel({ address, compact = false }) {
  const [timeframe, setTimeframe] = useState("1h");
  const [shouldLoad, setShouldLoad] = useState(false);
  const [isFrameLoading, setIsFrameLoading] = useState(false);
  const panelRef = useRef(null);
  const timeframes = ["1h", "4h", "1d", "1w"];
  const heightClass = compact ? "h-[300px] md:h-[380px]" : "h-[360px] md:h-[500px]";
  const iframeUrl = useMemo(() => {
    if (!address) return "";
    const tf = timeframe === "1w" ? "1W" : timeframe;
    return buildDexscreenerSolanaEmbedUrl(address, tf);
  }, [address, timeframe]);
  const dexUrl = buildDexscreenerSolanaTokenUrl(address);

  useEffect(() => {
    setShouldLoad(false);
    setIsFrameLoading(false);
  }, [address]);

  useEffect(() => {
    if (shouldLoad || typeof IntersectionObserver === "undefined") return undefined;
    const el = panelRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    if (shouldLoad && iframeUrl) setIsFrameLoading(true);
  }, [shouldLoad, iframeUrl]);

  if (!address) return <div className="glass-card h-96 skeleton-shimmer" />;
  return (
    <div ref={panelRef} className="glass-card glass-card-hover overflow-hidden p-0">
      <div className="px-4 py-3 border-b soft-divider flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-xs mono text-gray-400">
          LIVE CHART · DEXSCREENER · enable <span className="text-gray-300">Volume</span> from the embedded chart
          toolbar if bars are hidden
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 h-7 rounded-lg text-xs transition ${
                timeframe === tf
                  ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white"
                  : "bg-[#0D1216] text-gray-400 hover:text-gray-200"
              }`}
            >
              {tf}
            </button>
          ))}
          <a
            href={dexUrl}
            target="_blank"
            rel={EXTERNAL_ANCHOR_REL}
            className="h-7 px-2 rounded-lg text-xs inline-flex items-center gap-1 bg-[#0D1216] text-gray-300 hover:text-white transition"
          >
            Open <ExternalLink size={12} />
          </a>
        </div>
      </div>
      <div className={`relative ${heightClass} bg-[#080b10]`}>
        {!shouldLoad ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.16),transparent_46%),#080b10] px-4 text-center">
            <div className="h-16 w-16 rounded-2xl border border-indigo-400/25 bg-indigo-500/10 shadow-[0_0_30px_rgba(99,102,241,0.16)]" />
            <div>
              <p className="text-sm font-semibold text-white">DexScreener chart paused</p>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-gray-500">
                The chart loads only when needed so token price, metrics, and signals appear immediately.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShouldLoad(true)}
              className="h-10 rounded-xl bg-indigo-500 px-4 text-xs font-black uppercase tracking-[0.14em] text-white hover:bg-indigo-400"
            >
              Load chart
            </button>
          </div>
        ) : null}
        {shouldLoad && iframeUrl ? (
          <>
            {isFrameLoading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-[#080b10]/85 text-sm text-gray-300">
                <Loader2 size={16} className="animate-spin text-indigo-300" />
                Loading DexScreener chart…
              </div>
            ) : null}
            <iframe
              src={iframeUrl}
              loading="lazy"
              className={`w-full border-0 ${heightClass}`}
              title="Token Chart"
              onLoad={() => setIsFrameLoading(false)}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

