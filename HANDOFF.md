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

### Ops Automation

Implemented:
- Daily 2-minute report script.

Key files:
- `backend/scripts/opsDailyReport.js`
- `backend/package.json` (`ops:daily`)

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

## 5) Required Environment Variables

### Must-have (system correctness)

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` (or `SUPABASE_DATABASE_URL`)
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

See `backend/.env.example` for full list.

## 6) Scripts You Will Use

- `npm run db:ensure-signal-performance`
- `npm run db:verify-schema`
- `npm run ops:daily`
- `npm run simulate:helius`

## 7) Current Operational Blockers

1. Outcome migration requires DB URL:
   - `DATABASE_URL` is required to run:
   - `npm run db:ensure-signal-performance`
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

# 3) Apply migration
npm run db:ensure-signal-performance

# 4) Start backend
npm run dev

# 5) Health checks
curl http://localhost:3000/health
curl http://localhost:3000/health/sync

# 6) Daily report
npm run ops:daily
```

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

## 10) Recommended Next Step (After Data Accumulation)

After collecting enough resolved outcomes (target: 300+; better 500+):
- evaluate canary auto-apply with strict rollback guardrails:
  - min sample per signal,
  - bounded max delta,
  - cooldown between weight updates,
  - hard revert on performance degradation.

---

Owner handoff intent: preserve stability, maintain security posture, and continue quant feedback loop without operational surprises.

