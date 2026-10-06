-- =============================================================================
-- PotholeGuard — Seed / Dimension Bootstrapping
-- =============================================================================
-- This file inserts the static dimension rows that are required before any
-- detection facts can be loaded.
--
-- ⚠️  DEMO DATA NOTE  ⚠️
-- The detection records in Part B are DEMO DATA for UI development only.
-- They are NOT actual model output.
-- Label: "DEMO DATA — NOT MODEL OUTPUT"
-- Remove or clear these rows before the production demonstration.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────────────────────
-- Part A: Road dimension — sample road entries
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO Road_Dim (Road_ID, Road_Name, Road_Type, City, State) VALUES
    (1, 'Unknown',              'Unknown',  'Unknown', 'Unknown'),
    (2, 'MG Road',              'Arterial', 'Bangalore', 'Karnataka'),
    (3, 'NH-44',                'Highway',  'Hyderabad', 'Telangana'),
    (4, 'Outer Ring Road',      'Arterial', 'Bangalore', 'Karnataka'),
    (5, 'Anna Salai',           'Arterial', 'Chennai',   'Tamil Nadu'),
    (6, 'Pune-Nashik Highway',  'Highway',  'Pune',      'Maharashtra');

-- ─────────────────────────────────────────────────────────────────────────────
-- Part A: Default location (GPS unavailable)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO Location_Dim
    (Location_ID, Latitude, Longitude, City, State, Country, GPS_Available)
VALUES
    (1, NULL, NULL, 'Unknown', 'Unknown', 'Unknown', 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- Part A: Date dimension helper — a few sample dates
-- In production the ETL pipeline populates this automatically.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO Date_Dim
    (Date_ID, Full_Date, Day, Day_Name, Week_Number, Month, Month_Name, Quarter, Year, Is_Weekend)
VALUES
    (20251001, '2025-10-01', 1,  'Wednesday', 40, 10, 'October',   4, 2025, 0),
    (20251010, '2025-10-10', 10, 'Friday',    41, 10, 'October',   4, 2025, 0),
    (20251015, '2025-10-15', 15, 'Wednesday', 42, 10, 'October',   4, 2025, 0),
    (20251101, '2025-11-01', 1,  'Saturday',  44, 11, 'November',  4, 2025, 1),
    (20251201, '2025-12-01', 1,  'Monday',    49, 12, 'December',  4, 2025, 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- Part A: Time dimension helper — a few sample time slots
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO Time_Dim (Time_ID, Full_Time, Hour, Minute, Second, Shift) VALUES
    (90000,  '09:00:00', 9,  0,  0, 'Morning'),
    (103000, '10:30:00', 10, 30, 0, 'Morning'),
    (140000, '14:00:00', 14, 0,  0, 'Afternoon'),
    (163000, '16:30:00', 16, 30, 0, 'Afternoon'),
    (191500, '19:15:00', 19, 15, 0, 'Evening');

-- =============================================================================
-- Part B: DEMO DATA — NOT MODEL OUTPUT
-- For UI development / dashboard testing only.
-- DO NOT use in production or include in academic evaluation.
-- =============================================================================
-- Uncomment the block below when doing frontend-only development:

/*
INSERT OR IGNORE INTO Pothole_Detection_Fact
    (Detection_ID, Date_ID, Time_ID, Location_ID, Road_ID, Severity_ID,
     Pothole_Count, Confidence, Bounding_Box_Area, Source, Device, Raw_Timestamp, Notes)
VALUES
    ('demo-001', 20251001, 90000,  1, 2, 2, 3, 0.81, 0.025, 'IMAGE',       'webcam',  '2025-10-01T09:00:00', 'DEMO DATA — NOT MODEL OUTPUT'),
    ('demo-002', 20251001, 103000, 1, 3, 3, 5, 0.76, 0.055, 'LIVE_CAMERA', 'webcam',  '2025-10-01T10:30:00', 'DEMO DATA — NOT MODEL OUTPUT'),
    ('demo-003', 20251010, 140000, 1, 4, 1, 1, 0.91, 0.008, 'IMAGE',       'upload',  '2025-10-10T14:00:00', 'DEMO DATA — NOT MODEL OUTPUT'),
    ('demo-004', 20251015, 163000, 1, 5, 2, 2, 0.68, 0.020, 'VIDEO',       'upload',  '2025-10-15T16:30:00', 'DEMO DATA — NOT MODEL OUTPUT'),
    ('demo-005', 20251101, 191500, 1, 6, 3, 7, 0.84, 0.062, 'LIVE_CAMERA', 'mobile',  '2025-11-01T19:15:00', 'DEMO DATA — NOT MODEL OUTPUT');
*/
