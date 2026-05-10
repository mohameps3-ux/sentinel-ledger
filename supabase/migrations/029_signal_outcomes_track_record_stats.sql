-- Exact aggregates for GET /api/v1/signals/track-record KPIs (full table, no sampling bias).
-- Requires backend service_role (PostgREST) or direct Postgres; not exposed to anon.

BEGIN;

CREATE OR REPLACE FUNCTION public.signal_outcomes_track_record_stats()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'total_signals', (SELECT count(*)::bigint FROM signal_outcomes),
    'resolved_signals', (SELECT count(*)::bigint FROM signal_outcomes WHERE outcome_60m IS NOT NULL),
    'wins_decisive', (SELECT count(*)::bigint FROM signal_outcomes WHERE outcome_60m > 0.05),
    'losses_decisive', (SELECT count(*)::bigint FROM signal_outcomes WHERE outcome_60m < -0.05),
    'avg_outcome_60m_all', (
      SELECT avg(outcome_60m)::double precision FROM signal_outcomes WHERE outcome_60m IS NOT NULL
    ),
    'min_outcome_60m_all', (
      SELECT min(outcome_60m)::double precision FROM signal_outcomes WHERE outcome_60m IS NOT NULL
    ),
    'avg_outcome_60m_wins', (
      SELECT avg(outcome_60m)::double precision FROM signal_outcomes WHERE outcome_60m > 0.05
    )
  );
$$;

REVOKE ALL ON FUNCTION public.signal_outcomes_track_record_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signal_outcomes_track_record_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.signal_outcomes_track_record_stats() TO postgres;

COMMIT;
