"""
test_pipeline.py
================
Integration tests for PotholeGuard — Phase 1 & 2 verification.

Tests:
  1. Dataset loading (verify labels directory and YOLO files exist)
  2. Model loading (weights available)
  3. Image inference (YOLO runs without error on a test image)
  4. API endpoints (basic import and FastAPI app creation)
  5. Database schema (SQLite tables can be created)
  6. ETL functions (dimension ID computation)
  7. K-Means clustering (runs with synthetic data)

Run with:
    pytest tests/test_pipeline.py -v

Author: PotholeGuard project
"""

import json
import sys
from pathlib import Path

import pytest

# ── Project root on path ──────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

DATASET_DIR = PROJECT_ROOT / "ml" / "dataset"
MODELS_DIR  = PROJECT_ROOT / "ml" / "models"


# ─────────────────────────────────────────────────────────────────────────────
# 1. Dataset loading tests
# ─────────────────────────────────────────────────────────────────────────────

class TestDatasetLoading:
    def test_dataset_yaml_exists(self):
        """dataset.yaml must exist (created by prepare_rdd2022.py)."""
        yaml_path = DATASET_DIR / "dataset.yaml"
        assert yaml_path.exists(), (
            f"dataset.yaml not found at {yaml_path}. "
            "Run ml/scripts/prepare_rdd2022.py first."
        )

    def test_metadata_json_exists(self):
        """metadata.json must exist and contain split statistics."""
        meta_path = DATASET_DIR / "metadata.json"
        assert meta_path.exists(), "metadata.json not found."
        data = json.loads(meta_path.read_text())
        assert "splits" in data, "metadata.json missing 'splits' key."
        for split in ("train", "val", "test"):
            assert split in data["splits"], f"Missing split: {split}"

    def test_train_images_exist(self):
        """Train images directory must not be empty."""
        train_img = DATASET_DIR / "images" / "train"
        if not train_img.exists():
            pytest.skip("Dataset not yet prepared.")
        imgs = list(train_img.glob("*.jpg")) + list(train_img.glob("*.png"))
        assert len(imgs) > 0, "No images found in train split."

    def test_train_labels_exist(self):
        """Train labels directory must have .txt label files."""
        train_lbl = DATASET_DIR / "labels" / "train"
        if not train_lbl.exists():
            pytest.skip("Dataset not yet prepared.")
        labels = list(train_lbl.glob("*.txt"))
        assert len(labels) > 0, "No label files found in train split."

    def test_label_format(self):
        """A random label file should have valid YOLO format (class_id xc yc w h)."""
        train_lbl = DATASET_DIR / "labels" / "train"
        if not train_lbl.exists():
            pytest.skip("Dataset not yet prepared.")

        label_files = list(train_lbl.glob("*.txt"))
        if not label_files:
            pytest.skip("No label files found.")

        # Check first non-empty label file
        for lf in label_files:
            text = lf.read_text().strip()
            if not text:
                continue
            parts = text.splitlines()[0].split()
            assert len(parts) == 5, f"Expected 5 values per line, got {len(parts)}"
            class_id = int(parts[0])
            assert class_id == 0, f"Expected class_id=0 (pothole), got {class_id}"
            xc, yc, w, h = map(float, parts[1:])
            assert 0 <= xc <= 1, "x_center out of range"
            assert 0 <= yc <= 1, "y_center out of range"
            assert 0 <  w  <= 1, "width out of range"
            assert 0 <  h  <= 1, "height out of range"
            break   # one file is enough


# ─────────────────────────────────────────────────────────────────────────────
# 2. Model loading
# ─────────────────────────────────────────────────────────────────────────────

