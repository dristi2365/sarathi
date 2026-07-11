"""
ByteTrack-based object tracking, using Ultralytics' built-in tracker.

Wraps YOLOv8's `.track()` method (instead of `.predict()`) so every
detection gets a persistent track_id across frames, and adds
direction/distance estimation relative to the camera frame.
"""

from ultralytics import YOLO
import numpy as np

CONFIDENCE_THRESHOLD = 0.45
MODEL_PATH = "yolov8n.pt"

_model = None


def get_model() -> YOLO:
    global _model
    if _model is None:
        print("[tracking] Loading YOLOv8 model...")
        _model = YOLO(MODEL_PATH)
        print("[tracking] YOLOv8 model loaded.")
    return _model


def _estimate_direction(cx: float, frame_width: int) -> str:
    """
    Estimate left/center/right based on the object's horizontal
    center position relative to the frame width.
    """
    left_bound = frame_width * 0.4
    right_bound = frame_width * 0.6

    if cx < left_bound:
        return "left"
    elif cx > right_bound:
        return "right"
    else:
        return "front"  # center of frame = directly ahead


def _estimate_distance(bbox: list[float], frame_area: float) -> str:
    """
    Estimate near/medium/far using the bounding box area relative to
    the total frame area. Bigger box (closer to camera) = nearer.
    This is a rough heuristic, not real depth — good enough for a
    hackathon MVP without a depth sensor.
    """
    x1, y1, x2, y2 = bbox
    box_area = max(0, x2 - x1) * max(0, y2 - y1)
    ratio = box_area / frame_area

    if ratio > 0.15:
        return "near"
    elif ratio > 0.04:
        return "medium"
    else:
        return "far"


def track_objects(frame: np.ndarray) -> list[dict]:
    """
    Run YOLOv8 + ByteTrack on a single frame.

    Returns a list of structured detections, each with:
        - name: class name (e.g. "bottle")
        - track_id: stable ID across frames (None if not yet assigned)
        - confidence: float 0-1
        - direction: "left" | "front" | "right"
        - distance: "near" | "medium" | "far"
        - bbox: [x1, y1, x2, y2]
        - center: [cx, cy]
    """
    model = get_model()
    frame_height, frame_width = frame.shape[:2]
    frame_area = frame_width * frame_height

    # persist=True tells Ultralytics to keep matching against previous
    # frames' tracks rather than starting fresh each call.
    results = model.track(
        source=frame,
        persist=True,
        tracker="bytetrack.yaml",
        verbose=False,
        conf=CONFIDENCE_THRESHOLD,
    )

    result = results[0]
    detections = []

    if result.boxes is None or result.boxes.id is None:
        # No tracked objects yet (e.g. very first frame, or nothing detected)
        return detections

    for box in result.boxes:
        cls_id = int(box.cls[0])
        class_name = model.names[cls_id]
        confidence = float(box.conf[0])
        track_id = int(box.id[0]) if box.id is not None else None

        x1, y1, x2, y2 = box.xyxy[0].tolist()
        cx = (x1 + x2) / 2
        cy = (y1 + y2) / 2

        detections.append({
            "name": class_name,
            "track_id": track_id,
            "confidence": round(confidence, 3),
            "direction": _estimate_direction(cx, frame_width),
            "distance": _estimate_distance([x1, y1, x2, y2], frame_area),
            "bbox": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
            "center": [round(cx, 1), round(cy, 1)],
        })

    return detections