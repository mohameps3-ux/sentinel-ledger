# Sentinel Ledger — Handoff técnico (ingeniería)

Documento vivo para **ingenieros y programadores**: arquitectura, rutas HTTP, parámetros habituales, jobs, datos y frontend. La fuente de verdad sigue siendo el código; aquí se resume lo esencial.

**Relacionado:** `README.md` (local, Supabase, deploy, smoke), `backend/.env.example` (todas las variables).

---

## 1. Monorepo

| Directorio | Rol |
|------------|-----|
| `frontend/` | Next.js (pages router), Tailwind, TanStack Query, Zustand. Deploy típico: **Vercel** (Root Directory = `frontend`). |
| `backend/` | Express + Socket.IO, crons, workers, Supabase + Redis. Deploy típico: **Railway** (Root Directory = `backend`). |
| `supabase/` | `schema.sql`, migraciones numeradas, bundles RLS/payments. |

**Importante:** El código del backend en Git se despliega en Railway; **las políticas SQL / migraciones** se aplican en Postgres (SQL Editor, scripts `npm run db:*`, etc.) cuando corresponda.

---

## 2. Flujo de datos (resumen)

```
Helius webhook / Solana poller / Flipside / crons
  → ingesta + dedupe + estado ingestion
  → scoring (Redis) + signal emission gate + token state machine
  → Postgres (señales, performance, wallets, snapshots, coordinación…)
  → homeTerminalApi (cache Redis, freshness, SLO)
  → REST /api/v1/* y /api/v1/public/*
  → Socket.IO (narrativas, rooms por mint/usuario)
  → Next.js (React Query + sockets donde aplique)
```

---

## 3. Autenticación

- **Wallet Solana:** `POST /api/v1/auth/nonce` → mensaje firmable; `POST /api/v1/auth/login` con firma → **JWT** (`Authorization: Bearer …`, 7d).
- **`authMiddleware`:** adjunta `req.user` con `userId`, `wallet`, contexto Stripe/subscription (`hasProAccess`, etc.).
- **`requirePro`:** 403 si no hay acceso PRO activo.

---

## 4. Ops (`OMNI_BOT_OPS_KEY`)

Todas las rutas bajo `/api/v1/ops/*` (salvo las que el código exponga sin auth) usan header:

```http
x-ops-key: <OMNI_BOT_OPS_KEY>
```

Sin key configurada → **503** `ops_key_not_configured`. Key incorrecta → **401**.

---

## 5. Referencia HTTP — salud

| Método | Ruta | Respuesta |
|--------|------|-----------|
| GET | `/health/live` | Proceso vivo; `commit` si hay vars Railway/Vercel. |
| GET | `/health` | Agregado de crons, Redis, gates. **503** si faltan secretos críticos (`HELIUS_WEBHOOK_SECRET`, Stripe key + webhook secret\*). |
| GET | `/health/ingestion` | Estado feed ingesta (siempre 200; revisar `status`). |
| GET | `/health/sync` | Sync + market data + ratios freshness. |

---

## 6. Referencia HTTP — auth / usuario / billing

### `/api/v1/auth`

| Método | Ruta | Body | Respuestas |
|--------|------|------|------------|
| POST | `/nonce` | `{ walletAddress }` | `{ nonce, message }` |
| POST | `/login` | `{ walletAddress, publicKey, signature, message }` | `{ token, user }` o 400/401/503 |

### `/api/v1/user`

| Método | Ruta | Auth |
|--------|------|------|
| GET | `/status` | Bearer |

### Billing (montado en `/api/v1`, no bajo `/billing`)

| Método | Ruta | Body | Notas |
|--------|------|------|--------|
| POST | `/create-checkout-session` | `{ plan }` — `pro` \| `super_pro` \| `lifetime` | Stripe Checkout URL |
| POST | `/create-portal-session` | — | Portal cliente Stripe |
| POST | `/create-customer-portal` | — | Alias del anterior |

### Stripe webhook (raw JSON body)

| POST | `/api/v1/stripe-webhook` |
| POST | `/api/v1/webhooks/stripe` | alias |

---

## 7. Referencia HTTP — señales (`/api/v1/signals`)

