# Changelog

## 2026-04-21
- backend: `signals/latest` now guarantees non-empty output via layered fallback (`supabase` -> `dexscreener_fallback` -> `static_fallback`).
- backend: bumped cache keys to `signals/latest` v3 (`fallback` v2) to avoid serving stale empty payloads.
- backend: added controlled simulation toggle `HOME_TERMINAL_FORCE_STATIC_FALLBACK=true` to validate failover behavior safely.
- backend: added sustained `static_fallback` Ops alerting (`SIGNALS_LATEST_STATIC_ALERT_*`) and snapshot endpoint at `/api/v1/ops/signals-latest-fallback/snapshot`.
- backend: added daily Ops webhook heartbeat (`OPS_HEARTBEAT_*`) with status endpoint and on-demand trigger (`/api/v1/ops/heartbeat/*`).
- backend: phase 2 market failover hardening — separate provider breakers (`dex_hot`, `dex_token`, `birdeye_token`), 429 jitter-retry, per-mint dedupe, provider-fallback metadata, and ops freshness endpoint (`/api/v1/ops/data-freshness`).
- backend: phase 3 robustness upgrade — `signals/latest` now recovers `supabase` rows from `signal_performance` when `smart_wallet_signals` is empty, adds persistent `market_snapshots` stale-safe fallback, warmup cron (`MARKET_SNAPSHOT_WARMUP_*`), and 24h freshness SLO metadata (`supabaseSourceRate24h`, fallback/provider breakdowns).
- backend: ingestion fix + mini backfill — live webhook now persists smart buys into `smart_wallet_signals` (with dedupe), and new rate-limited backfill cron (`SMART_SIGNAL_BACKFILL_*`) with ops status/run endpoints.
- backend: added sustained SLO alerting for `signals/latest` supabase ratio (`SIGNALS_SUPABASE_SLO_ALERT_*`) with ops snapshot endpoint `/api/v1/ops/signals-supabase-slo/snapshot`.
- backend: hardening pass — moved SLO breach evaluation off request hot path, made webhook signal persistence non-blocking, and added DB-level minute-bucket uniqueness guard for `smart_wallet_signals`.
