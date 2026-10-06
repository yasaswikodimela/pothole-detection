"""
main.py
=======
PotholeGuard FastAPI backend entry point.

Run with:
    uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000

API documentation auto-generated at:
    http://localhost:8000/docs    (Swagger UI)
    http://localhost:8000/redoc   (ReDoc)
"""

import pathlib
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.app.database.db import init_db
from backend.app.api import (
    detect,
    detections,
    dashboard,
    analytics,
    model_metrics,
    health,
)

# Path helpers
_ROOT = pathlib.Path(__file__).resolve().parents[2]   # pothole-detection/
_ML_RESULTS = _ROOT / "ml" / "results"


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan (startup / shutdown)
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise the database and load the YOLO model on startup."""
    await init_db()
    yield
    # Cleanup (if required) can go here


# ─────────────────────────────────────────────────────────────────────────────
# Application
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="PotholeGuard API",
    description=(
        "Real-time pothole detection backend using YOLOv8 trained on RDD2022 (India, D40). "
        "Provides detection endpoints, data-warehouse storage, OLAP analytics, "
        "and K-Means road-clustering."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(health.router,         prefix="",                tags=["Health"])
app.include_router(detect.router,         prefix="/detect",         tags=["Detection"])
app.include_router(detections.router,     prefix="/detections",     tags=["Detection History"])
app.include_router(dashboard.router,      prefix="/dashboard",      tags=["Dashboard"])
app.include_router(analytics.router,      prefix="/analytics",      tags=["DMDW Analytics"])
app.include_router(model_metrics.router,  prefix="/model",          tags=["Model Metrics"])

# ── Static files (YOLO validation plots & test samples for React frontend) ───
if _ML_RESULTS.exists():
    app.mount("/static/results", StaticFiles(directory=str(_ML_RESULTS)), name="ml_results")

_ML_TEST_IMAGES = _ROOT / "ml" / "dataset" / "images" / "test"
if _ML_TEST_IMAGES.exists():
    app.mount("/static/samples", StaticFiles(directory=str(_ML_TEST_IMAGES)), name="ml_samples")


