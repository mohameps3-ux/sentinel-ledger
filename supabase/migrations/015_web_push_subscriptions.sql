-- Web Push subscription storage (VAPID). Service role + API; deny-by-default for PostgREST.
BEGIN;

CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  keys jsonb NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user_id ON public.web_push_subscriptions (user_id);

ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;

COMMIT;
