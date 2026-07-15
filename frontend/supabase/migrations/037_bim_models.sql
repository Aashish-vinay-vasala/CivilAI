-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query
-- BIM/IFC model persistence — backs the new project-scoped endpoints in
-- backend/app/api/v1/routes/bim.py. Previously an uploaded IFC file was parsed
-- in-memory per request and never saved: the BIM page lost it on reload and
-- Digital Twin faked persistence via localStorage. This table gives each
-- project one durable "current" BIM model while keeping prior uploads as
-- history (is_current flag) for a future version picker / Model Diff tie-in.
-- Same persisted-table + RLS + realtime pattern as contracts (035_contracts.sql).

-- ─────────────────────────────────────────
-- 1. bim_models table
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bim_models (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  file_name     TEXT,
  original_name TEXT,
  bucket        TEXT,
  file_url      TEXT,
  bim_data      JSONB,
  meshes        JSONB,
  ai_analysis   TEXT,
  is_current    BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bim_models ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE bim_models ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE bim_models ADD COLUMN IF NOT EXISTS original_name TEXT;
ALTER TABLE bim_models ADD COLUMN IF NOT EXISTS bucket TEXT;
ALTER TABLE bim_models ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE bim_models ADD COLUMN IF NOT EXISTS bim_data JSONB;
ALTER TABLE bim_models ADD COLUMN IF NOT EXISTS meshes JSONB;
ALTER TABLE bim_models ADD COLUMN IF NOT EXISTS ai_analysis TEXT;
ALTER TABLE bim_models ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE bim_models ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS bim_models_project_current
  ON bim_models(project_id, is_current);

-- ─────────────────────────────────────────
-- 2. RLS — service role key bypasses RLS
-- ─────────────────────────────────────────
ALTER TABLE bim_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access to bim_models" ON bim_models;
CREATE POLICY "Service role full access to bim_models"
  ON bim_models FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────
-- 3. Realtime — so uploading a model in one tab refreshes it in others
-- ─────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE bim_models;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
