-- Customer support ticket system with AI auto-response
-- Used by backend/app/api/v1/routes/support.py and backend/app/ai/support_analyzer.py

CREATE TABLE IF NOT EXISTS support_tickets (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email    TEXT NOT NULL,
  user_name     TEXT DEFAULT 'Anonymous',
  subject       TEXT NOT NULL,
  description   TEXT NOT NULL,
  category      TEXT DEFAULT 'general',
  priority      TEXT DEFAULT 'medium',
  status        TEXT DEFAULT 'open'
                CHECK (status IN ('open','in_progress','resolved','closed')),
  ai_response   TEXT,
  ai_resolved   BOOLEAN DEFAULT FALSE,
  assigned_to   TEXT,
  project_id    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_support_tickets" ON support_tickets;
CREATE POLICY "allow_all_support_tickets"
  ON support_tickets FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status     ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_email  ON support_tickets(user_email);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created     ON support_tickets(created_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id   UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender      TEXT CHECK (sender IN ('user','ai','agent')),
  sender_name TEXT DEFAULT '',
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_support_messages" ON support_messages;
CREATE POLICY "allow_all_support_messages"
  ON support_messages FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id, created_at);

NOTIFY pgrst, 'reload schema';
