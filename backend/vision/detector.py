"""
YOLOv8 object detection wrapper.

Loads a YOLOv8 model once at startup and exposes a simple function
to run detection on a single image (numpy array in BGR format, as
returned by OpenCV).
"""

from ultralytics import YOLO
import numpy as np

# Confidence threshold: detections below this are discarded as noise
CONFIDENCE_THRESHOLD = 0.45

# "yolov8n.pt" = nano model: smallest and fastest, ideal for a
# hackathon / real-time webcam use case. Ultralytics downloads this
# automatically the first time it's used.
MODEL_PATH = "yolov8n.pt"

_model = None  # loaded lazily, once


def get_model() -> YOLO:
    """Load the YOLO model once and reuse it across requests (loading is slow)."""
    global _model
    if _model is None:
        print("[vision] Loading YOLOv8 model...")
        _model = YOLO(MODEL_PATH)
        print("[vision] YOLOv8 model loaded.")
    return _model


def detect_objects(frame: np.ndarray) -> list[dict]:
    """
    Run YOLOv8 detection on a single frame.

    Args:
        frame: a BGR image as a numpy array (OpenCV format).

    Returns:
        A list of detections, each a dict with:
            - name: class name (e.g. "bottle")
            - confidence: float 0-1
            - bbox: [x1, y1, x2, y2] pixel coordinates of the box
            - center: [cx, cy] pixel coordinates of the box center
    """
    model = get_model()
    results = model.predict(source=frame, verbose=False, conf=CONFIDENCE_THRESHOLD)

    detections = []
    result = results[0]  # single image in, single result out

    for box in result.boxes:
        cls_id = int(box.cls[0])
        class_name = model.names[cls_id]
        confidence = float(box.conf[0])

        x1, y1, x2, y2 = box.xyxy[0].tolist()
        cx = (x1 + x2) / 2
        cy = (y1 + y2) / 2

        detections.append({
            "name": class_name,
            "confidence": round(confidence, 3),
            "bbox": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
            "center": [round(cx, 1), round(cy, 1)],
        })

    return detections