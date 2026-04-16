-- Sentinel Ledger - Demo seed for Smart Money panel
-- Creates/aligns smart_wallets table and inserts 20 demo wallets + token signals.
-- Safe to run multiple times (upsert).

begin;

-- 0) Ensure table exists with expected columns (idempotent)
create table if not exists public.smart_wallets (
  wallet_address text primary key,
  win_rate numeric(5,2) not null default 0,
  pnl_30d numeric(18,2) not null default 0,
  avg_position_size numeric(18,2) not null default 0,
  recent_hits int not null default 0,
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.smart_wallets add column if not exists win_rate numeric(5,2) not null default 0;
alter table public.smart_wallets add column if not exists pnl_30d numeric(18,2) not null default 0;
alter table public.smart_wallets add column if not exists avg_position_size numeric(18,2) not null default 0;
alter table public.smart_wallets add column if not exists recent_hits int not null default 0;
alter table public.smart_wallets add column if not exists last_seen timestamptz not null default now();
alter table public.smart_wallets add column if not exists updated_at timestamptz not null default now();

-- 1) Global smart wallets (20)
insert into public.smart_wallets (wallet_address, win_rate, pnl_30d, avg_position_size, recent_hits, last_seen, updated_at)
values
  ('7YqvBxbp5XJvYzX1Q2f7pN8mQ3uQmY9mQb8Qxqj2mT8x', 92.40, 184250.55, 4200.00, 14, now() - interval '12 hours', now()),
  ('4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q', 89.10,  97240.10, 3100.00, 11, now() - interval '6 hours', now()),
  ('9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3b6PqvT2n8m', 87.75,  65210.33, 2600.00, 10, now() - interval '4 hours', now()),
  ('5tK9pQxY7uV2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ', 86.30,  50120.00, 2400.00,  9, now() - interval '3 hours', now()),
  ('2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7u', 85.20,  33200.72, 2200.00,  8, now() - interval '2 hours', now()),
  ('BqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3b', 84.60,  28840.18, 2100.00,  8, now() - interval '2 hours', now()),
  ('C6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g', 83.35,  24105.91, 1900.00,  7, now() - interval '90 minutes', now()),
  ('D2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3b6Pq', 82.80,  19877.44, 1750.00,  7, now() - interval '75 minutes', now()),
  ('E9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3b6PqvT2n8', 81.95,  16542.06, 1600.00,  6, now() - interval '60 minutes', now()),
  ('F1pK8pQ9xY7uV2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2', 81.10,  14110.12, 1500.00,  6, now() - interval '55 minutes', now()),
  ('G8pQ9xY7uV2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ1', 80.40,  12100.00, 1350.00,  5, now() - interval '45 minutes', now()),
  ('H9xY7uV2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ1pK8', 79.85,  10987.30, 1200.00,  5, now() - interval '40 minutes', now()),
  ('J7uV2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9', 79.20,   9871.88, 1100.00,  5, now() - interval '35 minutes', now()),
  ('K2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7', 78.70,   8650.40,  980.00,  4, now() - interval '30 minutes', now()),
  ('L3q4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1', 78.10,   7420.17,  900.00,  4, now() - interval '25 minutes', now()),
  ('M1mX3q4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5', 77.55,   6902.55,  850.00,  4, now() - interval '20 minutes', now()),
  ('N2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3b6Pqv', 76.90,   6100.00,  800.00,  3, now() - interval '18 minutes', now()),
  ('P4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3', 75.80,   5201.19,  720.00,  3, now() - interval '15 minutes', now()),
  ('Q5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2c', 74.60,   4100.77,  650.00,  3, now() - interval '12 minutes', now()),
  ('R6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3', 72.40,   2800.20,  500.00,  2, now() - interval '10 minutes', now())
on conflict (wallet_address) do update
set win_rate = excluded.win_rate,
    pnl_30d = excluded.pnl_30d,
    avg_position_size = excluded.avg_position_size,
    recent_hits = excluded.recent_hits,
    last_seen = excluded.last_seen,
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

