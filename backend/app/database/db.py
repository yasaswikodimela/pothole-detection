"""
db.py
=====
Async SQLAlchemy database layer for PotholeGuard.

Uses SQLite (via aiosqlite) for local development.
The schema is read from database/schema.sql and applied on first run.

Switching to PostgreSQL later:
    Change DATABASE_URL to postgresql+asyncpg://...
    Install: pip install asyncpg

Fix note: aiosqlite's connection adapter (AsyncAdapt_aiosqlite_connection) does
NOT expose executescript. We therefore call stdlib sqlite3 directly for schema
initialization. The underlying .db file is shared by both libraries.
"""

import os
import sqlite3 as _sqlite3
from pathlib import Path

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text


# ── Database URL ──────────────────────────────────────────────────────────────
_DB_PATH = Path(__file__).resolve().parent.parent.parent.parent / "pothole_guard.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{_DB_PATH}")

# ── Engine ────────────────────────────────────────────────────────────────────
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# ── Schema / seed paths ────────────────────────────────────────────────────────
_SCHEMA_SQL = (
    Path(__file__).resolve()
    .parent.parent.parent.parent   # pothole-detection/
    / "database" / "schema.sql"
)
_SEED_SQL = _SCHEMA_SQL.parent / "seed.sql"


async def init_db() -> None:
    """
    Create all tables (idempotent — CREATE TABLE IF NOT EXISTS) and seed dimensions.

    Uses stdlib sqlite3 directly because the aiosqlite async adapter does not
    expose executescript on its connection proxy object.
    """
    if "sqlite" in DATABASE_URL:
        schema_text = _SCHEMA_SQL.read_text(encoding="utf-8")
        seed_text   = _SEED_SQL.read_text(encoding="utf-8")
        with _sqlite3.connect(str(_DB_PATH)) as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            conn.executescript(schema_text)
            conn.executescript(seed_text)
    else:
        # PostgreSQL / other — fall back to per-statement execution
        async with engine.begin() as conn:
            await conn.execute(text("PRAGMA foreign_keys = ON"))
            for stmt in _SCHEMA_SQL.read_text(encoding="utf-8").split(";"):
                stmt = stmt.strip()
                if stmt:
                    await conn.execute(text(stmt))


# ── Dependency injection ──────────────────────────────────────────────────────

async def get_db():
    """FastAPI dependency that yields an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
