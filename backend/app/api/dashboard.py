"""
dashboard.py  — /dashboard router
===================================
Dashboard summary endpoint.

GET /dashboard/summary — Returns KPI cards and chart data for the frontend dashboard.

Author: PotholeGuard project
"""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.db import get_db

router = APIRouter()


@router.get("/summary", summary="Dashboard KPI summary")
async def dashboard_summary(db: AsyncSession = Depends(get_db)):
    """
    Returns aggregated statistics for the dashboard:
    - KPI cards: total potholes, today's potholes, high severity, affected roads, avg confidence
    - Chart data: potholes by date, by month, by road, severity distribution
    - Note: If no data is available, returns zeros (no fake data injected).
    """
    # ── KPI: Total potholes ────────────────────────────────────────────────
    total_potholes_res = await db.execute(
        text("SELECT COALESCE(SUM(Pothole_Count), 0) FROM Pothole_Detection_Fact")
    )
    total_potholes = total_potholes_res.scalar() or 0

    # ── KPI: Today's potholes ─────────────────────────────────────────────
    today_res = await db.execute(
        text("""
        SELECT COALESCE(SUM(f.Pothole_Count), 0)
        FROM Pothole_Detection_Fact f
        JOIN Date_Dim d ON f.Date_ID = d.Date_ID
        WHERE d.Full_Date = date('now')
        """)
    )
    today_potholes = today_res.scalar() or 0

    # ── KPI: High severity (Large proxy) ──────────────────────────────────
    high_sev_res = await db.execute(
        text("""
        SELECT COUNT(*)
        FROM Pothole_Detection_Fact f
        JOIN Severity_Dim s ON f.Severity_ID = s.Severity_ID
        WHERE s.Severity_Label = 'Large'
        """)
    )
    high_severity_count = high_sev_res.scalar() or 0

    # ── KPI: Affected roads ───────────────────────────────────────────────
    roads_res = await db.execute(
        text("SELECT COUNT(DISTINCT Road_ID) FROM Pothole_Detection_Fact WHERE Road_ID != 1")
    )
    affected_roads = roads_res.scalar() or 0

    # ── KPI: Average confidence ───────────────────────────────────────────
    conf_res = await db.execute(
        text("SELECT COALESCE(AVG(Confidence), 0) FROM Pothole_Detection_Fact")
    )
    avg_confidence = round(conf_res.scalar() or 0, 4)

    # ── KPI: Detection count ──────────────────────────────────────────────
    det_count_res = await db.execute(
        text("SELECT COUNT(*) FROM Pothole_Detection_Fact")
    )
    total_detections = det_count_res.scalar() or 0

    # ── Chart: Potholes by date (last 30 days) ────────────────────────────
    by_date_res = await db.execute(
        text("""
        SELECT d.Full_Date, SUM(f.Pothole_Count)
        FROM Pothole_Detection_Fact f
        JOIN Date_Dim d ON f.Date_ID = d.Date_ID
        GROUP BY d.Full_Date
        ORDER BY d.Full_Date DESC
        LIMIT 30
        """)
    )
    by_date = [{"date": r[0], "potholes": r[1]} for r in by_date_res.fetchall()]
    by_date.reverse()   # oldest first

    # ── Chart: Potholes by road ───────────────────────────────────────────
    by_road_res = await db.execute(
        text("""
        SELECT r.Road_Name, SUM(f.Pothole_Count)
        FROM Pothole_Detection_Fact f
        JOIN Road_Dim r ON f.Road_ID = r.Road_ID
        GROUP BY r.Road_ID
        ORDER BY SUM(f.Pothole_Count) DESC
        LIMIT 10
        """)
    )
    by_road = [{"road": r[0], "potholes": r[1]} for r in by_road_res.fetchall()]

    # ── Chart: Severity distribution ──────────────────────────────────────
    sev_res = await db.execute(
        text("""
        SELECT s.Severity_Label, COUNT(*), SUM(f.Pothole_Count)
        FROM Pothole_Detection_Fact f
        JOIN Severity_Dim s ON f.Severity_ID = s.Severity_ID
        GROUP BY s.Severity_ID
        """)
    )
    severity_dist = [
        {"severity": r[0], "detection_count": r[1], "total_potholes": r[2]}
        for r in sev_res.fetchall()
    ]

    # ── Chart: Source distribution ────────────────────────────────────────
    source_res = await db.execute(
        text("""
        SELECT Source, COUNT(*), SUM(Pothole_Count)
        FROM Pothole_Detection_Fact
        GROUP BY Source
        """)
    )
    source_dist = [
        {"source": r[0], "detection_count": r[1], "total_potholes": r[2]}
        for r in source_res.fetchall()
    ]

    # ── GPS detections for map ────────────────────────────────────────────
    gps_res = await db.execute(
        text("""
        SELECT l.Latitude, l.Longitude, SUM(f.Pothole_Count), AVG(f.Confidence)
        FROM Pothole_Detection_Fact f
        JOIN Location_Dim l ON f.Location_ID = l.Location_ID
        WHERE l.GPS_Available = 1
          AND l.Latitude IS NOT NULL
          AND l.Longitude IS NOT NULL
        GROUP BY l.Location_ID
        """)
    )
    gps_points = [
        {
            "latitude":  r[0],
            "longitude": r[1],
            "potholes":  r[2],
            "confidence": round(r[3], 4) if r[3] else 0,
        }
        for r in gps_res.fetchall()
    ]

    no_data = total_detections == 0

    return {
        "no_data": no_data,
        "no_data_message": "No detection data available." if no_data else None,
        "total_detections":  total_detections,
        "total_potholes":    total_potholes,
        "total_roads":       affected_roads,
        "avg_confidence":    avg_confidence,
        "kpis": {
            "total_potholes":    total_potholes,
            "today_potholes":    today_potholes,
            "high_severity":     high_severity_count,
            "affected_roads":    affected_roads,
            "avg_confidence":    avg_confidence,
            "total_detections":  total_detections,
        },

        "charts": {
            "by_date":          by_date,
            "by_road":          by_road,
            "severity_distribution": severity_dist,
            "source_distribution":   source_dist,
        },
        "map_points": gps_points,
        "severity_note": (
            "High Estimated Severity uses bounding-box area as a proxy. "
            "This does NOT represent actual physical pothole depth."
        ),
    }
