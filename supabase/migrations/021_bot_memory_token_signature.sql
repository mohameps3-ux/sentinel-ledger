-- Semantic dedup for support-tree v2 (see botService tokenSignature on HIGH-match upsert).
BEGIN;

ALTER TABLE public.bot_memory ADD COLUMN IF NOT EXISTS token_signature character varying(200);

CREATE INDEX IF NOT EXISTS idx_bot_memory_signature ON public.bot_memory (token_signature);

COMMIT;
