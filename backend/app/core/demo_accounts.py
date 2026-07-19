"""Single source of truth for the 5 seeded demo accounts — one per role.

Used by both backend/scripts/seed_demo_users.py (to create/upsert them) and
POST /api/v1/auth/demo-login (to sign into them without ever exposing a
password to the frontend). Reuses the 4 auth.users rows that already existed
under the old role scheme, remapped to the new one, plus one new viewer account.
"""

DEMO_ACCOUNTS = [
    {"email": "director@civilai.com",   "role": "project_manager",     "password": "Director@2024",   "full_name": "Morgan Ellis"},
    {"email": "admin@civilai.com",      "role": "admin",               "password": "Admin@2024",      "full_name": "Jordan Blake"},
    {"email": "engineer@civilai.com",   "role": "site_engineer",       "password": "Engineer@2024",   "full_name": "Sam Rivera"},
    {"email": "contractor@civilai.com", "role": "procurement_manager", "password": "Contractor@2024", "full_name": "Casey Nguyen"},
    {"email": "viewer@civilai.com",     "role": "viewer",              "password": "Viewer@2024",     "full_name": "Alex Kim"},
]

DEMO_ACCOUNTS_BY_ROLE = {acc["role"]: acc for acc in DEMO_ACCOUNTS}
