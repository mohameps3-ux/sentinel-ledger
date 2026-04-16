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

Ejecuta `supabase/schema.sql` en tu proyecto Supabase (SQL editor).

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

