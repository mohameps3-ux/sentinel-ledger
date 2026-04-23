# Sentinel Ledger — Engineering Handoff

This document is for a new engineer taking control of Sentinel Ledger with minimal ramp-up time.

## 1) Product + Architecture Context

- Product: Solana-first real-time signal terminal.
- Current engineering direction: institutional-grade closed loop:
  - signal -> real outcome -> statistics -> calibration proposal.
- Explicit constraints:
  - security-first,
  - minimum maintenance/ops burden,
  - no hot-path destabilization,
  - zero additional infra cost when possible.

## 2) Repository Layout

- `backend/` Node.js + Express + Socket.IO + cron jobs.
- `frontend/` Next.js (Pages Router).
- `supabase/` schema + migrations.

Deploy model:
- Backend: Railway.
- Frontend: Vercel.

**Vercel monorepo (evitar `frontend\frontend`):** en el proyecto → Settings → General → **Root Directory** = `frontend` (exactamente eso, una vez). Con la CLI, **`vercel deploy --prod --yes` desde la raíz del repo** (no desde `frontend/`). Si el directorio de proyecto en el panel fuera `frontend/frontend`, bórralo y vuelve a escribir `frontend`. `scripts/recover-prod.ps1 -Redeploy` despliega desde la raíz del monorepo para coincidir con esa configuración.

## 3) What Is Implemented (Current State)

### Pillar 1: Algorithmic Integrity (Signed Intelligence)

Implemented:
- Ed25519 signing for `sentinel:score` in backend.
- Public key endpoint for verification.
- Frontend verification path with backward compatibility.

Key files:
- `backend/src/lib/scoreSigner.js`
- `backend/src/scoring/engine.js`
- `backend/src/routes/scoring.js`
- `frontend/lib/scoreVerifier.js`
- `frontend/hooks/useScoreSocket.js`

### Pillar 2a: Webhook Entropy Guard (Anti-flood)

Implemented:
- Shape checks, entropy checks (Shannon), per-mint hybrid limiter.
- Aggregated guard reporting and ops snapshot.
- Admin ops endpoint.

Key files:
- `backend/src/ingestion/entropyGuard.js`
- `backend/src/routes/heliusWebhook.js`
- `backend/src/routes/ops.js`

### Pillar 2b: Circuit Breaker for External Dependencies

Implemented:
- Generic in-process circuit breaker.
- Integrated in market data path (DexScreener + CoinGecko).
- Exposed degraded state in `/health/sync`.

Key files:
- `backend/src/lib/circuitBreaker.js`
- `backend/src/services/marketData.js`
- `backend/src/server.js`

### Pillar 4 Infra: Outcome Archive + Quant Feedback Loop

Implemented:
- `signal_performance` archival model.
- T+N outcome resolver cron.
- Ops summary metrics (win rate, PF, drawdown, corr, signals/combos).
- Advisory calibrator bot + cron (no live auto-apply).

Key files:
- `backend/src/services/signalPerformance.js`
- `backend/src/jobs/signalOutcomeCron.js`
- `backend/src/services/signalCalibrator.js`
- `backend/src/jobs/signalCalibratorCron.js`
- `backend/src/routes/ops.js`
- `supabase/migrations/003_signal_performance.sql`
- `supabase/schema.sql`

**Coordination T+N (market outcomes for RED alerts):** `coordination_outcomes` + cron, recurrence stats prefer this table with `signal_performance` fallback; see **§8b** for production closure. Key files: `backend/src/services/coordinationOutcomes.js`, `backend/src/jobs/coordinationOutcomeCron.js`, `walletCoordinationService.js`, `supabase/migrations/010_*.sql`, `012_coordination_outcomes.sql`.

### Ops Automation

Implemented:
- Daily 2-minute report script.
- Offline signed-export verifier script for F4.9 acceptance.

Key files:
- `backend/scripts/opsDailyReport.js`
- `backend/scripts/verifyFreshnessSignedExportOffline.js`
- `backend/package.json` (`ops:daily`, `ops:verify-export-offline`)

## 4) Critical Endpoints

