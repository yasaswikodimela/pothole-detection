"""
export_model.py
===============
Export the trained best.pt model to ONNX format for mobile/edge deployment.

Why ONNX?
----------
ONNX (Open Neural Network Exchange) is a portable model format that can be
run by ONNX Runtime on Android (via onnxruntime-android) or in the browser.
This allows the Flutter mobile app to perform on-device inference without
streaming frames to the server.

Exported files
--------------
  ml/models/best.onnx       — ONNX model
  ml/models/model_info.json — metadata about the exported model

Usage
-----
  python ml/scripts/export_model.py \\
      --weights ml/models/best.pt \\
      --imgsz   640 \\
      --device  cpu

Author: PotholeGuard project
"""

import argparse
import json
import shutil
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export YOLOv8 model to ONNX.")
    parser.add_argument(
        "--weights", type=str,
        default=str(Path(__file__).resolve().parent.parent / "models" / "best.pt"),
    )
    parser.add_argument("--imgsz",      type=int,   default=640)
    parser.add_argument("--device",     type=str,   default="cpu")
    parser.add_argument("--simplify",   action="store_true", default=True,
                        help="Simplify ONNX graph (recommended).")
    parser.add_argument("--opset",      type=int,   default=12,
                        help="ONNX opset version (12 is widely supported by ONNX Runtime Mobile).")
    parser.add_argument("--half",       action="store_true", default=False,
                        help="Export FP16 (GPU only).")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    try:
        from ultralytics import YOLO
    except ImportError:
        raise ImportError("pip install ultralytics")

    weights_path = Path(args.weights)
    if not weights_path.exists():
        raise FileNotFoundError(
            f"Weights not found: {weights_path}\n"
            "Train the model first:  python ml/scripts/train_yolov8.py"
        )

    models_dir = weights_path.parent

    print(f"[export] Loading model: {weights_path}")
    model = YOLO(str(weights_path))

    print(f"[export] Exporting to ONNX (opset {args.opset}, imgsz={args.imgsz})...")
    exported_path = model.export(
        format   = "onnx",
        imgsz    = args.imgsz,
        simplify = args.simplify,
        opset    = args.opset,
        half     = args.half,
        device   = args.device,
    )

    # ultralytics saves the ONNX next to the .pt file; move to models/
    src_onnx = Path(exported_path)
    dst_onnx = models_dir / "best.onnx"
    if src_onnx != dst_onnx and src_onnx.exists():
        shutil.move(str(src_onnx), str(dst_onnx))

    model_info = {
        "source_weights": str(weights_path),
        "onnx_path":      str(dst_onnx),
        "imgsz":          args.imgsz,
        "opset":          args.opset,
        "half":           args.half,
        "simplify":       args.simplify,
        "classes":        {0: "pothole"},
        "deployment_note": (
            "Use ONNX Runtime Mobile (onnxruntime-android) for on-device inference. "
            "Input shape: [1, 3, imgsz, imgsz]. Normalise pixels to [0, 1]. "
            "Output: [1, 5, 8400] - decode with NMS post-processing."
        ),
    }
    info_path = models_dir / "model_info.json"
    info_path.write_text(json.dumps(model_info, indent=2), encoding="utf-8")

    print(f"\n=== Export complete ===")
    print(f"  ONNX model  : {dst_onnx}")
    print(f"  Model info  : {info_path}")
    print("\nNext step: copy best.onnx -> mobile/assets/best.onnx")


if __name__ == "__main__":
    main()
