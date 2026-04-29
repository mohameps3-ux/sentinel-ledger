import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, Maximize2, Minimize2 } from "lucide-react";
import {
  buildDexscreenerSolanaEmbedUrl,
  buildDexscreenerSolanaTokenUrl,
  EXTERNAL_ANCHOR_REL
} from "../../lib/terminalLinks";

/**
 * Sentinel-branded chart panel.
 *
 * Visual contract (Phase 7C):
 *  - Header bar reads "SENTINEL · LIVE CHART · <SYMBOL>" with the
 *    Sentinel hex+radar mark. The chart is presented as Sentinel's,
 *    third-party data attribution is footer-sized.
 *  - Bloomberg-Black palette (no violet/cyan gradient on timeframe pills).
 *  - Native Fullscreen API toggle (button top-right).
 *  - Sentinel logo watermark anchored to bottom-right of the chart frame
 *    while the iframe loads, so the brand is the first thing the user
 *    sees regardless of network speed.
 *
 * Data: embed in iframe (no backend change; UI does not name the vendor).
 * A Sentinel-owned chart is queued for a later phase.
 */
export function ChartPanel({ address, compact = false, symbol = "" }) {
  const [timeframe, setTimeframe] = useState("1h");
  const [shouldLoad, setShouldLoad] = useState(false);
  const [isFrameLoading, setIsFrameLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);
  const panelRef = useRef(null);
  const timeframes = ["1h", "4h", "1d", "1w"];
  const heightClass = compact ? "h-[320px] md:h-[420px]" : "h-[420px] md:h-[560px]";
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

  useEffect(() => {
    const onFsChange = () => {
      const el = document.fullscreenElement || document.webkitFullscreenElement || null;
      setIsFullscreen(Boolean(el && el === containerRef.current));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const isInFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    if (isInFs) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
      return;
    }
    const enter = el.requestFullscreen || el.webkitRequestFullscreen;
    if (enter) {
      Promise.resolve(enter.call(el)).catch(() => {});
    }
  }, []);

  if (!address) return <div className="glass-card h-96 skeleton-shimmer" />;

  return (
    <div ref={panelRef} className="sl-chart-shell">
      <div ref={containerRef} className={`sl-chart-container ${isFullscreen ? "sl-chart-container--fs" : ""}`}>
        <div className="sl-chart-header">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="sl-chart-mark" aria-hidden>
              <svg viewBox="0 0 32 32" width="18" height="18">
                <polygon
                  points="16,2 26,8 26,24 16,30 6,24 6,8"
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth="1.2"
                  opacity="0.65"
                />
                <circle cx="16" cy="16" r="2.4" fill="#60A5FA" />
                <line x1="16" y1="16" x2="16" y2="6" stroke="#60A5FA" strokeWidth="1" opacity="0.85" />
              </svg>
            </span>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#60A5FA]">
              SENTINEL
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#a3a3a3]">·</span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#fafafa]">
              LIVE CHART
            </span>
            {symbol ? (
              <>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#a3a3a3]">·</span>
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#fafafa] truncate">
                  ${symbol}
                </span>
              </>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {timeframes.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`sl-chart-tf-pill ${timeframe === tf ? "sl-chart-tf-pill--active" : ""}`}
                aria-pressed={timeframe === tf}
              >
                {tf.toUpperCase()}
              </button>
            ))}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="sl-chart-fs-btn"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen chart"}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              <span className="hidden sm:inline">{isFullscreen ? "EXIT" : "FULL"}</span>
            </button>
          </div>
        </div>

        <div className={`sl-chart-body ${isFullscreen ? "sl-chart-body--fs" : heightClass}`}>
          {!shouldLoad ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center bg-[#0a0a0a]">
              <div className="sl-chart-watermark sl-chart-watermark--center" aria-hidden>
                <SentinelChartMark size={64} />
              </div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#fafafa]">
                Chart standby
              </p>
              <p className="max-w-md text-[11px] leading-relaxed text-[#737373] font-mono">
                Loaded on demand to keep token signals snappy. Click below to stream live price action.
              </p>
              <button
                type="button"
                onClick={() => setShouldLoad(true)}
                className="btn-primary"
              >
                Load chart
              </button>
            </div>
          ) : null}

          {shouldLoad && iframeUrl ? (
            <>
              {isFrameLoading ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-[#0a0a0a]/85 font-mono text-xs text-[#a3a3a3]">
                  <Loader2 size={14} className="animate-spin text-[#fef08a]" />
                  Streaming chart…
                </div>
              ) : null}
              <iframe
                src={iframeUrl}
                loading="lazy"
                className="sl-chart-iframe"
                title="Sentinel · Token Chart"
                onLoad={() => setIsFrameLoading(false)}
              />
              <div className="sl-chart-watermark sl-chart-watermark--corner" aria-hidden>
                <SentinelChartMark size={28} />
                <span className="font-mono text-[8px] uppercase tracking-[0.22em] text-[#fef08a]/70 mt-1">
                  Sentinel
                </span>
              </div>
            </>
          ) : null}
        </div>

        <div className="sl-chart-footer">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#525252]">
            Aggregated DEX price action
          </span>
          <a
            href={dexUrl}
            target="_blank"
            rel={EXTERNAL_ANCHOR_REL}
            className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#737373] hover:text-[#fef08a] inline-flex items-center gap-1"
            title="View markets in a new tab"
          >
            Open in browser <ExternalLink size={9} />
          </a>
        </div>
      </div>

      <style jsx>{`
        .sl-chart-shell {
          width: 100%;
        }
        .sl-chart-container {
          background: #0a0a0a;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-top: 1px solid rgba(250, 204, 21, 0.22);
          overflow: hidden;
        }
        .sl-chart-container--fs {
          width: 100vw;
          height: 100vh;
          display: flex;
          flex-direction: column;
        }
        .sl-chart-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 14px;
          background: linear-gradient(180deg, rgba(250, 204, 21, 0.06), transparent);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          flex-wrap: wrap;
        }
        .sl-chart-mark {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        :global(.sl-chart-tf-pill) {
          height: 24px;
          padding: 0 9px;
          font-family: var(--font-jetbrains-mono), monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.12em;
          color: #a3a3a3;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.10);
          cursor: pointer;
          transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
        }
        :global(.sl-chart-tf-pill:hover) {
          border-color: rgba(37, 99, 235, 0.45);
          color: #fafafa;
        }
        :global(.sl-chart-tf-pill--active) {
          background: rgba(37, 99, 235, 0.1);
          border-color: #2563eb;
          color: #60a5fa;
        }
        :global(.sl-chart-fs-btn) {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          height: 24px;
          padding: 0 9px;
          font-family: var(--font-jetbrains-mono), monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.14em;
          color: #fef08a;
          background: rgba(250, 204, 21, 0.08);
          border: 1px solid rgba(250, 204, 21, 0.55);
          cursor: pointer;
          transition: background 120ms ease, border-color 120ms ease;
        }
        :global(.sl-chart-fs-btn:hover) {
          background: rgba(250, 204, 21, 0.16);
          border-color: rgba(250, 204, 21, 0.85);
        }
        .sl-chart-body {
          position: relative;
          background: #0a0a0a;
        }
        .sl-chart-body--fs {
          flex: 1;
          height: auto;
        }
        :global(.sl-chart-iframe) {
          width: 100%;
          height: 100%;
          border: 0;
          display: block;
        }
        .sl-chart-watermark {
          pointer-events: none;
        }
        .sl-chart-watermark--corner {
          position: absolute;
          right: 14px;
          bottom: 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          opacity: 0.42;
          mix-blend-mode: screen;
          z-index: 5;
        }
        .sl-chart-watermark--center {
          opacity: 0.55;
        }
        .sl-chart-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 14px;
          background: #050505;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
      `}</style>
    </div>
  );
}

function SentinelChartMark({ size = 32 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <polygon
        points="16,1 25,5 31,14 31,18 25,27 16,31 7,27 1,18 1,14 7,5"
        fill="none"
        stroke="#facc15"
        strokeWidth="0.7"
        opacity="0.6"
      />
      <polygon
        points="16,7 21,9.5 24,14 24,18 21,22.5 16,25 11,22.5 8,18 8,14 11,9.5"
        fill="none"
        stroke="#facc15"
        strokeWidth="0.9"
        opacity="0.75"
      />
      <line x1="16" y1="2" x2="16" y2="16" stroke="#fef08a" strokeWidth="1.2" opacity="0.95" />
      <line x1="8" y1="16" x2="13" y2="16" stroke="#fafafa" strokeWidth="0.7" opacity="0.55" />
      <line x1="19" y1="16" x2="24" y2="16" stroke="#fafafa" strokeWidth="0.7" opacity="0.55" />
      <line x1="16" y1="19" x2="16" y2="24" stroke="#fafafa" strokeWidth="0.7" opacity="0.55" />
      <circle cx="16" cy="16" r="2.4" fill="#fef08a" />
    </svg>
  );
}
