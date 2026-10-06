# Data Mining & Data Warehousing (DMDW) Architecture

This document describes the enterprise Data Mining and Data Warehousing (DMDW) architecture of the **PotholeGuard** system. It details the interaction between edge computer vision and analytical warehousing, the multi-dimensional star schema, the ETL ingestion pipeline, OLAP query operations, and unsupervised K-Means road clustering for municipal road maintenance prioritization.

---

## 1. System Overview: Two Complementary Pillars

The PotholeGuard platform bridges edge perception and municipal decision support by decoupling operations into two distinct, cooperative subsystems:

```
┌────────────────────────────────────────────────────────┐
│             1. Computer Vision Subsystem               │
│                   (Edge / Inference)                   │
│                                                        │
│   • Input: Video stream, smartphone camera, images     │
│   • Engine: YOLOv8s Deep Neural Network                │
│   • Task: Real-time detection & localization           │
│   • Output: Bounding boxes, confidence, bbox area      │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ Raw Detection Payloads
                            ▼
┌────────────────────────────────────────────────────────┐
│         2. Data Warehousing & Mining Subsystem         │
│                 (Analytical Core / DMDW)               │
│                                                        │
│   • Storage: Multi-dimensional Star Schema (SQLite)    │
│   • Pipeline: Automated Extract-Transform-Load (ETL)   │
│   • Operations: OLAP Roll-up, Drill-down, Slice, Dice  │
│   • Data Mining: K-Means Clustering on Road Networks   │
│   • Output: Road hazard profiling & repair scheduling  │
└────────────────────────────────────────────────────────┘
```

1. **Computer Vision (Perception):** Operates at millisecond latency on raw pixels. YOLO detects individual pothole instances within discrete image frames, emitting bounding coordinates, detection confidence scores, and normalized surface area proxies.
2. **Data Warehousing & Data Mining (Intelligence):** Ingests, normalizes, and aggregates stream records over temporal and geographic dimensions. The warehouse provides historical trend analysis, multidimensional OLAP cubes, and unsupervised clustering algorithms to identify structurally failing road corridors.

---

## 2. Multi-Dimensional Star Schema Architecture

PotholeGuard utilizes a normalized **Star Schema** optimized for high-performance analytical queries (OLAP) and automated reporting. A centralized **Fact Table** stores measurable numeric events, connected radially to five dedicated **Dimension Tables**.

### 2.1 Star Schema Diagram

```text
               ┌─────────────────────────────────────────┐
               │                Date_Dim                 │
               ├─────────────────────────────────────────┤
               │ PK  Date_ID                             │
               │     Full_Date, Day, Day_Name            │
               │     Week_Number, Month, Month_Name      │
               │     Quarter, Year, Is_Weekend           │
               └────────────────────┬────────────────────┘
                                    │
                                    │ 1:N
                                    ▼
┌──────────────────────┐    ┌─────────────────────────────────────────┐    ┌──────────────────────┐
│       Time_Dim       │    │          Pothole_Detection_Fact         │    │     Location_Dim     │
├──────────────────────┤    ├─────────────────────────────────────────┤    ├──────────────────────┤
│ PK  Time_ID          │    │ PK  Detection_ID (UUID)                 │    │ PK  Location_ID      │
│     Full_Time        │1:N │ FK  Date_ID                             │1:N │     Latitude         │
│     Hour, Minute     ├───►│ FK  Time_ID                             │◄───┤     Longitude        │
│     Second, Shift    │    │ FK  Location_ID                         │    │     City, State      │
└──────────────────────┘    │ FK  Road_ID                             │    │     Country          │
                            │ FK  Severity_ID                         │    │     GPS_Available    │
                            │     Pothole_Count                       │    └──────────────────────┘
                            │     Confidence                          │
                            │     Bounding_Box_Area                   │
                            │     Source, Device                      │
                            │     Raw_Timestamp, Image_File, Notes    │
                            └────────────────────▲────────────────────┘
                                    ▲            │
                                1:N │            │ 1:N
               ┌────────────────────┴───┐    ┌───┴─────────────────────┐
               │        Road_Dim        │    │      Severity_Dim       │
               ├────────────────────────┤    ├─────────────────────────┤
               │ PK  Road_ID            │    │ PK  Severity_ID         │
               │     Road_Name          │    │     Severity_Label      │
               │     Road_Type          │    │     Description         │
               │     City, State        │    │     Area_Min, Area_Max  │
               └────────────────────────┘    └─────────────────────────┘
```

