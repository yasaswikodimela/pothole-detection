"""
health.py  — /health router
============================
Simple health check endpoint.
"""

from datetime import datetime
from fastapi import APIRouter

router = APIRouter()

@router.get("/health", summary="Health check")
async def health():
    return {
        "status": "ok",
        "service": "PotholeGuard API",
        "timestamp": datetime.utcnow().isoformat(),
    }
