CREATE TABLE IF NOT EXISTS rule_performance (
  rule_id VARCHAR(50) PRIMARY KEY,
  total_signals INTEGER DEFAULT 0,
  success_count_5m INTEGER DEFAULT 0,
  success_count_15m INTEGER DEFAULT 0,
  success_count_60m INTEGER DEFAULT 0,
  avg_return_5m FLOAT DEFAULT 0,
  avg_return_15m FLOAT DEFAULT 0,
  avg_return_60m FLOAT DEFAULT 0,
  median_return_60m FLOAT DEFAULT 0,
  max_drawdown FLOAT DEFAULT 0,
  confidence_score FLOAT DEFAULT 0,
  last_validated TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signal_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id TEXT,
  mint VARCHAR(100),
  rule_id VARCHAR(50),
  price_at_signal FLOAT,
  wallets_involved INTEGER,
  regime VARCHAR(20),
  price_5m FLOAT,
  price_15m FLOAT,
  price_60m FLOAT,
  outcome_5m FLOAT,
  outcome_15m FLOAT,
  outcome_60m FLOAT,
  validated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_signal_outcomes_signal_rule
  ON signal_outcomes(signal_id, rule_id)
  WHERE signal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signal_outcomes_mint ON signal_outcomes(mint);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_rule ON signal_outcomes(rule_id);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_created ON signal_outcomes(created_at DESC);
