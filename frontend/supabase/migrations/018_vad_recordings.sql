-- VAD analysis records (WebRTC and Silero results + generated PDFs)
CREATE TABLE IF NOT EXISTS vad_recordings (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  filename     TEXT    DEFAULT '',
  engine       TEXT    DEFAULT '',
  pdf_path     TEXT    DEFAULT '',
  pdf_url      TEXT    DEFAULT '',
  speech_ratio FLOAT   DEFAULT 0,
  num_segments INT     DEFAULT 0,
  segments     JSONB   DEFAULT '[]',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vad_recordings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_vad_recordings" ON vad_recordings;
CREATE POLICY "allow_all_vad_recordings"
  ON vad_recordings FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_vad_recordings_created ON vad_recordings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vad_recordings_engine  ON vad_recordings(engine);

NOTIFY pgrst, 'reload schema';
