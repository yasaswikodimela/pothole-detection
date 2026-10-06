# PotholeGuard — Backend API

FastAPI backend for the PotholeGuard pothole detection system.

## Quick Start

```bash
# From the repo root
pip install -r backend/requirements.txt

# Start the server
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

API documentation:
- Swagger UI → http://localhost:8000/docs
- ReDoc      → http://localhost:8000/redoc

## Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/health` | Health check |
| POST | `/detect/image` | Upload image, detect potholes |
| POST | `/detect/frame` | Base64 frame (live camera) |
| POST | `/detect/video` | Upload video, detect potholes |
| GET | `/detections` | List detection history (paginated) |
| GET | `/detections/{id}` | Get single detection record |
| GET | `/dashboard/summary` | Dashboard KPIs and chart data |
| GET | `/analytics/olap/rollup/monthly` | OLAP Roll-Up (daily → monthly) |
| GET | `/analytics/olap/rollup/yearly` | OLAP Roll-Up (monthly → yearly) |
| GET | `/analytics/olap/drilldown` | OLAP Drill-Down |
| GET | `/analytics/olap/slice` | OLAP Slice (one dimension) |
| GET | `/analytics/olap/dice` | OLAP Dice (multi-dimension) |
| GET | `/analytics/clusters` | K-Means road clustering |
| GET | `/model/metrics` | Actual model evaluation metrics |
| GET | `/model/info` | Model metadata |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite+aiosqlite:///pothole_guard.db` | Database connection string |

## Project Requirements

- Python 3.8+
- The trained model (`ml/models/best.pt`) must exist before starting the server.
- SQLite database is created automatically on first startup.
