-- add_task (backend/app/api/v1/routes/projects.py) has always inserted a `priority`
-- value into schedule_tasks, but the live table was created without that column, so
-- every task creation through the UI has been failing with PGRST204 ("Could not find
-- the 'priority' column of 'schedule_tasks' in the schema cache").

ALTER TABLE schedule_tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';

NOTIFY pgrst, 'reload schema';
