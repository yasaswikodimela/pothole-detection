"""
detection_service.py
Core inference service for PotholeGuard.

Uses ONNX Runtime for CPU-friendly inference on Render.
"""

import io
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Tuple

import numpy as np
from PIL import Image

from backend.app.models.detection import (
    BoundingBox,
    DetectionResult,
    SingleDetection,
    Source,
)


# ---------------------------------------------------------------------------
# Model paths
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[3]

ONNX_MODEL_PATH = ROOT / "ml" / "models" / "best.onnx"

# Fallback to the backend copy if needed
BACKEND_ONNX_MODEL_PATH = ROOT / "backend" / "models" / "best.onnx"


# ---------------------------------------------------------------------------
# Model configuration
# ---------------------------------------------------------------------------

IMG_SIZE = 640

SEVERITY_SMALL_MAX = 0.01
SEVERITY_MEDIUM_MAX = 0.04

SEVERITY_ID_SMALL = 1
SEVERITY_ID_MEDIUM = 2
SEVERITY_ID_LARGE = 3


# ---------------------------------------------------------------------------
# ONNX model singleton
# ---------------------------------------------------------------------------

_session = None


def _get_model():
    """
    Load ONNX model once and reuse it.
    """

    global _session

    if _session is not None:
        return _session

    import onnxruntime as ort

    if ONNX_MODEL_PATH.exists():
        model_path = ONNX_MODEL_PATH
    elif BACKEND_ONNX_MODEL_PATH.exists():
        model_path = BACKEND_ONNX_MODEL_PATH
    else:
        raise FileNotFoundError(
            "ONNX model not found. Expected one of:\n"
            f"  {ONNX_MODEL_PATH}\n"
            f"  {BACKEND_ONNX_MODEL_PATH}"
        )

    print(f"Loading ONNX model: {model_path}")

    providers = ["CPUExecutionProvider"]

    opts = ort.SessionOptions()
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL

    _session = ort.InferenceSession(
        str(model_path),
        sess_options=opts,
        providers=providers,
    )

    print("ONNX model loaded successfully.")

    return _session


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _severity_proxy(norm_area: float) -> Tuple[str, int]:

    if norm_area < SEVERITY_SMALL_MAX:
        return "Small", SEVERITY_ID_SMALL

    elif norm_area < SEVERITY_MEDIUM_MAX:
        return "Medium", SEVERITY_ID_MEDIUM

    return "Large", SEVERITY_ID_LARGE


def _preprocess_image(image: Image.Image) -> np.ndarray:

    image = image.resize((IMG_SIZE, IMG_SIZE))

    image_array = np.asarray(image).astype(np.float32) / 255.0

    # HWC → CHW
    image_array = np.transpose(image_array, (2, 0, 1))

    # Add batch dimension
    image_array = np.expand_dims(image_array, axis=0)

    return image_array


