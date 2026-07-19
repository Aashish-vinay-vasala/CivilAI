-- Per-user data isolation, core-4 scope (projects, cost, schedule, safety).
-- Real enforcement lives in FastAPI (backend/app/services/scoping.py) since
-- the backend's service-role key bypasses RLS entirely — these policies are
-- defense-in-depth for any direct frontend->Supabase reads.
--
-- owner_id IS NULL == the shared/legacy/demo data pool (all demo accounts
-- see it). owner_id = auth.uid() == a real self-registered user's private data.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select_scoped" ON projects;
CREATE POLICY "projects_select_scoped" ON projects FOR SELECT
  USING (owner_id IS NULL OR owner_id = auth.uid());

DROP POLICY IF EXISTS "projects_insert_own" ON projects;
CREATE POLICY "projects_insert_own" ON projects FOR INSERT
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "projects_update_own" ON projects;
CREATE POLICY "projects_update_own" ON projects FOR UPDATE
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "projects_delete_own" ON projects;
CREATE POLICY "projects_delete_own" ON projects FOR DELETE
  USING (owner_id = auth.uid());

-- Reusable pattern for tables that already FK to projects.id via project_id
-- (cost_entries, schedule_tasks, safety_incidents today; extend to the
-- deferred ~18 modules' tables the same way when their routers get scoped).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cost_entries','schedule_tasks','safety_incidents']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_scoped" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_scoped" ON %I FOR ALL USING (
         project_id IN (SELECT id FROM projects WHERE owner_id IS NULL OR owner_id = auth.uid())
       ) WITH CHECK (
         project_id IN (SELECT id FROM projects WHERE owner_id IS NULL OR owner_id = auth.uid())
       )', t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
