"""
One-off, idempotent seed script for the 4 demo accounts shown on the login page.

Creates each account as a real Supabase Auth user (email-confirmed, real
password) and sets its profiles.role so backend RBAC (protect_route) works
for the demo. Safe to re-run: existing accounts are left untouched aside
from making sure their profile role is correct.

Usage:
    python backend/scripts/seed_demo_users.py
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.db_service import supabase  # service-role client

DEMO_USERS = [
    {"email": "director@civilai.com",   "password": "Director@2024",   "full_name": "Sarah Chen",   "role": "project_director"},
    {"email": "admin@civilai.com",      "password": "Admin@2024",      "full_name": "James Wilson", "role": "admin"},
    {"email": "engineer@civilai.com",   "password": "Engineer@2024",   "full_name": "Priya Patel",  "role": "engineer"},
    {"email": "contractor@civilai.com", "password": "Contractor@2024", "full_name": "Mike Torres",  "role": "contractor"},
]


def find_existing_user(email: str):
    page = 1
    while True:
        result = supabase.auth.admin.list_users(page=page, per_page=200)
        users = result if isinstance(result, list) else getattr(result, "users", [])
        if not users:
            return None
        for u in users:
            if u.email and u.email.lower() == email.lower():
                return u
        if len(users) < 200:
            return None
        page += 1


def main():
    for account in DEMO_USERS:
        existing = find_existing_user(account["email"])
        if existing:
            user_id = existing.id
            print(f"[skip] {account['email']} already exists ({user_id})")
        else:
            created = supabase.auth.admin.create_user({
                "email": account["email"],
                "password": account["password"],
                "email_confirm": True,
                "user_metadata": {"full_name": account["full_name"]},
            })
            user_id = created.user.id
            print(f"[created] {account['email']} ({user_id})")

        supabase.table("profiles").upsert({
            "id": user_id,
            "email": account["email"],
            "full_name": account["full_name"],
            "role": account["role"],
        }).execute()
        print(f"         -> role set to '{account['role']}'")


if __name__ == "__main__":
    main()
