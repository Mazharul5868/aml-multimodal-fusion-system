"""
Core configuration settings
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings"""
    
    # API
    API_V1_STR: str
    PROJECT_NAME: str
    VERSION: str
    
    # CORS
    BACKEND_CORS_ORIGINS: str

    # Database
    DB_HOST: str
    DB_PORT: int
    DB_USER: str
    DB_PASSWORD: str
    DB_NAME: str
    DB_SSL_CA: str | None = None
    
    # File Storage
    UPLOAD_DIR: str
    MAX_FILE_SIZE: int
    MODEL_DIR: str

    # Hugging Face
    HF_REPO_ID: str | None = None
    HF_TOKEN: str | None = None
    
    CLOUDINARY_CLOUD_NAME: str | None = None
    CLOUDINARY_API_KEY: str | None = None
    CLOUDINARY_API_SECRET: str | None = None
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"

settings = Settings()