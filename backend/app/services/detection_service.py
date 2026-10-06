"""
detection_service.py
====================
Core YOLO inference service for PotholeGuard.

Responsibilities:
  - Load the YOLOv8 model once (singleton pattern).
  - Run inference on images (numpy arrays or file bytes).
  - Convert YOLO results to structured DetectionResult objects.
  - Compute the severity proxy based on bounding-box area.
  - Feed results to the ETL pipeline (stores to data warehouse).

The model is NOT the DMDW component.
YOLO performs computer vision (object detection).
K-Means and OLAP are applied to the stored detection records.

Author: PotholeGuard project
"""

import io
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np

from backend.app.models.detection import (
    BoundingBox,
    DetectionResult,
    SingleDetection,
    Source,
)


# ── Constants ─────────────────────────────────────────────────────────────────

MODEL_PATH = (
    Path(__file__).resolve().parent.parent.parent.parent
    / "ml" / "models" / "best.pt"
)

# Severity proxy thresholds (normalised bounding-box area w * h)
SEVERITY_SMALL_MAX  = 0.01
SEVERITY_MEDIUM_MAX = 0.04

# Severity dimension IDs (match database/schema.sql seed)
SEVERITY_ID_SMALL  = 1
SEVERITY_ID_MEDIUM = 2
SEVERITY_ID_LARGE  = 3


# ── Singleton model holder ─────────────────────────────────────────────────────

_model = None
_model_loaded = False


def _get_model():
    global _model, _model_loaded
    if _model_loaded:
        return _model

    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"YOLOv8 model weights not found: {MODEL_PATH}\n"
            "Please train the model first:\n"
            "  python ml/scripts/train_yolov8.py --dataset_yaml ml/dataset/dataset.yaml"
        )

    from ultralytics import YOLO
    _model = YOLO(str(MODEL_PATH))
    _model_loaded = True
    return _model


# ── Helpers ───────────────────────────────────────────────────────────────────

def _severity_proxy(norm_area: float) -> Tuple[str, int]:
    """
    Map normalised bounding-box area to a severity label and dimension ID.

    This is a PROXY only — it does NOT measure actual pothole depth.
    Clearly labelled in the API response as 'estimated_severity_proxy'.
    """
    if norm_area < SEVERITY_SMALL_MAX:
        return "Small",  SEVERITY_ID_SMALL
    elif norm_area < SEVERITY_MEDIUM_MAX:
        return "Medium", SEVERITY_ID_MEDIUM
    else:
        return "Large",  SEVERITY_ID_LARGE


def _decode_results(yolo_results, source: Source, device: str) -> DetectionResult:
    """
    Convert a list of ultralytics Result objects to a DetectionResult.
    Assumes all results are from the same inference call.
    """
    detections: List[SingleDetection] = []
    timestamp = datetime.utcnow()

    for result in yolo_results:
        boxes = result.boxes
        if boxes is None:
            continue

        confs     = boxes.conf.tolist()      # confidence scores
        xyxy_norm = boxes.xyxyn.tolist()     # normalised [x1,y1,x2,y2]
        xywh_norm = boxes.xywhn.tolist()     # normalised [xc,yc,w,h]

        for i in range(len(confs)):
            conf     = float(confs[i])
            x1, y1, x2, y2 = xyxy_norm[i]
            xc, yc, w, h   = xywh_norm[i]
            area = w * h

            sev_label, sev_id = _severity_proxy(area)

            det = SingleDetection(
                detection_id = str(uuid.uuid4()),
                confidence   = round(conf, 4),
                bounding_box = BoundingBox(
                    x1=round(x1, 6),
                    y1=round(y1, 6),
                    x2=round(x2, 6),
                    y2=round(y2, 6),
                    norm_area=round(area, 6),
                ),
                estimated_severity_proxy = sev_label,
                severity_id              = sev_id,
                severity_note=(
                    "Estimated Severity (Bounding-Box Area Proxy) — "
                    "NOT actual physical pothole depth"
                ),
            )
            detections.append(det)

    pothole_count = len(detections)
    avg_conf = (
        round(sum(d.confidence for d in detections) / pothole_count, 4)
        if pothole_count else 0.0
    )
    max_area = (
        max(d.bounding_box.norm_area for d in detections)
        if detections else 0.0
    )
    sev_label, sev_id = _severity_proxy(max_area)

    return DetectionResult(
        result_id       = str(uuid.uuid4()),
        timestamp       = timestamp,
        pothole_count   = pothole_count,
        avg_confidence  = avg_conf,
        detections      = detections,
        dominant_severity_proxy = sev_label,
        dominant_severity_id    = sev_id,
        source          = source,
        device          = device,
    )


