-- Sentinel Ledger - Demo seed for Smart Money panel
-- Inserts 20 "smart wallets" plus token-specific signals so the UI looks realistic.
-- Safe to run multiple times (upsert).

begin;

-- 1) Global smart wallets (20)
insert into public.smart_wallets (wallet_address, win_rate, pnl_30d, trades_30d, confidence, updated_at)
values
  ('7YqvBxbp5XJvYzX1Q2f7pN8mQ3uQmY9mQb8Qxqj2mT8x', 92.40, 184250.55, 146, 91, now()),
  ('4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q', 89.10,  97240.10,  88, 86, now()),
  ('9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3b6PqvT2n8m', 87.75,  65210.33, 103, 84, now()),
  ('5tK9pQxY7uV2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ', 86.30,  50120.00,  74, 81, now()),
  ('2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7u', 85.20,  33200.72,  62, 79, now()),
  ('BqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3b', 84.60,  28840.18,  59, 78, now()),
  ('C6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g', 83.35,  24105.91,  57, 77, now()),
  ('D2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3b6Pq', 82.80,  19877.44,  54, 76, now()),
  ('E9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3b6PqvT2n8', 81.95,  16542.06,  52, 75, now()),
  ('F1pK8pQ9xY7uV2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2', 81.10,  14110.12,  49, 74, now()),
  ('G8pQ9xY7uV2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ1', 80.40,  12100.00,  45, 73, now()),
  ('H9xY7uV2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ1pK8', 79.85,  10987.30,  43, 72, now()),
  ('J7uV2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9', 79.20,   9871.88,  41, 71, now()),
  ('K2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7', 78.70,   8650.40,  39, 70, now()),
  ('L3q4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1', 78.10,   7420.17,  37, 69, now()),
  ('M1mX3q4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5', 77.55,   6902.55,  35, 68, now()),
  ('N2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3b6Pqv', 76.90,   6100.00,  33, 67, now()),
  ('P4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3', 75.80,   5201.19,  31, 66, now()),
  ('Q5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2c', 74.60,   4100.77,  28, 64, now()),
  ('R6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3', 72.40,   2800.20,  22, 61, now())
on conflict (wallet_address) do update
set win_rate = excluded.win_rate,
    pnl_30d = excluded.pnl_30d,
    trades_30d = excluded.trades_30d,
    confidence = excluded.confidence,
    updated_at = excluded.updated_at;

-- 2) Token-specific signals (so token pages show targeted smart money activity)
-- Using a couple of well-known/test mints so you can instantly verify the panel:
-- - Wrapped SOL mint (commonly used for testing): So11111111111111111111111111111111111111112
-- - USDC (Solana): EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

insert into public.smart_wallet_signals (token_address, wallet_address, last_action, confidence, created_at)
values
  ('So11111111111111111111111111111111111111112', '7YqvBxbp5XJvYzX1Q2f7pN8mQ3uQmY9mQb8Qxqj2mT8x', 'buy', 92, now()),
  ('So11111111111111111111111111111111111111112', '4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q', 'buy', 88, now()),
  ('So11111111111111111111111111111111111111112', '9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3b6PqvT2n8m', 'buy', 86, now()),
  ('So11111111111111111111111111111111111111112', '5tK9pQxY7uV2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ', 'buy', 84, now()),
  ('So11111111111111111111111111111111111111112', '2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7u', 'buy', 82, now()),
  ('So11111111111111111111111111111111111111112', 'BqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3b', 'buy', 80, now()),
  ('So11111111111111111111111111111111111111112', 'C6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g', 'sell', 78, now()),
  ('So11111111111111111111111111111111111111112', 'D2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3b6Pq', 'buy', 77, now()),
  ('So11111111111111111111111111111111111111112', 'E9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3b6PqvT2n8', 'buy', 75, now()),
  ('So11111111111111111111111111111111111111112', 'F1pK8pQ9xY7uV2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2', 'buy', 74, now()),
  ('So11111111111111111111111111111111111111112', 'G8pQ9xY7uV2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ1', 'sell', 72, now()),
  ('So11111111111111111111111111111111111111112', 'H9xY7uV2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ1pK8', 'buy', 71, now()),

  ('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'J7uV2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9', 'buy', 80, now()),
  ('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'K2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7', 'buy', 76, now()),
  ('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'L3q4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1', 'sell', 74, now()),
  ('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'M1mX3q4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5', 'buy', 72, now())
on conflict do nothing;

commit;

