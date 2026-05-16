-- Ensure safety_incidents has all columns needed for safety analytics

CREATE TABLE IF NOT EXISTS safety_incidents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  severity    TEXT DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high')),
  status      TEXT DEFAULT 'open'  CHECK (status IN ('open', 'closed', 'investigating')),
  zone        TEXT DEFAULT '',
  location    TEXT DEFAULT '',
  injured     TEXT DEFAULT 'None',
  date        DATE DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns to existing table without breaking existing rows
ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS zone     TEXT DEFAULT '';
ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '';
ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS injured  TEXT DEFAULT 'None';
ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS date     DATE DEFAULT CURRENT_DATE;
ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_si_project_id ON safety_incidents(project_id);
CREATE INDEX IF NOT EXISTS idx_si_created_at ON safety_incidents(created_at);
CREATE INDEX IF NOT EXISTS idx_si_severity   ON safety_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_si_zone       ON safety_incidents(zone);

-- RLS
ALTER TABLE safety_incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access to safety_incidents" ON safety_incidents;
CREATE POLICY "Service role full access to safety_incidents"
  ON safety_incidents FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
