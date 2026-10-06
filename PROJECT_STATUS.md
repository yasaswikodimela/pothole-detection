# PotholeGuard — Project Status & Handover Document

**Project Title:** Real-Time Pothole Detection Using RDD2022 and Data Mining & Data Warehousing (DMDW)  
**System OS:** Windows (PowerShell)  
**Status:** COMPLETE & VERIFIED ✅  
**Repository Path:** `C:\Users\yasas\Downloads\Pothole_detection\pothole-detection`

---

## 1. Executive Summary & What Has Been Completed

1. **RDD2022 India D40 Dataset Pipeline:**
   - 1,530 India road damage images extracted and filtered for class `D40` (pothole).
   - 3,187 bounding boxes normalized to YOLO format (`x_center`, `y_center`, `width`, `height`).
   - 80/10/10 train/validation/test split created with seed 42.
   - Comprehensive statistics generated and saved in `ml/results/dataset_stats/`.

2. **YOLOv8s Model Training & Validation:**
   - YOLOv8s model trained using Ultralytics framework.
   - Production weights saved at `ml/models/best.pt` (21.47 MB).
   - Exported to ONNX at `ml/models/best.onnx` (42.67 MB, Opset 12, dynamic axes, verified shape `images: [1, 3, 640, 640]` -> `output0: [1, 5, 8400]`).
   - Genuine test metrics strictly reported:
     - **Precision:** `0.6789`
     - **Recall:** `0.2284`
     - **mAP50:** `0.1840`
     - **mAP50-95:** `0.0760`
     - **CPU Latency:** `~376 ms`

3. **Data Warehouse & DMDW Layer:**
   - Kimball Star Schema implemented in SQLite:
     - Fact: `Pothole_Detection_Fact`
     - Dimensions: `Date_Dim`, `Time_Dim`, `Location_Dim`, `Road_Dim`, `Severity_Dim`
   - Real-time ETL pipeline (`backend/app/services/etl_service.py`) automatically maps dimensions and inserts fact records upon every detection.
   - OLAP capabilities implemented:
     - Roll-Up (Monthly, Yearly)
     - Drill-Down (Year -> Month -> Day -> Detection)
     - Slice (by road name)
     - Dice (multi-dimensional filtering)
   - K-Means road hazard clustering (`backend/app/services/kmeans_service.py`) using scikit-learn. Clusters road segments into hazard tiers.

4. **FastAPI Backend (`backend/`):**
   - Running at `http://localhost:8000` with Swagger documentation at `/docs`.
   - Endpoints:
     - `POST /detect/image`: Detects potholes from uploaded images.
     - `POST /detect/frame`: Real-time frame inference for webcam/live stream.
     - `POST /detect/video`: Video file processing.
     - `GET /detections`: Warehouse detection records.
     - `GET /dashboard/summary`: High-level aggregated statistics.
     - `GET /analytics/olap/*`: OLAP operations.
     - `GET /analytics/clusters`: K-Means clustering.
     - `GET /model/metrics`: Real validation metrics.
     - `GET /health`: Health check.
   - Fixed SQLite schema bootstrap using stdlib `sqlite3` to ensure compatibility with `aiosqlite`.
   - Lowered default inference threshold to `0.15` to catch realistic low-contrast potholes.

5. **Laptop / Web Application (React + Vite + Tailwind CSS):**
   - Running at `http://localhost:3000`.
   - Clean, professional **White + Pastel Blue** aesthetic (`#f0f6ff`, `#3b82f6`, slate typography).
   - **Image Detection Page:**
     - Interactive **Confidence Threshold Slider (5% to 50%)**.
     - Quick sample buttons for RDD2022 test images (`India_000105.jpg`, `India_000305.jpg`, `India_000780.jpg`).
     - Bounding boxes rendered accurately using responsive percentage coordinates.
     - Prominent severity proxy disclaimer banner.
   - **Live Webcam Detection Page:**
     - Solved camera stutter/freeze by capturing frames into an offscreen canvas every 350ms.
     - Overlay canvas renders bounding boxes with clean pastel tags without interfering with the live stream.
     - Adjustable sensitivity slider on live stream.
   - **Video Detection Page:** Progress bar, summary statistics, and detected timestamps.
   - **Analytics & OLAP Dashboard:** Real-time KPI cards, OLAP queries (Roll-up, Slice, Dice), and K-Means hazard cluster visualization.
   - **Model Evaluation Page:** Shows genuine test metrics, PR curve, Confusion Matrix, and RDD2022 dataset metadata.

6. **Flutter Mobile Application (`mobile/`):**
   - Scaffolding complete with clean architecture.
   - `best.onnx` copied to `mobile/assets/models/best.onnx` and loaded via `onnxruntime`.
   - Real-time on-device YOLO pre-processing, post-processing, and Non-Maximum Suppression (NMS).
   - Live Camera screen with overlay bounding boxes and audio/visual hazard alert.
   - Geolocation integration using `geolocator` to attach GPS coordinates.
   - History screen and Settings screen to configure backend server sync.
   - Fully compatible with Flutter 3.44+ (`dart analyze lib` reports **0 errors, 0 warnings**).

7. **Test & Verification Suite:**
   - 18/18 pytest tests passing (`tests/test_pipeline.py`).
   - End-to-end integration test passing (`scripts/verify_laptop_pipeline.py`).

---

## 2. Issues Investigated & Resolved

1. **Issue:** Detection showed 0 potholes on real road images.
   - **Cause:** Default `conf_threshold` was set to `0.25`. On natural road scenes under varying lighting, real potholes had confidence scores around `0.18 - 0.22`.
   - **Solution:** Lowered default threshold to `0.15` in `detect.py`, `yolo_service.py`, and added a real-time slider (5% - 50%) in both Web and Mobile interfaces.

2. **Issue:** Live webcam detection froze or did not draw overlays.
   - **Cause:** The video frame was being drawn onto the same canvas used for overlay boxes, causing frame overwrite collisions and video stutters.
   - **Solution:** Separated video capture to a hidden offscreen canvas and kept the overlay canvas dedicated exclusively to bounding boxes with `pointer-events: none`.

3. **Issue:** `aiosqlite` connection error on DB initialization.
   - **Cause:** `aiosqlite`'s proxy connection does not support `executescript()`.
   - **Solution:** Initialized tables with stdlib `sqlite3` in `db.py`, sharing the same database file with `aiosqlite`.

4. **Issue:** Flutter 3.44 deprecation warnings.
   - **Solution:** Replaced deprecated `CardTheme` with `CardThemeData` and `.withOpacity()` with `.withValues()`.

---

## 3. Commands to Run

### Run All (One-Click)
```cmd
.\start.bat
```

### Manual Run
```bash
# Terminal 1: Backend
python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: Mobile (optional)
cd mobile
flutter run
```

### Run Tests
```bash
python -m pytest tests/test_pipeline.py
python scripts/verify_laptop_pipeline.py
```

---

## 4. GitHub Push & Deployment Instructions

### Push to GitHub
```bash
git add .
git commit -m "feat: complete PotholeGuard full-stack real-time pothole detection and DMDW system"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPOSITORY>.git
git push -u origin main
```

*(Note: `.gitignore` has been pre-configured to exclude large temporary virtual environments, cache directories, and intermediate epoch checkpoints, ensuring standard GitHub pushes remain under all repository size limits).*
