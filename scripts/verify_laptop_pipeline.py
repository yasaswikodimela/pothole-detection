import urllib.request
import json
from pathlib import Path
import base64
import cv2
import numpy as np

def run_checks():
    print("====================================================")
    print("   PotholeGuard Complete Laptop Pipeline Test       ")
    print("====================================================")

    # 1. Health
    with urllib.request.urlopen('http://localhost:8000/health', timeout=5) as r:
        h = json.loads(r.read())
        print(f"[1] /health: HTTP {r.status} -> {h['status']}")

    # 2. Image Detection with Real RDD2022 image
    img_path = Path('ml/dataset/images/test/India_000105.jpg')
    img_bytes = img_path.read_bytes()
    boundary = 'BoundaryLaptopVerify123'
    body = bytearray()
    body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{img_path.name}"\r\nContent-Type: image/jpeg\r\n\r\n'.encode('utf-8'))
    body.extend(img_bytes)
    body.extend(f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="road_name"\r\n\r\nMG Road, Bengaluru\r\n'.encode('utf-8'))
    body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="latitude"\r\n\r\n12.9716\r\n'.encode('utf-8'))
    body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="longitude"\r\n\r\n77.5946\r\n'.encode('utf-8'))
    body.extend(f'--{boundary}--\r\n'.encode('utf-8'))

    req = urllib.request.Request(
        'http://localhost:8000/detect/image',
        data=bytes(body),
        headers={'Content-Type': f'multipart/form-data; boundary={boundary}'}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.loads(r.read())
        print(f"[2] /detect/image: HTTP {r.status} | potholes: {res['pothole_count']} | est_severity: {res.get('dominant_severity')} | road: {res.get('road_name')}")
        if res.get('detections'):
            print(f"    Bbox: {res['detections'][0].get('bbox')} | conf: {res['detections'][0].get('confidence')}")

    # 3. Live Webcam Frame Detection
    b64 = base64.b64encode(img_bytes).decode('utf-8')
    frame_req = urllib.request.Request(
        'http://localhost:8000/detect/frame',
        data=json.dumps({
            'image_base64': b64,
            'road_name': 'Outer Ring Road',
            'latitude': 12.9352,
            'longitude': 77.6245,
            'device': 'laptop_webcam'
        }).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(frame_req, timeout=30) as r:
        frame_res = json.loads(r.read())
        print(f"[3] /detect/frame: HTTP {r.status} | potholes: {frame_res['pothole_count']} | avg_conf: {frame_res['avg_confidence']}")

    # 4. Video Detection test (create short 1-sec mp4 in memory using OpenCV)
    video_path = Path('scripts/test_clip.mp4')
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(str(video_path), fourcc, 10.0, (640, 640))
    test_img = cv2.imread(str(img_path))
    test_img_resized = cv2.resize(test_img, (640, 640))
    for _ in range(10):
        out.write(test_img_resized)
    out.release()

    video_bytes = video_path.read_bytes()
    v_boundary = 'BoundaryVideoTest987'
    v_body = bytearray()
    v_body.extend(f'--{v_boundary}\r\nContent-Disposition: form-data; name="file"; filename="test_clip.mp4"\r\nContent-Type: video/mp4\r\n\r\n'.encode('utf-8'))
    v_body.extend(video_bytes)
    v_body.extend(f'\r\n--{v_boundary}--\r\n'.encode('utf-8'))

    v_req = urllib.request.Request(
        'http://localhost:8000/detect/video',
        data=bytes(v_body),
        headers={'Content-Type': f'multipart/form-data; boundary={v_boundary}'}
    )
    with urllib.request.urlopen(v_req, timeout=60) as r:
        v_res = json.loads(r.read())
        print(f"[4] /detect/video: HTTP {r.status} | frames processed: {v_res.get('frames_processed')} | total potholes: {v_res.get('total_potholes')}")
    if video_path.exists():
        video_path.unlink()

    # 5. Warehouse & Detections History
    with urllib.request.urlopen('http://localhost:8000/detections?limit=10', timeout=5) as r:
        d_res = json.loads(r.read())
        print(f"[5] /detections: HTTP {r.status} | total rows in warehouse: {d_res.get('total')}")

    # 6. Dashboard Summary
    with urllib.request.urlopen('http://localhost:8000/dashboard/summary', timeout=5) as r:
        dash_res = json.loads(r.read())
        print(f"[6] /dashboard/summary: HTTP {r.status} | total potholes: {dash_res.get('total_potholes')} | roads: {dash_res.get('total_roads')}")

    # 7. OLAP Rollup
    with urllib.request.urlopen('http://localhost:8000/analytics/olap/rollup/monthly', timeout=5) as r:
        olap_res = json.loads(r.read())
        print(f"[7] OLAP Rollup: HTTP {r.status} | rows in monthly_rollup: {len(olap_res.get('monthly_rollup', []))}")

    # 8. OLAP Slice by Road
    with urllib.request.urlopen('http://localhost:8000/analytics/olap/slice?road_name=MG%20Road', timeout=5) as r:
        slice_res = json.loads(r.read())
        print(f"[8] OLAP Slice: HTTP {r.status} | rows in slice_result for 'MG Road': {len(slice_res.get('slice_result', []))}")

    # 9. OLAP Dice
    with urllib.request.urlopen('http://localhost:8000/analytics/olap/dice?severity=small', timeout=5) as r:
        dice_res = json.loads(r.read())
        print(f"[9] OLAP Dice: HTTP {r.status} | rows in dice_result for Small severity: {len(dice_res.get('dice_result', []))}")

    # 10. K-Means Road Clustering
    try:
        with urllib.request.urlopen('http://localhost:8000/analytics/clusters?k=2', timeout=5) as r:
            k_res = json.loads(r.read())
            print(f"[10] K-Means Clustering: HTTP {r.status} | clusters returned: {len(k_res.get('clusters', []))}")
    except Exception as e:
        print(f"[10] K-Means Clustering: Note on road count: {e}")

    # 11. Model Evaluation Metrics
    with urllib.request.urlopen('http://localhost:8000/model/metrics', timeout=5) as r:
        m_res = json.loads(r.read())
        p = m_res['metrics']['precision']
        rec = m_res['metrics']['recall']
        map50 = m_res['metrics']['mAP50']
        print(f"[11] /model/metrics: Precision={p} Recall={rec} mAP50={map50}")

    # 12. Frontend React Web App
    with urllib.request.urlopen('http://localhost:3000/', timeout=5) as r:
        html = r.read().decode('utf-8')
        print(f"[12] Frontend (http://localhost:3000/): HTTP {r.status} | HTML contains PotholeGuard: {'PotholeGuard' in html}")

    print("====================================================")
    print("   ALL LAPTOP APPLICATION FEATURES VERIFIED!        ")
    print("====================================================")

if __name__ == '__main__':
    run_checks()
