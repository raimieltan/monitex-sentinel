# apps/video-worker

Not implemented yet — explicitly out of scope for the current milestone (see
root `AGENTS.md`). `worker.py` is an empty placeholder. When this is built,
it should emit detection events into the same pipeline the simulator feeds
(`ws://localhost:8765` on the API, or a comparable ingestion path) rather
than a separate one — sensor and camera events share one pipeline by design.
