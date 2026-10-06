# PotholeGuard 🛣️
> **"Spot it. Map it. Fix it."**  
> *Real-Time Pothole Detection Using RDD2022 and Data Mining & Data Warehousing (DMDW)*

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-61DAFB.svg?logo=react&logoColor=black)](https://react.dev)
[![Flutter](https://img.shields.io/badge/Flutter-3.44+-02569B.svg?logo=flutter&logoColor=white)](https://flutter.dev)
[![YOLOv8s](https://img.shields.io/badge/YOLOv8s-Ultralytics-blue.svg)](https://ultralytics.com)
[![Tests](https://img.shields.io/badge/Tests-18%2F18%20Passed-brightgreen.svg)](#testing)

---

## 📌 Project Overview

**PotholeGuard** is a genuine, end-to-end academic system combining **Computer Vision (Deep Learning)** and **Data Mining & Data Warehousing (DMDW)** for real-time road hazard detection, analysis, and management.

### Key Highlights
- **Computer Vision:** YOLOv8s trained specifically on the **RDD2022 India** road damage subset for the `D40` (pothole) class.
- **Genuine Academic Evaluation:** Real test metrics on unseen test images:
  - **Precision:** `0.6789`
  - **Recall:** `0.2284`
  - **mAP50:** `0.1840`
  - **mAP50-95:** `0.0760`
  - **Inference Latency:** `~376 ms/image` (CPU)
- **Data Warehousing:** Kimball Star Schema (`Pothole_Detection_Fact` connected to `Date_Dim`, `Time_Dim`, `Location_Dim`, `Road_Dim`, and `Severity_Dim`).
- **OLAP Capabilities:** High-performance analytical operations including **Roll-Up** (daily → monthly → yearly), **Drill-Down**, **Slice** (by road/region), and **Dice** (multi-dimensional filtering).
- **Data Mining:** Scikit-Learn **K-Means clustering** applied on road segments to categorize hazardous road clusters (*Low, Medium, Critical Hazard*).
  > ⚠️ *Academic Note:* K-Means clusters road hazard profiles—it does **NOT** detect potholes in images. YOLO performs computer vision; DMDW performs analytical warehousing and mining.
- **Severity Proxy:** Bounding-box area proxy (`Small: <1%`, `Medium: 1-4%`, `Large: >4%`).
  > ⚠️ *Academic Note:* Bounding-box area is an estimated surface proxy and does **NOT** measure physical pothole depth.
- **Dual Interfaces:**
  1. **Web / Laptop Dashboard:** React 18 + Tailwind CSS (White + Pastel Blue design) with Image upload (with confidence slider), Live camera detection (offscreen canvas capture), Video processing, Analytics/OLAP dashboard, and Model Evaluation visualizer.
  2. **Mobile Application:** Flutter 3.44+ supporting real-time on-device ONNX inference (`best.onnx`), GPS tagging, detection history, and optional sync to the backend warehouse.

---

## 🏛️ System Architecture

```text
       RDD2022 (India D40 Pothole Dataset)
                       │
                 YOLOv8s Model
         (ml/models/best.pt & best.onnx)
                       │
       ┌───────────────┴───────────────┐
       ▼                               ▼
Laptop / Web App              Mobile App (Flutter)
(Image / Video / Webcam)      (On-Device Camera + ONNX)
       │                               │
       └───────────────┬───────────────┘
                       │ Detection Records
                       ▼
               FastAPI Backend
                       │
               ETL Pipeline
                       │
       ┌───────────────┴───────────────┐
       ▼                               ▼
Star Schema Data Warehouse       Data Mining Engine
- Date_Dim                       - K-Means Road Clustering
- Time_Dim                       - Hazard Profiling
- Location_Dim
- Road_Dim                       OLAP Engine
- Severity_Dim                   - Roll-Up, Drill-Down
- Pothole_Detection_Fact         - Slice & Dice
       │                               │
       └───────────────┬───────────────┘
                       ▼
       Analytics & Interactive Dashboard
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- **Python 3.10+** (Tested on Python 3.10, 3.11, 3.12, 3.14)
- **Node.js 18+** & npm
- *(Optional for Mobile)* **Flutter 3.20+** & Android Studio

---

### Method A: One-Click Startup (Windows)
Double-click `start.bat` in the project root, or execute:
```cmd
.\start.bat
```
This automatically initializes the database with the star schema and seeds, boots FastAPI on `http://localhost:8000`, and launches the Vite React frontend on `http://localhost:3000`.

---

### Method B: Manual Startup

#### 1. Backend Setup
```bash
# From project root:
cd backend

# Install dependencies
pip install -r requirements.txt

# Run the backend server
python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```
- **API Swagger Documentation:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check:** [http://localhost:8000/health](http://localhost:8000/health)

#### 2. Frontend Setup
```bash
# In a new terminal:
cd frontend

# Install npm dependencies
npm install

# Start Vite dev server
npm run dev
```
- Open browser at [http://localhost:3000](http://localhost:3000)

#### 3. Run Backend & Pipeline Verification Tests
```bash
python -m pytest tests/test_pipeline.py
python scripts/verify_laptop_pipeline.py
```

---

## 📱 Mobile App (Flutter)

The mobile application is located in `mobile/`. It runs on Android, iOS, and Windows.

### Features
- **On-Device ONNX Inference:** Uses `ml/models/best.onnx` (`mobile/assets/models/best.onnx`) without requiring constant internet access.
- **Real-Time Camera Detection:** Scans live camera stream, performs Non-Maximum Suppression (NMS), and renders bounding boxes with estimated severity.
- **Location Tagging:** Automatically embeds GPS coordinates into detection records.
- **Backend Sync:** Easily configures the server URL to send detections directly to the FastAPI Data Warehouse.

### Running the Mobile App
```bash
cd mobile

# Get dependencies
flutter pub get

# Check code analysis
dart analyze lib

# Run on connected device or emulator
flutter run
```

### Building APK
```bash
cd mobile
flutter build apk --release
```
The APK will be generated at `mobile/build/app/outputs/flutter-apk/app-release.apk`.

---

## 🔍 Computer Vision & Detection Sensitivity

In real-world asphalt images, potholes present extreme variation in lighting, camera angle, and surface texture.
- Default confidence threshold is configured to **0.15** (15%).
- An **Interactive Sensitivity Slider** (5% – 50%) is provided in both Image and Live Webcam views, allowing immediate sensitivity tuning.
- **Sample RDD2022 Test Images** are built directly into the UI for instant testing with one click (`India_000105.jpg`, `India_000305.jpg`, `India_000780.jpg`).

---

## 📊 Data Mining & Data Warehousing (DMDW)

### Star Schema
- **Fact Table:** `Pothole_Detection_Fact` (records detection instances, coordinates, confidence, bbox dimensions, area, processing latency, and foreign keys).
- **Dimension Tables:**
  - `Date_Dim` (day, month, quarter, year, day_of_week, is_weekend)
  - `Time_Dim` (hour, minute, time_of_day)
  - `Location_Dim` (city, state, country, lat/lon bounds)
  - `Road_Dim` (road_name, road_type, surface_material, speed_limit)
  - `Severity_Dim` (severity_label: Small, Medium, Large; description)

### OLAP Endpoints
- `GET /analytics/olap/rollup/monthly` — Aggregates detections per month and year.
- `GET /analytics/olap/drilldown?year=2024&month=1` — Drills down from year to individual detections.
- `GET /analytics/olap/slice?road_name=MG+Road` — Slices across a single dimension.
- `GET /analytics/olap/dice?severity=Large&city=Bengaluru` — Dices across multi-dimensional intersections.

### K-Means Road Hazard Clustering
- `GET /analytics/clusters`
- Computes feature vectors per road segment (`[pothole_count, avg_confidence, high_severity_count, avg_bbox_area]`).
- Clusters roads into **Low**, **Medium**, and **High/Critical Hazard** groups for municipal road repair prioritization.

---

## 🌐 Deployment Guide

### Deploying the Backend (Render / Railway / DigitalOcean / AWS)
1. Set the following environment variables:
   ```env
   PORT=8000
   DATABASE_URL=sqlite+aiosqlite:///pothole_guard.db
   ```
2. Build command: `pip install -r backend/requirements.txt`
3. Start command: `python -m uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`

### Deploying the Frontend (Vercel / Netlify / Firebase Hosting)
1. Set `VITE_API_URL` to your production backend URL (e.g. `https://your-backend.onrender.com`).
2. Build command: `npm run build`
3. Output directory: `dist`

---

## 🧪 Testing Summary

| Test Suite | Result | Details |
| :--- | :--- | :--- |
| **Star Schema & ETL** | ✅ Passed | Dimension mapping & fact table inserts |
| **K-Means Clustering** | ✅ Passed | Feature vector normalization & clustering |
| **Severity Proxy Logic** | ✅ Passed | Small (<1%), Medium (1-4%), Large (>4%) area categorization |
| **FastAPI REST Endpoints**| ✅ Passed | 12 endpoints validated |
| **Flutter Analysis** | ✅ 0 Errors | Pure Dart & Flutter null-safe code |
| **E2E Pipeline Test** | ✅ Passed | `scripts/verify_laptop_pipeline.py` exited with code 0 |

---

## 👨‍💻 Project Team & Academic Credits

- **Course:** Data Mining & Data Warehousing (DMDW) / Machine Learning Project
- **Dataset:** RDD2022 (Road Damage Dataset 2022 - India Region D40 Pothole Subset)
- **Model:** YOLOv8s (Ultralytics) + ONNX Runtime
- **Theme:** White & Pastel Blue Minimalist Architecture
