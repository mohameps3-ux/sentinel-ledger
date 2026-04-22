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
  telegram_chat_id varchar(32),
  pro_alerts_enabled boolean not null default false,
  pro_alert_prefs jsonb not null default '{}'::jsonb,
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
  created_minute timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  channel varchar(30) not null default 'webhook',
  user_external_id varchar(120) not null,
  intent varchar(40) not null default 'general',
  status varchar(20) not null default 'open',
  priority varchar(20) not null default 'normal',
  user_message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists bot_events (
  id uuid primary key default gen_random_uuid(),
  channel varchar(30) not null default 'webhook',
  user_external_id varchar(120) not null,
  intent varchar(40) not null default 'general',
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists signal_performance (
  id uuid primary key default gen_random_uuid(),
  event_id text unique,
  asset varchar(100) not null,
  emitted_at timestamptz not null default now(),
  resolve_after timestamptz not null,
  horizon_min int not null default 10 check (horizon_min > 0 and horizon_min <= 240),
  confidence numeric(6,2),
  signals jsonb not null default '[]'::jsonb,
  insights jsonb not null default '[]'::jsonb,
  entry_price_usd numeric(18,8),
  outcome_price_usd numeric(18,8),
  outcome_pct numeric(10,4),
  success boolean,
  status varchar(20) not null default 'pending' check (status in ('pending', 'resolved', 'failed')),
  attempts int not null default 0,
  failure_reason text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists ops_data_freshness_history (
  id uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null default now(),
  endpoint varchar(32) not null check (endpoint in ('signalsLatest', 'tokensHot')),
  requests_24h int not null default 0,
  real_ratio_24h numeric(8,4) not null default 0,
  static_fallback_rate_24h numeric(8,4) not null default 0,
  supabase_source_rate_24h numeric(8,4),
  source_breakdown_24h jsonb not null default '{}'::jsonb,
  fallback_reason_breakdown_24h jsonb not null default '{}'::jsonb,
  provider_used_breakdown_24h jsonb not null default '{}'::jsonb,
  slo_target numeric(8,4),
  slo_met boolean
);

create table if not exists ops_data_freshness_events (
  id uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null default now(),
  endpoint varchar(32) not null check (endpoint in ('signalsLatest', 'tokensHot')),
  source varchar(48) not null default 'unknown',
  real_data_ratio numeric(8,4) not null default 0,
  fallback_reason varchar(96),
  provider_used varchar(64)
);

create table if not exists wallet_behavior_stats (
  wallet_address varchar(100) primary key,
  lookback_days int not null default 30,
  sample_signals int not null default 0,
  resolved_signals int not null default 0,
  win_rate_real numeric(6,2) not null default 0,
  avg_position_size_usd numeric(20,4) not null default 0,
  avg_size_pre_pump_usd numeric(20,4) not null default 0,
  avg_latency_post_deploy_min numeric(20,4),
  solo_buy_ratio numeric(8,4) not null default 0,
  group_buy_ratio numeric(8,4) not null default 0,
  anticipatory_buy_ratio numeric(8,4) not null default 0,
  breakout_buy_ratio numeric(8,4) not null default 0,
  style_label varchar(48) not null default 'insufficient_sample',
  computed_at timestamptz not null default now()
);

create table if not exists wallet_behavior_token_features (
  id uuid primary key default gen_random_uuid(),
  wallet_address varchar(100) not null,
  token_address varchar(100) not null,
  first_buy_at timestamptz,
  last_buy_at timestamptz,
  buys_count int not null default 0,
  avg_amount_usd numeric(20,4) not null default 0,
  avg_latency_post_deploy_min numeric(20,4),
  group_buy_ratio numeric(8,4) not null default 0,
  anticipatory_ratio numeric(8,4) not null default 0,
  breakout_ratio numeric(8,4) not null default 0,
  win_rate_real numeric(6,2) not null default 0,
  avg_result_pct numeric(10,4),
  computed_at timestamptz not null default now()
);

create index if not exists idx_users_wallet on users(wallet_address);
create index if not exists idx_tokens_address on tokens_analyzed(token_address);
create index if not exists idx_watchlists_user on watchlists(user_id);
create index if not exists idx_alerts_user on alerts(user_id);
create index if not exists idx_smart_wallet_signals_token on smart_wallet_signals(token_address);
create index if not exists idx_smart_wallet_signals_wallet on smart_wallet_signals(wallet_address);
create unique index if not exists ux_smart_wallet_signals_wallet_token_action_minute
on smart_wallet_signals (wallet_address, token_address, last_action, created_minute);
create index if not exists idx_support_tickets_created_at on support_tickets(created_at desc);
create index if not exists idx_support_tickets_status on support_tickets(status);
create index if not exists idx_bot_events_created_at on bot_events(created_at desc);
create index if not exists idx_signal_perf_asset_emitted on signal_performance(asset, emitted_at desc);
create index if not exists idx_signal_perf_status_resolve_after on signal_performance(status, resolve_after asc);
create index if not exists idx_signal_perf_resolved_at on signal_performance(resolved_at desc);
create index if not exists idx_market_snapshots_updated_at on market_snapshots(updated_at desc);
create index if not exists idx_ops_freshness_history_endpoint_time on ops_data_freshness_history(endpoint, captured_at desc);
create index if not exists idx_ops_freshness_history_captured on ops_data_freshness_history(captured_at desc);
create index if not exists idx_ops_freshness_events_endpoint_time on ops_data_freshness_events(endpoint, captured_at desc);
create index if not exists idx_ops_freshness_events_captured on ops_data_freshness_events(captured_at desc);
create index if not exists idx_wallet_behavior_stats_computed on wallet_behavior_stats(computed_at desc);
create index if not exists idx_wallet_behavior_stats_winrate on wallet_behavior_stats(win_rate_real desc);
create index if not exists idx_wallet_behavior_token_wallet on wallet_behavior_token_features(wallet_address, computed_at desc);
create index if not exists idx_wallet_behavior_token_token on wallet_behavior_token_features(token_address, computed_at desc);

-- ---------------------------------------------------------------------------
-- Stripe, PRO Telegram alerts, worker tables (idempotent). Same SQL as
-- supabase/payments_and_pro.sql — edit that file and paste here, or run it
-- alone on databases that already have the tables above.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  plan VARCHAR(20) NOT NULL DEFAULT 'free',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  stripe_subscription_id VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);

CREATE TABLE IF NOT EXISTS stripe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stripe_events_event_id ON stripe_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed ON stripe_events(processed_at);

CREATE TABLE IF NOT EXISTS system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_category_created ON system_logs(category, created_at DESC);

ALTER TABLE smart_wallets ADD COLUMN IF NOT EXISTS total_trades INT DEFAULT 0;
ALTER TABLE smart_wallets ADD COLUMN IF NOT EXISTS profitable_trades INT DEFAULT 0;
ALTER TABLE smart_wallets ADD COLUMN IF NOT EXISTS early_entry_score DECIMAL(5,2) DEFAULT 0;
ALTER TABLE smart_wallets ADD COLUMN IF NOT EXISTS cluster_score DECIMAL(5,2) DEFAULT 0;
ALTER TABLE smart_wallets ADD COLUMN IF NOT EXISTS consistency_score DECIMAL(5,2) DEFAULT 0;
ALTER TABLE smart_wallets ADD COLUMN IF NOT EXISTS smart_score DECIMAL(5,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_smart_wallets_win_rate ON smart_wallets(win_rate DESC);
CREATE INDEX IF NOT EXISTS idx_smart_wallets_smart_score ON smart_wallets(smart_score DESC);

CREATE TABLE IF NOT EXISTS wallet_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(100) REFERENCES smart_wallets(wallet_address) ON DELETE CASCADE,
  token_address VARCHAR(100) NOT NULL,
  tx_signature VARCHAR(255),
  amount_usd DECIMAL(20,2),
  bought_at TIMESTAMPTZ,
  UNIQUE(wallet_address, token_address, tx_signature)
);

CREATE INDEX IF NOT EXISTS idx_wallet_tokens_token ON wallet_tokens(token_address);

CREATE TABLE IF NOT EXISTS wallet_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_name VARCHAR(100),
  wallet_address VARCHAR(100) REFERENCES smart_wallets(wallet_address),
  confidence DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS token_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address VARCHAR(100),
  wallet_address VARCHAR(100),
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_time ON token_activity_logs(token_address, timestamp);

ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_alerts_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_alert_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;
