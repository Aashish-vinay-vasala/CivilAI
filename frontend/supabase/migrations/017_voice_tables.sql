-- Voice chat sessions — stores full conversation history per session
CREATE TABLE IF NOT EXISTS voice_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label      TEXT DEFAULT '',
  turns      JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_voice_sessions" ON voice_sessions;
CREATE POLICY "allow_all_voice_sessions"
  ON voice_sessions FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_created ON voice_sessions(created_at DESC);

-- Meeting recordings — diarization + transcript + summary + PDF reference
CREATE TABLE IF NOT EXISTS meeting_recordings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename     TEXT DEFAULT '',
  pdf_path     TEXT DEFAULT '',
  pdf_url      TEXT DEFAULT '',
  num_speakers INT  DEFAULT 0,
  segments     JSONB DEFAULT '[]',
  dialogue     JSONB DEFAULT '[]',
  summary      TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE meeting_recordings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_meeting_recordings" ON meeting_recordings;
CREATE POLICY "allow_all_meeting_recordings"
  ON meeting_recordings FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_meeting_recordings_created ON meeting_recordings(created_at DESC);

-- Storage bucket for generated meeting PDFs (public so URLs are shareable)
INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-reports', 'meeting-reports', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "allow_all_meeting_reports" ON storage.objects;
CREATE POLICY "allow_all_meeting_reports"
  ON storage.objects FOR ALL
  USING  (bucket_id = 'meeting-reports')
  WITH CHECK (bucket_id = 'meeting-reports');

NOTIFY pgrst, 'reload schema';
