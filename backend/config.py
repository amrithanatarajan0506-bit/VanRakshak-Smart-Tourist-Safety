import os
from pydantic_settings import BaseSettings
from pydantic import Field, field_validator, model_validator
from dotenv import load_dotenv
from cryptography.fernet import Fernet

load_dotenv()

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./vanrakshak.db"
    SECRET_KEY: str = Field(default="029sH8BNmLZFcBxMsZa9kG2DlC8UdmudU5cElapcAjyh6idKggLQ9Jz210M6nr1y", min_length=32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    OWM_API_KEY: str = ""  # OpenWeatherMap — leave blank to use mock data
    USE_POSTGIS: bool = False
    FERNET_KEY: str = Field(default="LWFmK3ESmbfvxtvR1MbOpVG_u_TpJkkffqcVMtj9W6Y=", min_length=44)
    APP_ENV: str = "development"
    STAFF_USERNAME: str = Field(default="vanrakshak", min_length=1)
    STAFF_PASSWORD: str = Field(default="Vanrakshak@123", min_length=12)
    ALLOW_DEMO_CREDENTIALS: bool = True

    @field_validator("FERNET_KEY", mode="before")
    @classmethod
    def validate_fernet_key(cls, value: str) -> str:
        if not value or len(value) < 44:
            return "LWFmK3ESmbfvxtvR1MbOpVG_u_TpJkkffqcVMtj9W6Y="
        try:
            Fernet(value.encode())
            return value
        except Exception:
            return "LWFmK3ESmbfvxtvR1MbOpVG_u_TpJkkffqcVMtj9W6Y="

    @model_validator(mode="after")
    def reject_default_staff_credentials_in_production(self):
        if not self.ALLOW_DEMO_CREDENTIALS and self.APP_ENV.lower() in {"prod", "production"} and (
            self.STAFF_USERNAME == "vanrakshak"
            or self.STAFF_PASSWORD == "Vanrakshak@123"
        ):
            raise ValueError("Production requires unique STAFF_USERNAME and STAFF_PASSWORD values.")
        return self

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
