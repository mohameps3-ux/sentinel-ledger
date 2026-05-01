import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Clock } from "lucide-react";
import { readRecentTokens, formatRelativeTime, RECENT_TOKEN_TTL_HOURS } from "../../lib/recentTokens";
import { useMarketStore } from "../../lib/store/marketStore";

/**
 * Left sidebar shown alongside the token chart.
 *
 * Lists every token mint the user has opened in the last 24h, sorted
 * newest first. Entries auto-expire (TTL handled in recentTokens.js).
 *
 * Read-only: never writes. Recording happens on the token page itself
 * via recordRecentToken().
 *
 * Visual: institutional dark surface, mono font, blue accent for the
 * currently-active mint, pulse for entries < 5 min old.
 *
 * terminalMode: minimal list rows for /token terminal layout (tpt-l-row).
 */
function shortMint(addr) {
  if (!addr || typeof addr !== "string" || addr.length < 12) return addr || "";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function RecentTokensSidebar({
  activeMint,
  activeAddress,
  terminalMode = false,
  filterMode = "ALL",
  searchQuery = "",
  ..._rest
}) {
  const mintKey = activeMint ?? activeAddress ?? "";
  const [items, setItems] = useState([]);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const scores = useMarketStore((s) => s.scores);

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

  const filteredTerminal = useMemo(() => {
    const getDisplayScore = useMarketStore.getState().getDisplayScore;
    return (items ?? []).filter((tok) => {
      const sym = (tok.symbol ?? tok.name ?? "").toLowerCase();
      const mint = tok.mint ?? tok.address ?? "";

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!sym.includes(q) && !mint.toLowerCase().includes(q)) return false;
      }

      if (filterMode === "ALL") return true;

      const live = scores.get(tok.mint);
      const now = Date.now();
      const sc =
        getDisplayScore(tok.mint, now) ??
        (Number.isFinite(Number(tok._currentScore)) ? Number(tok._currentScore) : null) ??
        (Number.isFinite(Number(tok.sentinelScore)) ? Number(tok.sentinelScore) : 0);

      const rawAge =
        live?.poolAgeMinutes ?? live?.ageMin ?? live?.pool_age_minutes ?? tok.poolAgeMinutes ?? tok.ageMin;
      const age = Number.isFinite(Number(rawAge)) ? Number(rawAge) : 9999;

      if (filterMode === "HOT") return sc >= 75;
      if (filterMode === "EARLY") return age < 60;
      if (filterMode === "WATCH") return sc >= 50 && sc < 75;
      return true;
    });
  }, [items, scores, filterMode, searchQuery]);

  if (terminalMode) {
    if (!mounted) {
      return (
        <div className="px-3 py-4">
          <p className="text-[10px] font-mono text-[#525252]">Loading…</p>
        </div>
      );
    }
    if (!items.length) {
      return (
        <div className="px-3 py-6">
          <p className="text-[10px] font-mono text-[#525252] leading-relaxed">
            No tokens analyzed yet.
            <br />
            Open a token to start tracking your last {RECENT_TOKEN_TTL_HOURS} hours.
          </p>
        </div>
      );
    }
    if (!filteredTerminal.length) {
      return (
        <div className="px-3 py-6">
          <p className="text-[10px] font-mono text-[#525252] leading-relaxed">No tokens match this filter.</p>
        </div>
      );
    }
    return (
      <ul className="list-none p-0 m-0">
        {filteredTerminal.map((row) => {
          const isActive = mintKey && row.mint === mintKey;
          const sym = row.symbol || shortMint(row.mint);
          const initials = (sym || "?").slice(0, 2).toUpperCase();
          return (
            <li key={row.mint}>
              <Link
                href={`/token/${row.mint}`}
                className={`tpt-l-row ${isActive ? "tpt-l-row-active" : ""}`}
              >
                <div className="tpt-l-row-left min-w-0">
                  <span className="tpt-tok-img tpt-tok-initials">{initials}</span>
                  <div className="min-w-0">
                    <div className="tpt-tok-sym">${sym}</div>
                    <div className="tpt-tok-name">{row.name && row.name !== row.symbol ? row.name : shortMint(row.mint)}</div>
                  </div>
                </div>
                <span className="tpt-score-na">—</span>
                <span className="tpt-score-na">—</span>
                <span className="tpt-age">{formatRelativeTime(row.viewedAt)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <aside className="sl-recent-sidebar">
      <div className="sl-recent-head">
        <div className="flex items-center gap-2">
          <Clock size={11} className="text-blue-300" />
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
            const isActive = mintKey && row.mint === mintKey;
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
          border-top: 1px solid rgba(37, 99, 235, 0.18);
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
            rgba(37, 99, 235, 0.32),
            rgba(37, 99, 235, 0.08) 60%,
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
          background: rgba(37, 99, 235, 0.05);
        }
        :global(.sl-recent-item--active) {
          background: rgba(37, 99, 235, 0.10);
          box-shadow: inset 2px 0 0 #2563eb;
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