# ── Public API ─────────────────────────────────────────────────────────────────

def infer_image_bytes(
    image_bytes: bytes,
    conf_threshold: float = 0.25,
    iou_threshold: float  = 0.45,
    imgsz: int            = 640,
    source: Source        = Source.IMAGE,
    device: str           = "upload",
) -> DetectionResult:
    """
    Run YOLO inference on raw image bytes.

    Parameters
    ----------
    image_bytes   : Raw bytes of the image (JPEG / PNG / etc.)
    conf_threshold: Confidence threshold (default 0.25)
    iou_threshold : NMS IoU threshold (default 0.45)
    imgsz         : Inference image size (default 640)
    source        : Detection source (IMAGE | LIVE_CAMERA | VIDEO)
    device        : Device identifier string (e.g. 'webcam', 'upload', 'mobile')

    Returns
    -------
    DetectionResult containing all detected potholes with confidence and
    estimated severity proxy.
    """
    from PIL import Image

    model = _get_model()

    # Decode bytes to PIL image
    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    t0 = time.perf_counter()
    results = model.predict(
        source  = pil_image,
        conf    = conf_threshold,
        iou     = iou_threshold,
        imgsz   = imgsz,
        verbose = False,
        save    = False,
    )
    inference_ms = (time.perf_counter() - t0) * 1000

    detection_result = _decode_results(results, source, device)
    detection_result.inference_ms = round(inference_ms, 1)

    return detection_result


def infer_numpy_frame(
    frame: np.ndarray,
    conf_threshold: float = 0.25,
    iou_threshold: float  = 0.45,
    imgsz: int            = 640,
    source: Source        = Source.LIVE_CAMERA,
    device: str           = "webcam",
) -> DetectionResult:
    """
    Run YOLO inference on a BGR numpy array (OpenCV frame).
    Used for webcam live detection.
    """
    model = _get_model()

    # YOLO accepts numpy arrays directly
    t0 = time.perf_counter()
    results = model.predict(
        source  = frame,
        conf    = conf_threshold,
        iou     = iou_threshold,
        imgsz   = imgsz,
        verbose = False,
        save    = False,
    )
    inference_ms = (time.perf_counter() - t0) * 1000

    detection_result = _decode_results(results, source, device)
    detection_result.inference_ms = round(inference_ms, 1)

    return detection_result


def draw_detections(frame: np.ndarray, detection_result: DetectionResult) -> np.ndarray:
    """
    Draw bounding boxes on a BGR numpy frame in-place.

    Boxes are drawn with:
      - Red colour (#FF4444)
      - Confidence label
      - Severity proxy label
    """
    import cv2

    h, w = frame.shape[:2]

    for det in detection_result.detections:
        bb = det.bounding_box
        x1 = int(bb.x1 * w)
        y1 = int(bb.y1 * h)
        x2 = int(bb.x2 * w)
        y2 = int(bb.y2 * h)

        # Draw bounding box
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 220), 2)

        # Label
        label = f"Pothole {det.confidence:.0%} ({det.estimated_severity_proxy})"
        label_y = max(y1 - 8, 15)
        cv2.putText(
            frame, label,
            (x1, label_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55, (0, 0, 220), 2, cv2.LINE_AA,
        )

    # Overlay summary
    summary = (
        f"Potholes: {detection_result.pothole_count}  "
        f"Conf: {detection_result.avg_confidence:.0%}  "
        f"Inf: {detection_result.inference_ms:.0f}ms"
    )
    cv2.putText(
        frame, summary,
        (10, 28),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7, (255, 255, 255), 2, cv2.LINE_AA,
    )

    return frame
