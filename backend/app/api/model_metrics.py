"""
model_metrics.py  — /model router
===================================
Model evaluation metrics endpoint.

GET /model/metrics — Returns actual trained model metrics (from evaluation JSON)
GET /model/info    — Returns model metadata (weights path, class map, etc.)

Author: PotholeGuard project
"""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter()

_MODELS_DIR  = Path(__file__).resolve().parent.parent.parent.parent / "ml" / "models"
_RESULTS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "ml" / "results"


@router.get("/metrics", summary="Actual model evaluation metrics")
async def get_model_metrics():
    """
    Returns ACTUAL model evaluation metrics computed on the RDD2022 India test set.

    Metrics:
    - Precision, Recall, mAP50, mAP50-95

    NOTE: These are real values from validate_model.py output.
    If the model has not been evaluated yet, returns a 'not_available' status.
    """
    # Look for metrics JSON saved by validate_model.py
    metrics_path = _RESULTS_DIR / "evaluation" / "metrics_test.json"
    if not metrics_path.exists():
        metrics_path = _RESULTS_DIR / "evaluation" / "metrics_val.json"

    if not metrics_path.exists():
        return {
            "status":  "not_available",
            "message": (
                "Model metrics not yet available.  "
                "Run:  python ml/scripts/validate_model.py"
            ),
            "metrics": None,
        }

    data = json.loads(metrics_path.read_text())

    return {
        "status":  "available",
        "model":   data.get("model"),
        "split":   data.get("split"),
        "dataset": "RDD2022, India subset, D40 (pothole) class",
        "metrics": data.get("metrics"),
        "note":    data.get("note"),
        "metric_explanations": {
            "precision":  "Of all predicted potholes, what fraction were real potholes.",
            "recall":     "Of all real potholes in the test set, what fraction did the model detect.",
            "mAP50":      "Mean Average Precision at IoU threshold 0.50 (primary detection benchmark).",
            "mAP50_95":   "mAP averaged over IoU thresholds 0.50–0.95 (stricter benchmark).",
            "accuracy_note": (
                "'Accuracy' is not reported because it is not a valid metric for "
                "object detection.  Background is not a class.  Use Precision, Recall, mAP."
            ),
        },
    }


@router.get("/info", summary="Model metadata and class map")
async def get_model_info():
    """Returns metadata about the deployed model weights."""
    info_path = _MODELS_DIR / "model_info.json"
    weights_path = _MODELS_DIR / "best.pt"

    model_info = {}
    if info_path.exists():
        model_info = json.loads(info_path.read_text())

    return {
        "weights_available": weights_path.exists(),
        "onnx_available":    (_MODELS_DIR / "best.onnx").exists(),
        "class_map":         {0: "pothole"},
        "source_dataset":    "RDD2022",
        "subset":            "India",
        "pothole_class":     "D40",
        "architecture":      "YOLOv8s (small)",
        "info":              model_info,
    }
