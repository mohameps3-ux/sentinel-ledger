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

## data freshness KPI / SLO (24h)

- Scope: `GET /api/v1/ops/data-freshness` (requires `x-ops-key`).
- KPI: `data.signalsLatest.supabaseSourceRate24h` should trend above `0.80` (configurable with `SIGNALS_LATEST_SUPABASE_SLO_TARGET`).
- Review also `sourceBreakdown24h`, `fallbackReasonBreakdown24h`, and `providerUsedBreakdown24h` to identify root cause of degradations.
- Automation: daily heartbeat embeds `realRatio24h`, `supabaseSourceRate24h`, top `fallbackReason`, and top `providerUsed`.
- Alerting: `GET /api/v1/ops/signals-supabase-slo/snapshot` exposes sustained-breach state for automatic webhook alerts when rate stays below target.

## market snapshot warmup

- Scope: `GET /api/v1/ops/market-snapshot-warmup/status` and `POST /api/v1/ops/market-snapshot-warmup/run` (requires `x-ops-key`).
- Goal: keep `market_snapshots` fresh every 20-40s to avoid empty/latest gaps on burst traffic.
- If stale: verify `MARKET_SNAPSHOT_WARMUP_ENABLED=true`, tick interval, and Supabase table `market_snapshots`.

## smart signal backfill

- Scope: `GET /api/v1/ops/smart-signal-backfill/status` and `POST /api/v1/ops/smart-signal-backfill/run` (requires `x-ops-key`).
- Goal: sustain `smart_wallet_signals` density from recent `wallet_tokens` when live webhook throughput is low.
- Safety rails: `SMART_SIGNAL_BACKFILL_BATCH`, `SMART_SIGNAL_BACKFILL_DEDUPE_MINUTES`, and min win-rate filter.
- If over-inserting: reduce batch, increase dedupe minutes, or set `SMART_SIGNAL_BACKFILL_ENABLED=false`.
