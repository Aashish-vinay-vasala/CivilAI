-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query

-- ─────────────────────────────────────────
-- 1. workforce table
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workforce (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT '',
  trade         TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'onleave', 'inactive')),
  hours_worked  FLOAT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add any missing columns to existing workforce tables
ALTER TABLE workforce ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE workforce ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT '';
ALTER TABLE workforce ADD COLUMN IF NOT EXISTS trade TEXT NOT NULL DEFAULT '';
ALTER TABLE workforce ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE workforce ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE workforce ADD COLUMN IF NOT EXISTS hours_worked FLOAT NOT NULL DEFAULT 0;
ALTER TABLE workforce ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Fix status check constraint if it used a different value set
ALTER TABLE workforce DROP CONSTRAINT IF EXISTS workforce_status_check;
ALTER TABLE workforce ADD CONSTRAINT workforce_status_check
  CHECK (status IN ('active', 'onleave', 'inactive'));

-- ─────────────────────────────────────────
-- 2. skill_targets table
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skill_targets (
  skill_name   TEXT PRIMARY KEY,
  required_pct INTEGER NOT NULL DEFAULT 70
               CHECK (required_pct BETWEEN 0 AND 100),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- 3. RLS — service role key bypasses RLS
-- ─────────────────────────────────────────
ALTER TABLE workforce ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access to workforce" ON workforce;
CREATE POLICY "Service role full access to workforce"
  ON workforce FOR ALL
  USING (true)
  WITH CHECK (true);

ALTER TABLE skill_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access to skill_targets" ON skill_targets;
CREATE POLICY "Service role full access to skill_targets"
  ON skill_targets FOR ALL
  USING (true)
  WITH CHECK (true);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
