BEGIN;

CREATE TABLE IF NOT EXISTS public.bot_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_hash varchar(64) UNIQUE NOT NULL,
  question_sample text,
  intent varchar(20),
  answer_type varchar(20) DEFAULT 'manual',
  best_answer text NOT NULL,
  source varchar(20) DEFAULT 'manual',
  confidence double precision DEFAULT 0.5,
  language varchar(5) DEFAULT 'es',
  times_used integer DEFAULT 0,
  thumbs_up integer DEFAULT 0,
  thumbs_down integer DEFAULT 0,
  version integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_memory_hash ON public.bot_memory (question_hash);
CREATE INDEX IF NOT EXISTS idx_bot_memory_confidence ON public.bot_memory (confidence DESC);
CREATE INDEX IF NOT EXISTS idx_bot_memory_intent ON public.bot_memory (intent);

COMMIT;
