"""
detection.py  (Pydantic models)
=================================
Data models for detection requests, results, and API responses.

Author: PotholeGuard project
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


# ── Enumerations ──────────────────────────────────────────────────────────────

class Source(str, Enum):
    LIVE_CAMERA = "LIVE_CAMERA"
    IMAGE       = "IMAGE"
    VIDEO       = "VIDEO"


class SeverityLabel(str, Enum):
    Small  = "Small"
    Medium = "Medium"
    Large  = "Large"


# ── Sub-models ────────────────────────────────────────────────────────────────

class BoundingBox(BaseModel):
    """Normalised bounding box coordinates (0.0–1.0)."""
    x1:        float = Field(..., ge=0, le=1)
    y1:        float = Field(..., ge=0, le=1)
    x2:        float = Field(..., ge=0, le=1)
    y2:        float = Field(..., ge=0, le=1)
    norm_area: float = Field(..., ge=0, le=1,
                             description="Normalised bounding-box area (w * h). Proxy for severity.")


class SingleDetection(BaseModel):
    """One pothole detection within an inference result."""
    detection_id:              str
    confidence:                float  = Field(..., ge=0, le=1)
    bounding_box:              BoundingBox
    estimated_severity_proxy:  str    = Field(
        ...,
        description="Estimated Severity (Bounding-Box Area Proxy) — NOT actual physical depth."
    )
    severity_id:               int
    severity_note:             str = (
        "Estimated Severity (Bounding-Box Area Proxy) — NOT actual physical pothole depth"
    )


# ── Main result ───────────────────────────────────────────────────────────────

class DetectionResult(BaseModel):
    """Full inference result for one image / frame."""
    result_id:                str
    timestamp:                datetime
    pothole_count:            int
    avg_confidence:           float
    inference_ms:             float = 0.0
    detections:               List[SingleDetection]
    dominant_severity_proxy:  str
    dominant_severity_id:     int
    source:                   Source
    device:                   str

    # Optional metadata (GPS and road name)
    road_name:  Optional[str] = None
    latitude:   Optional[float] = None
    longitude:  Optional[float] = None
    gps_available: bool = False


# ── API request models ────────────────────────────────────────────────────────

class ImageDetectionRequest(BaseModel):
    """Query parameters for image detection."""
    conf_threshold: float = Field(0.25, ge=0.01, le=1.0,
                                  description="YOLO confidence threshold.")
    iou_threshold:  float = Field(0.45, ge=0.01, le=1.0,
                                  description="NMS IoU threshold.")
    imgsz:          int   = Field(640,  ge=320, le=1280,
                                  description="Inference image size (multiple of 32).")


class FrameDetectionRequest(BaseModel):
    """Request body for live-frame detection (base64 image)."""
    image_base64:   str
    conf_threshold: float = 0.15
    iou_threshold:  float = 0.45
    imgsz:          int   = 640
    road_name:      Optional[str] = None
    latitude:       Optional[float] = None
    longitude:      Optional[float] = None
    device:         str = "webcam"
    save_to_db:     bool = False



# ── Record stored in DB ───────────────────────────────────────────────────────

class DetectionRecord(BaseModel):
    """Schema for a detection record stored in the data warehouse."""
    Detection_ID:      str
    Date_ID:           int
    Time_ID:           int
    Location_ID:       int
    Road_ID:           int
    Severity_ID:       int
    Pothole_Count:     int
    Confidence:        float
    Bounding_Box_Area: float
    Source:            str
    Device:            str
    Raw_Timestamp:     str
    Image_File:        Optional[str] = None
    Notes:             Optional[str] = None
