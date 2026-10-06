"""
detections.py  — /detections router
=====================================
CRUD endpoints for detection history.

GET  /detections              — List all detection records (paginated)
GET  /detections/{id}         — Get a single detection record
POST /detections              — Manually insert a detection record (ETL bypass)

Author: PotholeGuard project
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.db import get_db

router = APIRouter()


@router.get("", summary="List detection history (paginated)")
async def list_detections(
    limit:  int           = Query(50, ge=1, le=500),
    offset: int           = Query(0,  ge=0),
    source: Optional[str] = Query(None, description="Filter: IMAGE | VIDEO | LIVE_CAMERA"),
    db: AsyncSession = Depends(get_db),
):
    """Return paginated detection records from the data warehouse."""
    conditions, params = [], {"limit": limit, "offset": offset}

    if source:
        conditions.append("f.Source = :source")
        params["source"] = source.upper()

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    result = await db.execute(
        text(f"""
        SELECT
            f.Detection_ID, d.Full_Date, t.Full_Time,
            f.Pothole_Count, f.Confidence, f.Source, f.Device,
            r.Road_Name, s.Severity_Label,
            l.Latitude, l.Longitude, f.Raw_Timestamp
        FROM Pothole_Detection_Fact f
        JOIN Date_Dim     d ON f.Date_ID     = d.Date_ID
        JOIN Time_Dim     t ON f.Time_ID     = t.Time_ID
        JOIN Road_Dim     r ON f.Road_ID     = r.Road_ID
        JOIN Severity_Dim s ON f.Severity_ID = s.Severity_ID
        JOIN Location_Dim l ON f.Location_ID = l.Location_ID
        {where}
        ORDER BY f.Raw_Timestamp DESC
        LIMIT :limit OFFSET :offset
        """),
        params,
    )
    rows = result.fetchall()

    # Total count
    count_result = await db.execute(
        text(f"""
        SELECT COUNT(*) FROM Pothole_Detection_Fact f {where}
        """),
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total = count_result.scalar() or 0

    return {
        "total":  total,
        "limit":  limit,
        "offset": offset,
        "data": [
            {
                "detection_id":  r[0],
                "date":          r[1],
                "time":          r[2],
                "pothole_count": r[3],
                "confidence":    round(r[4], 4),
                "source":        r[5],
                "device":        r[6],
                "road":          r[7],
                "severity":      r[8],
                "latitude":      r[9],
                "longitude":     r[10],
                "timestamp":     r[11],
            }
            for r in rows
        ],
    }


@router.get("/{detection_id}", summary="Get a single detection record")
async def get_detection(detection_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
        SELECT
            f.Detection_ID, d.Full_Date, t.Full_Time,
            f.Pothole_Count, f.Confidence, f.Bounding_Box_Area,
            f.Source, f.Device, r.Road_Name, s.Severity_Label,
            l.Latitude, l.Longitude, f.Raw_Timestamp, f.Image_File, f.Notes
        FROM Pothole_Detection_Fact f
        JOIN Date_Dim     d ON f.Date_ID     = d.Date_ID
        JOIN Time_Dim     t ON f.Time_ID     = t.Time_ID
        JOIN Road_Dim     r ON f.Road_ID     = r.Road_ID
        JOIN Severity_Dim s ON f.Severity_ID = s.Severity_ID
        JOIN Location_Dim l ON f.Location_ID = l.Location_ID
        WHERE f.Detection_ID = :id
        """),
        {"id": detection_id},
    )
    row = result.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Detection '{detection_id}' not found.")

    return {
        "detection_id":    row[0],
        "date":            row[1],
        "time":            row[2],
        "pothole_count":   row[3],
        "confidence":      round(row[4], 4),
        "bbox_area":       round(row[5], 6),
        "source":          row[6],
        "device":          row[7],
        "road":            row[8],
        "severity":        row[9],
        "severity_note":   "Estimated Severity (Bounding-Box Area Proxy) — NOT actual depth",
        "latitude":        row[10],
        "longitude":       row[11],
        "timestamp":       row[12],
        "image_file":      row[13],
        "notes":           row[14],
    }
