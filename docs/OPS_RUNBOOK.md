# Sentinel Ops Runbook

## Supabase RLS — Security Advisor (`wallet_behavior_stats`, `wallet_coordination_pairs`, `coordination_outcomes`)

- **Síntoma:** Security Advisor → “RLS Disabled in Public” en `public.wallet_behavior_stats` y/o `public.wallet_coordination_pairs` (a veces el título menciona otra tabla vecina).
- **Qué hace la app:** el API usa `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS). Activar RLS **sin** políticas para `anon`/`authenticated` = deny-by-default en PostgREST; no rompe el backend.
- **Aplicar 014 (+ cadena si hace falta):**
  - Con URI: `npm run db:ensure-signal-performance --prefix backend` (orden **002 → 003 → 011 → 010 → 012 → 013 → 014** … hasta **017** si aplica Stalker F4; ver cabecera de `applySignalPerformanceSchema.js`).
  - Railway (env inyectado): `railway run npm run db:ensure-signal-performance` desde `backend/` o la variante documentada en `HANDOFF.md` §6b.
  - Supabase CLI: `supabase db push` si el proyecto enlaza estas migraciones.
  - Sin CLI: **SQL Editor** → pegar `supabase/migrations/014_wallet_behavior_and_coordination_rls.sql` → ejecutar (tras **010**/**012** si aún no existen las tablas).
- **Comprobar:** `npm run db:verify-schema --prefix backend` — si la tabla existe y RLS está off, falla con mensaje que indica 013–014.
- **Advisor:** refresca Security Advisor tras unos minutos.

## Wallet Stalker F4 (double-down baselines, migración 017)

- **Qué aporta:** tablas `stalker_position_baselines` y `stalker_baseline_dedup` para idempotencia y ratio *current / first* notional USD (Helius + `applyStalkerDoubleDown`). Sin 017 el backend tolera errores de Supabase y no rompe el webhook; no verás `conviction: DOUBLE_DOWN` hasta que existan las tablas y **`amountUsd`** sea usable (mercado memoizado en `heliusWebhook.js`).
- **Aplicar en prod (elige uno):**
  1. **Script de migraciones:** `DATABASE_URL` o `SUPABASE_URL` + `SUPABASE_DB_PASSWORD` en `backend/.env`, luego `npm run db:ensure-signal-performance --prefix backend` (cadena **002** `wallet_stalks`, **003→016**, **017**).
  2. **Railway:** `railway run npm run db:ensure-signal-performance` desde `backend/` con el proyecto enlazado (inyecta env).
  3. **Supabase SQL Editor:** pegar `supabase/migrations/017_stalker_double_down_baselines.sql` → Run (idempotente `IF NOT EXISTS`).
- **Alineación DB ↔ app («100 %» scriptable):** el `SKIP` en `db:verify-schema` solo indica que **este** Postgres no tiene `public.wallet_stalks` (otro proyecto Supabase o sin migración 002). Para el **mismo** URI que usa Railway con Stalker activo:
  1. `npm run db:ensure-signal-performance --prefix backend` (si hiciera falta 017).
  2. `npm run db:verify-schema:stalker-ops --prefix backend` (= `verifySupabaseSchema.js --stalker-strict`): **exige** `wallet_stalks` y las dos tablas `stalker_*`; si falla, corrige `DATABASE_URL` hasta que veas `OK: table public.stalker_position_baselines` y `stalker_baseline_dedup` (no SKIP).
- **Comprobar tablas (modo laxo, CI / dev):** `npm run db:verify-schema --prefix backend` — si existe `wallet_stalks` y faltan tablas F4, falla; si no hay Stalker en esa DB, hace SKIP del bloque F4.
- **Expectativa `type` (Helius):** F4 solo corre cuando el normalizador entrega `type === 'buy'` en la pierna stalker (`stalkerDoubleDown.js`). Si en prod solo entran piernas como `swap`, veréis **F0** (pool / USD) en `enrichment` pero **no** `conviction: DOUBLE_DOWN` salvo que en el futuro se amplíe el clasificador (**F4.1** producto).
- **Checklist verificación en vivo una vez (no automatizable sin E2E):**
  1. Usuario con sesión: en `/wallet-stalker`, añadir una wallet que vaya a comprar on-chain (o ya stalkeada con actividad).
  2. Disparar una **compra** que el pipeline clasifique como `type === 'buy'` para stalker, con precio/liquidez suficientes en el memo de mercado (si `amountUsd` es null, F4 no calcula multiplicador).
  3. **Postgres:** fila en `stalker_position_baselines` para `(wallet_address, token_address)`; en `stalker_baseline_dedup` fila por firma en replays de Helius.
  4. **Cliente:** evento socket `wallet-stalk` con `enrichment` (F0 + F4); en una recompra ≥ **3×** la primera notional, `conviction === 'DOUBLE_DOWN'` y badge en la UI.

## tactical regime → PRO Telegram + Web Push (advisory)

- **Engine:** `backend/src/lib/tripleRiskRegime.cjs` (`buildTacticalRegimeForTokenResponse`) — same v1 as cockpit; do not duplicate client-only rules.
- **Service:** `backend/src/services/tacticalRegimeNotify.js` — preview; delivery via Telegram and/or VAPID Web Push (`tacticalRegimeWebPush.js`) with Redis signature + cooldown when **either** channel succeeds.
- **User opt-in:** `users.pro_alert_prefs.tacticalRegime: true` (PRO). At least one delivery channel: linked `telegram_chat_id` and/or a row in `web_push_subscriptions` (PRO alerts page, browser “Enable” after migration **015**).
- **VAPID env (required for push):** `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT` (see `backend/.env.example`). Generate: `npx web-push generate-vapid-keys` (or your secrets manager). After deploy, confirm `GET /api/v1/push/vapid-public-key` returns `ok: true` (or 503 if keys missing). **Security:** private key only on the API host (Railway); never in the frontend or in `NEXT_PUBLIC_*`. `GET /health` reports `webPushVapidKeysConfigured` (boolean) without exposing keys. Subscriptions are validated (HTTPS push endpoints, key shape), rate-limited per IP, and storage errors are not echoed from Postgres to clients.
- **Cron (optional):** `TACTICAL_REGIME_CRON_ENABLED=true` — `TACTICAL_REGIME_CRON_TICK_MS` (default 30m), `TACTICAL_REGIME_NOTIFY_COOLDOWN_SEC`, `TACTICAL_REGIME_NOTIFY_ACTIONS`, `TACTICAL_REGIME_WATCHLIST_LIMIT`. Eligible users: `pro_alerts_enabled` + `tacticalRegime` + (Telegram **or** at least one web push subscription). Health: `GET /health` → `tacticalRegimeNotify`.
- **Ops (x-ops-key):**
  - `GET /api/v1/ops/tactical-regime/notify/status`
  - `GET /api/v1/ops/tactical-regime/notify/preview?mint=<pk>`
  - `POST /api/v1/ops/tactical-regime/notify/send-test` body `{ "mint": "…", "telegramChatId": "optional", "force": false }` — `userId=ops` is not a valid UUID, so Web Push is skipped; use for Telegram smoke only.

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

## F4.9 acceptance — end-to-end proof flow

Use this sequence to formally close F4.8/F4.9 in production:

1) Verification key endpoint is live:
   - `GET /api/v1/public/freshness-export-verification-key` returns `ok=true` and `algorithm=ed25519`.

2) Produce one signed export (Ops auth required):
   - `GET /api/v1/ops/data-freshness/history/export/signed?hours=24&endpoint=signalsLatest&limit=5000`
   - Save JSON to file (for example `signed-export.json`).

3) Public verify endpoint returns PASS:
   - `POST /api/v1/ops/verify-signed-export` with full signed JSON body.
   - Expect: `valid=true`, `signatureAlgorithm=ed25519`, and all `*Matches=true`.

4) Offline verify (no ops key):
   - `cd backend`
   - `npm run ops:verify-export-offline -- --file "./signed-export.json" --key-url "https://<backend>/api/v1/public/freshness-export-verification-key"`
   - Expect process exit code `0` and `valid=true`.

If step 4 fails due to missing public key in document, use `--key-url` (script will inject `publicKeyHex` from the public endpoint before verifying).

## market snapshot warmup

- Scope: `GET /api/v1/ops/market-snapshot-warmup/status` and `POST /api/v1/ops/market-snapshot-warmup/run` (requires `x-ops-key`).
- Goal: keep `market_snapshots` fresh every 20-40s to avoid empty/latest gaps on burst traffic.
- If stale: verify `MARKET_SNAPSHOT_WARMUP_ENABLED=true`, tick interval, and Supabase table `market_snapshots`.

## smart signal backfill

- Scope: `GET /api/v1/ops/smart-signal-backfill/status` and `POST /api/v1/ops/smart-signal-backfill/run` (requires `x-ops-key`).
- Goal: sustain `smart_wallet_signals` density from recent `wallet_tokens` when live webhook throughput is low.
- Safety rails: `SMART_SIGNAL_BACKFILL_BATCH`, `SMART_SIGNAL_BACKFILL_DEDUPE_MINUTES`, and min win-rate filter.
- If over-inserting: reduce batch, increase dedupe minutes, or set `SMART_SIGNAL_BACKFILL_ENABLED=false`.
