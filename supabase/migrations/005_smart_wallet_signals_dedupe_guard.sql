-- Deduplicate existing rows and enforce minute-bucket uniqueness to avoid
-- burst duplicates for the same wallet/token/action.

ALTER TABLE smart_wallet_signals
ADD COLUMN IF NOT EXISTS created_minute timestamptz;

UPDATE smart_wallet_signals
SET created_minute = date_trunc('minute', created_at)
WHERE created_minute IS NULL;

WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY wallet_address, token_address, last_action, created_minute
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM smart_wallet_signals
)
DELETE FROM smart_wallet_signals s
USING ranked r
WHERE s.ctid = r.ctid
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_smart_wallet_signals_wallet_token_action_minute
ON smart_wallet_signals (
  wallet_address,
  token_address,
  last_action,
  created_minute
);
