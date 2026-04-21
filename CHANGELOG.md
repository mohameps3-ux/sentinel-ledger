# Changelog

## 2026-04-21
- backend: `signals/latest` now guarantees non-empty output via layered fallback (`supabase` -> `dexscreener_fallback` -> `static_fallback`).
- backend: bumped cache keys to `signals/latest` v3 (`fallback` v2) to avoid serving stale empty payloads.
- backend: added controlled simulation toggle `HOME_TERMINAL_FORCE_STATIC_FALLBACK=true` to validate failover behavior safely.
- backend: added sustained `static_fallback` Ops alerting (`SIGNALS_LATEST_STATIC_ALERT_*`) and snapshot endpoint at `/api/v1/ops/signals-latest-fallback/snapshot`.
- backend: added daily Ops webhook heartbeat (`OPS_HEARTBEAT_*`) with status endpoint and on-demand trigger (`/api/v1/ops/heartbeat/*`).
