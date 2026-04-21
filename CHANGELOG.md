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
- backend: phase 4 foundations — added persistent `ops_data_freshness_history` storage, periodic history cron (`FRESHNESS_HISTORY_*`), and ops historical endpoint (`/api/v1/ops/data-freshness/history`).
- backend: phase 4.4 historical alerting — `data-freshness/history` cron now evaluates sustained degradation + negative trend slope for `signalsLatest` and emits cooldown-gated Ops webhook alerts (`FRESHNESS_HISTORY_ALERT_*`), exposed via `GET /api/v1/ops/data-freshness/history/status`.
- ops: phase 4.5 exportability — added CSV export endpoint (`/api/v1/ops/data-freshness/history/export`) and Ops UI quick actions to download 24h/7d historical freshness for audits and due diligence.
- ops: phase 4.6 signed evidence export — added integrity-protected JSON export endpoint (`/api/v1/ops/data-freshness/history/export/signed`) with `payloadHash` (SHA-256) and `signature` (HMAC-SHA256), plus Ops UI quick actions for 24h/7d signed downloads.
- ops: phase 4.7 public verify — shared signing/verify logic in `backend/src/lib/freshnessSignedExport.js`; public `POST /api/v1/ops/verify-signed-export` (rate-limited, 4mb JSON) returns integrity PASS/FAIL without exposing secrets; Ops UI paste-to-verify for auditors.
- ops: phase 4.8 Ed25519 exports — optional `FRESHNESS_HISTORY_EXPORT_ED25519_SEED_BASE64` switches signed exports to Ed25519 (embedded `publicKeyHex`); `GET /api/v1/public/freshness-export-verification-key` exposes the verifier key; public verify endpoint validates Ed25519 without HMAC secret.
