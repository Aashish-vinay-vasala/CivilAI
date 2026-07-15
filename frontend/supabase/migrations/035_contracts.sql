-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query
-- Contracts register — backs backend/app/api/v1/routes/contracts.py.
-- The Contracts page (Documents → Contracts) previously had no table at all —
-- the "Contract Register" list was hardcoded in the frontend. Meanwhile several
-- backend modules (accounting extractor, cost-overrun trainer, project delete
-- cascade, export_training_data script) already read/write a `contracts` table
-- that was created ad hoc directly in Supabase and never captured in a tracked
-- migration. This migration is written defensively (CREATE TABLE IF NOT EXISTS +
-- ALTER TABLE ADD COLUMN IF NOT EXISTS for every column) so it's safe to run
-- whether or not that ad-hoc table already exists, and brings it under version
-- control with the same persisted-table + CRUD + realtime pattern as vendors
-- (034_vendors.sql) and permits (006_permits.sql).

-- ─────────────────────────────────────────
-- 1. contracts table
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID REFERENCES projects(id) ON DELETE SET NULL,
  title              TEXT NOT NULL DEFAULT '',
  contract_type      TEXT NOT NULL DEFAULT '',
  contractor         TEXT NOT NULL DEFAULT '',
  value              NUMERIC NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'Draft'
                     CHECK (status IN ('Draft', 'Pending', 'Active', 'Review', 'Approved', 'Completed', 'Terminated')),
  risk_level         TEXT NOT NULL DEFAULT 'medium'
                     CHECK (risk_level IN ('low', 'medium', 'high')),
  risk_score         NUMERIC,
  start_date         TEXT,
  end_date           TEXT,
  payment_terms      TEXT,
  retention_percent  NUMERIC,
  notes              TEXT,
  file_url           TEXT,
  file_name          TEXT,
  bucket             TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ
);

-- Add columns that may be missing if the table already existed ad hoc
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_type TEXT NOT NULL DEFAULT '';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contractor TEXT NOT NULL DEFAULT '';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS value NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Draft';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS risk_level TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS risk_score NUMERIC;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS start_date TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS end_date TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS retention_percent NUMERIC;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS bucket TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS contracts_project_created
  ON contracts(project_id, created_at DESC);

-- ─────────────────────────────────────────
-- 2. RLS — service role key bypasses RLS
-- ─────────────────────────────────────────
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access to contracts" ON contracts;
CREATE POLICY "Service role full access to contracts"
  ON contracts FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────
-- 3. Realtime — so an add/edit/delete in one tab (or by a teammate) refreshes
--    the register everywhere else without a manual reload. useSupabaseSync
--    subscribes to this. Guarded since a live ad-hoc `contracts` table may
--    conceivably already be a publication member in some environments.
-- ─────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE contracts;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
