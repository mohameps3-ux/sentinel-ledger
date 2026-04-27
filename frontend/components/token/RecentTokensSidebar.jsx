import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Clock } from "lucide-react";
import { readRecentTokens, formatRelativeTime, RECENT_TOKEN_TTL_HOURS } from "../../lib/recentTokens";

/**
 * Left sidebar shown alongside the token chart.
 *
 * Lists every token mint the user has opened in the last 24h, sorted
 * newest first. Entries auto-expire (TTL handled in recentTokens.js).
 *
 * Read-only: never writes. Recording happens on the token page itself
 * via recordRecentToken().
 *
 * Visual: institutional dark surface, mono font, amber accent for the
 * currently-active mint, pulse for entries < 5 min old.
 */
function shortMint(addr) {
  if (!addr || typeof addr !== "string" || addr.length < 12) return addr || "";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function RecentTokensSidebar({ activeMint }) {
  const [items, setItems] = useState([]);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    setItems(readRecentTokens());
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setItems(readRecentTokens());
  }, [mounted, router.asPath]);

  useEffect(() => {
    if (!mounted) return;
    const id = setInterval(() => setItems(readRecentTokens()), 60000);
    return () => clearInterval(id);
  }, [mounted]);

  return (
    <aside className="sl-recent-sidebar">
      <div className="sl-recent-head">
        <div className="flex items-center gap-2">
          <Clock size={11} className="text-[#fbbf24]" />
          <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.2em] text-[#a3a3a3]">
            Recent · {RECENT_TOKEN_TTL_HOURS}h
          </span>
        </div>
        <p className="mt-1 text-[9px] font-mono text-[#737373] tracking-wide">
          {items.length} {items.length === 1 ? "mint" : "mints"} analyzed
        </p>
      </div>

      <div className="sl-recent-divider" aria-hidden />

      {!mounted ? (
        <div className="px-3 py-4">
          <p className="text-[10px] font-mono text-[#525252]">Loading…</p>
        </div>
      ) : !items.length ? (
        <div className="px-3 py-6">
          <p className="text-[10px] font-mono text-[#525252] leading-relaxed">
            No tokens analyzed yet.<br />
            Open a token to start tracking your last {RECENT_TOKEN_TTL_HOURS} hours.
          </p>
        </div>
      ) : (
        <ul className="sl-recent-list">
          {items.map((row) => {
            const isActive = activeMint && row.mint === activeMint;
            const ageMin = Math.floor((Date.now() - row.viewedAt) / 60000);
            const isFresh = ageMin < 5;
            return (
              <li key={row.mint}>
                <Link
                  href={`/token/${row.mint}`}
                  className={`sl-recent-item ${isActive ? "sl-recent-item--active" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate font-mono text-[11px] font-semibold text-[#fafafa]">
                      {row.symbol || shortMint(row.mint)}
                    </span>
                    <span className="shrink-0 font-mono text-[9px] text-[#737373]">
                      {formatRelativeTime(row.viewedAt)}
                    </span>
                  </div>
                  {row.name && row.name !== row.symbol ? (
                    <p className="mt-0.5 truncate font-mono text-[9px] text-[#737373] leading-tight">
                      {row.name}
                    </p>
                  ) : (
                    <p className="mt-0.5 truncate font-mono text-[9px] text-[#525252] leading-tight">
                      {shortMint(row.mint)}
                    </p>
                  )}
                  {isFresh && !isActive ? (
                    <span className="sl-recent-fresh-dot" aria-hidden />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <style jsx>{`
        .sl-recent-sidebar {
          background: linear-gradient(180deg, #0d0d0d, #0a0a0a);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-top: 1px solid rgba(245, 158, 11, 0.18);
          width: 100%;
          max-height: calc(100vh - 140px);
          overflow-y: auto;
          position: sticky;
          top: calc(var(--sl-nav-actual, 52px) + 8px);
        }
        .sl-recent-head {
          padding: 12px 14px 10px;
        }
        .sl-recent-divider {
          height: 1px;
          background: linear-gradient(
            90deg,
            rgba(245, 158, 11, 0.32),
            rgba(245, 158, 11, 0.08) 60%,
            transparent
          );
        }
        .sl-recent-list {
          list-style: none;
          padding: 6px 0;
          margin: 0;
        }
        .sl-recent-list li + li {
          border-top: 1px solid rgba(255, 255, 255, 0.04);
        }
        :global(.sl-recent-item) {
          display: block;
          padding: 8px 14px;
          text-decoration: none !important;
          position: relative;
          transition: background 120ms ease;
        }
        :global(.sl-recent-item:hover) {
          background: rgba(245, 158, 11, 0.05);
        }
        :global(.sl-recent-item--active) {
          background: rgba(245, 158, 11, 0.10);
          box-shadow: inset 2px 0 0 #f59e0b;
        }
        .sl-recent-fresh-dot {
          position: absolute;
          top: 10px;
          right: 6px;
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: #10b981;
          box-shadow: 0 0 6px rgba(16, 185, 129, 0.7);
          animation: sl-recent-pulse 2.4s ease-in-out infinite;
        }
        @keyframes sl-recent-pulse {
          0%, 100% { opacity: 0.55; transform: scale(0.85); }
          50%      { opacity: 1;    transform: scale(1.15); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sl-recent-fresh-dot { animation: none; }
        }
      `}</style>
    </aside>
  );
}
