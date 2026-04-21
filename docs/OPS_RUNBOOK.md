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

## data freshness history (phase 4)

- Scope:
  - `GET /api/v1/ops/data-freshness/history?hours=24&endpoint=signalsLatest`
  - `GET /api/v1/ops/data-freshness/history/export?hours=24&endpoint=signalsLatest` (CSV)
  - `GET /api/v1/ops/data-freshness/history/export/signed?hours=24&endpoint=signalsLatest` (JSON + SHA256 + HMAC)
  - `POST /api/v1/ops/verify-signed-export` (public, no `x-ops-key`: full signed JSON body → `{ valid, hashMatches, proofInputMatches, signatureMatches }`)
  - `GET /api/v1/ops/data-freshness/history/status`
  - `POST /api/v1/ops/data-freshness/history/run`
- Goal: persist and query historical freshness/SLO metrics across restarts and deploys.
- Cron config: `FRESHNESS_HISTORY_CRON_ENABLED`, `FRESHNESS_HISTORY_TICK_MS`, `FRESHNESS_HISTORY_RETENTION_DAYS`.
- Verify: status endpoint reports successful inserts and pruning, and history endpoint returns time-ordered rows.
- Signed export config: `FRESHNESS_HISTORY_EXPORT_SIGNING_KEY` (falls back to `OMNI_BOT_OPS_KEY` if unset).
- Integrity fields to archive with exports: `payloadHash`, `proofInput`, `signature`.
- Public verify (F4.7): `FRESHNESS_HISTORY_VERIFY_*` controls enablement, rate limit window, max requests per window, and max rows accepted per verify. **Trust model:** with HMAC, third parties verify by asking *your* honest server (secret stays server-side). For offline / trust-minimized verification, configure **Ed25519** (see `freshness export Ed25519 (F4.8)` below).

## freshness export Ed25519 (F4.8)

- When `FRESHNESS_HISTORY_EXPORT_ED25519_SEED_BASE64` is set (32-byte seed, base64), `GET /api/v1/ops/data-freshness/history/export/signed` uses **Ed25519** detached signatures over UTF-8 `integrity.proofInput` (same `payloadHash` / `proofInput` contract as HMAC exports).
- Public key (no auth): `GET /api/v1/public/freshness-export-verification-key` — use with `tweetnacl.sign.detached.verify` for offline verification. Optional `FRESHNESS_HISTORY_EXPORT_ED25519_PUBLIC_BASE64` if you publish the key without keeping the seed on the same host.
- `POST /api/v1/ops/verify-signed-export` accepts both `signatureAlgorithm: ed25519` and `hmac-sha256` documents. For Ed25519, the server can verify using only the **public** key (env or embedded `publicKeyHex`); if both env and document embed a key, they must match.
- Generate a seed once (example): `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` — store only in the secrets manager / Railway variables.
- Historical alerting (F4.4): `data.trendAlert` in the status response now evaluates sustained degradation (`rate < target` for multiple points) plus negative slope.
- Alert config: `FRESHNESS_HISTORY_ALERT_*` controls lookback, minimum points, sustained points, slope threshold, min request volume, and cooldown.
- Trigger meaning: when `trendAlert.breach.active=true`, quality is not only below target now, it is also getting worse over time.

## market snapshot warmup

- Scope: `GET /api/v1/ops/market-snapshot-warmup/status` and `POST /api/v1/ops/market-snapshot-warmup/run` (requires `x-ops-key`).
- Goal: keep `market_snapshots` fresh every 20-40s to avoid empty/latest gaps on burst traffic.
- If stale: verify `MARKET_SNAPSHOT_WARMUP_ENABLED=true`, tick interval, and Supabase table `market_snapshots`.

## smart signal backfill

- Scope: `GET /api/v1/ops/smart-signal-backfill/status` and `POST /api/v1/ops/smart-signal-backfill/run` (requires `x-ops-key`).
- Goal: sustain `smart_wallet_signals` density from recent `wallet_tokens` when live webhook throughput is low.
- Safety rails: `SMART_SIGNAL_BACKFILL_BATCH`, `SMART_SIGNAL_BACKFILL_DEDUPE_MINUTES`, and min win-rate filter.
- If over-inserting: reduce batch, increase dedupe minutes, or set `SMART_SIGNAL_BACKFILL_ENABLED=false`.
