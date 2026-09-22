"""
Sentinel video worker.

Reads a looping MP4 (no camera/RTSP hardware dependency — see AGENTS.md),
samples every Nth frame, and runs lightweight frame-differencing motion
detection. When a sampled frame has motion, it also runs a real YOLOv5-nano
object detector (ONNX, via OpenCV's `cv2.dnn` module, pretrained on COCO) on
that frame to get an actual bounding box for any detected person. If a
person is found, POSTs an `object_detected` event with the detection(s) in
`metadata`; otherwise POSTs a plain `motion_detected` event. Either way it
goes through `POST /internal/events` on the API, the same ingestion
pipeline the simulator feeds, so it's triaged and displayed exactly like a
sensor event.

Like the simulator, this worker is silent by default: before each report it
calls `POST /internal/simulator/video-armed` and only posts if that grants
permission (see apps/api/src/services/ingestion.ts) — either because the
dashboard's "Auto Mode" toggle is on, or because the "Stream CCTV" dev
button granted it manual-stream credits, drawn down one at a time as
motion is actually detected. Either way, a demo doesn't start streaming
(and burning a triage provider's rate limit) before anyone's clicked
anything.

The detector's weights (~4MB ONNX file) aren't checked into the repo —
they're downloaded once into `models/` on first run and cached there. If
they can't be fetched (no network on first run), the worker logs a warning
and falls back to motion-only detection rather than crashing.
"""
import os
import time
import urllib.request
import uuid
from datetime import datetime, timezone

import cv2
import numpy as np
import requests
from dotenv import load_dotenv

load_dotenv()

API_URL = os.environ.get("API_URL", "http://localhost:4000")
VIDEO_PATH = os.environ.get("VIDEO_PATH", os.path.join(os.path.dirname(__file__), "sample.mp4"))
SITE_ID = os.environ.get("SITE_ID", "site-207")
ZONE = os.environ.get("ZONE", "loading-dock")

# Sample every Nth frame rather than every frame — cheap and sufficient for
# frame-differencing motion detection, and keeps the (heavier) DNN pass rare.
FRAME_SAMPLE_INTERVAL = int(os.environ.get("FRAME_SAMPLE_INTERVAL", "5"))
# Fraction of pixels that must change between sampled frames to count as motion.
MOTION_THRESHOLD = float(os.environ.get("MOTION_THRESHOLD", "0.02"))
# Minimum seconds between reported events, so continuous motion doesn't
# flood the pipeline with one event per sampled frame.
EVENT_COOLDOWN_SECONDS = float(os.environ.get("EVENT_COOLDOWN_SECONDS", "5"))
RECONNECT_DELAY_SECONDS = float(os.environ.get("RECONNECT_DELAY_SECONDS", "3"))
# Minimum YOLO confidence (objectness * class score) to report a detection.
DETECTION_CONFIDENCE_THRESHOLD = float(os.environ.get("DETECTION_CONFIDENCE_THRESHOLD", "0.4"))
DETECTION_NMS_IOU_THRESHOLD = float(os.environ.get("DETECTION_NMS_IOU_THRESHOLD", "0.45"))

_MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
_WEIGHTS_PATH = os.path.join(_MODELS_DIR, "yolov5n.onnx")
_WEIGHTS_URL = "https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5n.onnx"

# YOLOv5's input is a fixed square; frames are resized (not letterboxed) to
# it and boxes are rescaled back — simpler, and accurate enough for this
# demo's steady, wide-shot CCTV footage.
_INPUT_SIZE = 640
# COCO class order used by this model. Index 0 is "person".
_PERSON_CLASS_ID = 0


def _ensure_weights_downloaded() -> bool:
    """Downloads the YOLOv5-nano ONNX weights into models/ on first run if missing.

    Returns True if the weights are present and usable, False if they
    couldn't be fetched (caller should fall back to motion-only detection).
    """
    if os.path.exists(_WEIGHTS_PATH):
        return True
    os.makedirs(_MODELS_DIR, exist_ok=True)
    print(f"[video-worker] downloading detection model weights (~4MB) to {_WEIGHTS_PATH} ...")
    tmp_path = f"{_WEIGHTS_PATH}.download"
    try:
        urllib.request.urlretrieve(_WEIGHTS_URL, tmp_path)
        os.replace(tmp_path, _WEIGHTS_PATH)
        print("[video-worker] detection model ready")
        return True
    except OSError as err:
        print(f"[video-worker] could not download detection model ({err}); falling back to motion-only detection")
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        return False


def _load_detector():
    if not _ensure_weights_downloaded():
        return None
    return cv2.dnn.readNetFromONNX(_WEIGHTS_PATH)


_net = _load_detector()


def detect_people(frame: np.ndarray) -> tuple[list[dict], int, int]:
    """Runs a real YOLOv5-nano forward pass on one frame and keeps person detections.

    Returns (detections, frame_width, frame_height) — bbox coordinates are
    in the frame's native pixel space (matches whatever resolution the
    frontend plays the same source video at), so the dashboard can overlay
    them directly with no rescaling assumptions. Returns an empty detection
    list (never raises) if the model failed to load.
    """
    height, width = frame.shape[:2]
    if _net is None:
        return [], width, height

    blob = cv2.dnn.blobFromImage(frame, scalefactor=1 / 255.0, size=(_INPUT_SIZE, _INPUT_SIZE), swapRB=True, crop=False)
    _net.setInput(blob)
    predictions = _net.forward()[0]  # (25200, 85): cx, cy, w, h, objectness, 80 class scores

    x_scale = width / _INPUT_SIZE
    y_scale = height / _INPUT_SIZE

    boxes: list[list[int]] = []
    scores: list[float] = []
    for row in predictions:
        objectness = float(row[4])
        if objectness < DETECTION_CONFIDENCE_THRESHOLD:
            continue
        class_scores = row[5:]
        class_id = int(np.argmax(class_scores))
        if class_id != _PERSON_CLASS_ID:
            continue
        confidence = objectness * float(class_scores[class_id])
        if confidence < DETECTION_CONFIDENCE_THRESHOLD:
            continue

        cx, cy, w, h = row[0], row[1], row[2], row[3]
        x = int((cx - w / 2) * x_scale)
        y = int((cy - h / 2) * y_scale)
        boxes.append([x, y, int(w * x_scale), int(h * y_scale)])
        scores.append(confidence)

    detections = []
    if boxes:
        keep = cv2.dnn.NMSBoxes(boxes, scores, DETECTION_CONFIDENCE_THRESHOLD, DETECTION_NMS_IOU_THRESHOLD)
        for i in np.array(keep).flatten():
            x, y, w, h = boxes[i]
            x, y = max(0, x), max(0, y)
            w, h = min(w, width - x), min(h, height - y)
            if w <= 0 or h <= 0:
                continue
            detections.append(
                {
                    "label": "person",
                    "confidence": round(scores[i], 2),
                    "bbox": {"x": x, "y": y, "width": w, "height": h},
                }
            )

    return detections, width, height


def open_capture() -> cv2.VideoCapture:
    if not os.path.exists(VIDEO_PATH):
        raise FileNotFoundError(
            f"video file not found: {VIDEO_PATH} "
            "(run generate_sample_video.py to create a sample, or set VIDEO_PATH)"
        )
    capture = cv2.VideoCapture(VIDEO_PATH)
    if not capture.isOpened():
        raise IOError(f"failed to open video: {VIDEO_PATH}")
    return capture


def motion_ratio(prev_gray: np.ndarray, gray: np.ndarray) -> float:
    diff = cv2.absdiff(prev_gray, gray)
    _, thresholded = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)
    return float(np.count_nonzero(thresholded)) / thresholded.size


def streaming_armed() -> bool:
    """Asks the API for permission to post: granted if Auto Mode is on, or
    if a manual "Stream CCTV" credit is available and gets consumed here.

    Fails safe: if the check itself fails (API down, network blip), treat
    streaming as not armed rather than posting anyway.
    """
    try:
        response = requests.post(f"{API_URL}/internal/simulator/video-armed", timeout=3)
        response.raise_for_status()
        return bool(response.json().get("armed", False))
    except requests.RequestException as err:
        print(f"[video-worker] could not check streaming permission ({err}); skipping this event")
        return False


def post_event(event_type: str, confidence: float, metadata: dict) -> None:
    if not streaming_armed():
        print(f"[video-worker] suppressed {event_type} (Auto Mode is off)")
        return

    event = {
        "event_id": f"evt_{uuid.uuid4().hex[:10]}",
        "site_id": SITE_ID,
        "zone": ZONE,
        "type": event_type,
        "source": "camera",
        "confidence": round(min(confidence, 1.0), 2),
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "snapshot_url": None,
        "metadata": metadata,
    }
    try:
        response = requests.post(f"{API_URL}/internal/events", json=event, timeout=5)
        response.raise_for_status()
        print(f"[video-worker] reported {event_type} (confidence {event['confidence']})")
    except requests.RequestException as err:
        # A failed POST must not crash the worker — the next detection will
        # simply try again.
        print(f"[video-worker] failed to report event: {err}")


def run() -> None:
    print(f"[video-worker] starting, video={VIDEO_PATH}")
    prev_gray = None
    last_event_time = 0.0
    frame_index = 0

    capture = open_capture()
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                # End of file (or a decode hiccup) — loop back to the start
                # rather than crashing; this is a looping sample feed, not a
                # live camera with a real "end".
                capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue

            frame_index += 1
            if frame_index % FRAME_SAMPLE_INTERVAL != 0:
                continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (21, 21), 0)

            if prev_gray is not None:
                ratio = motion_ratio(prev_gray, gray)
                now = time.monotonic()
                if ratio >= MOTION_THRESHOLD and (now - last_event_time) >= EVENT_COOLDOWN_SECONDS:
                    detections, frame_width, frame_height = detect_people(frame)
                    if detections:
                        best_confidence = max(d["confidence"] for d in detections)
                        post_event(
                            "object_detected",
                            confidence=best_confidence,
                            metadata={
                                "detections": detections,
                                "sourceWidth": frame_width,
                                "sourceHeight": frame_height,
                            },
                        )
                    else:
                        post_event("motion_detected", confidence=0.5 + ratio, metadata={})
                    last_event_time = now

            prev_gray = gray
    finally:
        capture.release()


if __name__ == "__main__":
    while True:
        try:
            run()
        except (FileNotFoundError, IOError) as err:
            # Missing/unreadable video is a config problem, not a transient
            # one — log clearly and retry rather than busy-looping forever
            # (lets the operator fix VIDEO_PATH and have the worker recover).
            print(f"[video-worker] {err}; retrying in {RECONNECT_DELAY_SECONDS}s")
            time.sleep(RECONNECT_DELAY_SECONDS)
        except KeyboardInterrupt:
            print("[video-worker] shutting down")
            break
