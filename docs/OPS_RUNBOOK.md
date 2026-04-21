# Sentinel Ops Runbook

## signals/latest fallback monitoring

- Scope: `GET /api/v1/ops/signals-latest-fallback/snapshot` (requires `x-ops-key`).
- Signal to watch: `staticFallback.active` and `staticFallback.activeForMs`.
- Rule: if `staticFallback.active=true` and `activeForMs` is above the configured alert threshold, treat as upstream degradation.
- Immediate action: review upstream market providers (Dex/market feed) and provider health.
- Verify recovery: `status=healthy`, `staticFallback.active=false`, and `latest.source` back to `dexscreener_fallback` or `supabase`.
