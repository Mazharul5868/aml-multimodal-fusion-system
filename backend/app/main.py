"""
AML Diagnostic System - Main Application
Entry point for the FastAPI application
"""
import datetime
from pathlib import Path

import joblib
from app.api.v1 import api_router
from app.core import settings
from app.db.database import Base, engine, get_db
from app.models.patient import CBCData, Patient
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

# Initialize FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Multimodal decision-support system for AML detection",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
)

cors_origins = [origin.strip() for origin in settings.BACKEND_CORS_ORIGINS.split(",")]

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

upload_dir = Path(settings.UPLOAD_DIR)
upload_dir.mkdir(parents=True, exist_ok=True)  # Ensure directory exists

app.mount(
    "/uploads",
    StaticFiles(directory=str(upload_dir)),
    name="uploads"
)

# Include API router
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": f"{settings.PROJECT_NAME} API",
        "version": settings.VERSION,
        "status": "operational",
        "docs": f"{settings.API_V1_STR}/docs"
    }

@app.get("/test-db")
def test_connection(db: Session = Depends(get_db)):
    """Test database connection for real"""
    try:
        # Perform a physical query to the DB
        db.execute(text("SELECT 1"))
        return {"status": "Database is connected and responding!"}
    except Exception as e:
        return {"status": "Connection error", "detail": str(e)}

@app.on_event("startup")
async def startup_event():
    """Application startup"""
    print(f"🚀 {settings.PROJECT_NAME} starting...")
    # This line creates the tables in aml_diagnostic if they don't exist
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ Database tables initialized successfully")
    except Exception as e:
        print(f"❌ Database initialization failed: {e}")

    print("✅ All systems operational")


@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown"""
    print(f"🛑 {settings.PROJECT_NAME} shutting down...")
    # TODO: Close connections, cleanup
    print("✅ Shutdown complete")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )