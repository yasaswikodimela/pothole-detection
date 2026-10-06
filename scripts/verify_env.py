"""
verify_env.py
=============
Quick environment verification script for the PotholeGuard project.

Run from the repository root:
    python scripts/verify_env.py

It checks:
  - Python version >= 3.8
  - Required pip packages
  - GPU / CUDA availability (for YOLO training)
  - Git presence
"""

import importlib
import subprocess
import sys
from typing import List, Tuple


# ── Required packages ─────────────────────────────────────────────────────────

ML_PACKAGES: List[Tuple[str, str]] = [
    ("torch",         "PyTorch (CPU/CUDA)"),
    ("ultralytics",   "Ultralytics YOLOv8"),
    ("cv2",           "OpenCV (opencv-python)"),
    ("numpy",         "NumPy"),
    ("pandas",        "Pandas"),
    ("yaml",          "PyYAML"),
    ("tqdm",          "tqdm"),
    ("matplotlib",    "Matplotlib"),
    ("seaborn",       "Seaborn"),
    ("sklearn",       "scikit-learn"),
    ("PIL",           "Pillow"),
]

BACKEND_PACKAGES: List[Tuple[str, str]] = [
    ("fastapi",       "FastAPI"),
    ("uvicorn",       "Uvicorn"),
    ("sqlalchemy",    "SQLAlchemy"),
    ("pydantic",      "Pydantic"),
]

OPTIONAL_PACKAGES: List[Tuple[str, str]] = [
    ("onnxruntime",   "ONNX Runtime (optional, for export)"),
]


# ── Helpers ───────────────────────────────────────────────────────────────────

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
RESET  = "\033[0m"

OK   = f"{GREEN}[OK]{RESET}"
FAIL = f"{RED}[MISSING]{RESET}"
WARN = f"{YELLOW}[OPTIONAL]{RESET}"


def check_python() -> bool:
    major, minor = sys.version_info[:2]
    v = f"{major}.{minor}"
    ok = (major, minor) >= (3, 8)
    status = OK if ok else FAIL
    print(f"  {status}  Python {v} (requires >= 3.8)")
    return ok


def check_package(import_name: str, label: str, optional: bool = False) -> bool:
    try:
        mod = importlib.import_module(import_name)
        version = getattr(mod, "__version__", "unknown")
        print(f"  {OK}  {label} (v{version})")
        return True
    except ImportError:
        tag = WARN if optional else FAIL
        print(f"  {tag}  {label} — not installed")
        return False


def check_git() -> bool:
    try:
        result = subprocess.run(
            ["git", "--version"], capture_output=True, text=True, timeout=5
        )
        version = result.stdout.strip()
        print(f"  {OK}  Git ({version})")
        return True
    except Exception:
        print(f"  {WARN}  Git — not found (recommended for version control)")
        return False


def check_cuda() -> None:
    try:
        import torch
        if torch.cuda.is_available():
            device_name = torch.cuda.get_device_name(0)
            print(f"  {OK}  CUDA available — {device_name}")
        else:
            print(f"  {YELLOW}[INFO]{RESET}  CUDA not available — training will use CPU (slow).")
            print(f"         For faster training, use a machine with a CUDA GPU or Google Colab.")
    except ImportError:
        pass  # torch check already reported above


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 60)
    print("  PotholeGuard — Environment Verification")
    print("=" * 60)

    all_ok = True

    print("\n[1] Python version")
    all_ok &= check_python()

    print("\n[2] ML / Training packages")
    for pkg, label in ML_PACKAGES:
        ok = check_package(pkg, label)
        all_ok &= ok

    print("\n[3] Backend packages")
    for pkg, label in BACKEND_PACKAGES:
        ok = check_package(pkg, label)
        # backend packages are not required for ML phase
        # do not fail the overall check
        _ = ok

    print("\n[4] Optional packages")
    for pkg, label in OPTIONAL_PACKAGES:
        check_package(pkg, label, optional=True)

    print("\n[5] CUDA / GPU")
    check_cuda()

    print("\n[6] Git")
    check_git()

    print("\n" + "=" * 60)
    if all_ok:
        print(f"  {GREEN}All required packages are installed.{RESET}")
        print("  You are ready to run the dataset preparation script.")
    else:
        print(f"  {RED}Some required packages are missing.{RESET}")
        print("  Install them with:")
        print("    pip install -r ml/requirements.txt")
        print("    pip install -r backend/requirements.txt")
    print("=" * 60)


if __name__ == "__main__":
    main()
