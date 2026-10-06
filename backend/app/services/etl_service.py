"""
etl_service.py
==============
ETL (Extract → Transform → Load) pipeline for the PotholeGuard data warehouse.

This service transforms a DetectionResult (from YOLO inference) into star-schema
records and inserts them into the SQLite data warehouse.

Steps
-----
1. EXTRACT  — receive DetectionResult from the YOLO detection service
2. TRANSFORM — derive Date_ID, Time_ID, look up / create Location, Road,
               Severity dimensions
3. LOAD      — insert into Pothole_Detection_Fact

Author: PotholeGuard project
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.detection import DetectionResult, Source


# ── Time helpers ──────────────────────────────────────────────────────────────

def _date_id(dt: datetime) -> int:
    """Derive Date_ID (YYYYMMDD integer) from a datetime."""
    return dt.year * 10000 + dt.month * 100 + dt.day


def _time_id(dt: datetime) -> int:
    """Derive Time_ID (HHMMSS integer) from a datetime."""
    return dt.hour * 10000 + dt.minute * 100 + dt.second


def _shift(hour: int) -> str:
    if 5 <= hour < 12:
        return "Morning"
    elif 12 <= hour < 17:
        return "Afternoon"
    elif 17 <= hour < 21:
        return "Evening"
    else:
        return "Night"


def _quarter(month: int) -> int:
    return (month - 1) // 3 + 1


def _day_name(dt: datetime) -> str:
    return dt.strftime("%A")


def _month_name(dt: datetime) -> str:
    return dt.strftime("%B")


def _is_weekend(dt: datetime) -> int:
    return 1 if dt.weekday() >= 5 else 0


# ── Dimension helpers ──────────────────────────────────────────────────────────

async def _ensure_date_dim(db: AsyncSession, dt: datetime) -> int:
    """Insert or skip Date_Dim row; return Date_ID."""
    date_id = _date_id(dt)
    await db.execute(
        text("""
        INSERT OR IGNORE INTO Date_Dim
            (Date_ID, Full_Date, Day, Day_Name, Week_Number,
             Month, Month_Name, Quarter, Year, Is_Weekend)
        VALUES
            (:date_id, :full_date, :day, :day_name, :week,
             :month, :month_name, :quarter, :year, :is_weekend)
        """),
        {
            "date_id":    date_id,
            "full_date":  dt.strftime("%Y-%m-%d"),
            "day":        dt.day,
            "day_name":   _day_name(dt),
            "week":       dt.isocalendar()[1],
            "month":      dt.month,
            "month_name": _month_name(dt),
            "quarter":    _quarter(dt.month),
            "year":       dt.year,
            "is_weekend": _is_weekend(dt),
        },
    )
    return date_id


async def _ensure_time_dim(db: AsyncSession, dt: datetime) -> int:
    """Insert or skip Time_Dim row; return Time_ID."""
    time_id = _time_id(dt)
    await db.execute(
        text("""
        INSERT OR IGNORE INTO Time_Dim
            (Time_ID, Full_Time, Hour, Minute, Second, Shift)
        VALUES
            (:time_id, :full_time, :hour, :minute, :second, :shift)
        """),
        {
            "time_id":   time_id,
            "full_time": dt.strftime("%H:%M:%S"),
            "hour":      dt.hour,
            "minute":    dt.minute,
            "second":    dt.second,
            "shift":     _shift(dt.hour),
        },
    )
    return time_id


async def _get_or_create_location(
    db: AsyncSession,
    latitude: Optional[float],
    longitude: Optional[float],
) -> int:
    """
    Return Location_ID for the given GPS coordinates.
    If no GPS data, return the default 'Unknown' location (ID=1).
    """
    if latitude is None or longitude is None:
        return 1   # default 'Unknown' location seeded in seed.sql

    # Look for an existing nearby location (within ~0.001 degrees ≈ 100 m)
    result = await db.execute(
        text("""
        SELECT Location_ID FROM Location_Dim
        WHERE ABS(Latitude - :lat) < 0.001
          AND ABS(Longitude - :lng) < 0.001
        LIMIT 1
        """),
        {"lat": latitude, "lng": longitude},
    )
    row = result.fetchone()
    if row:
        return row[0]

    # Insert new location
    result = await db.execute(
        text("""
        INSERT INTO Location_Dim (Latitude, Longitude, City, State, Country, GPS_Available)
        VALUES (:lat, :lng, 'Unknown', 'Unknown', 'India', 1)
        """),
        {"lat": latitude, "lng": longitude},
    )
    await db.flush()
    return result.lastrowid


async def _get_or_create_road(db: AsyncSession, road_name: Optional[str]) -> int:
    """Return Road_ID for given road name, or create if not exists. Defaults to 1 (Unknown)."""
    if not road_name or road_name.strip() in ("", "Unknown"):
        return 1
    clean_name = road_name.strip()
    result = await db.execute(
        text("SELECT Road_ID FROM Road_Dim WHERE LOWER(Road_Name) = LOWER(:name) LIMIT 1"),
        {"name": clean_name},
    )
    row = result.fetchone()
    if row:
        return row[0]

    # Insert new road into Road_Dim
    result = await db.execute(
        text("""
        INSERT INTO Road_Dim (Road_Name, Road_Type, City, State)
        VALUES (:name, 'Local Road', 'Unknown', 'India')
        """),
        {"name": clean_name},
    )
    await db.flush()
    return result.lastrowid


# ── Main ETL function ──────────────────────────────────────────────────────────

async def load_detection_to_warehouse(
    db: AsyncSession,
    result: DetectionResult,
    image_file: Optional[str] = None,
) -> str:
    """
    ETL: transform a DetectionResult and insert into the Pothole_Detection_Fact table.

    Parameters
    ----------
    db          : Async database session
    result      : DetectionResult from YOLO inference
    image_file  : Optional filename (not raw bytes) of the source image/frame

    Returns
    -------
    The Detection_ID (UUID string) of the inserted fact row.
    """
    dt = result.timestamp

    # ── TRANSFORM ─────────────────────────────────────────────────────────────
    date_id     = await _ensure_date_dim(db, dt)
    time_id     = await _ensure_time_dim(db, dt)
    location_id = await _get_or_create_location(db, result.latitude, result.longitude)
    road_id     = await _get_or_create_road(db, result.road_name)
    severity_id = result.dominant_severity_id

    detection_id = str(uuid.uuid4())


    # ── LOAD ──────────────────────────────────────────────────────────────────
    await db.execute(
        text("""
        INSERT INTO Pothole_Detection_Fact
            (Detection_ID, Date_ID, Time_ID, Location_ID, Road_ID, Severity_ID,
             Pothole_Count, Confidence, Bounding_Box_Area, Source, Device,
             Raw_Timestamp, Image_File, Notes)
        VALUES
            (:det_id, :date_id, :time_id, :loc_id, :road_id, :sev_id,
             :count, :conf, :area, :source, :device,
             :ts, :img_file, NULL)
        """),
        {
            "det_id":   detection_id,
            "date_id":  date_id,
            "time_id":  time_id,
            "loc_id":   location_id,
            "road_id":  road_id,
            "sev_id":   severity_id,
            "count":    result.pothole_count,
            "conf":     result.avg_confidence,
            "area":     max(
                            (d.bounding_box.norm_area for d in result.detections),
                            default=0.0,
                        ),
            "source":   result.source.value,
            "device":   result.device,
            "ts":       dt.isoformat(),
            "img_file": image_file,
        },
    )

    await db.commit()
    return detection_id
