"""
Minimal Supabase client factory. Not legacy/unused — app/services/db_service.py
is the main data-access layer used throughout the app (with its own client
configured for connection-reuse workarounds), but a handful of call sites
(voice_db_service.py, and lazy imports in copilot.py/voice.py) import the
plain `supabase` client from here instead.
"""

from supabase import create_client, Client
from app.config import settings

supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SECRET_KEY
)

def get_db():
    return supabase