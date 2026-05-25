import { useTerminalInfrastructureStatus } from "../../hooks/useTerminalInfrastructureStatus";

function ledClass(ok) {
  if (ok === true) return "sl-status-led sl-status-led--ok";
  if (ok === false) return "sl-status-led sl-status-led--bad";
  return "sl-status-led sl-status-led--warn";
}

export function GlobalStatusBar() {
  const { state, service, signalsToday, walletCount, activeWallets24h, live, solPrice, lastEventAgo } =
    useTerminalInfrastructureStatus();

  return (
    <div className="sl-status-bar" role="status" aria-live="polite">
      <div className="sl-status-bar__inner">
        <div className="sl-status-indicator min-w-0">
          <span className={live ? "sl-pulse-dot" : "sl-status-led sl-status-led--warn"} aria-hidden />
          <span className="text-[var(--sl-win)]">{live ? "LIVE" : state.loading ? "SYNC" : "DEGRADED"}</span>
          <span className="truncate text-[var(--sl-text-muted)]">last event {lastEventAgo}</span>
        </div>
        <div className="sl-status-bar__center truncate text-center">
          {activeWallets24h > 0
            ? <>{activeWallets24h.toLocaleString()} wallets active 24h · {signalsToday.toLocaleString()} signals today · {walletCount > 0 ? `${walletCount.toLocaleString()} universe` : "Oracle active"}</>
            : <>Smart wallet universe {walletCount > 0 ? walletCount.toLocaleString() : "—"} · {signalsToday.toLocaleString()} signals today · Oracle active</>
          }
        </div>
        <div className="sl-status-bar__right flex items-center justify-end gap-3 overflow-hidden">
          <span className="hidden sm:inline text-[var(--sl-text-muted)]">
            SOL {Number.isFinite(solPrice) ? `$${solPrice.toFixed(2)}` : "—"}
          </span>
          <span
            className="sl-status-indicator"
            title="DexScreener / Birdeye / CoinGecko circuit (from /health/sync), not Alchemy"
          >
            <span className={ledClass(service.marketOk)} />
            Market
          </span>
          <span className="sl-status-indicator">
            <span className={ledClass(service.supabase)} />
            Supabase
          </span>
          <span className="sl-status-indicator">
            <span className={ledClass(service.redis)} />
            Redis
          </span>
        </div>
      </div>
    </div>
  );
}
