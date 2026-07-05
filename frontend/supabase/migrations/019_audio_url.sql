-- Add audio_url column to both recording tables so uploaded audio can be played back
ALTER TABLE vad_recordings     ADD COLUMN IF NOT EXISTS audio_url TEXT DEFAULT '';
ALTER TABLE meeting_recordings ADD COLUMN IF NOT EXISTS audio_url TEXT DEFAULT '';

NOTIFY pgrst, 'reload schema';
