"""
kmeans_service.py
=================
K-Means clustering for road damage analysis (DMDW component).

IMPORTANT distinction:
  - YOLO performs computer vision → detects individual potholes in images.
  - K-Means performs data mining → clusters ROADS/LOCATIONS based on
    aggregated detection statistics from the data warehouse.

K-Means does NOT detect potholes.  It groups road segments by damage patterns.

Features used for clustering
-----------------------------
  - total_potholes       : total detected pothole count
  - detection_frequency  : number of detection events
  - high_severity_count  : count of 'Large' severity detections (bbox area proxy)
  - avg_confidence       : average YOLO confidence score
  - avg_bbox_area        : average bounding-box normalised area

Author: PotholeGuard project
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler


# ── Data types ────────────────────────────────────────────────────────────────

ClusterResult = Dict[str, Any]


# ── Service ───────────────────────────────────────────────────────────────────

def cluster_roads(
    road_stats: List[Dict],
    k: int = 3,
    random_state: int = 42,
) -> ClusterResult:
    """
    Apply K-Means clustering to road-level statistics.

    Parameters
    ----------
    road_stats    : List of dicts, each representing one road.
                    Expected keys (all numeric):
                      road_id, road_name,
                      total_potholes, detection_count,
                      high_severity_count, avg_confidence, avg_bbox_area
    k             : Number of clusters (configurable by user, default 3)
    random_state  : For reproducibility

    Returns
    -------
    A ClusterResult dict containing:
      - k              : number of clusters
      - features_used  : list of feature names
      - roads          : list of road dicts with assigned cluster label
      - cluster_centers: cluster centroid values per feature
      - cluster_sizes  : number of roads per cluster
      - inertia        : within-cluster sum of squares (model fit quality)
      - note           : explanation of what the clusters represent
    """
    if len(road_stats) < k:
        raise ValueError(
            f"Cannot create {k} clusters from only {len(road_stats)} roads. "
            f"Reduce k or collect more detection data."
        )

    features = [
        "total_potholes",
        "detection_count",
        "high_severity_count",
        "avg_confidence",
        "avg_bbox_area",
    ]

    # Build feature matrix
    X_raw = np.array(
        [[row.get(f, 0.0) for f in features] for row in road_stats],
        dtype=float,
    )

    # Standardise (zero mean, unit variance) so no feature dominates
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_raw)

    # Fit K-Means
    km = KMeans(n_clusters=k, random_state=random_state, n_init=10)
    labels = km.fit_predict(X_scaled)

    # Cluster centers in original (unscaled) space
    centers_scaled = km.cluster_centers_
    centers_original = scaler.inverse_transform(centers_scaled)

    center_dicts = [
        {f: round(float(centers_original[c][i]), 4) for i, f in enumerate(features)}
        for c in range(k)
    ]

    # Cluster size counts
    cluster_sizes = {int(c): int(np.sum(labels == c)) for c in range(k)}

    # Annotate each road
    annotated_roads = []
    for idx, row in enumerate(road_stats):
        road_copy = dict(row)
        road_copy["cluster"] = int(labels[idx])
        road_copy["cluster_label"] = f"Cluster {int(labels[idx])}"
        annotated_roads.append(road_copy)

    return {
        "k":               k,
        "features_used":   features,
        "roads":           annotated_roads,
        "cluster_centers": center_dicts,
        "cluster_sizes":   cluster_sizes,
        "inertia":         round(float(km.inertia_), 4),
        "note": (
            "K-Means clusters ROADS based on aggregated detection statistics "
            "from the data warehouse.  Cluster labels (0, 1, 2 …) are assigned "
            "automatically and must be interpreted using the cluster_centers. "
            "K-Means is the DATA MINING component — YOLO is the pothole detector."
        ),
        "severity_note": (
            "High-severity count uses 'Large' estimated severity "
            "(bounding-box area proxy) — NOT actual physical pothole depth."
        ),
    }


def describe_cluster(center: Dict[str, float]) -> str:
    """
    Generate a human-readable description of a cluster based on its centroid.

    This is a heuristic description, NOT a definitive label.
    """
    potholes    = center.get("total_potholes", 0)
    freq        = center.get("detection_count", 0)
    high_sev    = center.get("high_severity_count", 0)

    if potholes > 50 and high_sev > 5:
        return "High-damage road segment — many potholes, frequent large detections"
    elif potholes > 20:
        return "Moderate-damage road segment — regular pothole occurrences"
    else:
        return "Low-damage road segment — few detections recorded"
