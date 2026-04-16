create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  wallet_address varchar(100) unique not null,
  telegram_id bigint unique,
  telegram_username varchar(100),
  plan varchar(20) not null default 'free',
  plan_expires_at timestamptz,
  total_points bigint not null default 0,
  referral_code varchar(10) unique,
  referrer_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tokens_analyzed (
  id uuid primary key default gen_random_uuid(),
  token_address varchar(100) unique not null,
  chain varchar(20) not null default 'solana',
  deployer_wallet varchar(100),
  ia_score int check (ia_score between 0 and 100),
  decision varchar(10) check (decision in ('BUY', 'WATCH', 'AVOID', 'EXIT')),
  confidence int,
  components jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  version varchar(10) not null default 'v1.0',
  last_checked timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists deployer_history (
  wallet_address varchar(100) primary key,
  rug_count int not null default 0,
  total_launches int not null default 0,
  funding_source varchar(50) default 'unknown',
  risk_score int not null default 0,
  last_launch timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_address varchar(100) not null,
  note text,
  priority int not null default 0,
  added_at timestamptz not null default now(),
  unique(user_id, token_address)
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_address varchar(100),
  condition_score int not null default 70,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists smart_wallets (
  wallet_address text primary key,
  win_rate numeric(5,2) not null default 0,
  pnl_30d numeric(18,2) not null default 0,
  avg_position_size numeric(18,2) not null default 0,
  recent_hits int not null default 0,
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists smart_wallet_signals (
  id uuid primary key default gen_random_uuid(),
  token_address varchar(100) not null,
  wallet_address varchar(100) not null,
  last_action varchar(20) not null default 'buy',
  confidence int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_wallet on users(wallet_address);
create index if not exists idx_tokens_address on tokens_analyzed(token_address);
create index if not exists idx_watchlists_user on watchlists(user_id);
create index if not exists idx_alerts_user on alerts(user_id);
create index if not exists idx_smart_wallet_signals_token on smart_wallet_signals(token_address);
create index if not exists idx_smart_wallet_signals_wallet on smart_wallet_signals(wallet_address);

