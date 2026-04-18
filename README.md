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

Frontend:

1. `cd frontend`
2. `npm install`
3. `npm run dev`

## Supabase

Ejecuta `supabase/schema.sql` en el SQL editor del proyecto (incluye tablas base, Stripe `subscriptions` / `stripe_events`, logs, columnas PRO en `users`, y tablas del worker smart-wallet). Si la base ya existía sin esa parte, puedes ejecutar solo el parche idempotente `supabase/payments_and_pro.sql`. **Para un bot o un solo pegado en PRODUCTION:** usa `supabase/apply_production_bundle.sql` (parche + RLS + queries de verificación al final). Con `DATABASE_URL` en `backend/.env`: `cd backend && npm run db:ensure-subscriptions` aplica `payments_and_pro.sql`; `npm run db:verify-schema` comprueba tablas/columnas clave. Opcional por separado: `supabase/rls_service_tables.sql` (también va incluido en el bundle).

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

## Deploy (resumen)

- **Vercel (frontend):** en el proyecto, **Root Directory** = `frontend`. Build por defecto usa `npm run vercel-build` (equivale a `npm run build`). Si hace falta override explícito: `next build --webpack`.
- **Railway (backend):** conectar repo `mohameps3-ux/sentinel-ledger`, **Root Directory** = `backend`, rama `main`. Variables mínimas según `backend/.env.example`.
- **RPC / Helius 429:** define `SOLANA_RPC_URL` o `SOLANA_RPC_URLS` (coma) con un RPC dedicado; el backend prueba esas URLs antes que Helius y el cluster público, con reintentos en rate limit.
- **Señales / precios:** cron `SIGNAL_PRICE_*` en el backend enriquece `smart_wallet_signals` desde DexScreener. Estado en `GET /health` → `signalPrices`.
- **Portfolio:** `GET /api/v1/portfolio/watchlist-markets` (auth) + página `/portfolio` — datos reales desde watchlist + Dex (no balances on-chain).

