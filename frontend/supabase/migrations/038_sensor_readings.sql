-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query
-- Sensor zone reading persistence — backs the new project-scoped endpoints in
-- backend/app/api/v1/routes/bim.py. Previously an uploaded sensor CSV was parsed
-- client-side only and held in React state: the Digital Twin "Sensor Zones" KPI
-- reset to "—" on reload and never survived a tab close. This table gives each
-- project one durable "current" set of sensor readings while keeping prior
-- uploads as history (is_current flag), same pattern as bim_models
-- (037_bim_models.sql).

-- ─────────────────────────────────────────
-- 1. sensor_readings table
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sensor_readings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  file_name    TEXT,
  readings     JSONB,
  is_current   BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS readings JSONB;
ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS sensor_readings_project_current
  ON sensor_readings(project_id, is_current);

-- ─────────────────────────────────────────
-- 2. RLS — service role key bypasses RLS
-- ─────────────────────────────────────────
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access to sensor_readings" ON sensor_readings;
CREATE POLICY "Service role full access to sensor_readings"
  ON sensor_readings FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────
-- 3. Realtime — so uploading a CSV in one tab refreshes it in others
-- ─────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE sensor_readings;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
