-- Human-in-the-loop review queue for high-risk AI outputs.
-- Used by backend/app/core/hitl.py (writes) and backend/app/api/v1/routes/review.py (reads/decisions).

CREATE TABLE IF NOT EXISTS ai_review_queue (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  route           TEXT NOT NULL,
  trigger_reason  TEXT NOT NULL,
  payload_summary TEXT,
  ai_output       TEXT,
  risk_score      FLOAT DEFAULT 0,
  status          TEXT DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_name   TEXT,
  reviewed_at     TIMESTAMPTZ,
  notes           TEXT,
  project_id      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_review_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_ai_review_queue" ON ai_review_queue;
CREATE POLICY "allow_all_ai_review_queue"
  ON ai_review_queue FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ai_review_queue_status  ON ai_review_queue(status);
CREATE INDEX IF NOT EXISTS idx_ai_review_queue_route    ON ai_review_queue(route);
CREATE INDEX IF NOT EXISTS idx_ai_review_queue_created  ON ai_review_queue(created_at DESC);

NOTIFY pgrst, 'reload schema';
