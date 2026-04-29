BEGIN;

-- Enable RLS on all tables
ALTER TABLE public.smart_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_wallet_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signal_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_discovered_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_trials ENABLE ROW LEVEL SECURITY;

-- Allow backend service role full access (bypasses RLS)
-- Allow public read on leaderboard data only
CREATE POLICY "public_read_smart_wallets" ON public.smart_wallets
  FOR SELECT USING (true);

CREATE POLICY "public_read_signals" ON public.smart_wallet_signals
  FOR SELECT USING (true);

CREATE POLICY "public_read_rule_performance" ON public.rule_performance
  FOR SELECT USING (true);

-- Bot memory: public read, service role writes
CREATE POLICY "public_read_bot_memory" ON public.bot_memory
  FOR SELECT USING (true);

-- Guest trials: no public access (backend only via service role)
CREATE POLICY "no_public_guest_trials" ON public.guest_trials
  FOR ALL USING (false);

COMMIT;
