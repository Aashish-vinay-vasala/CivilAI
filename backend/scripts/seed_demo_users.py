"""
One-off, idempotent seed script for the 5 demo accounts (one per role) shown
on the login page's demo role picker.

Creates each account as a real Supabase Auth user (email-confirmed, real
password) and sets its profiles row (role, account_type='demo',
otp_verified=true) so backend RBAC and POST /api/v1/auth/demo-login both
work. Safe to re-run: existing accounts are left untouched aside from
making sure their profile row is correct.

Credentials live in app/core/demo_accounts.py — the single source of truth
also used by the demo-login endpoint.

Usage:
    python backend/scripts/seed_demo_users.py
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.db_service import supabase  # service-role client
from app.core.demo_accounts import DEMO_ACCOUNTS


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
    failures = []
    for account in DEMO_ACCOUNTS:
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

        response = supabase.table("profiles").upsert({
            "id": user_id,
            "email": account["email"],
            "full_name": account["full_name"],
            "role": account["role"],
            "account_type": "demo",
            "otp_verified": True,
        }).execute()

        # The previous version of this script never checked the response —
        # a silent upsert failure left 4 auth.users rows with no matching
        # profiles row at all, and nobody noticed until a live query caught it.
        if not response.data:
            failures.append(account["email"])
            print(f"         -> FAILED to upsert profile for {account['email']}")
        else:
            print(f"         -> role set to '{account['role']}'")

    if failures:
        raise RuntimeError(f"Failed to seed profiles for: {', '.join(failures)}")


if __name__ == "__main__":
    main()
