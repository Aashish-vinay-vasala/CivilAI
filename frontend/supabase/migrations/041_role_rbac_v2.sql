-- Role model v2: 5-role RBAC (admin, project_manager, site_engineer, viewer,
-- procurement_manager) replacing the old 4-role scheme
-- (project_director, admin, engineer, contractor). Also adds account_type
-- (demo vs real self-registered user) and otp_verified (Google-OAuth
-- signup step-up gate; password signups don't need it).

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

UPDATE profiles SET role = CASE role
  WHEN 'project_director' THEN 'project_manager'
  WHEN 'engineer'         THEN 'site_engineer'
  WHEN 'contractor'       THEN 'procurement_manager'
  ELSE role  -- 'admin' unchanged
END;

ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'viewer';
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin','project_manager','site_engineer','viewer','procurement_manager'));

-- Distinguish seeded demo accounts (share the global/demo data pool) from
-- real self-registered users (get their own private, empty data space).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'real'
  CHECK (account_type IN ('demo','real'));

-- Google-OAuth signup step-up: false until the emailed OTP is confirmed.
-- Password signups never need this (default true).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS otp_verified BOOLEAN NOT NULL DEFAULT true;

-- Retire the old single hardcoded demo login in favor of the 5-role demo
-- picker (backend/app/core/demo_accounts.py). vasalaaashishvinay@gmail.com
-- is a personal dev account, not part of the demo pool, so it stays 'real'.
UPDATE profiles SET account_type = 'demo'
  WHERE email = 'aashishvinayvasala@gmail.com';

-- handle_new_user: only Google-OAuth signups start unverified; role is left
-- at the trigger-default ('viewer') and set for real by the backend's
-- POST /api/v1/auth/complete-signup (service-role, bypasses protect_profile_role).
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, otp_verified)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_app_meta_data->>'provider' IS DISTINCT FROM 'google'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
