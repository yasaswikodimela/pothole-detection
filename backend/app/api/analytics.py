"""
analytics.py  — /analytics router
===================================
DMDW analytics API endpoints.

GET  /analytics/olap          — OLAP operations (roll-up, drill-down, slice, dice)
GET  /analytics/clusters      — K-Means road clustering
GET  /analytics/olap/rollup   — Monthly/yearly roll-up
GET  /analytics/olap/slice    — Slice by road or date

Author: PotholeGuard project
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.db import get_db
from backend.app.services.kmeans_service import cluster_roads, describe_cluster

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# OLAP — ROLL-UP: Daily → Monthly
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/olap/rollup/monthly", summary="OLAP Roll-Up: daily detections → monthly summary")
async def olap_rollup_monthly(
    year: Optional[int] = Query(None, description="Filter by year"),
    db: AsyncSession = Depends(get_db),
):
    """
    OLAP ROLL-UP: Aggregate daily pothole detections into monthly totals.

    Example: January 2025 = sum of all daily detections in January 2025.
    """
    query = """
    SELECT
        d.Year,
        d.Month,
        d.Month_Name,
        SUM(f.Pothole_Count)      AS total_potholes,
        COUNT(*)                  AS detection_events,
        AVG(f.Confidence)         AS avg_confidence
    FROM Pothole_Detection_Fact f
    JOIN Date_Dim d ON f.Date_ID = d.Date_ID
    {where}
    GROUP BY d.Year, d.Month
    ORDER BY d.Year, d.Month
    """
    where = "WHERE d.Year = :year" if year else ""
    params = {"year": year} if year else {}

    result = await db.execute(text(query.format(where=where)), params)
    rows = result.fetchall()

    rows_data = [
        {
            "year":             r[0],
            "month":            f"{r[0]}-{str(r[1]).zfill(2)}" if r[1] else str(r[0]),
            "month_num":        r[1],
            "month_name":       r[2],
            "total_potholes":   r[3] or 0,
            "detection_events": r[4] or 0,
            "detection_count":  r[4] or 0,
            "avg_confidence":   round(r[5], 4) if r[5] else 0,
        }
        for r in rows
    ]

    return {
        "operation":      "ROLL-UP (Day → Month)",
        "description":    "Daily pothole detections aggregated to monthly totals.",
        "data":           rows_data,
        "monthly_rollup": rows_data,
    }


@router.get("/olap/rollup/yearly", summary="OLAP Roll-Up: monthly → yearly summary")
async def olap_rollup_yearly(db: AsyncSession = Depends(get_db)):
    """OLAP ROLL-UP: Aggregate to yearly totals."""
    result = await db.execute(
        text("""
        SELECT
            d.Year,
            SUM(f.Pothole_Count)  AS total_potholes,
            COUNT(*)              AS detection_events,
            AVG(f.Confidence)     AS avg_confidence
        FROM Pothole_Detection_Fact f
        JOIN Date_Dim d ON f.Date_ID = d.Date_ID
        GROUP BY d.Year
        ORDER BY d.Year
        """)
    )
    rows = result.fetchall()
    rows_data = [
        {
            "year":             r[0],
            "total_potholes":   r[1] or 0,
            "detection_events": r[2] or 0,
            "detection_count":  r[2] or 0,
            "avg_confidence":   round(r[3], 4) if r[3] else 0,
        }
        for r in rows
    ]

    return {
        "operation":     "ROLL-UP (Month → Year)",
        "description":   "Monthly totals aggregated to yearly totals.",
        "data":          rows_data,
        "yearly_rollup": rows_data,
    }



# ─────────────────────────────────────────────────────────────────────────────
# OLAP — DRILL-DOWN: Year → Month → Day → Detection
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/olap/drilldown", summary="OLAP Drill-Down: Year → Month → Day → Detection")
async def olap_drilldown(
    year:  Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    day:   Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    OLAP DRILL-DOWN: Start broad (year) and progressively add granularity.

    - Provide only year        → monthly breakdown
    - Provide year + month     → daily breakdown
    - Provide year + month + day → individual detection records
    """
    conditions = []
    params: dict = {}

    if year:
        conditions.append("d.Year = :year")
        params["year"] = year
    if month:
        conditions.append("d.Month = :month")
        params["month"] = month
    if day:
        conditions.append("d.Day = :day")
        params["day"] = day

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    if day and month and year:
        # Individual detection records
        result = await db.execute(
            text(f"""
            SELECT
                f.Detection_ID, d.Full_Date, t.Full_Time,
                f.Pothole_Count, f.Confidence, f.Source,
                r.Road_Name, s.Severity_Label
            FROM Pothole_Detection_Fact f
            JOIN Date_Dim     d ON f.Date_ID     = d.Date_ID
            JOIN Time_Dim     t ON f.Time_ID     = t.Time_ID
            JOIN Road_Dim     r ON f.Road_ID     = r.Road_ID
            JOIN Severity_Dim s ON f.Severity_ID = s.Severity_ID
            {where}
            ORDER BY d.Full_Date, t.Full_Time
            """),
            params,
        )
        rows = result.fetchall()
        rows_data = [
            {
                "detection_id":  r[0],
                "date":          r[1],
                "time":          r[2],
                "pothole_count": r[3],
                "confidence":    round(r[4], 4),
                "source":        r[5],
                "road":          r[6],
                "severity":      r[7],
            }
            for r in rows
        ]
        return {
            "level":      "Detection",
            "operation":  "DRILL-DOWN (Day → Detection)",
            "data":       rows_data,
            "drilldown":   rows_data,
        }
    else:
        # Aggregate by day
        result = await db.execute(
            text(f"""
            SELECT
                d.Full_Date, d.Day, d.Month_Name, d.Year,
                SUM(f.Pothole_Count)  AS total_potholes,
                COUNT(*)              AS detection_events,
                AVG(f.Confidence)     AS avg_confidence
            FROM Pothole_Detection_Fact f
            JOIN Date_Dim d ON f.Date_ID = d.Date_ID
            {where}
            GROUP BY d.Full_Date
            ORDER BY d.Full_Date
            """),
            params,
        )
        rows = result.fetchall()
        rows_data = [
            {
                "date":             r[0],
                "day":              r[1],
                "month":            r[2],
                "year":             r[3],
                "total_potholes":   r[4] or 0,
                "detection_events": r[5] or 0,
                "detection_count":  r[5] or 0,
                "avg_confidence":   round(r[6], 4) if r[6] else 0,
            }
            for r in rows
        ]
        return {
            "level":      "Day",
            "operation":  "DRILL-DOWN",
            "data":       rows_data,
            "drilldown":   rows_data,
        }


