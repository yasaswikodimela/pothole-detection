-- =============================================================================
-- PotholeGuard — Data Warehouse Schema (SQLite)
-- Star Schema for Road-Damage Detection Analytics
-- =============================================================================
-- Usage:
--   sqlite3 pothole_guard.db < database/schema.sql
-- =============================================================================

PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────────────────────
-- DIMENSION: Date_Dim
-- Allows OLAP roll-up/drill-down on time (Year → Month → Day)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Date_Dim (
    Date_ID         INTEGER PRIMARY KEY,   -- surrogate key  (YYYYMMDD as int)
    Full_Date       TEXT    NOT NULL,      -- e.g. '2025-08-15'
    Day             INTEGER NOT NULL,      -- 1–31
    Day_Name        TEXT    NOT NULL,      -- 'Monday' … 'Sunday'
    Week_Number     INTEGER NOT NULL,      -- ISO week number
    Month           INTEGER NOT NULL,      -- 1–12
    Month_Name      TEXT    NOT NULL,      -- 'January' … 'December'
    Quarter         INTEGER NOT NULL,      -- 1–4
    Year            INTEGER NOT NULL,
    Is_Weekend      INTEGER NOT NULL DEFAULT 0   -- 0=weekday, 1=weekend
);

-- ─────────────────────────────────────────────────────────────────────────────
-- DIMENSION: Time_Dim
-- Allows roll-up on hour-of-day / shift
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Time_Dim (
    Time_ID         INTEGER PRIMARY KEY,   -- surrogate key  (HHMMSS as int)
    Full_Time       TEXT    NOT NULL,      -- 'HH:MM:SS'
    Hour            INTEGER NOT NULL,      -- 0–23
    Minute          INTEGER NOT NULL,      -- 0–59
    Second          INTEGER NOT NULL,      -- 0–59
    Shift           TEXT    NOT NULL       -- 'Morning' | 'Afternoon' | 'Evening' | 'Night'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- DIMENSION: Location_Dim
-- GPS-derived or user-supplied location data
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Location_Dim (
    Location_ID     INTEGER PRIMARY KEY AUTOINCREMENT,
    Latitude        REAL,                  -- NULL if GPS unavailable
    Longitude       REAL,                  -- NULL if GPS unavailable
    City            TEXT    DEFAULT 'Unknown',
    State           TEXT    DEFAULT 'Unknown',
    Country         TEXT    DEFAULT 'Unknown',
    GPS_Available   INTEGER NOT NULL DEFAULT 0   -- 0=No, 1=Yes
);

-- ─────────────────────────────────────────────────────────────────────────────
-- DIMENSION: Road_Dim
-- Logical grouping of road segments (or 'Unknown' for image/video detections)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Road_Dim (
    Road_ID         INTEGER PRIMARY KEY AUTOINCREMENT,
    Road_Name       TEXT    NOT NULL DEFAULT 'Unknown',
    Road_Type       TEXT    NOT NULL DEFAULT 'Unknown',   -- Arterial | Local | Highway
    City            TEXT    DEFAULT 'Unknown',
    State           TEXT    DEFAULT 'Unknown'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- DIMENSION: Severity_Dim
-- Proxy severity based on bounding-box area
-- NOT actual physical pothole depth
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Severity_Dim (
    Severity_ID     INTEGER PRIMARY KEY,
    Severity_Label  TEXT    NOT NULL,     -- 'Small' | 'Medium' | 'Large'
    Description     TEXT    NOT NULL,
    Area_Min        REAL    NOT NULL,     -- normalised bounding-box area lower bound
    Area_Max        REAL    NOT NULL     -- normalised bounding-box area upper bound
);

-- Pre-populate severity dimension
INSERT OR IGNORE INTO Severity_Dim (Severity_ID, Severity_Label, Description, Area_Min, Area_Max) VALUES
    (1, 'Small',  'Estimated Severity (Bounding-Box Area Proxy) — small pothole, area < 1% of frame',  0.0,  0.01),
    (2, 'Medium', 'Estimated Severity (Bounding-Box Area Proxy) — medium pothole, 1–4% of frame',      0.01, 0.04),
    (3, 'Large',  'Estimated Severity (Bounding-Box Area Proxy) — large pothole, > 4% of frame',       0.04, 1.0);

-- ─────────────────────────────────────────────────────────────────────────────
-- FACT TABLE: Pothole_Detection_Fact
-- One row per detection event
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Pothole_Detection_Fact (
    Detection_ID        TEXT    PRIMARY KEY,   -- UUID
    Date_ID             INTEGER NOT NULL REFERENCES Date_Dim(Date_ID),
    Time_ID             INTEGER NOT NULL REFERENCES Time_Dim(Time_ID),
    Location_ID         INTEGER NOT NULL REFERENCES Location_Dim(Location_ID),
    Road_ID             INTEGER NOT NULL REFERENCES Road_Dim(Road_ID),
    Severity_ID         INTEGER NOT NULL REFERENCES Severity_Dim(Severity_ID),

    -- Measures
    Pothole_Count       INTEGER NOT NULL DEFAULT 1,
    Confidence          REAL    NOT NULL,         -- 0.0–1.0
    Bounding_Box_Area   REAL    NOT NULL,         -- normalised area (proxy only)
    Source              TEXT    NOT NULL,         -- 'LIVE_CAMERA' | 'IMAGE' | 'VIDEO'
    Device              TEXT    NOT NULL DEFAULT 'Unknown',   -- 'webcam' | 'mobile' | 'upload'
    Raw_Timestamp       TEXT    NOT NULL,         -- ISO 8601 full timestamp
    Image_File          TEXT,                     -- filename if applicable (not the raw bytes)
    Notes               TEXT
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES for OLAP query performance
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fact_date     ON Pothole_Detection_Fact(Date_ID);
CREATE INDEX IF NOT EXISTS idx_fact_time     ON Pothole_Detection_Fact(Time_ID);
CREATE INDEX IF NOT EXISTS idx_fact_location ON Pothole_Detection_Fact(Location_ID);
CREATE INDEX IF NOT EXISTS idx_fact_road     ON Pothole_Detection_Fact(Road_ID);
CREATE INDEX IF NOT EXISTS idx_fact_severity ON Pothole_Detection_Fact(Severity_ID);
CREATE INDEX IF NOT EXISTS idx_fact_source   ON Pothole_Detection_Fact(Source);
CREATE INDEX IF NOT EXISTS idx_date_year_month ON Date_Dim(Year, Month);

-- ─────────────────────────────────────────────────────────────────────────────
-- OLAP Views
-- These simplify ROLL-UP / SLICE / DICE operations in the backend.
-- ─────────────────────────────────────────────────────────────────────────────

-- Daily pothole summary  (ROLL-UP base)
CREATE VIEW IF NOT EXISTS v_daily_potholes AS
SELECT
    d.Full_Date,
    d.Day,
    d.Month_Name,
    d.Month,
    d.Year,
    r.Road_Name,
    SUM(f.Pothole_Count)    AS total_potholes,
    AVG(f.Confidence)       AS avg_confidence,
    COUNT(*)                AS detection_count
FROM Pothole_Detection_Fact f
JOIN Date_Dim     d ON f.Date_ID     = d.Date_ID
JOIN Road_Dim     r ON f.Road_ID     = r.Road_ID
GROUP BY d.Full_Date, r.Road_ID;

-- Monthly ROLL-UP
CREATE VIEW IF NOT EXISTS v_monthly_potholes AS
SELECT
    d.Year,
    d.Month,
    d.Month_Name,
    r.Road_Name,
    SUM(f.Pothole_Count)    AS total_potholes,
    AVG(f.Confidence)       AS avg_confidence,
    COUNT(*)                AS detection_count
FROM Pothole_Detection_Fact f
JOIN Date_Dim d ON f.Date_ID = d.Date_ID
JOIN Road_Dim r ON f.Road_ID = r.Road_ID
GROUP BY d.Year, d.Month, r.Road_ID;

-- Road-level ROLL-UP
CREATE VIEW IF NOT EXISTS v_road_summary AS
SELECT
    r.Road_ID,
    r.Road_Name,
    r.City,
    SUM(f.Pothole_Count)    AS total_potholes,
    AVG(f.Confidence)       AS avg_confidence,
    AVG(f.Bounding_Box_Area) AS avg_bbox_area,
    COUNT(*)                AS detection_count,
    SUM(CASE WHEN s.Severity_Label = 'Large'  THEN 1 ELSE 0 END) AS large_severity_count
FROM Pothole_Detection_Fact f
JOIN Road_Dim     r ON f.Road_ID     = r.Road_ID
JOIN Severity_Dim s ON f.Severity_ID = s.Severity_ID
GROUP BY r.Road_ID;

-- Severity distribution
CREATE VIEW IF NOT EXISTS v_severity_distribution AS
SELECT
    s.Severity_Label,
    COUNT(*) AS detection_count,
    SUM(f.Pothole_Count) AS total_potholes
FROM Pothole_Detection_Fact f
JOIN Severity_Dim s ON f.Severity_ID = s.Severity_ID
GROUP BY s.Severity_ID;