Limiter: `publicTerminalLimiter` (middleware del router).

| Método | Ruta | Query / notas |
|--------|------|----------------|
| GET | `/outcomes` | `hours` (24–168, default 168), `recent` (1–25, default 10). Proof of edge cache ~3m. |
| GET | `/desk-proof-of-edge` | `mint` (opcional pubkey), `confidence` (0–100 opcional), `regime` (string opcional). |
| GET | `/track-record` | `filter` (`all`, `wins`, `losses`, `pending`, …), `page`, `limit` (max 50). Redis + Cache-Control. |
| GET | `/latest` | `limit` (cap por env), `strategy` = `balanced` \| `conservative` \| `aggressive`, `token` (filtro símbolo/mint), `format=array` → solo array. |
| GET | `/history` | `limit` (1–80, default 30). Últimas 24h `smart_wallet_signals`. |
| GET | `/graveyard` | `from`, `to` (ISO), `outcome` (`ALL`, `WIN`, `LOSS`, …), `limit` (10–300, default 120). Usa columnas extrema si existen (migración 016). |

Errores típicos: **503** `supabase_unconfigured`; **500** con `ok: false`.

---

## 8. Referencia HTTP — tokens

| Método | Ruta | Query |
|--------|------|--------|
| GET | `/api/v1/tokens/hot` | `limit` (1–24, default 12), `narrative` (tag, filtra `narrativeTags`). |
| GET | `/api/v1/tokens/quotes` | `mints` = lista coma/espacio de pubkeys (max 16 valid).

### `/api/v1/token`

| GET | `/trending` | Lista trending (servicio `fetchTrendingList`). |
| GET | `/:address` | Detalle token: `marketData`, análisis, holders, deployer, smart money, convergencia, oracle rules. **400** `invalid_address`, **404** token no encontrado. Auth opcional para watchlist privada. |

---

## 9. Referencia HTTP — smart wallets

| Método | Ruta | Query / params | Auth |
|--------|------|----------------|------|
| GET | `/api/v1/smart-wallets/top` | `limit` (1–50, default 20) | Público (limiter) |
| GET | `/api/v1/smart-wallets/:address` | `:address` = **mint del token** (lista wallets smart en ese token vía `getSmartWalletsForToken`) | Bearer + **PRO** |

---

## 10. Referencia HTTP — watchlist / portfolio / stalker

### `/api/v1/watchlist` (Bearer)

| GET | `/` |
| POST | `/` body: token + campos |
| DELETE | `/:tokenAddress` |
| PATCH | `/:tokenAddress/note` |

### `/api/v1/portfolio`

| GET | `/watchlist-markets` | `limit` (1–40). Dex snapshot por fila watchlist (no PnL verificado on-chain). |

### `/api/v1/wallet-stalker` (Bearer)

| GET | `/` | Lista `wallet_stalks` activos |
| POST | `/` | `{ wallet }` pubkey; free max 3 activos sin PRO |
| DELETE | `/:wallet` | Soft `is_active: false` |

---

## 11. Referencia HTTP — scoring

| Método | Ruta | Respuesta |
|--------|------|-----------|
| GET | `/api/v1/scoring/public-key` | Info clave Ed25519 para verificar firmas de score |
| GET | `/api/v1/scoring/latest/:asset` | Cache Redis `scoring:latest:{asset}`. **400** asset inválido, **404** sin cache, **503** Redis |

---

## 12. Referencia HTTP — narrativa wallet (`/api/v1/wallets`)

Limiter dedicado. Todas GET:

| Ruta | Descripción breve |
|------|-------------------|
| `/:address/summary` | Resumen |
| `/:address/narrative` | Narrativa |
| `/:address/behavior` | Comportamiento |
| `/:address/behavior/tokens` | Por token |

---

## 13. Referencia HTTP — NLU

| POST | `/api/v1/nlu/query` | Body: `{ query?, intent?, entities? }` (max ~16KB). **413** payload grande |

---

## 14. Referencia HTTP — superficie pública (`/api/v1/public`)