# ─────────────────────────────────────────────────────────────────────────────
# OLAP — SLICE: one road or one date
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/olap/slice", summary="OLAP Slice: filter by one dimension")
async def olap_slice(
    road_id:   Optional[int] = Query(None, description="Filter by Road_ID"),
    road_name: Optional[str] = Query(None, description="Filter by Road Name"),
    date:      Optional[str] = Query(None, description="Filter by date 'YYYY-MM-DD'"),
    source:    Optional[str] = Query(None, description="Filter by source: IMAGE|VIDEO|LIVE_CAMERA"),
    db: AsyncSession = Depends(get_db),
):
    """
    OLAP SLICE: Fix one dimension and return all data for that slice.

    Example: road_name="MG Road" → all detections on MG Road
    """
    conditions, params = [], {}

    if road_id is not None:
        conditions.append("f.Road_ID = :road_id")
        params["road_id"] = road_id
    if road_name:
        conditions.append("LOWER(r.Road_Name) LIKE LOWER(:road_name)")
        params["road_name"] = f"%{road_name.strip()}%"
    if date:
        conditions.append("d.Full_Date = :date")
        params["date"] = date
    if source:
        conditions.append("f.Source = :source")
        params["source"] = source.upper()

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    result = await db.execute(
        text(f"""
        SELECT
            f.Detection_ID, d.Full_Date, t.Full_Time,
            f.Pothole_Count, f.Confidence, f.Source,
            r.Road_Name, s.Severity_Label,
            l.Latitude, l.Longitude
        FROM Pothole_Detection_Fact f
        JOIN Date_Dim     d ON f.Date_ID     = d.Date_ID
        JOIN Time_Dim     t ON f.Time_ID     = t.Time_ID
        JOIN Road_Dim     r ON f.Road_ID     = r.Road_ID
        JOIN Severity_Dim s ON f.Severity_ID = s.Severity_ID
        JOIN Location_Dim l ON f.Location_ID = l.Location_ID
        {where}
        ORDER BY d.Full_Date DESC, t.Full_Time DESC
        LIMIT 500
        """),
        params,
    )
    rows = result.fetchall()

    rows_data = [
        {
            "detection_id":   r[0],
            "date":           r[1],
            "time":           r[2],
            "pothole_count":  r[3],
            "confidence":     round(r[4], 4),
            "avg_confidence": round(r[4], 4),
            "source":         r[5],
            "road":           r[6],
            "road_name":      r[6],
            "severity":       r[7],
            "latitude":       r[8],
            "longitude":      r[9],
        }
        for r in rows
    ]

    return {
        "operation":    "SLICE",
        "filters":      {"road_id": road_id, "road_name": road_name, "date": date, "source": source},
        "count":        len(rows),
        "data":         rows_data,
        "slice_result": rows_data,
    }