---

## 3. Dimension Tables Specification

Dimension tables provide contextual hierarchies that allow data analysts to filter, slice, and group detection events across time, geography, and structural severity.

### 3.1 `Date_Dim`
Stores calendar-based temporal attributes for time-series trend analysis, seasonality detection (e.g., monsoon impact), and weekend versus weekday comparisons.

* **`Date_ID` (INTEGER, PK):** Surrogate integer key formatted as `YYYYMMDD` (e.g., `20251015`).
* **`Full_Date` (TEXT):** ISO date string (`'2025-10-15'`).
* **`Day` (INTEGER):** Day of month ($1 - 31$).
* **`Day_Name` (TEXT):** Day of week (`'Monday'` to `'Sunday'`).
* **`Week_Number` (INTEGER):** ISO week of year ($1 - 53$).
* **`Month` (INTEGER):** Month index ($1 - 12$).
* **`Month_Name` (TEXT):** Full month name (`'October'`).
* **`Quarter` (INTEGER):** Fiscal/calendar quarter ($1 - 4$).
* **`Year` (INTEGER):** Four-digit year ($2025$).
* **`Is_Weekend` (INTEGER):** Boolean flag ($0 = \text{Weekday}, 1 = \text{Weekend}$).

### 3.2 `Time_Dim`
Enables high-resolution diurnal analysis, isolating peak traffic hours and maintenance shift patterns.

* **`Time_ID` (INTEGER, PK):** Surrogate integer key formatted as `HHMMSS` (e.g., `143000`).
* **`Full_Time` (TEXT):** 24-hour time string (`'14:30:00'`).
* **`Hour` (INTEGER):** Hour of day ($0 - 23$).
* **`Minute` (INTEGER):** Minute of hour ($0 - 59$).
* **`Second` (INTEGER):** Second of minute ($0 - 59$).
* **`Shift` (TEXT):** Operational work shift (`'Morning'` [05:00-11:59], `'Afternoon'` [12:00-16:59], `'Evening'` [17:00-20:59], `'Night'` [21:00-04:59]).

### 3.3 `Location_Dim`
Captures raw geodetic positioning emitted by client GPS hardware or road survey telemetry.

* **`Location_ID` (INTEGER, PK):** Autoincrement surrogate key.
* **`Latitude` (REAL):** WGS84 decimal latitude (nullable if GPS unavailable).
* **`Longitude` (REAL):** WGS84 decimal longitude (nullable if GPS unavailable).
* **`City` (TEXT):** Municipality or city name (default `'Unknown'`).
* **`State` (TEXT):** State or administrative province (default `'Unknown'`).
* **`Country` (TEXT):** Country name (default `'India'`).
* **`GPS_Available` (INTEGER):** Binary flag ($1 = \text{Coordinates present}, 0 = \text{GPS absent}$).

### 3.4 `Road_Dim`
Maintains the registry of municipal road networks and arterial corridors.

* **`Road_ID` (INTEGER, PK):** Autoincrement surrogate key (ID `1` reserved for `'Unknown'`).
* **`Road_Name` (TEXT):** Official road or corridor designation (e.g., `'MG Road'`, `'NH-44'`).
* **`Road_Type` (TEXT):** Functional classification (`'Highway'`, `'Arterial'`, `'Local'`).
* **`City` (TEXT):** Associated city jurisdiction.
* **`State` (TEXT):** Associated state jurisdiction.

### 3.5 `Severity_Dim`
Lookup dimension defining proxy severity categories based on 2D bounding-box area coverage.

* **`Severity_ID` (INTEGER, PK):** Static key ($1 = \text{Small}, 2 = \text{Medium}, 3 = \text{Large}$).
* **`Severity_Label` (TEXT):** Classification tier (`'Small'`, `'Medium'`, `'Large'`).
* **`Description` (TEXT):** Explicit label specifying the proxy nature of the metric.
* **`Area_Min` (REAL):** Lower bound normalized bounding box area.
* **`Area_Max` (REAL):** Upper bound normalized bounding box area.

