-- financial_budget_items: real line items per project (imported or manual)
CREATE TABLE IF NOT EXISTS financial_budget_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID REFERENCES projects(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  description      TEXT NOT NULL,
  div_code         TEXT NOT NULL DEFAULT '',
  div_name         TEXT NOT NULL DEFAULT '',
  original_budget  NUMERIC(15,2) DEFAULT 0,
  budget_mods      NUMERIC(15,2) DEFAULT 0,
  approved_cos     NUMERIC(15,2) DEFAULT 0,
  revised_budget   NUMERIC(15,2) DEFAULT 0,
  pending_changes  NUMERIC(15,2) DEFAULT 0,
  projected_budget NUMERIC(15,2) DEFAULT 0,
  committed_costs  NUMERIC(15,2) DEFAULT 0,
  direct_costs     NUMERIC(15,2) DEFAULT 0,
  import_id        UUID,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- financial_change_history: real audit trail of budget changes
CREATE TABLE IF NOT EXISTS financial_change_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  user_name  TEXT NOT NULL DEFAULT 'User',
  field      TEXT NOT NULL,
  division   TEXT NOT NULL DEFAULT 'All Divisions',
  delta      NUMERIC(15,2) NOT NULL DEFAULT 0,
  reason     TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- financial_imports: tracks each import batch with metadata
CREATE TABLE IF NOT EXISTS financial_imports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
  company_name TEXT NOT NULL DEFAULT '',
  file_name    TEXT NOT NULL DEFAULT '',
  row_count    INTEGER DEFAULT 0,
  status       TEXT DEFAULT 'completed',
  notes        TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fbi_project_id ON financial_budget_items(project_id);
CREATE INDEX IF NOT EXISTS idx_fch_project_id ON financial_change_history(project_id);
CREATE INDEX IF NOT EXISTS idx_fi_project_id  ON financial_imports(project_id);
