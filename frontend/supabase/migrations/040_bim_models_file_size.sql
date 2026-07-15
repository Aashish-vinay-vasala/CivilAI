-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query
-- Adds file_size so the BIM upload-history UI can show something more than
-- a filename/date per row (backend/app/api/v1/routes/bim.py).

ALTER TABLE bim_models ADD COLUMN IF NOT EXISTS file_size BIGINT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
