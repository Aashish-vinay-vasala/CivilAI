-- Safe to run even if migration 015 was never applied.
-- Adds any missing columns first, then normalises legacy data.

-- ── 1. Ensure all columns exist ──────────────────────────────────────────────
ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS type        TEXT        DEFAULT '';
ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS description TEXT        DEFAULT '';
ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS severity    TEXT        DEFAULT 'low';
ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS status      TEXT        DEFAULT 'open';
ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS zone        TEXT        DEFAULT '';
ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS location    TEXT        DEFAULT '';
ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS injured     TEXT        DEFAULT 'None';
ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS date        DATE        DEFAULT CURRENT_DATE;
ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW();

-- ── 2. Normalise legacy type values ─────────────────────────────────────────
UPDATE safety_incidents
SET type = 'Other'
WHERE type IS NULL OR trim(type) = '';

-- ── 3. Normalise legacy severity values → low | medium | high ────────────────
UPDATE safety_incidents SET severity = 'high'
WHERE lower(trim(severity)) IN ('severe', 'critical', 'major', 'fatal');

UPDATE safety_incidents SET severity = 'medium'
WHERE lower(trim(severity)) IN ('moderate', 'notable', 'significant');

UPDATE safety_incidents SET severity = 'low'
WHERE lower(trim(severity)) NOT IN ('low', 'medium', 'high');

-- ── 4. Normalise legacy status values → open | investigating | closed ─────────
UPDATE safety_incidents SET status = 'closed'
WHERE lower(trim(status)) IN ('resolved', 'completed', 'done', 'fixed', 'archived');

UPDATE safety_incidents SET status = 'investigating'
WHERE lower(trim(status)) IN ('in progress', 'in-progress', 'pending', 'review', 'under review');

UPDATE safety_incidents SET status = 'open'
WHERE lower(trim(status)) NOT IN ('open', 'investigating', 'closed');

-- ── 5. Add / replace CHECK constraints ───────────────────────────────────────
ALTER TABLE safety_incidents DROP CONSTRAINT IF EXISTS safety_incidents_severity_check;
ALTER TABLE safety_incidents ADD  CONSTRAINT safety_incidents_severity_check
  CHECK (severity IN ('low', 'medium', 'high'));

ALTER TABLE safety_incidents DROP CONSTRAINT IF EXISTS safety_incidents_status_check;
ALTER TABLE safety_incidents ADD  CONSTRAINT safety_incidents_status_check
  CHECK (status IN ('open', 'investigating', 'closed'));

-- ── 6. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_si_project_id ON safety_incidents(project_id);
CREATE INDEX IF NOT EXISTS idx_si_created_at ON safety_incidents(created_at);
CREATE INDEX IF NOT EXISTS idx_si_severity   ON safety_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_si_zone       ON safety_incidents(zone);

-- ── 7. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE safety_incidents ENABLE ROW LEVEL SECURITY;
DROP   POLICY IF EXISTS "Service role full access to safety_incidents" ON safety_incidents;
CREATE POLICY "Service role full access to safety_incidents"
  ON safety_incidents FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
