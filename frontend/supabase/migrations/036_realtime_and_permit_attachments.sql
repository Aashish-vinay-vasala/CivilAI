-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query
-- Two independent fixups bundled together:
--
-- 1. `documents` and `permits` drive the Documents and Compliance pages but,
--    unlike cost_entries/invoices (027) and schedule_tasks/workforce/
--    safety_incidents/projects (030), were never added to the
--    supabase_realtime publication — so an upload/permit change in one tab
--    never live-refreshes another tab or teammate's view. useSupabaseSync
--    already knows how to subscribe; nothing was emitted until this runs.
--    Guarded because both tables were created ad hoc and their current
--    publication membership isn't known ahead of time.
--
-- 2. `permits` gains file-attachment columns so a permit entry can optionally
--    link to its uploaded document (mirrors the new contracts.file_url/
--    file_name/bucket columns from 035_contracts.sql), backing the new
--    POST /compliance/permits/upload endpoint.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE documents;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE permits;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE permits ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE permits ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE permits ADD COLUMN IF NOT EXISTS bucket TEXT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
