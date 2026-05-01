CREATE TABLE IF NOT EXISTS cluster_intel (
  cluster_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_addresses     TEXT[]      NOT NULL,
  cluster_sig          TEXT        NOT NULL UNIQUE,
  hit_rate             FLOAT       DEFAULT 0.0,
  avg_performance      FLOAT       DEFAULT 0.0,
  volatility_score     FLOAT       DEFAULT 0.0,
  total_activations    INT         DEFAULT 0,
  consecutive_failures INT         DEFAULT 0,
  last_active          TIMESTAMPTZ DEFAULT NOW(),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  tags                 TEXT[]      DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_cluster_intel_sig
  ON cluster_intel (cluster_sig);

CREATE INDEX IF NOT EXISTS idx_cluster_intel_wallets
  ON cluster_intel USING GIN (wallet_addresses);

COMMENT ON TABLE cluster_intel IS
  'Smart wallet clusters derived from coordinated buying patterns';
