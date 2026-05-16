-- Add metadata columns to cost_entries if they don't already exist
ALTER TABLE cost_entries
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS category    text,
  ADD COLUMN IF NOT EXISTS entry_date  date;
