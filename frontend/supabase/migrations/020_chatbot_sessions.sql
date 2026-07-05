-- Copilot session memory
-- Used by backend/app/ai/chatbot_memory.py to persist conversation history
-- across channels (web, whatsapp, slack)

CREATE TABLE IF NOT EXISTS chatbot_sessions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id  TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     TEXT NOT NULL,
  channel     TEXT DEFAULT 'web',
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_sid
  ON chatbot_sessions(session_id, created_at DESC);
