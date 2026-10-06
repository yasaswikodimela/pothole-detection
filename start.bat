@echo off
REM PotholeGuard — start both backend and frontend
REM Run this from: pothole-detection\

echo [1/3] Initialising database...
python -c "import sqlite3; from pathlib import Path; schema=Path('database/schema.sql').read_text(encoding='utf-8'); seed=Path('database/seed.sql').read_text(encoding='utf-8'); conn=sqlite3.connect('pothole_guard.db'); conn.executescript(schema); conn.executescript(seed); conn.close(); print('DB ready.')"

echo.
echo [2/3] Starting FastAPI backend on http://localhost:8000 ...
start "PotholeGuard Backend" cmd /k "uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000"

echo.
echo [3/3] Starting React frontend on http://localhost:3000 ...
start "PotholeGuard Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Both servers starting...
echo Backend: http://localhost:8000
echo Frontend: http://localhost:3000
echo API Docs: http://localhost:8000/docs
