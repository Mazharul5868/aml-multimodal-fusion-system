import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# load environment variable from .env file
load_dotenv()

# build the connection
DB_USER=os.getenv("DATABASE_USER")
DB_PASSWORD=os.getenv("DATABASE_PASSWORD")
DB_HOST=os.getenv("DATABASE_HOST")
DB_PORT=os.getenv("DATABASE_PORT", "3306")
DB_NAME=os.getenv("DATABASE_NAME")

DATABASE_URL=f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# create the SQLAlchemy engine
engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,
)

# A factory for individual database sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db(): 
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()