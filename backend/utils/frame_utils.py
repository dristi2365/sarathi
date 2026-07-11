"""
Helper functions for converting uploaded image bytes into an
OpenCV-compatible numpy frame.
"""

import numpy as np
import cv2


def bytes_to_frame(image_bytes: bytes) -> np.ndarray:
    """
    Convert raw image bytes (e.g. from an uploaded file) into a BGR
    numpy array that OpenCV / YOLO can process.
    """
    np_array = np.frombuffer(image_bytes, dtype=np.uint8)
    frame = cv2.imdecode(np_array, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Could not decode image bytes into a frame.")
    return frame
