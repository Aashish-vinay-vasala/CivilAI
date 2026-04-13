from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    APP_NAME: str = "CivilAI"
    DEBUG: bool = True
    ALLOWED_ORIGINS: str = "http://localhost:3000"
    
    GROQ_API_KEY: str
    GEMINI_API_KEY: str
    SUPABASE_URL: str
    SUPABASE_SECRET_KEY: str
    HUGGINGFACE_TOKEN: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    def get_origins(self) -> List[str]:
        return self.ALLOWED_ORIGINS.split(",")

    class Config:
        env_file = ".env"

settings = Settings()