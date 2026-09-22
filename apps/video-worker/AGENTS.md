# apps/video-worker

Processes a camera feed into real detection events on a background worker,
feeding the same ingestion pipeline the simulator uses — sensor and camera
events share one pipeline by design, not a separate one.

## What it does

`worker.py` opens a local MP4 (`VIDEO_PATH`, default `./sample.mp4`) via
OpenCV, loops it forever, samples every Nth frame (`FRAME_SAMPLE_INTERVAL`),
and runs frame-differencing motion detection on the sampled frames. When the
fraction of changed pixels crosses `MOTION_THRESHOLD`, and at least
`EVENT_COOLDOWN_SECONDS` has passed since the last report, that triggering
frame is also run through a real object detector — YOLOv5-nano (ONNX),
loaded via OpenCV's `cv2.dnn` module — to get an actual bounding box. If a
person is found, it POSTs an `object_detected` event with the detection(s)
(label, confidence, pixel-space bbox) in `metadata`; otherwise it POSTs a
plain `motion_detected` event. Either way this goes to `POST
/internal/events` on the API (the shared ingestion route) — same schema the
simulator uses, so it's triaged by the LLM and displayed identically,
including the real bounding box overlaid on the dashboard's camera panel.

No camera/RTSP hardware dependency: a looping local video file is the
simplest option for a take-home.

## Running it

```bash
apps/video-worker/.venv/bin/python apps/video-worker/generate_sample_video.py  # once, creates sample.mp4 (optional — bring your own clip instead)
apps/video-worker/.venv/bin/python apps/video-worker/worker.py
```

`generate_sample_video.py` synthesizes a short looping clip (a bouncing box
with brief motionless pauses) with OpenCV so there's no external video
download dependency; any local MP4 with visible motion (e.g. a real CCTV
clip) works just as well — point `VIDEO_PATH` at it. `sample.mp4` is
gitignored — regenerate it locally, or supply your own, after a fresh
checkout.

On first run, `worker.py` downloads the YOLOv5-nano ONNX weights (~4MB)
into `models/` and caches them there (also gitignored). If the download
fails (no network on first run), the worker logs a warning and falls back
to motion-only detection (`motion_detected` events, no bounding box)
instead of crashing.

Config is read from env vars (see `.env.example`): `API_URL`, `VIDEO_PATH`,
`SITE_ID`, `ZONE`, `FRAME_SAMPLE_INTERVAL`, `MOTION_THRESHOLD`,
`EVENT_COOLDOWN_SECONDS`, `DETECTION_CONFIDENCE_THRESHOLD`,
`DETECTION_NMS_IOU_THRESHOLD`.

## Failure handling

- A failed `POST /internal/events` (API down, network error) is caught and
  logged — the worker keeps running and just tries again on the next
  detection.
- A missing/unreadable `VIDEO_PATH` is treated as a config problem: logged
  clearly and retried on a delay, rather than crashing outright or
  busy-looping.
- A failed model download (offline first run) degrades to motion-only
  detection rather than crashing the worker.
- This runs as its own process — nothing here can take down the API.