| Severity_ID | Severity_Label | Area_Min | Area_Max | Formal Definition |
| :---: | :---: | :---: | :---: | :--- |
| `1` | **Small** | $0.00$ | $0.01$ | Bounding-box area $< 1\%$ of frame. Distant or localized surface damage. |
| `2` | **Medium** | $0.01$ | $0.04$ | Bounding-box area $1\% - 4\%$ of frame. Moderate road surface depression. |
| `3` | **Large** | $0.04$ | $1.00$ | Bounding-box area $> 4\%$ of frame. Severe surface damage / critical hazard. |

---

## 4. Fact Table: `Pothole_Detection_Fact`

The central fact table records individual detection events produced by the inference engine. Each row captures numeric measures and links to corresponding dimensions via foreign keys.

| Column Name | Data Type | Key Type | Description / Measure / Semantics |
| :--- | :--- | :---: | :--- |
| **`Detection_ID`** | `TEXT` | **PK** | Universally Unique Identifier (UUIDv4) generated upon ETL ingestion. |
| **`Date_ID`** | `INTEGER` | **FK** | References `Date_Dim(Date_ID)`. Date of detection. |
| **`Time_ID`** | `INTEGER` | **FK** | References `Time_Dim(Time_ID)`. Time of detection. |
| **`Location_ID`** | `INTEGER` | **FK** | References `Location_Dim(Location_ID)`. GPS coordinates. |
| **`Road_ID`** | `INTEGER` | **FK** | References `Road_Dim(Road_ID)`. Road segment identifier. |
| **`Severity_ID`** | `INTEGER` | **FK** | References `Severity_Dim(Severity_ID)`. Assigned proxy severity tier. |
| **`Pothole_Count`** | `INTEGER` | *Measure* | Additive measure: number of potholes identified in the detection event. |
| **`Confidence`** | `REAL` | *Measure* | Non-additive measure: YOLO inference confidence score ($0.0 - 1.0$). |
| **`Bounding_Box_Area`** | `REAL` | *Measure* | Semi-additive measure: normalized bounding-box area ($w \times h \in [0.0, 1.0]$). |
| **`Source`** | `TEXT` | *Degenerate* | Capture medium: `'LIVE_CAMERA'`, `'IMAGE'`, or `'VIDEO'`. |
| **`Device`** | `TEXT` | *Degenerate* | Client platform: `'webcam'`, `'mobile'`, or `'upload'`. |
| **`Raw_Timestamp`** | `TEXT` | *Metadata* | Original UTC ISO 8601 timestamp string. |
| **`Image_File`** | `TEXT` | *Metadata* | Optional storage key/filename for the source image (not raw binary). |
| **`Notes`** | `TEXT` | *Metadata* | Diagnostic or administrative notes. |

---

## 5. ETL (Extract-Transform-Load) Pipeline

The automated ETL pipeline (`backend/app/services/etl_service.py`) guarantees data integrity, normalizes sensor inputs, and populates the star schema atomically:

```
[Inference Engine]
         │
         │  DetectionResult (Pydantic Model)
         ▼
┌────────────────────────────────────────────────────────┐
│ 1. EXTRACT                                             │
│    • Extract detected bounding boxes (x1, y1, x2, y2)  │
│    • Extract inference confidence scores               │
│    • Extract client metadata (device, source, GPS, ts) │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. TRANSFORM                                           │
│    • Temporal Transformation:                          │
│      - Parse ISO timestamp → Date_ID (YYYYMMDD)        │
│      - Parse ISO timestamp → Time_ID (HHMMSS)          │
│      - Calculate shifts, day names, and calendar week  │
│      - Execute conditional upsert into Date_Dim/Time   │
│    • Spatial Deduplication & Transformation:           │
│      - Check GPS coordinates against Location_Dim      │
│      - Euclidean distance match within ~100m (0.001°)  │
│      - Reuse existing Location_ID or insert new record │
│      - Fallback to Location_ID=1 (Unknown) if no GPS   │
│    • Severity Classification (Proxy):                  │
│      - Area = (x2 - x1) * (y2 - y1)                    │
│      - Map area: <0.01 → Small, 0.01-0.04 → Medium,    │
│                  >0.04 → Large                         │
│    • Surrogate Key Assignment:                         │
│      - Generate UUIDv4 for Detection_ID                │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. LOAD                                                │
│    • Execute parameterized INSERT into Fact table      │
│    • Update B-tree indexes (idx_fact_date, road, etc.) │
│    • Atomic transaction commit                         │
└────────────────────────────────────────────────────────┘
```