| GET | Ruta | Query |
|-----|------|--------|
| `/stats` | Métricas onboarding (señales hoy, top wallet, …) |
| `/freshness-export-verification-key` | Clave pública Ed25519 exports |
| `/track-record` | `filter`, `limit` (20–200, default 80) — oracle + rule_performance |
| `/signals-24h` | Histórico 24h plano |
| `/wallet-labels` | `addresses` = coma (max ~80) |
| `/smart-wallets-leaderboard` | (ver implementación en `publicSurface.js`) |
| `/smart-money-activity` | Actividad agregada |

---

## 15. Referencia HTTP — alerts / push / telemetry / bot / trial

### `/api/v1/alerts` (Bearer; muchas rutas PRO)

- `GET /feed`, `GET /settings`, `PATCH /settings`, `POST /telegram/auth`, …

### `/api/v1/push`

- `GET /vapid-public-key` (limiter)
- `GET /status`, `POST /subscribe`, `POST /unsubscribe` — Bearer + PRO + limiters

### `/api/v1/telemetry`

- `POST /client`
- `GET /client/summary` — ops auth según código

### `/api/v1/bot`

- `POST /message`, `POST /feedback` — árbol soporte, sin LLM externo obligatorio

### `/api/v1/trial`

- `GET /status` — opcional header `x-fp-hash`
- `POST /start` — `{ fingerprintHash? }`

---

## 16. Referencia HTTP — webhooks Helius (`/api/v1/webhooks`)

| GET | `/helius/health` |
| GET | `/helius/entropy-guard` | ops |
| POST | `/helius` | Ingesta principal (auth webhook) |

---

## 17. Referencia HTTP — omni bots (`/api/v1/bots/omni`)

| GET | `/health` |
| POST | `/inbound` | auth inbound |
| POST | `/alerts/broadcast` | ops |
| GET/PATCH | `/tickets`, `/tickets/:id` | ops |
| GET | `/events`, `/diagnostics` | ops |
| POST | `/pro-alerts/run-tick` | ops |

---

## 18. Referencia HTTP — Ops (`/api/v1/ops/*`)

Todas requieren **`x-ops-key`** salvo que el código documente otra cosa.

Incluye (lista funcional): snapshots entropy-guard, signals-latest-fallback, signals-supabase-slo, data-freshness (+ history, export, export/signed, status, POST run), heartbeat, market-snapshot-warmup, wallet-behavior (+ top), wallet-coordination (+ alerts, outcomes), smart-signal-backfill, signal-performance summary/calibration (+ POST run), validation-oracle, auto-discovery, signal-gate (+ tuner preview/run), tactical-regime notify (+ preview, send-test).

**Verificación pública de export firmado (sin ops key):** `POST /api/v1/ops/verify-signed-export` — body JSON grande, rate limit dedicado.

---

## 19. Socket.IO

### Cliente → servidor

| Evento | Payload | Efecto |
|--------|---------|--------|
| `join-token` | string mint | Room si pubkey válida |
| `leave-token` | string mint | Sale del room |
| `join-user` | `{ token: JWT }` | Room `user:{userId}` |

### Servidor → cliente

| Evento | Uso |
|--------|-----|
| `sentinel:narrative` | Narrativas del orchestrator (mint, severidad, mensaje, evidence, state machine) |

El servidor parchea `io.emit` / `io.to().emit` para observabilidad interna.

**Fuente:** `orchestrator/sentinelOrchestrator.js` — poll `smart_wallet_signals` y emisión de narrativas.

---

## 20. Motor de scoring (`backend/src/scoring/engine.js`)

- **Reglas (todas en `RULES`):** `whale_accumulation`, `liquidity_shock`, `cluster_buy`, `new_wallet_confidence`, `velocity_spike`.
- **Scores:** dimensiones `risk`, `smart`, `momentum` (0–100), baseline 50.
- **Confidence:** función documentada en código (rules + wallets + boost − contradicciones); puede multiplicarse por calidad del feed / calibrador.
- **Cache Redis:** `scoring:latest:{asset}` TTL ~600s (env).
- **Exclude:** `isSystemMint` (WSOL, USDC, etc.) no se evalúan.

---

## 21. Cron jobs (`backend/src/jobs/`)

