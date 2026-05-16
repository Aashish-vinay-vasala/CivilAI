-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query

CREATE TABLE IF NOT EXISTS permits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  type         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'Pending'
               CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  expiry_date  TEXT,
  risk_level   TEXT NOT NULL DEFAULT 'medium'
               CHECK (risk_level IN ('low', 'medium', 'high')),
  project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
  issued_by    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ
);

-- Add columns that may be missing if the table was created without them
ALTER TABLE permits ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE permits ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT '';
ALTER TABLE permits ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Pending';
ALTER TABLE permits ADD COLUMN IF NOT EXISTS expiry_date TEXT;
ALTER TABLE permits ADD COLUMN IF NOT EXISTS risk_level TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE permits ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE permits ADD COLUMN IF NOT EXISTS issued_by TEXT;
ALTER TABLE permits ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE permits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

CREATE INDEX IF NOT EXISTS permits_project_created
  ON permits(project_id, created_at DESC);

-- Backend uses service-role key so RLS is bypassed, but enable it for safety
ALTER TABLE permits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to permits" ON permits;
CREATE POLICY "Service role full access to permits"
  ON permits FOR ALL
  USING (true)
  WITH CHECK (true);
