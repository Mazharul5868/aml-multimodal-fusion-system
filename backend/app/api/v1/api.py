"""
API v1 router - aggregates all endpoint routers
"""
from fastapi import APIRouter

from .endpoints import analysis, images, labels, patients, system

api_router = APIRouter()

# Include all endpoint routers
api_router.include_router(patients.router, prefix="/patients", tags=["patients"])
api_router.include_router(images.router, prefix="/images", tags=["images"])
api_router.include_router(analysis.router, prefix="/analysis", tags=["analysis"])
# api_router.include_router(labels.router, prefix="/labels", tags=["labels"])
api_router.include_router(system.router, prefix="/system", tags=["system"])