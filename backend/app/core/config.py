"""
Core configuration settings
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings"""
    
    # API
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "AML Diagnostic System"
    VERSION: str = "1.0.0"
    
    # CORS
    BACKEND_CORS_ORIGINS: str = "http://localhost:3000"

    # Database
    DATABASE_HOST: str = "localhost"
    DATABASE_PORT: int = 3306
    DATABASE_USER: str = "root"
    DATABASE_PASSWORD: str = ""
    DATABASE_NAME: str = "aml_diagnostic"
    
    # File Storage
    UPLOAD_DIR: str = "uploads"
    MAX_FILE_SIZE: int = 10485760  # 10MB
    
    # Models
    MODEL_DIR: str = "models"
    
    model_config = {
        "env_file": ".env",
        "case_sensitive": True
    }

settings = Settings()