---

## 6. OLAP Operations & Multi-Dimensional Analysis

Online Analytical Processing (OLAP) enables interactive inspection of road hazards across hierarchical dimensions. PotholeGuard supports all canonical OLAP operations:

### 6.1 ROLL-UP (Aggregation)
Roll-up moves from fine-grained data to higher-level summary data along a dimension hierarchy (e.g., Daily $\rightarrow$ Monthly $\rightarrow$ Yearly).

```sql
-- Monthly ROLL-UP: Aggregate daily detections to monthly totals per road
SELECT 
    d.Year,
    d.Month_Name,
    r.Road_Name,
    SUM(f.Pothole_Count) AS Total_Potholes,
    COUNT(f.Detection_ID) AS Total_Incidents,
    ROUND(AVG(f.Confidence), 3) AS Avg_Confidence
FROM Pothole_Detection_Fact f
JOIN Date_Dim d ON f.Date_ID = d.Date_ID
JOIN Road_Dim r ON f.Road_ID = r.Road_ID
GROUP BY d.Year, d.Month, r.Road_Name
ORDER BY d.Year DESC, d.Month DESC;
```

### 6.2 DRILL-DOWN (De-aggregation)
Drill-down traverses from coarse summary data down to finer detail (e.g., Yearly $\rightarrow$ Monthly $\rightarrow$ Daily $\rightarrow$ Individual Detection).

```sql
-- DRILL-DOWN: Investigate a high-damage corridor down to individual daily incidents
SELECT 
    f.Detection_ID,
    d.Full_Date,
    t.Full_Time,
    s.Severity_Label,
    f.Confidence,
    f.Bounding_Box_Area,
    f.Source
FROM Pothole_Detection_Fact f
JOIN Date_Dim d     ON f.Date_ID = d.Date_ID
JOIN Time_Dim t     ON f.Time_ID = t.Time_ID
JOIN Road_Dim r     ON f.Road_ID = r.Road_ID
JOIN Severity_Dim s ON f.Severity_ID = s.Severity_ID
WHERE r.Road_Name = 'MG Road'
  AND d.Year = 2025
  AND d.Month = 10
ORDER BY d.Full_Date DESC, t.Full_Time DESC;
```

### 6.3 SLICE (Single-Dimension Filter)
Slice fixes a single dimension attribute to produce a two-dimensional sub-table across all other dimensions.

```sql
-- SLICE: Filter data warehouse strictly for one specific road corridor
SELECT 
    d.Full_Date,
    s.Severity_Label,
    SUM(f.Pothole_Count) AS Potholes_Detected,
    AVG(f.Confidence) AS Mean_Confidence
FROM Pothole_Detection_Fact f
JOIN Date_Dim d     ON f.Date_ID = d.Date_ID
JOIN Severity_Dim s ON f.Severity_ID = s.Severity_ID
JOIN Road_Dim r     ON f.Road_ID = r.Road_ID
WHERE r.Road_Name = 'Outer Ring Road'
GROUP BY d.Full_Date, s.Severity_Label;
```

### 6.4 DICE (Multi-Dimensional Sub-Cube Selection)
Dice filters across two or more dimensions simultaneously, isolating a specific multi-dimensional sub-cube.

```sql
-- DICE: High-confidence + Large severity + Specific month + Arterial roads
SELECT 
    r.Road_Name,
    d.Full_Date,
    f.Confidence,
    f.Bounding_Box_Area
FROM Pothole_Detection_Fact f
JOIN Date_Dim d     ON f.Date_ID = d.Date_ID
JOIN Road_Dim r     ON f.Road_ID = r.Road_ID
JOIN Severity_Dim s ON f.Severity_ID = s.Severity_ID
WHERE f.Confidence >= 0.70
  AND s.Severity_Label = 'Large'
  AND d.Year = 2025
  AND d.Month = 10
  AND r.Road_Type = 'Arterial';
```

---

## 7. K-Means Clustering for Road Hazard Profiling

A common misconception in automated road monitoring is that clustering is applied to image frames. In PotholeGuard:

