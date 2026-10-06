# PotholeGuard — Machine Learning Pipeline

This directory contains everything needed to train, validate, and export the
YOLOv8 pothole detection model using the **RDD2022 India (D40)** dataset.

## Quick Start

```bash
# 1. Install dependencies
pip install -r ml/requirements.txt

# 2. Prepare the RDD2022 dataset
python ml/scripts/prepare_rdd2022.py \
    --rdd2022_root /path/to/your/RDD2022 \
    --output_dir   ml/dataset

# 3. View dataset statistics
python ml/scripts/dataset_statistics.py

# 4. Train the model  (requires GPU for practical speeds; CPU will be slow)
python ml/scripts/train_yolov8.py \
    --dataset_yaml ml/dataset/dataset.yaml \
    --epochs 100 \
    --batch  16

# 5. Evaluate on the test set
python ml/scripts/validate_model.py \
    --weights ml/models/best.pt \
    --split   test

# 6. Quick inference test
python ml/scripts/inference_test.py \
    --weights ml/models/best.pt \
    --image   ml/dataset/images/test/

# 7. Export to ONNX for mobile deployment
python ml/scripts/export_model.py \
    --weights ml/models/best.pt
```

## Directory Structure

```
ml/
├── dataset/
│   ├── images/
│   │   ├── train/       ← Training images (from RDD2022 India)
│   │   ├── val/         ← Validation images
│   │   └── test/        ← Test images
│   ├── labels/
│   │   ├── train/       ← YOLO-format .txt annotation files
│   │   ├── val/
│   │   └── test/
│   ├── dataset.yaml     ← YOLOv8 dataset config (auto-generated)
│   └── metadata.json    ← Dataset statistics (auto-generated)
│
├── scripts/
│   ├── prepare_rdd2022.py      ← Phase 1: Dataset preparation
│   ├── dataset_statistics.py   ← Dataset exploration/stats
│   ├── train_yolov8.py         ← Phase 2: Model training
│   ├── validate_model.py       ← Phase 2: Model evaluation
│   ├── inference_test.py       ← Phase 3: Inference testing
│   └── export_model.py         ← ONNX export for mobile
│
├── notebooks/
│   └── 01_dataset_exploration.ipynb  ← Jupyter exploration notebook
│
├── models/
│   ├── best.pt           ← Best trained weights (created by training)
│   ├── best.onnx         ← ONNX export (created by export_model.py)
│   └── model_info.json   ← Model metadata
│
├── results/
│   ├── pothguard_v1/     ← Training run output (auto-created)
│   │   ├── weights/
│   │   ├── results.csv
│   │   ├── confusion_matrix.png
│   │   └── PR_curve.png
│   ├── evaluation/       ← Validation results
│   │   └── metrics_test.json
│   └── dataset_stats/    ← Dataset statistics
│       ├── dataset_statistics.json
│       └── pothole_counts.png
│
└── requirements.txt
```

## Dataset Requirements

**IMPORTANT:** You must download RDD2022 yourself from the official source.

- RDD2022 is available from the BigData'22 IEEE International Conference dataset:
  https://github.com/sekilab/RoadDamageDetector

The project uses **only** the **India** subset and **only** the **D40** (pothole)
class.  Other damage categories (D00, D10, D20) are deliberately excluded.

## Model

- **Architecture**: YOLOv8 Small (YOLOv8s)
- **Input size**: 640×640
- **Classes**: 1 — `pothole` (D40)
- **Training epochs**: 100 (default, with early stopping patience=20)

## Evaluation Metrics

Object detection uses **Precision**, **Recall**, and **mAP** — NOT accuracy.

| Metric     | Description |
|------------|-------------|
| Precision  | Fraction of predicted potholes that are real |
| Recall     | Fraction of real potholes that were detected |
| mAP50      | Mean Average Precision @ IoU 0.50 |
| mAP50-95   | mAP averaged over IoU 0.50–0.95 (stricter) |

Results are saved to `ml/results/evaluation/metrics_test.json` and displayed on
the dashboard.

## Severity Proxy

The model outputs bounding boxes. Severity is estimated from **bounding-box
normalised area** (width × height):

| Label  | Normalised Area |
|--------|----------------|
| Small  | < 1%           |
| Medium | 1% – 4%        |
| Large  | > 4%           |

> ⚠️ **This is NOT physical pothole depth.** It is a 2D bounding-box area
> proxy, explicitly labelled as "Estimated Severity (Bounding-Box Area Proxy)"
> throughout the application.
