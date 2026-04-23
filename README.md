# Sentinel Ledger

Monorepo simple:

- `backend/`: API Express + Socket.IO
- `frontend/`: Next.js (pages router) + Tailwind
- `supabase/`: `schema.sql`

## Local

Backend:

1. `cd backend`
2. Copia `.env.example` a `.env` y rellena variables
3. `npm install`
4. `npm run dev`

Frontend (si el nav o la home no coinciden con el repo):

1. **Parar** el `next dev` anterior (**Ctrl+C** en esa terminal). No hace falta tener dos `next dev` a la vez.
2. En `frontend/`: `npm run dev:fresh` (o `clean:next` y luego `dev`).
3. **Recarga dura** (Ctrl+Shift+R) o **ventana de incógnito**.
4. **URL:** usa la que imprima el propio Next en consola (p. ej. `http://localhost:3000` o `http://localhost:3001`). Si en realidad otra app está en `:3000` o el terminal indica **otro puerto**, la UI no coincidirá con lo que crees: abre **exactamente** la base `Local:` / `Network:` del log.
5. **Inspecciona el `<nav>`:** si ves `data-sl-ui="home-compact-v2"`, el bundle **sí** es el actual, junto con `data-sl-nav="slim"` y `data-sentinel-build` (en local a veces `local`). Si sigue el **valor antiguo** u otro sufijo, no estás en ese proceso o en ese **puerto**.
6. **Producción (Vercel):** hacen falta `commit`, `push` y que el **deploy** termine; en el cloud no se leen los cambios solo de tu PC. El SHA en `data-sentinel-build` debe alinearse con el deployment. *Short SHA de ejemplo en doc (histórico):* `9f38d66` — un deploy reciente tendrá el suyo.

*Si con `data-sl-ui="home-compact-v2"` en el `<nav>` la UI aún no cuadra, di qué ves (p. ej. fila con scroll, solo logo) y se afina.*

## Supabase

Ejecuta `supabase/schema.sql` en el SQL editor del proyecto (incluye tablas base, Stripe `subscriptions` / `stripe_events`, logs, columnas PRO en `users`, y tablas del worker smart-wallet). Si la base ya existía sin esa parte, puedes ejecutar solo el parche idempotente `supabase/payments_and_pro.sql`. **Para un bot o un solo pegado en PRODUCTION:** usa `supabase/apply_production_bundle.sql` (parche + RLS + queries de verificación al final). Con `DATABASE_URL` en `backend/.env`: `cd backend && npm run db:ensure-subscriptions` aplica `payments_and_pro.sql`; `npm run db:verify-schema` comprueba tablas/columnas clave. Opcional por separado: `supabase/rls_service_tables.sql` (también va incluido en el bundle).

Si Supabase Security Advisor marca "RLS disabled in public", aplica `supabase/rls_public_lockdown.sql` para activar RLS en tablas `public` usadas por backend (incluye `tokens_analyzed`, `signal_performance`, `ops_data_freshness_history`, etc.). El backend con `service_role` sigue funcionando; acceso directo anon/auth queda denegado salvo políticas explícitas.

## Recovery express (produccion)

Si ves errores intermitentes (ej. `Service Unavailable`), usa el script:

1. Solo chequeo (frontend + token page + backend health):
   - `powershell -ExecutionPolicy Bypass -File "scripts/recover-prod.ps1"`
2. Chequeo + redeploy forzado en Vercel (sin cache):
   - `powershell -ExecutionPolicy Bypass -File "scripts/recover-prod.ps1" -Redeploy`

Notas:
- Requiere `vercel` CLI instalada y sesion iniciada para `-Redeploy`.
- El script limpia DNS local por defecto (`ipconfig /flushdns`).
- URL canónica frontend: `https://sentinel-ledger-ochre.vercel.app`.

## Mini release checklist (2 min)

Script rápido para validar release hygiene + smoke endpoints:

- `powershell -ExecutionPolicy Bypass -File "scripts/release-check-v1.1.ps1"`
- Con overrides:  
  `powershell -ExecutionPolicy Bypass -File "scripts/release-check-v1.1.ps1" -BackendUrl "https://<backend>" -FrontendUrl "https://<frontend>" -OpsKey "<OMNI_BOT_OPS_KEY>"`

El script cubre 5 checks: git hygiene, smoke core (`/health`, `/signals/latest`, `/ops/data-freshness`), recordatorio de seguridad, recordatorio de deploy alignment y plantilla para actualizar `HANDOFF.md`.

## Deploy (resumen)

- **Vercel (frontend):** en el proyecto, **Root Directory** = `frontend` (obligatorio en monorepo). En repo hay `frontend/vercel.json` con `install` + `build`; el build usa `next build --webpack` vía `package.json` → `npm run build`. Antes del build se ejecuta `scripts/check-deploy-contract.cjs` (vía `prebuild`): exige `vercel.json`, `data-sl-nav="slim"`, `data-sentinel-build` y `NEXT_PUBLIC_GIT_SHA` en `next.config` + `Navbar` — si falta un archivo nuevo o se borra un marcador, **el build falla** en local y en CI.
- **Railway (backend):** conectar repo `mohameps3-ux/sentinel-ledger`, **Root Directory** = `backend`, rama `main`. Variables mínimas según `backend/.env.example`.
- **RPC / Helius 429:** define `SOLANA_RPC_URL` o `SOLANA_RPC_URLS` (coma) con un RPC dedicado; el backend prueba esas URLs antes que Helius y el cluster público, con reintentos en rate limit.
- **Señales / precios:** cron `SIGNAL_PRICE_*` en el backend enriquece `smart_wallet_signals` desde DexScreener. Estado en `GET /health` → `signalPrices`.
- **Portfolio:** `GET /api/v1/portfolio/watchlist-markets` (auth) + página `/portfolio` — datos reales desde watchlist + Dex (no balances on-chain).

