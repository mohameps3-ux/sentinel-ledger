import { useTerminalInfrastructureStatus } from "../../hooks/useTerminalInfrastructureStatus";

function Led({ ok }) {
  if (ok === true) {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500/85" aria-hidden />;
  }
  if (ok === false) {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-red-500/90 animate-pulse" aria-hidden />;
  }
  return <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500/80 animate-pulse" aria-hidden />;
}

/**
 * Institutional status rail for Token Scanner (compact typography, LED markers).
 */
export function ScannerStatusStrip() {
  const { state, service, live, solPrice, lastEventAgo } = useTerminalInfrastructureStatus();
  const feedLabel = live ? "LIVE" : state.loading ? "SYNC" : "DEGRADED";

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/10 bg-zinc-950/80 px-4 py-2 text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-500 backdrop-blur-md"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-zinc-400">
          <Led ok={live} />
          <span className={live ? "text-emerald-500/90" : state.loading ? "text-amber-500/90" : "text-red-500/90"}>
            {feedLabel}
          </span>
        </span>
        <span className="hidden text-zinc-600 sm:block">·</span>
        <span className="hidden truncate text-zinc-600 sm:inline">evt {lastEventAgo}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5 tabular-nums text-zinc-400">
          <span className="text-zinc-600">SOL</span>
          <span className="text-zinc-100">{Number.isFinite(solPrice) ? `$${solPrice.toFixed(2)}` : "—"}</span>
        </span>
        {[
          ["Market", service.marketOk, "Price/liquidity providers (DexScreener, Birdeye, CoinGecko)"],
          ["Supabase", service.supabase, "Database"],
          ["Redis", service.redis, "Cache"]
        ].map(([label, ok, title]) => (
          <span key={label} className="inline-flex items-center gap-1.5 text-zinc-500" title={title}>
            <Led ok={ok} />
            <span className="text-[10px] tracking-[0.12em]">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