Health:
- `GET /health`
- `GET /health/live`
- `GET /health/ingestion`
- `GET /health/sync`

Scoring:
- `GET /api/v1/scoring/latest/:asset`
- `GET /api/v1/scoring/public-key`

Webhooks:
- `POST /api/v1/webhooks/helius`
- `GET /api/v1/webhooks/helius/health`

Ops (requires `x-ops-key`):
- `GET /api/v1/ops/entropy-guard/snapshot`
- `GET /api/v1/ops/signal-performance/summary`
- `GET /api/v1/ops/signal-performance/calibration`
- `POST /api/v1/ops/signal-performance/calibration/run`
- `GET /api/v1/ops/wallet-coordination/outcomes` (recent T+N `coordination_outcomes` rows)

## 5) Required Environment Variables

### Must-have (system correctness)

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` (or `SUPABASE_DATABASE_URL`) — **required** to run SQL migration scripts locally/CI; **not** required for API runtime if the app only uses the Supabase HTTP client (most deployments). Set it in Railway anyway if you run `db:ensure-signal-performance` from that environment.
- `OMNI_BOT_OPS_KEY` (or `OPS_KEY` / `SENTINEL_OPS_KEY` for script fallback)
- `HELIUS_WEBHOOK_SECRET`
- `SENTINEL_SCORE_SIGNING_KEY`

### Strongly recommended

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `HELIUS_KEY`
- `OPS_ALERT_WEBHOOK_URL` (for critical ops alerts)

### Tunables already wired

- `RULE_ENTROPY_*`
- `MARKETDATA_*`
- `SIGNAL_PERF_*`
- `SIGNAL_CALIBRATOR_*`
- `COORD_OUTCOME_*`, `COORD_RECURRENCE_*` (coordination market outcomes + verified recurrence)

See `backend/.env.example` for full list.

## 6) Scripts You Will Use

- `npm run db:ensure-signal-performance`
- `npm run db:verify-schema`
- `npm run ops:daily`
- `npm run simulate:helius`

### 6b) Internal reminder — DB URL + migrations (`signal_performance`, coordination)

`applySignalPerformanceSchema.js` always loads `backend/.env` (not the shell cwd). It applies, in order: `003_signal_performance.sql`, `011_signal_performance_emission_regime.sql`, `010_wallet_coordination_alerting.sql`, `012_coordination_outcomes.sql` (012 needs 010 for the FK to `wallet_coordination_alerts`), `013_coordination_outcomes_rls.sql`, `014_wallet_behavior_and_coordination_rls.sql` (RLS on `wallet_behavior_stats` and `wallet_coordination_pairs`; Security Advisor). Empty `DATABASE_URL=` / `SUPABASE_DATABASE_URL=` lines still load as blank strings — fix with sync or set values manually.

```bash
# Fill empty DATABASE_URL in backend/.env from the linked Railway service env
cd backend && railway run npm run db:sync-database-url-from-railway

# Apply migration from monorepo root (uses backend/.env)
npm run db:ensure-signal-performance --prefix backend

# Same migration against production DB only, without touching local .env
railway run npm run db:ensure-signal-performance
```

In the Supabase SQL editor, verify `wallet_coordination_alerts` and `coordination_outcomes` exist and that `coordination_outcomes.alert_id` references `wallet_coordination_alerts(id)`.

## 7) Current Operational Blockers

1. Outcome migration requires DB URL:
   - `DATABASE_URL` (or `SUPABASE_DATABASE_URL`) must be non-empty in `backend/.env`, or run via `railway run` (see §6b).
   - From repo root: `npm run db:ensure-signal-performance --prefix backend`
2. `ops:daily` requires:
   - backend reachable at `BACKEND_URL`,
   - and ops key set.

## 8) First-Hour Takeover Runbook

```bash
# 1) Pull latest
git pull origin main

# 2) Validate backend env (critical keys)
# - SUPABASE_URL
# - SUPABASE_SERVICE_ROLE_KEY
# - DATABASE_URL
# - OMNI_BOT_OPS_KEY
# - HELIUS_WEBHOOK_SECRET
# - SENTINEL_SCORE_SIGNING_KEY