# ─────────────────────────────────────────────────────────────────────────────
# OLAP — DICE: multi-dimension filter
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/olap/dice", summary="OLAP Dice: filter by multiple dimensions")
async def olap_dice(
    road_id:        Optional[int]   = Query(None),
    road_name:      Optional[str]   = Query(None),
    month:          Optional[int]   = Query(None),
    year:           Optional[int]   = Query(None),
    severity:       Optional[str]   = Query(None, description="small|medium|large"),
    severity_label: Optional[str]   = Query(None, description="Small|Medium|Large"),
    min_confidence: Optional[float] = Query(None, ge=0, le=1),
    db: AsyncSession = Depends(get_db),
):
    """
    OLAP DICE: Filter by multiple dimensions simultaneously.

    Example: high-confidence Large potholes on MG Road.
    """
    conditions, params = [], {}

    effective_severity = severity_label or (severity.capitalize() if severity else None)

    if road_id is not None:
        conditions.append("f.Road_ID = :road_id")
        params["road_id"] = road_id
    if road_name:
        conditions.append("LOWER(r.Road_Name) LIKE LOWER(:road_name)")
        params["road_name"] = f"%{road_name.strip()}%"
    if month is not None:
        conditions.append("d.Month = :month")
        params["month"] = month
    if year is not None:
        conditions.append("d.Year = :year")
        params["year"] = year
    if effective_severity:
        conditions.append("LOWER(s.Severity_Label) = LOWER(:severity)")
        params["severity"] = effective_severity
    if min_confidence is not None:
        conditions.append("f.Confidence >= :min_conf")
        params["min_conf"] = min_confidence

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    result = await db.execute(
        text(f"""
        SELECT
            f.Detection_ID, d.Full_Date, t.Full_Time,
            f.Pothole_Count, f.Confidence, f.Source,
            r.Road_Name, s.Severity_Label
        FROM Pothole_Detection_Fact f
        JOIN Date_Dim     d ON f.Date_ID     = d.Date_ID
        JOIN Time_Dim     t ON f.Time_ID     = t.Time_ID
        JOIN Road_Dim     r ON f.Road_ID     = r.Road_ID
        JOIN Severity_Dim s ON f.Severity_ID = s.Severity_ID
        {where}
        ORDER BY f.Confidence DESC
        LIMIT 500
        """),
        params,
    )
    rows = result.fetchall()

    rows_data = [
        {
            "detection_id":  r[0],
            "date":          r[1],
            "time":          r[2],
            "pothole_count": r[3],
            "confidence":    round(r[4], 4),
            "source":        r[5],
            "road":          r[6],
            "road_name":     r[6],
            "severity":      r[7],
        }
        for r in rows
    ]

    return {
        "operation":   "DICE",
        "filters": {
            "road_id":        road_id,
            "road_name":      road_name,
            "month":          month,
            "year":           year,
            "severity":       effective_severity,
            "min_confidence": min_confidence,
        },
        "count":       len(rows),
        "data":        rows_data,
        "dice_result": rows_data,
    }



# ─────────────────────────────────────────────────────────────────────────────
# K-Means Clustering
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/clusters", summary="K-Means road clustering (data mining component)")
async def get_clusters(
    k: int = Query(3, ge=2, le=10, description="Number of clusters"),
    db: AsyncSession = Depends(get_db),
):
    """
    K-Means clustering of road segments based on detection statistics.

    IMPORTANT:
    - YOLO detects potholes (computer vision).
    - K-Means clusters ROADS by aggregated damage patterns (data mining).

    Features used: total_potholes, detection_count, high_severity_count,
                   avg_confidence, avg_bbox_area

    Cluster labels are numeric (0, 1, 2 …) and should be interpreted
    using the cluster_centers values.
    """
    # Fetch road-level aggregates from the data warehouse
    result = await db.execute(
        text("""
        SELECT
            r.Road_ID,
            r.Road_Name,
            r.City,
            SUM(f.Pothole_Count)                           AS total_potholes,
            COUNT(*)                                        AS detection_count,
            SUM(CASE WHEN s.Severity_Label = 'Large' THEN 1 ELSE 0 END)
                                                           AS high_severity_count,
            AVG(f.Confidence)                              AS avg_confidence,
            AVG(f.Bounding_Box_Area)                       AS avg_bbox_area
        FROM Pothole_Detection_Fact f
        JOIN Road_Dim     r ON f.Road_ID     = r.Road_ID
        JOIN Severity_Dim s ON f.Severity_ID = s.Severity_ID
        GROUP BY r.Road_ID
        """)
    )
    rows = result.fetchall()

    if not rows:
        return {
            "message": "No detection data available.  Run some detections first.",
            "clusters": [],
        }

    road_stats = [
        {
            "road_id":            r[0],
            "road_name":          r[1],
            "city":               r[2],
            "total_potholes":     r[3] or 0,
            "detection_count":    r[4] or 0,
            "high_severity_count": r[5] or 0,
            "avg_confidence":     round(r[6], 4) if r[6] else 0.0,
            "avg_bbox_area":      round(r[7], 6) if r[7] else 0.0,
        }
        for r in rows
    ]

    if len(road_stats) < k:
        return {
            "message": (
                f"Not enough roads ({len(road_stats)}) to form {k} clusters. "
                f"Collect more detection data or reduce k."
            ),
            "road_count": len(road_stats),
            "requested_k": k,
        }

    cluster_result = cluster_roads(road_stats, k=k)

    # Add human-readable cluster descriptions
    for i, center in enumerate(cluster_result["cluster_centers"]):
        cluster_result["cluster_centers"][i]["description"] = describe_cluster(center)

    return cluster_result
