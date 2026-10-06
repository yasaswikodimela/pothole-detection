"""
validate_model.py
=================
Evaluates the trained YOLOv8 model on the RDD2022 India test split.

Outputs
-------
  - Precision, Recall, mAP50, mAP50-95  (printed to console + saved to JSON)
  - Confusion matrix
  - PR curve
  - Per-class metrics

Usage
-----
  python ml/scripts/validate_model.py \\
      --weights   ml/models/best.pt \\
      --dataset_yaml ml/dataset/dataset.yaml \\
      --split     test \\
      --imgsz     640 \\
      --conf      0.25 \\
      --iou       0.45 \\
      --device    cpu

Author: PotholeGuard project
"""

import argparse
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate a trained YOLOv8 pothole model."
    )
    parser.add_argument(
        "--weights", type=str,
        default=str(Path(__file__).resolve().parent.parent / "models" / "best.pt"),
        help="Path to trained weights (best.pt).",
    )
    parser.add_argument(
        "--dataset_yaml", type=str,
        default=str(Path(__file__).resolve().parent.parent / "dataset" / "dataset.yaml"),
    )
    parser.add_argument(
        "--split",   type=str, default="test",
        choices=["val", "test"],
        help="Which split to evaluate on.",
    )
    parser.add_argument("--imgsz",  type=int,   default=640)
    parser.add_argument("--conf",   type=float, default=0.25)
    parser.add_argument("--iou",    type=float, default=0.45)
    parser.add_argument("--device", type=str,   default="cpu")
    parser.add_argument(
        "--output_dir", type=str,
        default=str(Path(__file__).resolve().parent.parent / "results" / "evaluation"),
        help="Directory to save evaluation results.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    try:
        from ultralytics import YOLO
    except ImportError:
        raise ImportError("pip install ultralytics")

    weights = Path(args.weights)
    if not weights.exists():
        raise FileNotFoundError(
            f"Model weights not found: {weights}\n"
            "Train the model first:  python ml/scripts/train_yolov8.py"
        )

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"[val] Loading model: {weights}")
    model = YOLO(str(weights))

    print(f"[val] Evaluating on '{args.split}' split...")
    metrics = model.val(
        data    = args.dataset_yaml,
        split   = args.split,
        imgsz   = args.imgsz,
        conf    = args.conf,
        iou     = args.iou,
        device  = args.device,
        project = str(output_dir),
        name    = f"eval_{args.split}",
        plots   = True,
        verbose = True,
    )

    # ── Extract scalar metrics ─────────────────────────────────────────────
    precision = float(metrics.box.mp)        # mean precision
    recall    = float(metrics.box.mr)        # mean recall
    map50     = float(metrics.box.map50)     # mAP @ IoU 0.50
    map50_95  = float(metrics.box.map)       # mAP @ IoU 0.50:0.95

    results_dict = {
        "model":      str(weights),
        "split":      args.split,
        "conf_thres": args.conf,
        "iou_thres":  args.iou,
        "imgsz":      args.imgsz,
        "device":     args.device,
        "metrics": {
            "precision": round(precision, 4),
            "recall":    round(recall,    4),
            "mAP50":     round(map50,     4),
            "mAP50_95":  round(map50_95,  4),
        },
        "note": (
            "Precision, Recall and mAP are the standard object-detection metrics. "
            "mAP50-95 is the primary benchmark. 'Accuracy' is not used because "
            "background is not a class in object detection."
        ),
    }

    out_json = output_dir / f"metrics_{args.split}.json"
    out_json.write_text(json.dumps(results_dict, indent=2), encoding="utf-8")

    # ── Print summary ──────────────────────────────────────────────────────
    print("\n=== Evaluation Results ===")
    print(f"  Split        : {args.split}")
    print(f"  Precision    : {precision:.4f}")
    print(f"  Recall       : {recall:.4f}")
    print(f"  mAP50        : {map50:.4f}")
    print(f"  mAP50-95     : {map50_95:.4f}")
    print(f"  Saved to     : {out_json}")
    print("\nNote: These are ACTUAL model metrics - not invented numbers.")
    print("      If they appear low, do not hide them. Document them honestly.")
    print("\nNext step: run ml/scripts/inference_test.py to test single-image inference.")


if __name__ == "__main__":
    main()
