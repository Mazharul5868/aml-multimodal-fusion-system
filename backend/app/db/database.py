from pathlib import Path
from urllib.parse import quote_plus

from app.core.config import settings
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = Path(__file__).resolve().parents[2]


def resolve_path(path_value: str | None) -> str | None:
    if not path_value:
        return None

    path = Path(path_value)
    if not path.is_absolute():
        path = BASE_DIR / path

    return str(path)

DATABASE_URL = (
    f"mysql+pymysql://{quote_plus(settings.DB_USER)}:"
    f"{quote_plus(settings.DB_PASSWORD)}@"
    f"{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}"
)


ssl_ca = resolve_path(settings.DB_SSL_CA)

connect_args = {}
if ssl_ca:
    if not Path(ssl_ca).exists():
        raise FileNotFoundError(f"SSL CA certificate not found: {ssl_ca}")
    connect_args["ssl"] = {"ca": ssl_ca}

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args=connect_args,
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()