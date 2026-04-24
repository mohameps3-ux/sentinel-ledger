-- PRO alert inbox trail (priority tiers for /alerts feed + API).
-- Writers: proAlertCron (watchlist), tacticalRegimeNotify (regime). Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pro_alert_feed_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('info', 'tactical', 'urgent', 'surefire')),
  source text NOT NULL,
  headline text NOT NULL,
  detail text,
  token_address text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pro_alert_feed_user_created
  ON public.pro_alert_feed_items (user_id, created_at DESC);

COMMENT ON TABLE public.pro_alert_feed_items IS
  'Append-only PRO dispatch log for inbox UI; query last N by user_id where tier in (urgent, surefire).';

COMMIT;
