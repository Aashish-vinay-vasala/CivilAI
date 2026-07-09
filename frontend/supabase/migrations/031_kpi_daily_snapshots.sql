-- The Overview dashboard's Committed Spend / Active Workers / Safety Score
-- sparklines previously reconstructed a "trend" from row created_at columns
-- (e.g. summing invoices raised per month) — that's a proxy, not the actual
-- historical value of the metric at that point in time, and it silently
-- disagreed with the headline KPI number whenever old rows were edited.
--
-- This table stores one row per calendar day with the real KPI values as
-- computed by GET /api/v1/projects/kpis at the time it was read. The backend
-- upserts today's row on every read (see get_dashboard_kpis), so history
-- accumulates naturally — no cron job required. Trends built from this table
-- only ever show real recorded values; a day/month with no snapshot is simply
-- absent rather than guessed at.
CREATE TABLE IF NOT EXISTS kpi_daily_snapshots (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date    date          NOT NULL UNIQUE,
  total_budget     numeric(14,2) NOT NULL DEFAULT 0,
  spent_to_date    numeric(14,2) NOT NULL DEFAULT 0,
  committed_amount numeric(14,2) NOT NULL DEFAULT 0,
  avg_progress     numeric(5,2)  NOT NULL DEFAULT 0,
  active_workers   integer       NOT NULL DEFAULT 0,
  safety_score     integer       NOT NULL DEFAULT 0,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_date ON kpi_daily_snapshots(snapshot_date DESC);

NOTIFY pgrst, 'reload schema';
