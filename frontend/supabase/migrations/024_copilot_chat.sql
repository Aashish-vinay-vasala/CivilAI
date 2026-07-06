-- Copilot chat sessions — full conversation history from the floating CivilAI
-- assistant widget (mirrors voice_sessions, but for typed/voice text chat turns)
CREATE TABLE IF NOT EXISTS copilot_chat_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label      TEXT DEFAULT '',
  messages   JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE copilot_chat_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_copilot_chat_sessions" ON copilot_chat_sessions;
CREATE POLICY "allow_all_copilot_chat_sessions"
  ON copilot_chat_sessions FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_copilot_chat_sessions_created ON copilot_chat_sessions(created_at DESC);

-- Copilot chat transcripts — PDF exports of a conversation, downloadable later
CREATE TABLE IF NOT EXISTS copilot_chat_transcripts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label      TEXT DEFAULT '',
  messages   JSONB NOT NULL DEFAULT '[]',
  pdf_path   TEXT DEFAULT '',
  pdf_url    TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE copilot_chat_transcripts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_copilot_chat_transcripts" ON copilot_chat_transcripts;
CREATE POLICY "allow_all_copilot_chat_transcripts"
  ON copilot_chat_transcripts FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_copilot_chat_transcripts_created ON copilot_chat_transcripts(created_at DESC);

-- Storage bucket for generated chat-transcript PDFs (public so URLs are shareable)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-transcripts', 'chat-transcripts', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "allow_all_chat_transcripts_storage" ON storage.objects;
CREATE POLICY "allow_all_chat_transcripts_storage"
  ON storage.objects FOR ALL
  USING  (bucket_id = 'chat-transcripts')
  WITH CHECK (bucket_id = 'chat-transcripts');

NOTIFY pgrst, 'reload schema';
