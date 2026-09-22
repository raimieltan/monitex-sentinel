"""
Sentinel video worker.

Reads a looping MP4 (no camera/RTSP hardware dependency — see AGENTS.md),
samples every Nth frame, and runs lightweight frame-differencing motion
detection. On a detection above threshold, POSTs a `motion_detected` event
into the same ingestion pipeline the simulator feeds
(`POST /internal/events` on the API), so it's triaged and displayed exactly
like a sensor event.
"""
import os
import time
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
# frame-differencing motion detection (spec: object/person detection is
# explicitly optional).
FRAME_SAMPLE_INTERVAL = int(os.environ.get("FRAME_SAMPLE_INTERVAL", "5"))
# Fraction of pixels that must change between sampled frames to count as motion.
MOTION_THRESHOLD = float(os.environ.get("MOTION_THRESHOLD", "0.02"))
# Minimum seconds between reported events, so continuous motion doesn't
# flood the pipeline with one event per sampled frame.
EVENT_COOLDOWN_SECONDS = float(os.environ.get("EVENT_COOLDOWN_SECONDS", "5"))
RECONNECT_DELAY_SECONDS = float(os.environ.get("RECONNECT_DELAY_SECONDS", "3"))


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


def post_motion_event(confidence: float) -> None:
    event = {
        "event_id": f"evt_{uuid.uuid4().hex[:10]}",
        "site_id": SITE_ID,
        "zone": ZONE,
        "type": "motion_detected",
        "source": "camera",
        "confidence": round(min(confidence, 1.0), 2),
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "snapshot_url": None,
        "metadata": {},
    }
    try:
        response = requests.post(f"{API_URL}/internal/events", json=event, timeout=5)
        response.raise_for_status()
        print(f"[video-worker] reported motion_detected (confidence {event['confidence']})")
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
                    post_motion_event(confidence=0.5 + ratio)
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
