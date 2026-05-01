ALTER TABLE cluster_intel
  ADD COLUMN IF NOT EXISTS rank_score FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS decay_score FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_ranked_at TIMESTAMPTZ;

COMMENT ON COLUMN cluster_intel.rank_score IS '0–100 outcome rank; gate boost uses this only';
