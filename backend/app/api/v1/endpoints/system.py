from datetime import datetime

from fastapi import APIRouter

router = APIRouter()

@router.api_route("/health", methods=["GET", "HEAD"])
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now()
    }