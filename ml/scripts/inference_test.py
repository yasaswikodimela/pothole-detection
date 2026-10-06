"""
inference_test.py
=================
Quick single-image (or batch) inference test for PotholeGuard.

Verifies that:
  1. The trained model weights load correctly.
  2. Inference runs without errors.
  3. Bounding boxes are drawn and saved.

Usage
-----
  # Test on a single image
  python ml/scripts/inference_test.py \\
      --weights  ml/models/best.pt \\
      --image    path/to/test_image.jpg \\
      --conf     0.25 \\
      --device   cpu

  # Test on all images in a folder
  python ml/scripts/inference_test.py \\
      --weights  ml/models/best.pt \\
      --image    ml/dataset/images/test/ \\
      --conf     0.25

Output is saved to ml/results/inference_test/.

Author: PotholeGuard project
"""

import argparse
import json
import time
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run inference with the trained pothole model.")
    parser.add_argument(
        "--weights", type=str,
        default=str(Path(__file__).resolve().parent.parent / "models" / "best.pt"),
    )
    parser.add_argument(
        "--image",  type=str, required=True,
        help="Path to an image file or directory of images.",
    )
    parser.add_argument("--conf",    type=float, default=0.25,
                        help="Confidence threshold (0–1).")
    parser.add_argument("--iou",     type=float, default=0.45,
                        help="NMS IoU threshold (0–1).")
    parser.add_argument("--imgsz",   type=int,   default=640)
    parser.add_argument("--device",  type=str,   default="cpu")
    parser.add_argument(
        "--output_dir", type=str,
        default=str(Path(__file__).resolve().parent.parent / "results" / "inference_test"),
    )
    return parser.parse_args()


def severity_proxy(box_area: float) -> str:
    """
    Estimate pothole severity from bounding-box pixel area.

    This is a PROXY only — it does NOT measure actual pothole depth.
    Thresholds are in normalised area units (x_w * x_h from YOLO output).
    """
    if box_area < 0.01:
        return "Small"
    elif box_area < 0.04:
        return "Medium"
    else:
        return "Large"


def main() -> None:
    args = parse_args()

    try:
        from ultralytics import YOLO
        import cv2
    except ImportError:
        raise ImportError("pip install ultralytics opencv-python")

    weights_path = Path(args.weights)
    if not weights_path.exists():
        raise FileNotFoundError(
            f"Model weights not found: {weights_path}\n"
            "Train the model with:  python ml/scripts/train_yolov8.py"
        )

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"[infer] Loading model: {weights_path}")
    model = YOLO(str(weights_path))

    # ── Collect image paths ────────────────────────────────────────────────
    source = Path(args.image)
    if source.is_dir():
        img_paths = sorted(
            p for p in source.iterdir()
            if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
        )
    else:
        img_paths = [source]

    if not img_paths:
        print("[infer] No images found.  Check --image argument.")
        return

    print(f"[infer] Running inference on {len(img_paths)} image(s) …\n")

    summary = []

    for img_path in img_paths:
        t0 = time.perf_counter()
        results = model.predict(
            source = str(img_path),
            conf   = args.conf,
            iou    = args.iou,
            imgsz  = args.imgsz,
            device = args.device,
            save   = True,
            project= str(output_dir),
            name   = "run",
            exist_ok=True,
            verbose= False,
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000

        for result in results:
            boxes      = result.boxes
            n_potholes = len(boxes)
            confs      = boxes.conf.tolist() if boxes.conf is not None else []
            avg_conf   = round(sum(confs) / len(confs), 4) if confs else 0.0

            # severity proxy for each detection
            detections_detail = []
            for i, box in enumerate(boxes.xywhn):       # normalised xywh
                bw, bh  = float(box[2]), float(box[3])
                area    = bw * bh
                sev     = severity_proxy(area)
                conf_i  = round(float(confs[i]), 4) if i < len(confs) else 0.0
                detections_detail.append({
                    "box_index":    i,
                    "confidence":   conf_i,
                    "norm_area":    round(area, 6),
                    "severity_proxy": sev,   # NOT actual physical depth
                })

            record = {
                "image":        img_path.name,
                "pothole_count": n_potholes,
                "avg_confidence": avg_conf,
                "inference_ms":  round(elapsed_ms, 1),
                "detections":    detections_detail,
            }
            summary.append(record)

            # Console output
            print(f"  {img_path.name}")
            print(f"    Potholes detected : {n_potholes}")
            print(f"    Avg confidence    : {avg_conf:.2%}")
            print(f"    Inference time    : {elapsed_ms:.1f} ms")
            for d in detections_detail:
                print(f"      Box {d['box_index']}: conf={d['confidence']:.2%}  "
                      f"area={d['norm_area']:.4f}  "
                      f"severity={d['severity_proxy']}  "
                      f"(bbox area proxy - NOT physical depth)")
            print()

    # ── Save summary ──────────────────────────────────────────────────────
    summary_path = output_dir / "inference_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"[infer] Summary saved to: {summary_path}")
    print(f"[infer] Annotated images saved to: {output_dir}/run/")
    print("\n=== Inference test complete ===")
    print("The model is ready. Next step: backend API (Phase 3).")


if __name__ == "__main__":
    main()
