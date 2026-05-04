import { useTerminalInfrastructureStatus, terminalStatusTimeAgo } from "../../hooks/useTerminalInfrastructureStatus";

function ledClass(ok) {
  if (ok === true) return "sl-status-led sl-status-led--ok";
  if (ok === false) return "sl-status-led sl-status-led--bad";
  return "sl-status-led sl-status-led--warn";
}

export function GlobalStatusBar() {
  const { state, service, signalsToday, walletCount, live, solPrice } = useTerminalInfrastructureStatus();

  return (
    <div className="sl-status-bar" role="status" aria-live="polite">
      <div className="sl-status-bar__inner">
        <div className="sl-status-indicator min-w-0">
          <span className={live ? "sl-pulse-dot" : "sl-status-led sl-status-led--warn"} aria-hidden />
          <span className="text-[var(--sl-win)]">{live ? "LIVE" : state.loading ? "SYNC" : "DEGRADED"}</span>
          <span className="truncate text-[var(--sl-text-muted)]">last event {terminalStatusTimeAgo(state.ingestion?.lastEventAt)}</span>
        </div>
        <div className="sl-status-bar__center truncate text-center">
          Monitoring {Number.isFinite(walletCount) ? walletCount : 0} wallets · {signalsToday} signals today · Oracle active
        </div>
        <div className="sl-status-bar__right flex items-center justify-end gap-3 overflow-hidden">
          <span className="hidden sm:inline text-[var(--sl-text-muted)]">
            SOL {Number.isFinite(solPrice) ? `$${solPrice.toFixed(2)}` : "—"}
          </span>
          <span className="sl-status-indicator">
            <span className={ledClass(service.alchemy)} />
            Alchemy
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
