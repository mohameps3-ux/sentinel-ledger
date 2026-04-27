BEGIN;

CREATE TABLE IF NOT EXISTS public.guest_trials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash character varying(64) NOT NULL,
  fingerprint_hash character varying(64),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  converted boolean NOT NULL DEFAULT false,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_trials_ip ON public.guest_trials (ip_hash);
CREATE INDEX IF NOT EXISTS idx_guest_trials_fingerprint ON public.guest_trials (fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_guest_trials_expires ON public.guest_trials (expires_at);

COMMIT;