def _decode_results(
    output: np.ndarray,
    source: Source,
    device: str,
    conf_threshold: float,
    iou_threshold: float,
    original_width: int,
    original_height: int,
) -> DetectionResult:

    detections: List[SingleDetection] = []

    # YOLOv8 ONNX output is normally:
    # [1, 5, 8400]
    #
    # 5 values:
    # x_center, y_center, width, height, confidence

    predictions = output

    if predictions.ndim == 3:
        predictions = predictions[0]

    # Convert [5, N] → [N, 5]
    if predictions.shape[0] == 5:
        predictions = predictions.T

    boxes = []
    scores = []

    for prediction in predictions:

        if len(prediction) < 5:
            continue

        xc, yc, w, h, confidence = prediction[:5]

        confidence = float(confidence)

        if confidence < conf_threshold:
            continue

        # Coordinates are in 640x640 model space
        x1 = float(xc - w / 2)
        y1 = float(yc - h / 2)
        x2 = float(xc + w / 2)
        y2 = float(yc + h / 2)

        # Normalize
        x1 /= IMG_SIZE
        y1 /= IMG_SIZE
        x2 /= IMG_SIZE
        y2 /= IMG_SIZE

        x1 = max(0.0, min(1.0, x1))
        y1 = max(0.0, min(1.0, y1))
        x2 = max(0.0, min(1.0, x2))
        y2 = max(0.0, min(1.0, y2))

        boxes.append([x1, y1, x2, y2])
        scores.append(confidence)

    # Simple NMS
    selected = []

    order = np.argsort(scores)[::-1]

    while len(order) > 0:

        current = int(order[0])
        selected.append(current)

        if len(order) == 1:
            break

        remaining = []

        for idx in order[1:]:

            idx = int(idx)

            ax1, ay1, ax2, ay2 = boxes[current]
            bx1, by1, bx2, by2 = boxes[idx]

            inter_x1 = max(ax1, bx1)
            inter_y1 = max(ay1, by1)
            inter_x2 = min(ax2, bx2)
            inter_y2 = min(ay2, by2)

            inter_w = max(0.0, inter_x2 - inter_x1)
            inter_h = max(0.0, inter_y2 - inter_y1)

            intersection = inter_w * inter_h

            area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
            area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)

            union = area_a + area_b - intersection

            iou = intersection / union if union > 0 else 0

            if iou < iou_threshold:
                remaining.append(idx)

        order = np.array(remaining)

    for idx in selected:

        x1, y1, x2, y2 = boxes[idx]
        confidence = scores[idx]

        width = x2 - x1
        height = y2 - y1
        area = width * height

        severity_label, severity_id = _severity_proxy(area)

        detections.append(
            SingleDetection(
                detection_id=str(uuid.uuid4()),
                confidence=round(float(confidence), 4),
                bounding_box=BoundingBox(
                    x1=round(x1, 6),
                    y1=round(y1, 6),
                    x2=round(x2, 6),
                    y2=round(y2, 6),
                    norm_area=round(area, 6),
                ),
                estimated_severity_proxy=severity_label,
                severity_id=severity_id,
                severity_note=(
                    "Estimated Severity (Bounding-Box Area Proxy) — "
                    "NOT actual physical pothole depth"
                ),
            )
        )

    pothole_count = len(detections)

    avg_conf = (
        round(
            sum(d.confidence for d in detections) / pothole_count,
            4,
        )
        if pothole_count
        else 0.0
    )

    max_area = (
        max(d.bounding_box.norm_area for d in detections)
        if detections
        else 0.0
    )

    severity_label, severity_id = _severity_proxy(max_area)

    return DetectionResult(
        result_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(),
        pothole_count=pothole_count,
        avg_confidence=avg_conf,
        detections=detections,
        dominant_severity_proxy=severity_label,
        dominant_severity_id=severity_id,
        source=source,
        device=device,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _preprocess_numpy_frame(
    frame: np.ndarray,
    imgsz: int = IMG_SIZE,
) -> Tuple[np.ndarray, int, int]:
    """
    Directly preprocess a BGR/RGB numpy frame without JPEG encode/decode.
    """
    import cv2

    orig_h, orig_w = frame.shape[:2]

    # Convert BGR (OpenCV default) to RGB
    if frame.ndim == 3 and frame.shape[2] == 3:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    else:
        rgb = frame

    resized = cv2.resize(rgb, (imgsz, imgsz), interpolation=cv2.INTER_LINEAR)
    arr = resized.astype(np.float32) / 255.0
    arr = np.transpose(arr, (2, 0, 1))
    arr = np.expand_dims(arr, axis=0)
    arr = np.ascontiguousarray(arr)

    return arr, orig_w, orig_h


def _run_inference(
    input_tensor: np.ndarray,
    original_width: int,
    original_height: int,
    conf_threshold: float,
    iou_threshold: float,
    source: Source,
    device: str,
) -> DetectionResult:
    session = _get_model()
    input_name = session.get_inputs()[0].name

    t0 = time.perf_counter()

    outputs = session.run(
        None,
        {
            input_name: input_tensor,
        },
    )

    inference_ms = (time.perf_counter() - t0) * 1000

    output = outputs[0]

    result = _decode_results(
        output=output,
        source=source,
        device=device,
        conf_threshold=conf_threshold,
        iou_threshold=iou_threshold,
        original_width=original_width,
        original_height=original_height,
    )

    result.inference_ms = round(inference_ms, 1)

    return result


def infer_image_bytes(
    image_bytes: bytes,
    conf_threshold: float = 0.25,
    iou_threshold: float = 0.45,
    imgsz: int = 640,
    source: Source = Source.IMAGE,
    device: str = "upload",
) -> DetectionResult:

    pil_image = Image.open(
        io.BytesIO(image_bytes)
    ).convert("RGB")

    original_width, original_height = pil_image.size
    input_tensor = _preprocess_image(pil_image)

    return _run_inference(
        input_tensor=input_tensor,
        original_width=original_width,
        original_height=original_height,
        conf_threshold=conf_threshold,
        iou_threshold=iou_threshold,
        source=source,
        device=device,
    )


def infer_numpy_frame(
    frame: np.ndarray,
    conf_threshold: float = 0.25,
    iou_threshold: float = 0.45,
    imgsz: int = 640,
    source: Source = Source.LIVE_CAMERA,
    device: str = "webcam",
) -> DetectionResult:

    input_tensor, original_width, original_height = _preprocess_numpy_frame(
        frame, imgsz=imgsz
    )

    return _run_inference(
        input_tensor=input_tensor,
        original_width=original_width,
        original_height=original_height,
        conf_threshold=conf_threshold,
        iou_threshold=iou_threshold,
        source=source,
        device=device,
    )


def draw_detections(
    frame: np.ndarray,
    detection_result: DetectionResult,
) -> np.ndarray:

    import cv2

    h, w = frame.shape[:2]

    for det in detection_result.detections:

        bb = det.bounding_box

        x1 = int(bb.x1 * w)
        y1 = int(bb.y1 * h)
        x2 = int(bb.x2 * w)
        y2 = int(bb.y2 * h)

        cv2.rectangle(
            frame,
            (x1, y1),
            (x2, y2),
            (0, 0, 220),
            2,
        )

        label = (
            f"Pothole {det.confidence:.0%} "
            f"({det.estimated_severity_proxy})"
        )

        label_y = max(y1 - 8, 15)

        cv2.putText(
            frame,
            label,
            (x1, label_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (0, 0, 220),
            2,
            cv2.LINE_AA,
        )

    summary = (
        f"Potholes: {detection_result.pothole_count}  "
        f"Conf: {detection_result.avg_confidence:.0%}  "
        f"Inf: {detection_result.inference_ms:.0f}ms"
    )

    cv2.putText(
        frame,
        summary,
        (10, 28),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )

    return frame