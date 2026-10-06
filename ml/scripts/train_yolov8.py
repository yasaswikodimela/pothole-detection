"""
train_yolov8.py
===============
YOLO v8 training script for PotholeGuard.

This script trains a YOLOv8 small model on the prepared RDD2022 (India, D40)
dataset.  All training hyper-parameters are exposed as CLI arguments so the
run is fully reproducible.

Usage
-----
  python ml/scripts/train_yolov8.py \\
      --dataset_yaml  ml/dataset/dataset.yaml \\
      --model         yolov8s.pt \\
      --epochs        100 \\
      --imgsz         640 \\
      --batch         16 \\
      --device        0          \\   # 0 = first GPU,  cpu = CPU
      --project       ml/results \\
      --name          pothguard_v1

Outputs (saved under ml/results/<name>/)
-----------------------------------------
  weights/best.pt        — best checkpoint (highest mAP50-95 on val)
  weights/last.pt        — final epoch checkpoint
  results.csv            — per-epoch metrics (precision, recall, mAP50, mAP50-95, losses)
  confusion_matrix.png
  PR_curve.png
  val_batch0_pred.jpg    — sample validation predictions
  args.yaml              — all training arguments (for reproducibility)

Model selection rationale
--------------------------
  YOLOv8s  (small)  is chosen as the default because it provides a good
  balance between inference speed and detection accuracy.  It is small enough
  to export to ONNX and run on mobile via ONNX Runtime.

  For even lighter deployment on low-end phones, YOLOv8n (nano) can be used:
      --model yolov8n.pt

Evaluation metrics
------------------
  Precision   — what fraction of predicted potholes are real potholes
  Recall      — what fraction of real potholes were detected
  mAP50       — mean Average Precision at IoU threshold 0.50
  mAP50-95    — mean Average Precision averaged over IoU 0.50–0.95 (strict)

  NOTE: "accuracy" is NOT used as the primary object-detection metric.
        mAP50 is the standard object-detection benchmark.

Author: PotholeGuard project
"""

import argparse
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train YOLOv8 on the RDD2022 India (D40) pothole dataset."
    )
    parser.add_argument(
        "--dataset_yaml", type=str,
        default=str(Path(__file__).resolve().parent.parent / "dataset" / "dataset.yaml"),
        help="Path to the YOLOv8 dataset YAML (produced by prepare_rdd2022.py).",
    )
    parser.add_argument(
        "--model", type=str, default="yolov8s.pt",
        help="Base model weights.  Use 'yolov8n.pt' for nano, 'yolov8s.pt' for small (default).",
    )
    parser.add_argument("--epochs",      type=int,   default=100)
    parser.add_argument("--imgsz",       type=int,   default=640,
                        help="Training image size (pixels).  Must be a multiple of 32.")
    parser.add_argument("--batch",       type=int,   default=16,
                        help="Batch size.  Reduce if you get OOM errors (e.g. --batch 8).")
    parser.add_argument("--lr0",         type=float, default=0.01,
                        help="Initial learning rate.")
    parser.add_argument("--device",      type=str,   default="",
                        help="CUDA device (0, 0,1, cpu).  Blank = auto-detect.")
    parser.add_argument("--workers",     type=int,   default=4,
                        help="DataLoader worker threads.")
    parser.add_argument("--project",     type=str,
                        default=str(Path(__file__).resolve().parent.parent / "results"),
                        help="Root folder for training runs.")
    parser.add_argument("--name",        type=str,   default="pothguard_v1",
                        help="Experiment name (sub-folder under --project).")
    parser.add_argument("--patience",    type=int,   default=20,
                        help="Early-stopping patience (epochs without improvement).")
    parser.add_argument("--save_period", type=int,   default=10,
                        help="Save checkpoint every N epochs (in addition to best/last).")
    parser.add_argument("--conf_thres",  type=float, default=0.25,
                        help="Confidence threshold for validation/inference.")
    parser.add_argument("--iou_thres",   type=float, default=0.45,
                        help="NMS IoU threshold.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    # ── Import Ultralytics YOLO ───────────────────────────────────────────────
    try:
        from ultralytics import YOLO
    except ImportError:
        raise ImportError(
            "ultralytics is not installed.  "
            "Run:  pip install ultralytics"
        )

    dataset_yaml = Path(args.dataset_yaml)
    if not dataset_yaml.exists():
        raise FileNotFoundError(
            f"dataset.yaml not found: {dataset_yaml}\n"
            "Run ml/scripts/prepare_rdd2022.py first."
        )

    # ── Load model ────────────────────────────────────────────────────────────
    print(f"\n[train] Loading base model: {args.model}")
    model = YOLO(args.model)

    # ── Training ──────────────────────────────────────────────────────────────
    print(f"[train] Starting training...")
    print(f"  dataset : {dataset_yaml}")
    print(f"  epochs  : {args.epochs}")
    print(f"  imgsz   : {args.imgsz}")
    print(f"  batch   : {args.batch}")
    print(f"  lr0     : {args.lr0}")
    print(f"  device  : {args.device or 'auto'}")
    print(f"  project : {args.project}/{args.name}")

    results = model.train(
        data        = str(dataset_yaml),
        epochs      = args.epochs,
        imgsz       = args.imgsz,
        batch       = args.batch,
        lr0         = args.lr0,
        device      = args.device if args.device else None,
        workers     = args.workers,
        project     = args.project,
        name        = args.name,
        patience    = args.patience,
        save_period = args.save_period,
        conf        = args.conf_thres,
        iou         = args.iou_thres,
        val         = True,        # run validation after each epoch
        plots       = True,        # save training plots
        verbose     = True,
    )

    # ── Summarise ─────────────────────────────────────────────────────────────
    best_path = Path(args.project) / args.name / "weights" / "best.pt"
    print("\n=== Training complete ===")
    print(f"  Best weights : {best_path}")

    # Copy best.pt to ml/models/ for easy access
    models_dir = Path(__file__).resolve().parent.parent / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    import shutil
    dest = models_dir / "best.pt"
    if best_path.exists():
        shutil.copy2(best_path, dest)
        print(f"  Copied best.pt -> {dest}")

    print("\nNext step: run ml/scripts/validate_model.py to evaluate on the test set.")


if __name__ == "__main__":
    main()
