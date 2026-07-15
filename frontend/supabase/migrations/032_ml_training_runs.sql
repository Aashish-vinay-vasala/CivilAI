-- Versioned training-run history + uploaded-dataset staging for the cost-overrun ML model.
-- Lets the trainer keep every past model version (never overwrite the original baseline
-- in place) and record exactly which datasets + hyperparameters produced each version,
-- so predictions can be audited and any past version can be reactivated.

CREATE TABLE IF NOT EXISTS ml_training_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name        TEXT NOT NULL,
  version           INT NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT false,
  is_baseline_only  BOOLEAN NOT NULL DEFAULT false,
  dataset_sources   JSONB NOT NULL DEFAULT '[]',
  total_rows        INT NOT NULL DEFAULT 0,
  params            JSONB NOT NULL DEFAULT '{}',
  metrics           JSONB NOT NULL DEFAULT '{}',
  artifact_dir      TEXT NOT NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ml_training_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_ml_training_runs" ON ml_training_runs;
CREATE POLICY "allow_all_ml_training_runs"
  ON ml_training_runs FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ml_training_runs_model ON ml_training_runs(model_name, version DESC);

-- Uploaded CSV/XLSX datasets, staged after column validation and before (optionally) being
-- folded into a training run. Kept distinct from ml_training_runs so "upload/validate" and
-- "train" remain two separate user actions.
CREATE TABLE IF NOT EXISTS ml_dataset_uploads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name      TEXT NOT NULL,
  filename        TEXT NOT NULL,
  storage_path    TEXT NOT NULL,
  row_count       INT NOT NULL,
  column_mapping  JSONB NOT NULL DEFAULT '{}',
  validation      JSONB NOT NULL DEFAULT '{}',
  parsed_rows     JSONB NOT NULL DEFAULT '[]',
  status          TEXT NOT NULL DEFAULT 'validated',
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_in_run     UUID REFERENCES ml_training_runs(id)
);

ALTER TABLE ml_dataset_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_ml_dataset_uploads" ON ml_dataset_uploads;
CREATE POLICY "allow_all_ml_dataset_uploads"
  ON ml_dataset_uploads FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ml_dataset_uploads_model ON ml_dataset_uploads(model_name, status);

-- Private bucket — raw uploaded training files, not meant to be publicly linkable.
INSERT INTO storage.buckets (id, name, public)
VALUES ('ml-datasets', 'ml-datasets', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "allow_all_ml_datasets_storage" ON storage.objects;
CREATE POLICY "allow_all_ml_datasets_storage"
  ON storage.objects FOR ALL
  USING  (bucket_id = 'ml-datasets')
  WITH CHECK (bucket_id = 'ml-datasets');

NOTIFY pgrst, 'reload schema';
