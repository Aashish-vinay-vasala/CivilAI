-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query

CREATE TABLE IF NOT EXISTS tenders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','submitted','won','lost','no-bid')),
  summary       JSONB,
  requirements  JSONB,
  gap_result    JSONB,
  file_name     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tenders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own tenders"
  ON tenders FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tenders"
  ON tenders FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tenders"
  ON tenders FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tenders"
  ON tenders FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS tenders_user_created
  ON tenders(user_id, created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenders_updated_at
  BEFORE UPDATE ON tenders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
