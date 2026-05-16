import { useEffect, useMemo, useState } from "react";
import { getPublicApiUrl } from "../lib/publicRuntime";

const SOL_MINT = "So11111111111111111111111111111111111111112";

/** Format recency from /health/ingestion (`lastEventAgeMs` and/or `lastEventAt` epoch ms). */
export function terminalStatusTimeAgo(lastEventAt, lastEventAgeMs) {
  const ageMs = Number(lastEventAgeMs);
  if (Number.isFinite(ageMs) && ageMs >= 0) {
    const sec = Math.max(0, Math.round(ageMs / 1000));
    if (sec < 60) return `${sec}s ago`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m ago`;
    return `${Math.round(min / 60)}h ago`;
  }

  let t = NaN;
  if (lastEventAt != null && lastEventAt !== "") {
    if (typeof lastEventAt === "number" && Number.isFinite(lastEventAt)) {
      t = lastEventAt;
    } else {
      const parsed = Date.parse(String(lastEventAt));
      if (Number.isFinite(parsed)) t = parsed;
    }
  }
  if (!Number.isFinite(t)) return "no events";
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.round(min / 60)}h ago`;
}

/** True when L2 ingestion is healthy per backend (`status: OK`, `ok: true`). */
export function isIngestionLive(ingestion) {
  if (!ingestion || typeof ingestion !== "object") return false;
  if (ingestion.ok === false) return false;
  const status = String(ingestion.status || "").toUpperCase();
  if (status === "DEGRADED" || status === "WAITING") return false;
  if (status === "OK" || status === "LIVE") return true;
  if (ingestion.ok === true) return true;
  const ageMs = Number(ingestion.lastEventAgeMs);
  return Number.isFinite(ageMs) && ageMs <= 60_000;
}

/**
 * Shared poller for SOL quote + sync/health/ingestion (same footprint as GlobalStatusBar).
 */
export function useTerminalInfrastructureStatus() {
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
      /** Dex/Birdeye/CoinGecko circuit via /health/sync — not Alchemy RPC */
      marketOk:
        sync.marketData?.degraded === false || sync.services?.market_data === "operational",
      supabase: h.ok !== false,
      redis: h.cache === true
    };
  }, [state.health, state.sync]);

  const signalsToday = Number(state.stats?.signalsToday || 0);
  const walletCount = Number(
    state.stats?.activeWallets ??
      state.stats?.smartWallets ??
      state.ingestion?.walletsTracked ??
      state.ingestion?.walletCount ??
      state.health?.smartWallets ??
      0
  );
  const live = isIngestionLive(state.ingestion);
  const solPrice = Number(state.sol?.price);
  const ingestion = state.ingestion;

  return {
    state,
    service,
    signalsToday,
    walletCount,
    live,
    solPrice,
    lastEventAgo: terminalStatusTimeAgo(ingestion?.lastEventAt, ingestion?.lastEventAgeMs)
  };
}
