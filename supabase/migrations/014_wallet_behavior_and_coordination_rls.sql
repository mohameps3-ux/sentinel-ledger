-- Security Advisor: RLS disabled on public tables exposed to PostgREST.
-- Backend uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS). No anon policies:
-- deny-by-default for direct API key access that is not service_role.

BEGIN;

ALTER TABLE IF EXISTS public.wallet_behavior_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wallet_coordination_pairs ENABLE ROW LEVEL SECURITY;

COMMIT;
