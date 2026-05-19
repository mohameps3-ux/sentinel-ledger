-- Smart wallet hourly refresh: poll timestamp (distinct from on-chain last_seen).
ALTER TABLE smart_wallets ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN smart_wallets.last_checked_at IS 'Last successful analyze-wallet poll (getSignaturesForAddress), including zero-new-tx polls. Not on-chain activity; see last_seen.';
