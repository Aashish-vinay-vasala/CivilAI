-- Fields the Settings > Profile page lets a user edit about themselves.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone   TEXT NOT NULL DEFAULT '';

-- profiles_update_own (022) lets a user UPDATE their own row, but doesn't
-- restrict *which* columns — as written, a signed-in user could set their
-- own `role` to 'admin' via a direct client-side update. Only the backend's
-- service-role client (used by admin/seed flows) may change `role`; a
-- self-service update that tries to change it has that change silently
-- reverted instead of erroring out, so unrelated field edits still succeed.
CREATE OR REPLACE FUNCTION protect_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND auth.role() <> 'service_role' THEN
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_role_trigger ON profiles;
CREATE TRIGGER protect_profile_role_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_role();

NOTIFY pgrst, 'reload schema';
