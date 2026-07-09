from pydantic_settings import BaseSettings
from typing import List, Optional


class Settings(BaseSettings):
    APP_NAME: str = "CivilAI"

    # Set DEBUG=false in production — exposes stack traces when true
    DEBUG: bool = False

    # Comma-separated allowed origins. Set to your actual frontend domain in production.
    # Example: "https://civilai.yourdomain.com"
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    GROQ_API_KEY: str
    GROQ_API_KEY_2: Optional[str] = None  # fallback key when primary hits daily TPD limit
    GEMINI_API_KEY: str
    SUPABASE_URL: str
    SUPABASE_SECRET_KEY: str
    HUGGINGFACE_TOKEN: str

    # Optional Redis URL for distributed rate limiting across multiple pods.
    # Falls back to in-memory rate limiting when not set.
    # Example: "redis://localhost:6379/0"
    REDIS_URL: Optional[str] = None

    # Voice Bot — TTS (Groq PlayAI is used by default, no key needed beyond GROQ_API_KEY)
    # ElevenLabs is a premium alternative: set ELEVENLABS_API_KEY to enable it
    ELEVENLABS_API_KEY: Optional[str] = None

    # Memory — mem0 cloud (optional; uses local Groq+Chroma when unset)
    MEM0_API_KEY: Optional[str] = None

    # Memory — Zep self-hosted (optional; docker compose up in getzep/zep)
    ZEP_BASE_URL: Optional[str] = None
    ZEP_API_KEY:  Optional[str] = None

    # When True, sensitive routes (/financials, /payments, /vendors, /contracts)
    # require a valid JWT Bearer token. The frontend's "Start Demo" button signs
    # into a real (seeded admin-role) Supabase account, so this stays on.
    AUTH_REQUIRED: bool = True

    # ── Observability ────────────────────────────────────────────────────────────
    # LangSmith — set both vars to trace every LLM call in the LangSmith dashboard
    LANGCHAIN_TRACING_V2: bool = False
    LANGCHAIN_API_KEY: Optional[str] = None
    LANGCHAIN_PROJECT: str = "civilai"

    # OpenTelemetry — set to your collector URL (Jaeger / Grafana Tempo / Honeycomb)
    # e.g. "http://localhost:4317"  Leave unset → spans go to console only.
    OTEL_EXPORTER_OTLP_ENDPOINT: Optional[str] = None

    # Wake word — Picovoice Porcupine (free key at picovoice.ai)
    PVPORCUPINE_ACCESS_KEY: Optional[str] = None

    # Material price live sync — FRED (Federal Reserve Economic Data), free key at
    # fred.stlouisfed.org. Sync stays off until both a key is set AND this is enabled,
    # so no environment silently starts hitting an external API on deploy.
    FRED_API_KEY: Optional[str] = None
    MATERIAL_PRICE_SYNC_ENABLED: bool = False
    MATERIAL_PRICE_SYNC_INTERVAL_HOURS: int = 24

    def get_origins(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    class Config:
        env_file = ".env"


settings = Settings()
