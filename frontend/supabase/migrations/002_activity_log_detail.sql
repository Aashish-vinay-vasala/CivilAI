-- Run in Supabase SQL Editor to add missing columns to activity_log
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS module TEXT NOT NULL DEFAULT 'App';
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS detail TEXT;
