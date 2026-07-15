-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query
-- Vendor/subcontractor register — backs backend/app/api/v1/routes/vendors.py.
-- Previously the Vendors page (Workforce → Vendors) had no table at all; the
-- register, KPIs, and AI score/compare/report actions all ran on hardcoded
-- frontend data. This gives it the same persisted-table + CRUD pattern every
-- other module (workforce, equipment, material_prices) already has.

-- ─────────────────────────────────────────
-- 1. vendors table
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID REFERENCES projects(id) ON DELETE SET NULL,
  name                  TEXT NOT NULL,
  vendor_type           TEXT NOT NULL DEFAULT '',
  contact_name          TEXT NOT NULL DEFAULT '',
  email                 TEXT NOT NULL DEFAULT '',
  phone                 TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'Approved'
                        CHECK (status IN ('Preferred', 'Approved', 'Review', 'Blacklisted')),
  score                 FLOAT NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  delivery_score        FLOAT NOT NULL DEFAULT 0 CHECK (delivery_score BETWEEN 0 AND 100),
  quality_score         FLOAT NOT NULL DEFAULT 0 CHECK (quality_score BETWEEN 0 AND 100),
  safety_score          FLOAT NOT NULL DEFAULT 0 CHECK (safety_score BETWEEN 0 AND 100),
  financial_rating      TEXT NOT NULL DEFAULT 'Good',
  years_experience      INTEGER NOT NULL DEFAULT 0,
  completed_projects    INTEGER NOT NULL DEFAULT 0,
  safety_incidents      INTEGER NOT NULL DEFAULT 0,
  certifications        TEXT[] NOT NULL DEFAULT '{}',
  notes                 TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_status  ON vendors(status);
CREATE INDEX IF NOT EXISTS idx_vendors_project ON vendors(project_id);

-- ─────────────────────────────────────────
-- 2. RLS — service role key bypasses RLS
-- ─────────────────────────────────────────
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access to vendors" ON vendors;
CREATE POLICY "Service role full access to vendors"
  ON vendors FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────
-- 3. Realtime — so an add/edit/delete in one tab (or by a teammate) refreshes
--    the register and any dependent module (e.g. Procurement's vendor picker)
--    everywhere else without a manual reload. useSupabaseSync subscribes to this.
-- ─────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE vendors;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
