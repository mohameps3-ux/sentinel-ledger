# Sentinel Ops Runbook

## signals/latest fallback monitoring

- Scope: `GET /api/v1/ops/signals-latest-fallback/snapshot` (requires `x-ops-key`).
- Signal to watch: `staticFallback.active` and `staticFallback.activeForMs`.
- Rule: if `staticFallback.active=true` and `activeForMs` is above the configured alert threshold, treat as upstream degradation.
- Immediate action: review upstream market providers (Dex/market feed) and provider health.
- Verify recovery: `status=healthy`, `staticFallback.active=false`, and `latest.source` back to `dexscreener_fallback` or `supabase`.

## ops webhook heartbeat

- Scope: `GET /api/v1/ops/heartbeat/status` and `POST /api/v1/ops/heartbeat/run` (requires `x-ops-key`).
- Goal: detect broken `OPS_ALERT_WEBHOOK_URL` before a real incident.
- Daily check: ensure `data.lastStats.ok=true` and `data.lastStats.statusCode` is 2xx.
- If failing: rotate webhook URL and run `POST /api/v1/ops/heartbeat/run` until status recovers.
