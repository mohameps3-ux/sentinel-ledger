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

create index if not exists idx_ops_freshness_history_endpoint_time
  on ops_data_freshness_history(endpoint, captured_at desc);

create index if not exists idx_ops_freshness_history_captured
  on ops_data_freshness_history(captured_at desc);
