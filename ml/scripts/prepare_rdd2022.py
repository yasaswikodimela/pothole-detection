"""
prepare_rdd2022.py
==================
RDD2022 → YOLO‑format dataset preparation for the PotholeGuard project.

This script:
  1. Locates the RDD2022 download (caller provides --rdd2022_root).
  2. Reads the XML annotations (Pascal VOC format).
  3. Filters only the INDIA subset.
  4. Keeps only pothole bounding boxes  (D40 label in RDD2022).
  5. Converts Pascal VOC coordinates to YOLO normalised format.
  6. Writes images and label .txt files to ml/dataset/{images,labels}/{train,val,test}.
  7. Writes ml/dataset/dataset.yaml for YOLOv8.
  8. Writes ml/dataset/metadata.json with dataset statistics.

Usage
-----
  python ml/scripts/prepare_rdd2022.py \\
      --rdd2022_root  /path/to/RDD2022 \\
      --output_dir    ml/dataset \\
      --train_ratio   0.80 \\
      --val_ratio     0.10 \\
      --seed          42

RDD2022 expected structure (India)
------------------------------------
  RDD2022/
  └── India/
      ├── images/   (*.jpg / *.png)
      └── annotations/
          └── xmls/ (*.xml, Pascal VOC)

Each XML file may contain multiple objects.
Only objects with <name>D40</name> are kept as the pothole class.

Notes
-----
  - The script does NOT download data.
  - Only images that contain at least one D40 annotation are included in the
    filtered dataset. Images with zero potholes are skipped to avoid wasting
    training time on empty negatives (can be changed with --include_negatives).
  - YOLO class index 0 → D40 (pothole).

Author: PotholeGuard project
"""

import argparse
import json
import os
import random
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Tuple

# ──────────────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────────────

POTHOLE_CLASS_NAME = "D40"          # RDD2022 pothole label
YOLO_CLASS_ID      = 0             # We map D40 → class 0 in YOLO format
COUNTRY            = "India"       # Subset to use


# ──────────────────────────────────────────────────────────────────────────────
# Annotation helpers
# ──────────────────────────────────────────────────────────────────────────────

def parse_voc_xml(xml_path: Path) -> Tuple[int, int, List[Tuple[int, int, int, int]]]:
    """
    Parse a single Pascal VOC XML file.

    Returns
    -------
    (image_width, image_height, boxes)
    boxes: list of (xmin, ymin, xmax, ymax) for D40 objects only
    """
    tree = ET.parse(xml_path)
    root = tree.getroot()

    size_node = root.find("size")
    if size_node is None:
        raise ValueError(f"No <size> element in {xml_path}")

    img_w = int(size_node.findtext("width",  default="0"))
    img_h = int(size_node.findtext("height", default="0"))

    boxes: List[Tuple[int, int, int, int]] = []
    for obj in root.findall("object"):
        name = obj.findtext("name", default="").strip()
        if name != POTHOLE_CLASS_NAME:
            continue  # skip non‑pothole classes
        bndbox = obj.find("bndbox")
        if bndbox is None:
            continue
        xmin = int(float(bndbox.findtext("xmin", "0")))
        ymin = int(float(bndbox.findtext("ymin", "0")))
        xmax = int(float(bndbox.findtext("xmax", "0")))
        ymax = int(float(bndbox.findtext("ymax", "0")))
        boxes.append((xmin, ymin, xmax, ymax))

    return img_w, img_h, boxes


def voc_to_yolo(xmin: int, ymin: int, xmax: int, ymax: int,
                img_w: int, img_h: int) -> Tuple[float, float, float, float]:
    """
    Convert Pascal VOC (absolute pixel) bbox to YOLO normalised format.

    YOLO format: x_center  y_center  width  height   (all normalised 0‑1)
    """
    if img_w == 0 or img_h == 0:
        raise ValueError("Image width or height is zero — cannot normalise.")

    x_center = ((xmin + xmax) / 2.0) / img_w
    y_center  = ((ymin + ymax) / 2.0) / img_h
    width     = (xmax - xmin) / img_w
    height    = (ymax - ymin) / img_h

    # Clamp to [0, 1] to handle any edge‑case annotation errors
    x_center = max(0.0, min(1.0, x_center))
    y_center  = max(0.0, min(1.0, y_center))
    width     = max(0.0, min(1.0, width))
    height    = max(0.0, min(1.0, height))

    return x_center, y_center, width, height


# ──────────────────────────────────────────────────────────────────────────────
# Dataset scanning
# ──────────────────────────────────────────────────────────────────────────────

