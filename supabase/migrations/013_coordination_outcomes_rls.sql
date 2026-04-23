-- Lock down coordination_outcomes at the Postgres layer (PostgREST / anon).
-- Backend uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS in Supabase.
-- Safe to run after 012; idempotent.

BEGIN;

ALTER TABLE public.coordination_outcomes ENABLE ROW LEVEL SECURITY;

-- Intentionally no policies for anon/authenticated: deny-by-default via API keys that are not service_role.
-- Service role and direct Postgres (migrations, Railway script) still work.

COMMIT;