Arrancan en `server.js` → `bootstrap()` (salvo env que los desactive):

| Archivo | Rol |
|---------|-----|
| `smartWalletCron.js` | Encolar wallets desde `wallet_tokens` / seed `smart_wallets` |
| `smartWalletSignalPriceCron.js` | Precios Dex por ventanas en señales |
| `signalOutcomeCron.js` | Resolver `signal_performance` |
| `coordinationOutcomeCron.js` | Outcomes T+N coordinación |
| `signalCalibratorCron.js` | Pesos históricos |
| `signalGateTunerCron.js` | Ajuste adaptativo gate |
| `opsHeartbeatCron.js` | Heartbeat / webhook |
| `marketSnapshotWarmupCron.js` | Warmup `market_snapshots` |
| `smartWalletSignalBackfillCron.js` | Backfill señales desde `wallet_tokens` |
| `dataFreshnessHistoryCron.js` | Histórico freshness |
| `walletBehaviorCron.js` | Stats comportamiento |
| `walletCoordinationCron.js` | Pares y alertas |
| `flipsideSyncCron.js` | Sync Flipside |
| `proAlertCron.js` | Alertas PRO watchlist |
| `tacticalRegimeNotifyCron.js` | Régimen táctico + push |

**Clusters:** `clusterBackfillCron.js` y `clusterRankingCron.js` vía `setInterval` en `server.js`.

Intervalos y flags: **`backend/.env.example`**.

---

## 22. Workers y colas

| Componente | Archivo |
|--------------|---------|
| Worker deployer | `queues/deployerWorker.js` |
| Cola smart wallet | `queues/smartWallet.queue.js` |
| Worker smart wallet | `workers/smartWallet.worker.js` |
| Auto-discovery / promoción | `workers/autoDiscovery.js` |
| Validation oracle | `workers/validationOracle.js` |

`SMART_WORKERS_ENABLED=false` desactiva worker deployer + smart wallet + cron encolador asociado.

---

## 23. Base de datos

- **Esquema base:** `supabase/schema.sql` — usuarios, tokens analizados, smart wallets/señales, signal_performance, market_snapshots, freshness, wallet_behavior, wallet_coordination, …
- **Migraciones:** `supabase/migrations/` (001–027+ según repo): oracle, performance, RLS, stalker, web push, guest trials, clusters, repairs, etc.
- **Scripts aplicación:** `backend/package.json` → `db:ensure-subscriptions`, `db:ensure-signal-performance`, `db:verify-schema`, `db:apply-hot-rls-read-policies`, …

---

## 24. Frontend — rutas (`frontend/pages/`)

`/`, `/token/[address]`, `/wallet/[address]`, `/wallet-stalker`, `/smart-money`, `/graveyard`, `/results`, `/scanner`, `/compare`, `/watchlist`, `/portfolio`, `/alerts`, `/pricing`, `/ops`, `/contact`, `/legal`, `/privacy`, `/terms`.

**API Next:** `pages/api/ops-bridge/[[...slug]].js`.

**Componentes:** bajo `frontend/components/` — `cockpit/` (TokenDesk, WarRoom), `home/`, `token/`, `scanner/`, `smart-money/`, `layout/` (Navbar, status), `providers/ScoreSocketProvider.jsx`, `trial/`, `bot/`, etc.

**Layout:** variables CSS en `frontend/styles/globals.css` + `frontend/pages/_app.jsx` (`--sl-nav-h`, `--sl-status-h`, …).

---

## 25. Scripts útiles (backend)

Ver lista completa en `backend/package.json`. Destacados:

- `npm run smoke:post-deploy` — post-deploy
- `npm run backfill:wallets` — histórico wallets on-chain
- `npm run db:verify-schema` — esquema + RLS esperados

---

## 26. Convenciones de errores JSON

Muchos endpoints devuelven `{ ok: false, error: "snake_case_reason" }`. Autenticación: `{ error: "missing_token" | "invalid_token" }`.

---

*Última actualización: generado desde el árbol de rutas y código del monorepo Sentinel Ledger. Si una ruta cambia, actualizar este archivo o regenerar la sección a partir de `backend/src/routes/` y `server.js`.*