def scan_rdd2022(rdd2022_root: Path, include_negatives: bool = False) -> List[Dict]:
    """
    Walk the RDD2022/India subset and collect per‑image records.

    Each record is a dict:
        {
            "image_path": Path,
            "xml_path":   Path,
            "img_w":      int,
            "img_h":      int,
            "boxes":      [(xmin,ymin,xmax,ymax), ...],
        }
    """
    # Search for images and annotations in possible RDD2022 layout variations
    candidate_images_dirs = [
        rdd2022_root / COUNTRY / COUNTRY / "train" / "images",
        rdd2022_root / COUNTRY / "train" / "images",
        rdd2022_root / COUNTRY / "images",
        rdd2022_root / "train" / "images",
        rdd2022_root / "images",
    ]
    candidate_annot_dirs = [
        rdd2022_root / COUNTRY / COUNTRY / "train" / "annotations" / "xmls",
        rdd2022_root / COUNTRY / "train" / "annotations" / "xmls",
        rdd2022_root / COUNTRY / "annotations" / "xmls",
        rdd2022_root / "train" / "annotations" / "xmls",
        rdd2022_root / "annotations" / "xmls",
    ]

    images_dir = next((p for p in candidate_images_dirs if p.exists()), None)
    annot_dir  = next((p for p in candidate_annot_dirs if p.exists()), None)

    if images_dir is None:
        raise FileNotFoundError(
            f"Could not find India train images directory under: {rdd2022_root}\n"
            f"Checked paths:\n" + "\n".join(str(p) for p in candidate_images_dirs)
        )
    if annot_dir is None:
        raise FileNotFoundError(
            f"Could not find India train annotations/xmls directory under: {rdd2022_root}\n"
            f"Checked paths:\n" + "\n".join(str(p) for p in candidate_annot_dirs)
        )

    print(f"[scan] Using images from: {images_dir}")
    print(f"[scan] Using annotations from: {annot_dir}")

    image_extensions = {".jpg", ".jpeg", ".png"}
    records: List[Dict] = []
    skipped_no_xml = 0
    skipped_no_d40 = 0
    parse_errors   = 0

    image_files = sorted(
        p for p in images_dir.iterdir() if p.suffix.lower() in image_extensions
    )

    print(f"[scan] Found {len(image_files)} image files in {images_dir}")

    for img_path in image_files:
        xml_path = annot_dir / (img_path.stem + ".xml")
        if not xml_path.exists():
            skipped_no_xml += 1
            continue

        try:
            img_w, img_h, boxes = parse_voc_xml(xml_path)
        except Exception as exc:
            print(f"  [WARN] Failed to parse {xml_path.name}: {exc}")
            parse_errors += 1
            continue

        if not boxes and not include_negatives:
            skipped_no_d40 += 1
            continue

        records.append({
            "image_path": img_path,
            "xml_path":   xml_path,
            "img_w":      img_w,
            "img_h":      img_h,
            "boxes":      boxes,
        })

    print(f"[scan] Skipped {skipped_no_xml} images (no XML annotation).")
    print(f"[scan] Skipped {skipped_no_d40} images (no D40/pothole annotations).")
    print(f"[scan] Parse errors: {parse_errors}")
    print(f"[scan] Records retained: {len(records)}")

    return records


# ──────────────────────────────────────────────────────────────────────────────
# Split & copy
# ──────────────────────────────────────────────────────────────────────────────

def create_splits(records: List[Dict], train_ratio: float, val_ratio: float,
                  seed: int) -> Tuple[List[Dict], List[Dict], List[Dict]]:
    """
    Randomly split records into train / val / test sets.
    test_ratio is derived as  1 - train_ratio - val_ratio.
    """
    random.seed(seed)
    shuffled = records.copy()
    random.shuffle(shuffled)

    n      = len(shuffled)
    n_train = int(n * train_ratio)
    n_val   = int(n * val_ratio)

    train = shuffled[:n_train]
    val   = shuffled[n_train : n_train + n_val]
    test  = shuffled[n_train + n_val :]

    return train, val, test


def write_split(records: List[Dict], split_name: str,
                output_dir: Path) -> Dict:
    """
    Copy images and write YOLO label .txt files for one split.

    Returns statistics dict.
    """
    img_out   = output_dir / "images"  / split_name
    label_out = output_dir / "labels" / split_name
    img_out.mkdir(parents=True,   exist_ok=True)
    label_out.mkdir(parents=True, exist_ok=True)

    total_boxes = 0

    for rec in records:
        # ── copy image ──────────────────────────────────────────────────────
        dest_img = img_out / rec["image_path"].name
        shutil.copy2(rec["image_path"], dest_img)

        # ── write YOLO label ────────────────────────────────────────────────
        label_file = label_out / (rec["image_path"].stem + ".txt")
        img_w = rec["img_w"]
        img_h = rec["img_h"]

        lines: List[str] = []
        for (xmin, ymin, xmax, ymax) in rec["boxes"]:
            try:
                xc, yc, w, h = voc_to_yolo(xmin, ymin, xmax, ymax, img_w, img_h)
                lines.append(f"{YOLO_CLASS_ID} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}")
                total_boxes += 1
            except ValueError:
                pass  # skip malformed box

        label_file.write_text("\n".join(lines), encoding="utf-8")

    return {
        "images": len(records),
        "pothole_boxes": total_boxes,
    }


