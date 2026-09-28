from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent

class Settings(BaseSettings):
    groq_api_key: str = ""
    groq_text_model: str = "openai/gpt-oss-20b"
    groq_vision_model: str = "qwen/qwen3.8-27b"
    frontend_origin: str = "http://localhost:5173"
    app_env: str = "development"
    max_upload_mb: int = 15

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

settings = Settings()
KNOWLEDGE_DIR = BASE_DIR / "knowledge"
DATA_DIR = BASE_DIR / "data"
METADATA_FILE = DATA_DIR / "documents.json"
AUDIT_FILE = DATA_DIR / "audit_log.json"