# 3) Apply migration (from monorepo root; see §6b if DATABASE_URL is empty locally)
npm run db:ensure-signal-performance --prefix backend

# 4) Start backend
npm run dev

# 5) Health checks
curl http://localhost:3000/health
curl http://localhost:3000/health/sync

# 6) Daily report
npm run ops:daily
```

## 8b) Production closure: `coordination_outcomes` (wallet coordination T+N)

Minimum to consider the feature **complete in production** (no extra code if you accept legacy behaviour):

### 1) Database (project that backs the live API)

- Run migrations **once** on that Supabase project: `npm run db:ensure-signal-performance --prefix backend` (or `node backend/scripts/applySignalPerformanceSchema.js` with `DATABASE_URL` / `SUPABASE_DATABASE_URL` set), **or** apply by hand in order: **003 → 011 → 010 → 012 → 013 → 014** (`013` = RLS `coordination_outcomes`; `014` = RLS `wallet_behavior_stats` + `wallet_coordination_pairs`; service role bypasses). **CLI alternativa:** `supabase db push` si usas el flujo Supabase CLI con estas migraciones versionadas.
- Tras **014**, revisa **Security Advisor** en Supabase: el aviso de tablas públicas sin RLS debería desaparecer tras un refresco (si aún ves hallazgos, vuelve a ejecutar el advisor).
- In SQL editor, confirm `wallet_coordination_alerts` and `coordination_outcomes` exist and the FK from 012 to alerts is valid (no error on join).

### 2) Environment (Railway / hosting)

- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (API runtime).
- Optional: `DATABASE_URL` or `SUPABASE_DATABASE_URL` only for scripts and one-off migrations (not strictly required for API process if you never run migrations from that container).
- Tune production from `backend/.env.example`: `COORD_OUTCOME_*` (horizon, pump %, cron, batch, attempts), `COORD_RECURRENCE_*`, and related coordination vars.

### 3) Operational behaviour (after deploy)

- `GET /health` → `coordinationOutcomes`: cron enabled, `lastStats` / last tick reasonable; ensure `COORD_OUTCOME_CRON_ENABLED` / `COORD_OUTCOME_ENABLED` are not accidentally `false` in prod.
- Logs: resolver should move `pending` rows to `resolved` or `failed` (entry vs outcome price via same `getMarketData` path as `signal_performance`).

### 4) Product consistency (optional)

- **No backfill by default:** alerts **before** migration have no `coordination_outcomes` row; “verified” recurrence for those still uses `signal_performance` fallback (by design). For full historical T+N market rows, you would need a **one-off backfill** script (not shipped) — or accept legacy behaviour.
- **UI:** strong coordination + verified copy lives on the **token page** via `coordination:red-signal` socket. **War home / Live** shows the same signal when the user focuses a desk mint (`?t=...`): banner + chip on the matching live card, with a link to the full token view.
- **Ops:** `GET /api/v1/ops/wallet-coordination/outcomes` lists recent `coordination_outcomes` (wired in the Ops console next to F6 alerts).

### 5) Quality gate

- Staging: at least one **RED_CONFIRM**, then wait **T+N** (`COORD_OUTCOME_HORIZON_MIN`) or force a resolution batch and confirm `outcome_pct` in `coordination_outcomes`.
- **Process:** document whether migrations run on first deploy, in CI, or manually so **012** is never skipped on a new environment.

**Tolerant behaviour if 012 is missing:** the app does not hard-fail; “verified” recurrence falls back to `signal_performance` when there is no outcome row (or if the table is missing / join returns nothing).

## 8c) Production alignment (Vercel + Railway + Supabase) — security-first

| Sitio | Acción |
|--------|--------|
| **Vercel** | Último deploy desde **`main` (HEAD)**, estado **Ready**, sin errores de build. **Root Directory = `frontend`**. El build usa el árbol completo del commit (incluye UI `84df31a` y todo lo posterior en `main`). |
| **Railway** (API) | **Redeploy** del servicio Node con el mismo **`main`** / commit que ya tiene backend + cron + rutas; variables alineadas con `backend/.env.example`. |
| **Supabase** | Aplicar **012**, **013** y **014** en el proyecto correcto (`014` = `014_wallet_behavior_and_coordination_rls.sql`: RLS en `wallet_behavior_stats` y `wallet_coordination_pairs`). Sin CLI: SQL Editor → pegar el archivo **014** y ejecutar. Luego **Security Advisor** (puede tardar un refresco). |

**Smoke producción (todo en una línea, bash / macOS / Linux)**

`OMNI_BOT_OPS_KEY` debe estar en `backend/.env` (o en el entorno del runner **sin** imprimirlo en logs). El script **nunca** muestra esa clave.

```bash
SMOKE_API_BASE_URL="https://<tu-api>.up.railway.app" \
SMOKE_STRICT_HEALTH=true \
SMOKE_REQUIRE_HTTPS=true \
SMOKE_REQUIRE_OPS_KEY=true \
npm run smoke:post-deploy --prefix backend
```

**Windows PowerShell (mismo contrato):**

```powershell
$env:SMOKE_API_BASE_URL="https://<tu-api>.up.railway.app"
$env:SMOKE_STRICT_HEALTH="true"
$env:SMOKE_REQUIRE_HTTPS="true"
$env:SMOKE_REQUIRE_OPS_KEY="true"
# OMNI_BOT_OPS_KEY en backend\.env (cargado por dotenv) o:
# $env:OMNI_BOT_OPS_KEY="…"   # solo en sesión local, no commitear
npm run smoke:post-deploy --prefix backend
```

- Con `OMNI_BOT_OPS_KEY` presente: llama `GET /api/v1/ops/wallet-coordination/outcomes` y **falla** si `degraded=true` (migraciones **012/013** o Supabase del API incorrecto).
- `SMOKE_REQUIRE_OPS_KEY=true`: falla si falta la ops key (gate CI/prod).
- **No** pegar la ops key en Slack, Discord, issues públicos, ni query strings.

**Lo que no puede hacer el agente (ni Cursor) desde el repo:** ejecutar SQL en tu proyecto Supabase, pulsar Redeploy en Railway, ni invocar la API real sin tus credenciales en **tu** entorno; eso lo haces tú o tu CI con los comandos de arriba.

**Desalineación típica**

- Front **Ready** en Vercel pero API viejo en Railway → datos incoherentes; redeploy API.
- Migración **012/013** no aplicada en el proyecto Supabase que usa el API → outcomes degradados o tabla ausente; revisar logs y `GET /health` (`coordinationOutcomes` en cuerpo). **014** ausente → avisos de RLS en Security Advisor (no suele romper el API con service role).

## 9) Safety + Security Notes

- Do not auto-apply calibrator proposals yet (advisory-only by design).
- Do not expose `.env` secrets in commits/log dumps.
- Rotate secrets if leaked outside trusted channels:
  - Supabase service key,
  - Redis token,
  - Helius key,
  - Ops key,
  - webhook secret,
  - score signing key.

## 9b) Recent Security/Ops Changelog

- `2fa14f0` — `fix(db): harden Railway CLI JSON sync on Windows`
  - Handles Windows `.cmd` invocation (`shell: true`) and UTF-8 BOM trimming in `syncDatabaseUrlToLocalEnv.js`.
- `e366bab` — `docs(ops): add DB URL runbook for signal_performance`
  - Documents DB URL sync flow and root-level `--prefix backend` commands in this handoff.
- `b246ad9` — `docs(security): document public RLS lockdown runbook`
  - Adds README guidance for Security Advisor "RLS disabled in public" remediation.
- `28ea1b9` — `chore(security): add public-schema RLS lockdown script`
  - Adds `supabase/rls_public_lockdown.sql` (including `donations`) to enforce RLS on public tables.

## 10) Recommended Next Step (After Data Accumulation)

After collecting enough resolved outcomes (target: 300+; better 500+):
- evaluate canary auto-apply with strict rollback guardrails:
  - min sample per signal,
  - bounded max delta,
  - cooldown between weight updates,
  - hard revert on performance degradation.

---

Owner handoff intent: preserve stability, maintain security posture, and continue quant feedback loop without operational surprises.

