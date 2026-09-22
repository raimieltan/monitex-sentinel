# apps/video-worker

Simulates a camera feed and runs lightweight motion detection, feeding the
same ingestion pipeline the simulator uses — sensor and camera events share
one pipeline by design, not a separate one.

## What it does

`worker.py` opens a local MP4 (`VIDEO_PATH`, default `./sample.mp4`) via
OpenCV, loops it forever, samples every Nth frame (`FRAME_SAMPLE_INTERVAL`),
and runs frame-differencing motion detection on the sampled frames (object/
person detection is explicitly out of scope — see root `AGENTS.md`). When
the fraction of changed pixels crosses `MOTION_THRESHOLD`, and at least
`EVENT_COOLDOWN_SECONDS` has passed since the last report, it POSTs a
`motion_detected` event (`source: "camera"`) to `POST /internal/events` on
the API (Slice 1's shared ingestion route) — same schema the simulator uses,
so it gets triaged and displayed identically.

No camera/RTSP hardware dependency: a looping local video file is the
simplest option for a take-home.

## Running it

```bash
apps/video-worker/.venv/bin/python apps/video-worker/generate_sample_video.py  # once, creates sample.mp4
apps/video-worker/.venv/bin/python apps/video-worker/worker.py
```

`generate_sample_video.py` synthesizes a short looping clip (a bouncing box
with brief motionless pauses) with OpenCV so there's no external video
download dependency. `sample.mp4` is gitignored — regenerate it locally
after a fresh checkout.

Config is read from env vars (see `.env.example`): `API_URL`, `VIDEO_PATH`,
`SITE_ID`, `ZONE`, `FRAME_SAMPLE_INTERVAL`, `MOTION_THRESHOLD`,
`EVENT_COOLDOWN_SECONDS`.

## Failure handling

- A failed `POST /internal/events` (API down, network error) is caught and
  logged — the worker keeps running and just tries again on the next
  detection.
- A missing/unreadable `VIDEO_PATH` is treated as a config problem: logged
  clearly and retried on a delay, rather than crashing outright or
  busy-looping.
- This runs as its own process — nothing here can take down the API.
