"""
detect.py  — /detect router
============================
Detection API endpoints.

POST /detect/image    — Upload and detect potholes in an image
POST /detect/video    — Upload and detect potholes in a video
POST /detect/frame    — Submit a base64 frame (live camera / mobile)

Author: PotholeGuard project
"""

import base64
import io
import json
import uuid
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.db import get_db
from backend.app.models.detection import (
    DetectionResult,
    FrameDetectionRequest,
    Source,
)
from backend.app.services import detection_service, etl_service

router = APIRouter()

# Allowed image / video MIME types
_IMAGE_TYPES = {"image/jpeg", "image/png", "image/jpg", "image/webp"}
_VIDEO_TYPES = {"video/mp4", "video/avi", "video/quicktime", "video/x-msvideo"}


# ─────────────────────────────────────────────────────────────────────────────
# POST /detect/image
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/image", summary="Detect potholes in an uploaded image")
async def detect_image(
    file:           UploadFile = File(...),
    road_name:      Optional[str] = Form(None),
    latitude:       Optional[float] = Form(None),
    longitude:      Optional[float] = Form(None),
    conf_threshold: float      = Form(0.15),
    iou_threshold:  float      = Form(0.45),
    imgsz:          int        = Form(640),
    save_to_db:     bool       = Form(True),
    db: AsyncSession = Depends(get_db),
):

    """
    Upload an image file and receive pothole detection results.

    - Runs YOLO inference.
    - Returns bounding boxes, confidence scores, pothole count.
    - Optionally stores the detection record in the data warehouse.
    - Estimated severity is a bounding-box area proxy (NOT physical depth).
    """
    content_type = file.content_type or ""
    if not any(ct in content_type for ct in ["image/", "octet"]):
        raise HTTPException(status_code=400, detail="Only image files are accepted.")

    image_bytes = await file.read()

    result: DetectionResult = detection_service.infer_image_bytes(
        image_bytes    = image_bytes,
        conf_threshold = conf_threshold,
        iou_threshold  = iou_threshold,
        imgsz          = imgsz,
        source         = Source.IMAGE,
        device         = "upload",
    )

    result.road_name = road_name
    result.latitude  = latitude
    result.longitude = longitude
    result.gps_available = (latitude is not None and longitude is not None)

    detection_id = None
    if save_to_db and result.pothole_count > 0:
        detection_id = await etl_service.load_detection_to_warehouse(
            db         = db,
            result     = result,
            image_file = file.filename,
        )

    formatted_detections = [
        {
            **d.model_dump(),
            "estimated_severity": d.estimated_severity_proxy,
            "bbox": [d.bounding_box.x1, d.bounding_box.y1, d.bounding_box.x2, d.bounding_box.y2],
        }
        for d in result.detections
    ]

    return {
        "detection_id":    detection_id,
        "pothole_count":   result.pothole_count,
        "avg_confidence":  result.avg_confidence,
        "inference_ms":    result.inference_ms,
        "dominant_severity_proxy": result.dominant_severity_proxy,
        "dominant_severity": result.dominant_severity_proxy,
        "severity_note":   "Estimated Severity (Bounding-Box Area Proxy) — NOT actual depth",
        "detections":      formatted_detections,
        "source":          result.source.value,
        "road_name":       road_name,
        "location":        {"latitude": latitude, "longitude": longitude} if result.gps_available else None,
        "timestamp":       result.timestamp.isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# POST /detect/frame
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/frame", summary="Detect potholes in a base64-encoded camera frame")
async def detect_frame(
    request: FrameDetectionRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Accept a base64-encoded image frame (from live webcam or mobile).

    Runs YOLO inference and optionally stores the result.
    Returns detection data for real-time overlay in the UI.
    """
    try:
        image_bytes = base64.b64decode(request.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data.")

    result: DetectionResult = detection_service.infer_image_bytes(
        image_bytes    = image_bytes,
        conf_threshold = request.conf_threshold,
        iou_threshold  = request.iou_threshold,
        imgsz          = request.imgsz,
        source         = Source.LIVE_CAMERA,
        device         = request.device,
    )

    result.road_name  = request.road_name
    result.latitude   = request.latitude
    result.longitude  = request.longitude
    result.gps_available = (
        request.latitude is not None and request.longitude is not None
    )

    if result.pothole_count > 0:
        await etl_service.load_detection_to_warehouse(db=db, result=result)

    formatted_detections = [
        {
            **d.model_dump(),
            "estimated_severity": d.estimated_severity_proxy,
            "bbox": [d.bounding_box.x1, d.bounding_box.y1, d.bounding_box.x2, d.bounding_box.y2],
        }
        for d in result.detections
    ]

    return {
        "pothole_count":   result.pothole_count,
        "avg_confidence":  result.avg_confidence,
        "inference_ms":    result.inference_ms,
        "dominant_severity_proxy": result.dominant_severity_proxy,
        "dominant_severity": result.dominant_severity_proxy,
        "detections":      formatted_detections,
        "gps_available":   result.gps_available,
        "timestamp":       result.timestamp.isoformat(),
    }



# ─────────────────────────────────────────────────────────────────────────────
# POST /detect/video
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/video", summary="Detect potholes in an uploaded video file")
async def detect_video(
    file:           UploadFile = File(...),
    conf_threshold: float      = Form(0.25),
    iou_threshold:  float      = Form(0.45),
    imgsz:          int        = Form(640),
    frame_skip:     int        = Form(5,  description="Process every Nth frame"),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a video file (MP4 / AVI / MOV) and receive a detection summary.

    Processing:
    - Reads the video frame by frame.
    - Runs YOLO inference every `frame_skip` frames.
    - Returns a summary: total frames, pothole count per frame, timestamps.
    - Does NOT store every frame permanently.

    Returns a summary JSON with per-frame results.
    """
    try:
        import cv2
        import tempfile, os
    except ImportError:
        raise HTTPException(status_code=500, detail="OpenCV not installed.")

    video_bytes = await file.read()

    # Write to a temp file (OpenCV requires a path or real file)
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(video_bytes)
        tmp_path = tmp.name

    try:
        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="Could not open video file.")

        fps_in       = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        frame_results = []
        frame_idx     = 0
        total_potholes = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % frame_skip == 0:
                result = detection_service.infer_numpy_frame(
                    frame          = frame,
                    conf_threshold = conf_threshold,
                    iou_threshold  = iou_threshold,
                    imgsz          = imgsz,
                    source         = Source.VIDEO,
                    device         = "upload",
                )

                frame_time_s = frame_idx / fps_in
                total_potholes += result.pothole_count

                frame_results.append({
                    "frame":         frame_idx,
                    "time_seconds":  round(frame_time_s, 2),
                    "pothole_count": result.pothole_count,
                    "avg_confidence": result.avg_confidence,
                    "dominant_severity_proxy": result.dominant_severity_proxy,
                })

                # Store each frame with detections to DB
                if result.pothole_count > 0:
                    await etl_service.load_detection_to_warehouse(
                        db         = db,
                        result     = result,
                        image_file = f"{file.filename}::frame_{frame_idx}",
                    )

            frame_idx += 1

        cap.release()

    finally:
        os.unlink(tmp_path)

    return {
        "video_filename": file.filename,
        "total_frames":   total_frames,
        "frames_processed": len(frame_results),
        "frame_skip":     frame_skip,
        "total_potholes": total_potholes,
        "severity_note":  "Estimated Severity (Bounding-Box Area Proxy) — NOT actual depth",
        "frame_results":  frame_results,
    }
