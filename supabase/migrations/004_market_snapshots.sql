-- Persistent market snapshots for stale-safe fallback and warmup.
create table if not exists market_snapshots (
  mint varchar(100) primary key,
  symbol varchar(32) not null default '?',
  name varchar(120) not null default '',
  price numeric(24,10) not null default 0,
  liquidity numeric(24,4) not null default 0,
  volume24h numeric(24,4) not null default 0,
  price_change24h numeric(10,4) not null default 0,
  market_cap numeric(24,4),
  source varchar(40) not null default 'market_data',
  provider_used varchar(40),
  updated_at timestamptz not null default now()
);

create index if not exists idx_market_snapshots_updated_at on market_snapshots(updated_at desc);
