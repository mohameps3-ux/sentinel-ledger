-- RLS hardening for public schema tables used by backend services.
-- Safe to re-run (idempotent ALTER TABLE ... ENABLE ROW LEVEL SECURITY).
--
-- Why:
-- - Supabase flags "RLS disabled in public schema" as critical.
-- - Backend uses service_role and continues to work (service_role bypasses RLS).
-- - anon/authenticated direct PostgREST access is denied unless explicit policies exist.
--
-- Usage:
-- 1) Run this file in Supabase SQL Editor.
-- 2) Re-check Security Advisor warnings.
-- 3) If a table must be publicly readable, add explicit SELECT policy for that table.

BEGIN;

-- Core app tables
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tokens_analyzed ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.deployer_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.smart_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.smart_wallet_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bot_events ENABLE ROW LEVEL SECURITY;

-- Quant / ops tables
ALTER TABLE IF EXISTS public.signal_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ops_data_freshness_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.donations ENABLE ROW LEVEL SECURITY;

-- Billing + worker/service tables
ALTER TABLE IF EXISTS public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wallet_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wallet_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.token_activity_logs ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verification: tables in public with RLS disabled (expect 0 rows after hardening).
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false
ORDER BY tablename;

-- Optional helper template:
-- If you intentionally want public read access on one table, add an explicit policy:
-- CREATE POLICY "public_read_tokens_analyzed"
-- ON public.tokens_analyzed
-- FOR SELECT
-- TO anon, authenticated
-- USING (true);