class TestModelLoading:
    def test_weights_file_exists(self):
        """best.pt must be present after training."""
        weights = MODELS_DIR / "best.pt"
        assert weights.exists(), (
            "best.pt not found.  "
            "Train the model:  python ml/scripts/train_yolov8.py"
        )

    def test_yolo_loads(self):
        """YOLO should load best.pt without errors."""
        weights = MODELS_DIR / "best.pt"
        if not weights.exists():
            pytest.skip("best.pt not available.")
        try:
            from ultralytics import YOLO
            model = YOLO(str(weights))
            assert model is not None
        except Exception as e:
            pytest.fail(f"Failed to load YOLO model: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# 3. Image inference
# ─────────────────────────────────────────────────────────────────────────────

class TestImageInference:
    def test_inference_runs(self):
        """YOLO inference should run on a test image without crashing."""
        weights = MODELS_DIR / "best.pt"
        if not weights.exists():
            pytest.skip("best.pt not available.")

        # Use a test image if available; otherwise create a blank one
        test_dir = DATASET_DIR / "images" / "test"
        test_images = list(test_dir.glob("*.jpg")) + list(test_dir.glob("*.png")) if test_dir.exists() else []

        if not test_images:
            # Create a minimal blank image for inference test
            import numpy as np
            try:
                from ultralytics import YOLO
                model = YOLO(str(weights))
                blank = np.zeros((640, 640, 3), dtype=np.uint8)
                results = model.predict(source=blank, conf=0.25, verbose=False, save=False)
                assert isinstance(results, list)
            except Exception as e:
                pytest.fail(f"Inference failed on blank image: {e}")
        else:
            try:
                from ultralytics import YOLO
                model = YOLO(str(weights))
                results = model.predict(
                    source=str(test_images[0]),
                    conf=0.25,
                    verbose=False,
                    save=False,
                )
                assert isinstance(results, list)
            except Exception as e:
                pytest.fail(f"Inference failed: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# 4. Database schema
# ─────────────────────────────────────────────────────────────────────────────

class TestDatabase:
    def test_schema_sql_exists(self):
        schema = PROJECT_ROOT / "database" / "schema.sql"
        assert schema.exists(), "database/schema.sql not found."

    def test_schema_creates_tables(self):
        """The schema SQL should create tables in a temporary SQLite database."""
        import sqlite3
        import tempfile, os

        schema_sql = (PROJECT_ROOT / "database" / "schema.sql").read_text(encoding="utf-8")
        seed_sql   = (PROJECT_ROOT / "database" / "seed.sql").read_text(encoding="utf-8")

        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = f.name

        try:
            conn = sqlite3.connect(db_path)
            conn.execute("PRAGMA foreign_keys = ON")
            conn.executescript(schema_sql)
            conn.executescript(seed_sql)

            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
            tables = {row[0] for row in cursor.fetchall()}
            expected = {
                "Date_Dim", "Time_Dim", "Location_Dim",
                "Road_Dim", "Severity_Dim", "Pothole_Detection_Fact",
            }
            for t in expected:
                assert t in tables, f"Table '{t}' not found in schema."
            conn.close()
        finally:
            os.unlink(db_path)


# ─────────────────────────────────────────────────────────────────────────────
# 5. ETL helper functions
# ─────────────────────────────────────────────────────────────────────────────

class TestETL:
    def test_date_id_format(self):
        from datetime import datetime
        from backend.app.services.etl_service import _date_id
        dt = datetime(2025, 10, 15)
        assert _date_id(dt) == 20251015

    def test_time_id_format(self):
        from datetime import datetime
        from backend.app.services.etl_service import _time_id
        dt = datetime(2025, 10, 15, 9, 30, 0)
        assert _time_id(dt) == 93000

    def test_shift_classification(self):
        from backend.app.services.etl_service import _shift
        assert _shift(8)  == "Morning"
        assert _shift(13) == "Afternoon"
        assert _shift(18) == "Evening"
        assert _shift(23) == "Night"


# ─────────────────────────────────────────────────────────────────────────────
# 6. K-Means clustering (synthetic data)
# ─────────────────────────────────────────────────────────────────────────────

class TestKMeans:
    def test_cluster_roads_basic(self):
        from backend.app.services.kmeans_service import cluster_roads

        # Synthetic road data
        road_stats = [
            {"road_id": i, "road_name": f"Road {i}", "city": "TestCity",
             "total_potholes": i * 10, "detection_count": i * 2,
             "high_severity_count": i, "avg_confidence": 0.7, "avg_bbox_area": 0.02}
            for i in range(1, 7)   # 6 roads
        ]

        result = cluster_roads(road_stats, k=3)

        assert result["k"] == 3
        assert len(result["roads"]) == 6
        assert "cluster_centers" in result
        assert len(result["cluster_centers"]) == 3
        assert "inertia" in result

        for road in result["roads"]:
            assert "cluster" in road
            assert road["cluster"] in (0, 1, 2)

    def test_cluster_too_few_roads(self):
        from backend.app.services.kmeans_service import cluster_roads
        import pytest

        road_stats = [
            {"road_id": 1, "road_name": "Road A", "city": "X",
             "total_potholes": 10, "detection_count": 2,
             "high_severity_count": 1, "avg_confidence": 0.7, "avg_bbox_area": 0.02},
        ]

        with pytest.raises(ValueError, match="Cannot create"):
            cluster_roads(road_stats, k=3)


# ─────────────────────────────────────────────────────────────────────────────
# 7. Severity proxy
# ─────────────────────────────────────────────────────────────────────────────

class TestSeverityProxy:
    def test_small(self):
        from backend.app.services.detection_service import _severity_proxy
        label, sid = _severity_proxy(0.005)
        assert label == "Small"
        assert sid == 1

    def test_medium(self):
        from backend.app.services.detection_service import _severity_proxy
        label, sid = _severity_proxy(0.02)
        assert label == "Medium"
        assert sid == 2

    def test_large(self):
        from backend.app.services.detection_service import _severity_proxy
        label, sid = _severity_proxy(0.05)
        assert label == "Large"
        assert sid == 3