# ──────────────────────────────────────────────────────────────────────────────
# dataset.yaml
# ──────────────────────────────────────────────────────────────────────────────

def write_dataset_yaml(output_dir: Path) -> None:
    """Write the YOLOv8 dataset YAML configuration file."""
    yaml_content = f"""# PotholeGuard - YOLOv8 dataset configuration
# Source: RDD2022, India subset, D40 (pothole) class only.

path: {output_dir.resolve().as_posix()}
train: images/train
val:   images/val
test:  images/test

nc: 1

names:
  0: pothole

# Notes:
#   Class 0  = D40 (pothole) from RDD2022.
#   No other road-damage classes are included in this project.
"""
    (output_dir / "dataset.yaml").write_text(yaml_content, encoding="utf-8")
    print(f"[yaml] Written: {output_dir / 'dataset.yaml'}")


# ──────────────────────────────────────────────────────────────────────────────
# Metadata / statistics
# ──────────────────────────────────────────────────────────────────────────────

def write_metadata(output_dir: Path, stats: Dict,
                   args: argparse.Namespace) -> None:
    """Write a JSON metadata file summarising the dataset."""
    metadata = {
        "project":   "PotholeGuard",
        "dataset":   "RDD2022",
        "subset":    COUNTRY,
        "class":     POTHOLE_CLASS_NAME,
        "yolo_class_id": YOLO_CLASS_ID,
        "train_ratio": args.train_ratio,
        "val_ratio":   args.val_ratio,
        "test_ratio":  round(1.0 - args.train_ratio - args.val_ratio, 6),
        "seed":        args.seed,
        "splits":      stats,
    }
    out_path = output_dir / "metadata.json"
    out_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"[meta] Written: {out_path}")


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepare RDD2022 (India, D40) dataset for YOLOv8 training."
    )
    parser.add_argument(
        "--rdd2022_root", type=str, required=True,
        help="Path to the root RDD2022 folder (must contain an 'India' subdirectory).",
    )
    parser.add_argument(
        "--output_dir", type=str,
        default=str(Path(__file__).resolve().parent.parent / "dataset"),
        help="Destination folder for the prepared dataset (default: ml/dataset).",
    )
    parser.add_argument("--train_ratio", type=float, default=0.80)
    parser.add_argument("--val_ratio",   type=float, default=0.10)
    parser.add_argument("--seed",        type=int,   default=42)
    parser.add_argument(
        "--include_negatives", action="store_true",
        help="Also include images with zero D40 annotations (not recommended for training).",
    )
    args = parser.parse_args()

    rdd2022_root = Path(args.rdd2022_root)
    output_dir   = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if not rdd2022_root.exists():
        raise FileNotFoundError(f"RDD2022 root does not exist: {rdd2022_root}")

    if args.train_ratio + args.val_ratio >= 1.0:
        raise ValueError("train_ratio + val_ratio must be < 1.0 to leave room for test set.")

    # ── Step 1: Scan ─────────────────────────────────────────────────────────
    print("\n=== Step 1: Scanning RDD2022 India annotations ===")
    records = scan_rdd2022(rdd2022_root, include_negatives=args.include_negatives)

    if not records:
        raise RuntimeError(
            "No records found.  Check that:\n"
            "  1. --rdd2022_root points to the correct parent folder.\n"
            "  2. RDD2022/India/images/ and RDD2022/India/annotations/xmls/ exist.\n"
            "  3. XML files contain <name>D40</name> objects."
        )

    # ── Step 2: Split ─────────────────────────────────────────────────────────
    print("\n=== Step 2: Creating train / val / test splits ===")
    train, val, test = create_splits(
        records, args.train_ratio, args.val_ratio, args.seed
    )
    print(f"  Train: {len(train)}  |  Val: {len(val)}  |  Test: {len(test)}")

    # ── Step 3: Write ─────────────────────────────────────────────────────────
    print("\n=== Step 3: Writing dataset files ===")
    stats: Dict[str, Dict] = {}
    for split_name, split_records in [("train", train), ("val", val), ("test", test)]:
        print(f"  Writing {split_name} split ({len(split_records)} images)…")
        stats[split_name] = write_split(split_records, split_name, output_dir)

    # ── Step 4: YAML + Metadata ───────────────────────────────────────────────
    print("\n=== Step 4: Writing YAML + metadata ===")
    write_dataset_yaml(output_dir)
    write_metadata(output_dir, stats, args)

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n=== Dataset preparation complete ===")
    print(f"  Output directory : {output_dir}")
    for split, s in stats.items():
        print(f"  {split:5s}  -> {s['images']:4d} images, {s['pothole_boxes']:5d} pothole boxes")
    print("\nNext step: open ml/notebooks/01_dataset_exploration.ipynb to verify.")


if __name__ == "__main__":
    main()
