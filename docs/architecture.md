# PotholeGuard — System Architecture

## Overview

PotholeGuard is divided into two clearly separated concerns:

```
┌─────────────────────────────────────────────────────────────┐
│  COMPUTER VISION LAYER                                      │
│  YOLOv8 → detects potholes in images/frames/video          │
│  Output: bounding boxes + confidence scores                 │
└───────────────────────────────┬─────────────────────────────┘
                                │ DetectionResult
                                ▼
┌─────────────────────────────────────────────────────────────┐
│  ETL PIPELINE                                               │
│  Extract → Validate → Transform → Load                      │
│  (derive Date_ID, Time_ID, Severity_ID, etc.)               │
└───────────────────────────────┬─────────────────────────────┘
                                │ INSERT
                                ▼
┌─────────────────────────────────────────────────────────────┐
│  DATA WAREHOUSE (Star Schema / SQLite)                      │
│                                                             │
│  Date_Dim ──┐                                              │
│  Time_Dim ──┤                                              │
│  Loc_Dim  ──┼── Pothole_Detection_Fact                     │
│  Road_Dim ──┤                                              │
│  Sev_Dim  ──┘                                              │
└───────────────────────────────┬─────────────────────────────┘
                                │
               ┌────────────────┴─────────────────┐
               ▼                                  ▼
┌──────────────────────┐              ┌────────────────────────┐
│  OLAP Operations     │              │  K-Means Clustering    │
│  Roll-Up             │              │  (roads, not images)   │
│  Drill-Down          │              │  K configurable        │
│  Slice               │              │  Features: count,      │
│  Dice                │              │  frequency, severity,  │
└──────────────────────┘              │  confidence, area      │
               │                      └────────────┬───────────┘
               └──────────────┬───────────────────┘
                              ▼
              ┌───────────────────────────────────┐
              │  FASTAPI BACKEND (REST API)        │
              │  /detect  /detections  /dashboard │
              │  /analytics  /model               │
              └──────────────┬────────────────────┘
                             │
               ┌─────────────┴──────────────┐
               ▼                            ▼
 ┌─────────────────────┐     ┌──────────────────────────┐
 │  React Web Frontend │     │  Flutter Mobile App      │
 │  Home / Live /      │     │  Live Camera Detection   │
 │  Image / Video /    │     │  GPS Integration         │
 │  Dashboard /        │     │  Detection History       │
 │  OLAP / K-Means     │     │  On-device ONNX Infer.  │
 └─────────────────────┘     └──────────────────────────┘
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Object Detection | YOLOv8s (Ultralytics) |
| Model Training | PyTorch + Ultralytics CLI |
| Mobile Model | ONNX Runtime Android |
| Backend API | FastAPI + Uvicorn |
| Database | SQLite (aiosqlite + SQLAlchemy) |
| ETL | Custom Python ETL service |
| OLAP | SQL views + parameterised queries |
| Data Mining | scikit-learn K-Means |
| Web Frontend | React + Recharts + Leaflet |
| Mobile App | Flutter + ONNX Runtime |
| Dataset | RDD2022 (India, D40 class only) |

## Data Flow: Image Detection

```
User uploads image
       │
       ▼
POST /detect/image
       │
       ▼
detection_service.infer_image_bytes()
  [YOLOv8 inference]
  → DetectionResult
       │
       ▼
etl_service.load_detection_to_warehouse()
  → Date_ID derived
  → Time_ID derived
  → Location_ID looked up / created
  → Severity_ID from bbox area proxy
  → INSERT Pothole_Detection_Fact
       │
       ▼
Response: {pothole_count, confidence, bboxes, severity, timestamp}
```

## Data Flow: DMDW Analytics

```
Detection records in Pothole_Detection_Fact
             │
    ┌────────┴─────────┐
    ▼                  ▼
 OLAP Queries     K-Means Clustering
 (aggregations)   (road segmentation)
    │                  │
    └────────┬─────────┘
             ▼
       Dashboard API
             │
             ▼
      React Dashboard
   (charts, map, KPIs)
```

## Deployment Phases

| Phase | Component | Status |
|-------|-----------|--------|
| 1 | RDD2022 Dataset Pipeline | ✅ Scripts ready |
| 2 | YOLOv8 Training & Evaluation | ✅ Scripts ready |
| 3 | Image Detection | ✅ Backend ready |
| 4 | Video Detection | ✅ Backend ready |
| 5 | Live Camera (Webcam) | ✅ Backend ready |
| 6 | Database + Star Schema | ✅ Schema ready |
| 7 | ETL Pipeline | ✅ Service ready |
| 8 | OLAP Operations | ✅ Endpoints ready |
| 9 | K-Means Clustering | ✅ Service ready |
| 10 | Dashboard | 🔄 Frontend needed |
| 11 | Mobile App | 🔄 Flutter needed |
| 12 | Mobile Camera Inference | 🔄 ONNX + Flutter |
| 13 | End-to-end Integration | 🔄 Testing needed |
