-- Optional hardening: RLS on tables that should only be reached via backend (service_role JWT).
-- Service role bypasses RLS in Supabase; anon/authenticated PostgREST calls get denied if no policies exist.
-- Run after payments_and_pro.sql. Safe to re-run (IF NOT EXISTS policies where needed).

ALTER TABLE IF EXISTS subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS wallet_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS wallet_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS token_activity_logs ENABLE ROW LEVEL SECURITY;
