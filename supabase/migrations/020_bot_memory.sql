-- Bot assistant memory (cache + feedback loop). Service role (backend) only; deny-by-default.
-- Note: 005_ prefix was already used (smart_wallet_signals_dedupe_guard); this is the bot_memory migration.
BEGIN;

CREATE TABLE IF NOT EXISTS public.bot_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_hash varchar(64) NOT NULL,
  question_sample text,
  intent varchar(20),
  answer_type varchar(20) NOT NULL DEFAULT 'manual',
  best_answer text NOT NULL,
  source varchar(20) NOT NULL DEFAULT 'manual',
  confidence double precision NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0::double precision AND confidence <= 1::double precision),
  language varchar(5) NOT NULL DEFAULT 'es',
  times_used integer NOT NULL DEFAULT 0,
  thumbs_up integer NOT NULL DEFAULT 0,
  thumbs_down integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bot_memory_question_hash_key UNIQUE (question_hash)
);

CREATE INDEX IF NOT EXISTS idx_bot_memory_intent ON public.bot_memory (intent);
CREATE INDEX IF NOT EXISTS idx_bot_memory_confidence ON public.bot_memory (confidence);

ALTER TABLE public.bot_memory ENABLE ROW LEVEL SECURITY;

COMMIT;
