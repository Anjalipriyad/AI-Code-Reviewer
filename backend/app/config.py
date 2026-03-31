"""
AI Code Reviewer — Application Configuration

Uses pydantic-settings to read from environment variables / .env file.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Database ──
    database_url: str | None = None
    postgres_user: str = "codereview"
    postgres_password: str = "changeme"
    postgres_db: str = "ai_code_reviewer"
    postgres_host: str = "db"
    postgres_port: int = 5432

    def get_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    # ── Auth ──
    secret_key: str = "CHANGE-ME"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # ── CORS ──
    backend_cors_origins: list[str] = ["http://localhost:3000"]

    # ── GitHub ──
    github_client_id: str = ""
    github_client_secret: str = ""

    # ── LLM ──
    openai_api_key: str = ""
    llm_model_name: str = "gpt-4o"
    llm_temperature: float = 0.1
    llm_max_tokens: int = 4096


settings = Settings()
