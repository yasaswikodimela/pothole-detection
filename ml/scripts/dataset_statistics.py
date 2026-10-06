"""
dataset_statistics.py
=====================
Compute and display statistics about the prepared RDD2022 India (D40) dataset.

Outputs
-------
  - Total image count per split
  - Total bounding-box count per split
  - Bounding-box size distribution (small / medium / large)
  - Per-split statistics table (console + CSV)
  - Optional histogram saved as PNG

Usage
-----
  python ml/scripts/dataset_statistics.py \\
      --dataset_dir ml/dataset \\
      --output_dir  ml/results/dataset_stats

Author: PotholeGuard project
"""

import argparse
import csv
import json
from pathlib import Path
from typing import Dict, List, Tuple


SPLITS = ["train", "val", "test"]

# Thresholds for size classification (normalised area = w * h in YOLO format)
SMALL_MAX  = 0.01
MEDIUM_MAX = 0.04


def parse_yolo_label(label_path: Path) -> List[Tuple[float, float, float, float]]:
    """Return list of (x_center, y_center, width, height) from a YOLO label file."""
    boxes = []
    text = label_path.read_text(encoding="utf-8").strip()
    if not text:
        return boxes
    for line in text.splitlines():
        parts = line.split()
        if len(parts) < 5:
            continue
        # parts[0] is class_id (always 0 = pothole here)
        _, xc, yc, w, h = parts[:5]
        boxes.append((float(xc), float(yc), float(w), float(h)))
    return boxes


def compute_split_stats(dataset_dir: Path, split: str) -> Dict:
    labels_dir = dataset_dir / "labels" / split
    images_dir = dataset_dir / "images" / split

    if not labels_dir.exists():
        return {"split": split, "error": "labels directory not found"}

    n_images  = 0
    n_boxes   = 0
    n_small   = 0
    n_medium  = 0
    n_large   = 0
    n_empty   = 0        # images with zero D40 boxes

    for label_file in labels_dir.glob("*.txt"):
        n_images += 1
        boxes = parse_yolo_label(label_file)
        if not boxes:
            n_empty += 1
        for _, _, w, h in boxes:
            area = w * h
            n_boxes += 1
            if area < SMALL_MAX:
                n_small += 1
            elif area < MEDIUM_MAX:
                n_medium += 1
            else:
                n_large += 1

    return {
        "split":             split,
        "images":            n_images,
        "pothole_boxes":     n_boxes,
        "images_with_potholes": n_images - n_empty,
        "images_without_potholes": n_empty,
        "avg_boxes_per_image": round(n_boxes / n_images, 2) if n_images else 0,
        "size_distribution": {
            "small_lt_1pct":   n_small,
            "medium_1_4pct":   n_medium,
            "large_gt_4pct":   n_large,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Compute dataset statistics.")
    parser.add_argument(
        "--dataset_dir", type=str,
        default=str(Path(__file__).resolve().parent.parent / "dataset"),
    )
    parser.add_argument(
        "--output_dir", type=str,
        default=str(Path(__file__).resolve().parent.parent / "results" / "dataset_stats"),
    )
    args = parser.parse_args()

    dataset_dir = Path(args.dataset_dir)
    output_dir  = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    all_stats = []

    print("=" * 55)
    print("  PotholeGuard - Dataset Statistics  (RDD2022 India D40)")
    print("=" * 55)

    for split in SPLITS:
        stats = compute_split_stats(dataset_dir, split)
        all_stats.append(stats)

        if "error" in stats:
            print(f"\n  [{split.upper()}]  {stats['error']}")
            continue

        print(f"\n  [{split.upper()}]")
        print(f"    Images                   : {stats['images']}")
        print(f"    Pothole boxes            : {stats['pothole_boxes']}")
        print(f"    Images with potholes     : {stats['images_with_potholes']}")
        print(f"    Avg boxes / image        : {stats['avg_boxes_per_image']}")
        print(f"    Size - Small  (<1% area) : {stats['size_distribution']['small_lt_1pct']}")
        print(f"    Size - Medium (1-4%)     : {stats['size_distribution']['medium_1_4pct']}")
        print(f"    Size - Large  (>4%)      : {stats['size_distribution']['large_gt_4pct']}")

    # ── JSON output ───────────────────────────────────────────────────────
    json_path = output_dir / "dataset_statistics.json"
    json_path.write_text(json.dumps(all_stats, indent=2), encoding="utf-8")
    print(f"\n  JSON saved to: {json_path}")

    # ── CSV output ────────────────────────────────────────────────────────
    csv_path = output_dir / "dataset_statistics.csv"
    fieldnames = ["split", "images", "pothole_boxes",
                  "images_with_potholes", "avg_boxes_per_image"]
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(all_stats)
    print(f"  CSV  saved to: {csv_path}")

    # ── Optional matplotlib histogram ─────────────────────────────────────
    try:
        import matplotlib.pyplot as plt

        labels = [s["split"] for s in all_stats if "error" not in s]
        counts = [s["pothole_boxes"] for s in all_stats if "error" not in s]

        fig, ax = plt.subplots(figsize=(6, 4))
        bars = ax.bar(labels, counts, color=["#4CAF50", "#2196F3", "#FF5722"])
        ax.bar_label(bars)
        ax.set_title("Pothole Box Count per Split (RDD2022 India D40)")
        ax.set_ylabel("Bounding-box count")
        ax.set_xlabel("Split")
        plt.tight_layout()
        fig_path = output_dir / "pothole_counts.png"
        fig.savefig(str(fig_path), dpi=150)
        plt.close(fig)
        print(f"  Chart saved to: {fig_path}")
    except ImportError:
        print("  (matplotlib not installed — skipping chart generation)")

    print("\n=== Statistics complete ===")


if __name__ == "__main__":
    main()
