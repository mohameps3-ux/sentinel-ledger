import { useEffect, useMemo, useState } from "react";
import { getPublicApiUrl } from "../../lib/publicRuntime";

const SOL_MINT = "So11111111111111111111111111111111111111112";

function timeAgo(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "no events";
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.round(min / 60)}h ago`;
}

function ledClass(ok) {
  if (ok === true) return "sl-status-led sl-status-led--ok";
  if (ok === false) return "sl-status-led sl-status-led--bad";
  return "sl-status-led sl-status-led--warn";
}

export function GlobalStatusBar() {
  const [state, setState] = useState({
    loading: true,
    sync: null,
    health: null,
    ingestion: null,
    stats: null,
    sol: null
  });

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const api = getPublicApiUrl();
        const [syncRes, healthRes, ingestionRes, statsRes, solRes] = await Promise.allSettled([
          fetch(`${api}/health/sync`, { cache: "no-store" }).then((r) => r.json()),
          fetch(`${api}/health`, { cache: "no-store" }).then((r) => r.json()),
          fetch(`${api}/health/ingestion`, { cache: "no-store" }).then((r) => r.json()),
          fetch(`${api}/api/v1/public/stats`, { cache: "no-store" }).then((r) => r.json()),
          fetch(`${api}/api/v1/tokens/quotes?mints=${SOL_MINT}`, { cache: "no-store" }).then((r) => r.json())
        ]);
        if (!alive) return;
        setState({
          loading: false,
          sync: syncRes.status === "fulfilled" ? syncRes.value : null,
          health: healthRes.status === "fulfilled" ? healthRes.value : null,
          ingestion: ingestionRes.status === "fulfilled" ? ingestionRes.value : null,
          stats: statsRes.status === "fulfilled" ? statsRes.value : null,
          sol: solRes.status === "fulfilled" ? solRes.value?.data?.[0] : null
        });
      } catch {
        if (!alive) return;
        setState((prev) => ({ ...prev, loading: false }));
      }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const service = useMemo(() => {
    const h = state.health || {};
    const sync = state.sync || {};
    return {
      alchemy: sync.marketData?.degraded === false || sync.services?.market_data === "operational",
      supabase: h.ok !== false,
      redis: h.cache === true
    };
  }, [state.health, state.sync]);

  const signalsToday = Number(state.stats?.signalsToday || 0);
  const walletsText = state.health?.smartWorkersEnabled ? "workers online" : "workers standby";
  const live = state.ingestion?.status === "LIVE" || state.sync?.status === "LIVE";
  const solPrice = Number(state.sol?.price);

  return (
    <div className="sl-status-bar" role="status" aria-live="polite">
      <div className="sl-status-bar__inner">
        <div className="sl-status-indicator min-w-0">
          <span className={live ? "sl-pulse-dot" : "sl-status-led sl-status-led--warn"} aria-hidden />
          <span className="text-[var(--sl-win)]">{live ? "LIVE" : state.loading ? "SYNC" : "DEGRADED"}</span>
          <span className="truncate text-[var(--sl-text-muted)]">last event {timeAgo(state.ingestion?.lastEventAt)}</span>
        </div>
        <div className="sl-status-bar__center truncate text-center">
          Monitoring {walletsText} · {signalsToday} signals today · Oracle active
        </div>
        <div className="flex items-center justify-end gap-3 overflow-hidden">
          <span className="hidden sm:inline text-[var(--sl-text-muted)]">
            SOL {Number.isFinite(solPrice) ? `$${solPrice.toFixed(2)}` : "—"}
          </span>
          <span className="sl-status-indicator"><span className={ledClass(service.alchemy)} />Alchemy</span>
          <span className="sl-status-indicator"><span className={ledClass(service.supabase)} />Supabase</span>
          <span className="sl-status-indicator"><span className={ledClass(service.redis)} />Redis</span>
        </div>
      </div>
    </div>
  );
}
