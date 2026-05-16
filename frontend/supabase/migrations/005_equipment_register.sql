-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query

-- ─────────────────────────────────────────
-- 1. Extend equipment table with health/status fields
-- ─────────────────────────────────────────
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS equipment_code TEXT DEFAULT '';
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 80
  CHECK (health_score BETWEEN 0 AND 100);
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Operational'
  CHECK (status IN ('Operational', 'Needs Service', 'Critical', 'Inactive'));
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS next_service TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS age_years FLOAT DEFAULT 0;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS operating_hours FLOAT DEFAULT 0;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS notes TEXT;

-- ─────────────────────────────────────────
-- 2. equipment_maintenance_logs — monthly downtime & cost tracking
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_maintenance_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID REFERENCES projects(id) ON DELETE CASCADE,
  year             INTEGER NOT NULL,
  month            INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  planned_hours    FLOAT DEFAULT 0,
  unplanned_hours  FLOAT DEFAULT 0,
  maintenance_cost FLOAT DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS equipment_maintenance_project_month
  ON equipment_maintenance_logs(project_id, year, month);

-- ─────────────────────────────────────────
-- 3. RLS for equipment_maintenance_logs
-- ─────────────────────────────────────────
ALTER TABLE equipment_maintenance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to equipment_maintenance_logs"
  ON equipment_maintenance_logs FOR ALL
  USING (true)
  WITH CHECK (true);