> **CRITICAL ARCHITECTURAL DISTINCTION:**
> * **YOLOv8 is the Computer Vision Detector:** It processes image pixels to detect individual pothole instances.
> * **K-Means is the Data Mining Analytics Tool:** It clusters **ROADS and ROAD CORRIDORS** based on multi-dimensional aggregated statistics stored in the data warehouse.
> * **K-Means does NOT detect potholes; it profiles road segments to prioritize municipal maintenance.**

### 7.1 Feature Extraction Pipeline
The clustering engine (`backend/app/services/kmeans_service.py`) queries the data warehouse view `v_road_summary` to extract a 5-dimensional numerical feature vector for each road:

```sql
SELECT 
    r.Road_ID,
    r.Road_Name,
    SUM(f.Pothole_Count)                                            AS total_potholes,
    COUNT(f.Detection_ID)                                           AS detection_count,
    SUM(CASE WHEN s.Severity_Label = 'Large' THEN 1 ELSE 0 END)     AS high_severity_count,
    AVG(f.Confidence)                                               AS avg_confidence,
    AVG(f.Bounding_Box_Area)                                        AS avg_bbox_area
FROM Pothole_Detection_Fact f
JOIN Road_Dim r     ON f.Road_ID     = r.Road_ID
JOIN Severity_Dim s ON f.Severity_ID = s.Severity_ID
GROUP BY r.Road_ID;
```

### 7.2 Feature Vector Definition
For each road $i$, the feature vector $\mathbf{x}_i \in \mathbb{R}^5$ comprises:

1. **`total_potholes` ($x_{i,1}$):** Cumulative number of potholes detected along the corridor. Measures overall distress volume.
2. **`detection_count` ($x_{i,2}$):** Number of discrete detection events. Reflects survey frequency and spatial recurrence.
3. **`high_severity_count` ($x_{i,3}$):** Count of detections falling into the 'Large' severity proxy ($>4\%$ frame area). Represents severe safety hazards.
4. **`avg_confidence` ($x_{i,4}$):** Mean detection confidence score. Gauges statistical certainty and signal quality.
5. **`avg_bbox_area` ($x_{i,5}$):** Mean normalized bounding box footprint. Measures average 2D pothole footprint.

### 7.3 Feature Standardization
Because features exist on fundamentally different scales (e.g., `total_potholes` $\in [0, 500]$, while `avg_bbox_area` $\in [0.005, 0.08]$), raw features would bias Euclidean distance calculations toward high-magnitude counts. 

Features are standardized using Z-score scaling before clustering:
$$z = \frac{x - \mu}{\sigma}$$
Where $\mu$ is the feature mean and $\sigma$ is the standard deviation.

### 7.4 Algorithm & Cluster Optimization
* **Algorithm:** Standard K-Means with $k$-means++ centroid initialization (`n_init=10`, `random_state=42`).
* **Objective Function:** Minimizes within-cluster sum-of-squares (Inertia $J$):
  $$J = \sum_{j=1}^{k} \sum_{\mathbf{x}_i \in S_j} \|\mathbf{x}_i - \boldsymbol{\mu}_j\|^2$$
* **Optimal $k$ Selection:** Configurable by the user ($k=3$ default for operational maintenance tiers).

### 7.5 Cluster Interpretation for Municipal Decision Making

The resulting cluster centroids are mapped to actionable road maintenance tiers:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Road Cluster Classifications                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Cluster 0: Low-Distress / Stable Corridors                                  │
│   • Profile: Low total potholes, low frequency, minimal large cavities.     │
│   • Action: Routine monitoring; scheduled biennial inspection.              │
├─────────────────────────────────────────────────────────────────────────────┤
│ Cluster 1: Moderate-Distress / Developing Damage                            │
│   • Profile: Moderate pothole volume, small-to-medium bbox areas.           │
│   • Action: Preventive maintenance; asphalt crack sealing & localized patch │
├─────────────────────────────────────────────────────────────────────────────┤
│ Cluster 2: Critical Hotspot / Severe Structural Failure                     │
│   • Profile: High total pothole count, frequent large-area detections.      │
│   • Action: Urgent municipal intervention; complete resurfacing required.   │
└─────────────────────────────────────────────────────────────────────────────┘
```

This unsupervised clustering provides municipal public works departments with objective, data-driven prioritization for asphalt maintenance budgets and emergency repair dispatching.
