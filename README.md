# Project Sentinel

A miniature real-time alarm monitoring system: continuous sensor/camera
event ingestion, AI triage, and a live operator dashboard.

For architecture details, pipeline flow, and code conventions, see
[`AGENTS.md`](./AGENTS.md).

## Stack

- **web** — Next.js + TypeScript + Tailwind
- **api** — Node.js + Express + TypeScript, Prisma, BullMQ, Socket.IO
- **simulator** — Python WebSocket event simulator
- **video-worker** — Python + OpenCV, frame-differencing motion detection over a looping sample video
- **Infra** — PostgreSQL, Redis, Docker Compose
- **Package manager** — Yarn 1.x only (no npm/pnpm)

## Prerequisites

- Node.js + Yarn 1.x
- Docker (for Postgres + Redis)
- Python 3.9+

## Setup

```bash
git clone <repo>
cd monitex-sentinel
yarn install

# simulator's Python deps live in a venv
cd apps/simulator
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cd ../..

# video-worker's Python deps live in their own venv
cd apps/video-worker
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python generate_sample_video.py   # creates sample.mp4 (gitignored)
cd ../..
```

Copy `apps/api/.env.example` to `apps/api/.env` if it doesn't already exist
(it's checked out with sane local defaults). Set `OPENAI_API_KEY` there if
you want real AI triage — without it, triage falls back to a deterministic
stub provider so the pipeline still runs end-to-end.

Copy `apps/web/.env.example` to `apps/web/.env.local` and
`apps/video-worker/.env.example` to `apps/video-worker/.env` if you want to
override their defaults (both work out of the box without this).

## Running

Start each of these in its own terminal, in any order — the API and
simulator both retry/reconnect, so exact startup order doesn't matter.

```bash
# 1. Infra
docker-compose up -d

# 2. API — http://localhost:4000
yarn workspace api dev

# 3. Simulator — feeds ws://localhost:8765
apps/simulator/.venv/bin/python apps/simulator/stream.py

# 4. Web dashboard — http://localhost:3000
yarn dev:web

# 5. Video worker (optional) — feeds motion_detected events from a looping
# sample video into the same pipeline as the simulator
apps/video-worker/.venv/bin/python apps/video-worker/worker.py
```

### Sanity checks

```bash
curl http://localhost:4000/health
curl http://localhost:4000/events | python3 -m json.tool
```

## Services & ports

| Service      | Path                | Port                  |
|--------------|---------------------|------------------------|
| web          | `apps/web`          | 3000                   |
| api          | `apps/api`          | 4000                   |
| simulator    | `apps/simulator`    | 8765 (WebSocket)       |
| video-worker | `apps/video-worker` | none (calls out to api)|
| PostgreSQL   | docker-compose      | 5433 (host-mapped)     |
| Redis        | docker-compose      | 6379                   |

## Pipeline

```
simulator (WebSocket)      ─┐
video-worker (POST /internal/events) ─┴→ validate (Zod) → persist (Prisma) →
enqueue triage job (BullMQ) → broadcast event:new (Socket.IO)
                                    ↓
                    triage worker → AI triage (OpenAI or stub) →
                    update DB → broadcast event:updated
```

Both producers feed the same `ingestEvent` pipeline — the video worker isn't
a separate path, it's just another producer.

The LLM is never called inline during ingestion — triage runs asynchronously
in a BullMQ worker so bursts of events and slow/failing AI calls don't block
ingestion or the dashboard.

## REST API

| Method | Path                        | Description                  |
|--------|------------------------------|-------------------------------|
| GET    | `/health`                    | Service healthcheck           |
| GET    | `/events`                    | List events, newest first     |
| POST   | `/internal/events`           | Ingest an event from a producer other than the simulator's WebSocket feed (e.g. the video worker) |
| PATCH  | `/events/:id/acknowledge`    | Mark an event acknowledged    |
| PATCH  | `/events/:id/resolve`        | Mark an event resolved        |

Socket.IO emits `event:new` and `event:updated`.

## Architecture & key trade-offs

- **Validate → persist → enqueue → broadcast, LLM never inline.** Both
  producers (simulator over WebSocket, video worker over
  `POST /internal/events`) hit the same `ingestEvent` path
  (`apps/api/src/services/ingestion.ts`). An event is persisted and
  broadcast (`event:new`) *before* triage runs — triage is a BullMQ job
  picked up by a worker in the same process. This is the central trade-off
  in the system: a slow or rate-limited LLM call degrades triage latency,
  never ingestion. The dashboard shows a "triaging…" state until
  `event:updated` lands with the real severity/summary.
- **Triage worker in-process, not a separate service.** `startTriageWorker()`
  runs inside the API process rather than its own deployable — simpler to
  run for a take-home, and the queue/worker boundary already exists if it
  needs to be pulled out later.
- **AI provider is a swappable strategy, not a hard dependency.** The
  `TriageProvider` interface (`apps/api/src/services/triageProvider.ts`) has
  three implementations: OpenAI, OpenRouter/NVIDIA (both OpenAI-compatible),
  and a deterministic rule-based stub. With no API key set, the stub takes
  over so the pipeline runs identically end-to-end — the integration seam is
  real, not faked, but the demo doesn't require a paid key to work.
  Each provider entry has its own circuit breaker: a rate limit or 5xx trips
  it and skips straight to the next provider (or the stub) for a cooldown
  window, instead of retrying a provider that's currently failing.
- **Video worker is a separate OS process that talks HTTP, not a shared
  library.** It samples every Nth frame from a looping local MP4, runs
  frame-differencing motion detection, and only runs the (heavier) YOLOv5-nano
  ONNX pass when motion is actually detected — keeping decode/inference off
  the ingestion hot path per the spec. It reports through the same
  `POST /internal/events` route the simulator's WS events go through, so a
  camera detection is indistinguishable from a sensor alarm once it's in the
  pipeline.
- **Zod validation treats "weird" as normal, not exceptional.** Incoming
  events are untrusted by design (per spec: fields missing, confidence low).
  `schemas/event.ts` normalizes what it can and drops what it can't parse —
  logged, never thrown — so one malformed event can't take down ingestion.
- **No optimistic UI updates.** Acknowledge/resolve calls the REST endpoint
  and waits for the `event:updated` broadcast to update state, rather than
  mutating local state first. Slightly slower perceived latency in exchange
  for the UI never showing a state the server didn't actually confirm.

## Degrading gracefully

- **Event bursts:** ingestion never blocks on triage — it's a queue enqueue,
  not a synchronous call, so a burst of simulator events persists and
  broadcasts immediately regardless of triage throughput.
- **Slow LLM:** `triageWithTimeout` races the provider call against
  `TRIAGE_TIMEOUT_MS`; a hang fails fast and retries via BullMQ's
  exponential backoff instead of tying up a worker slot indefinitely.
- **Rate-limited/erroring LLM:** the circuit breaker in
  `ChainedTriageProvider` skips a failing provider for a cooldown window
  rather than retrying it immediately; once every real provider is
  unavailable, the stub provider guarantees a result so an event never gets
  stuck untriaged.
- **Exhausted retries:** an event that fails triage on every attempt is
  marked `triageStatus: FAILED` and broadcast as-is — visible to the
  operator as needing manual attention, rather than silently vanishing.
- **Bad/malformed events:** dropped at the Zod validation boundary, logged,
  never thrown — a single bad payload can't crash the WebSocket handler or
  the `POST /internal/events` route.

## What I'd build next

- **Pattern-based escalation** (spec's "ideally" tier) — e.g. N perimeter
  breaches at one site within a short window auto-escalates severity, on
  top of the current per-event triage. Skipped for time; the current system
  only guarantees a *single* critical event is impossible to miss (banner +
  row highlighting + severity-first sort), not multi-event correlation.
- **Snapshot/frame preview on alarm cards** — `snapshot_url` is already in
  the schema and the video worker has the frame in hand when it detects
  motion; it isn't uploaded/served anywhere yet, so cards show a live camera
  overlay but not a still frame per past event.
- **Operator feedback loop** — letting an operator flag a triage result as
  wrong and feeding that back into future prompts/thresholds.
- **Cost/latency metrics for the AI layer** — token counts and provider
  latency are implicitly bounded by the timeout/circuit breaker but aren't
  currently surfaced anywhere (logs only).
- **Basic auth on the dashboard** — currently open, fine for a local demo,
  not for anything beyond it.
- **Split the triage worker into its own process** — currently runs
  in-process with the API for simplicity; the queue/worker boundary already
  supports pulling it out if triage load needed to scale independently of
  the HTTP API.

## Where I knowingly cut corners

- **Video source is a local looping sample MP4, not a live camera/RTSP/HLS
  stream.** The spec explicitly allows this ("a looping file, webcam, HLS,
  or RTSP" — "adapt it however you like"); a looping file removes any
  hardware/network dependency for a take-home while keeping the same
  sample → detect → emit pipeline a real feed would use.
  `generate_sample_video.py` synthesizes the clip locally so there's no
  external video download dependency either.
- **Detection is motion-diff + YOLOv5-nano on motion-triggering frames
  only**, not per-frame object detection or multi-object tracking — the
  spec calls a motion diff sufficient and treats a real detector as a plus;
  running YOLO only when motion fires keeps the heavier pass rare and off
  the hot path.
- **Simulator and video worker are silent by default** and only stream on a
  dashboard "Stream N Events" / "Auto Mode" toggle (see
  `apps/web/src/components/dashboard/dev-controls.tsx`). This is a deliberate
  demo-ergonomics choice (avoids burning a real LLM provider's rate limit
  before anyone's watching), not a spec requirement — worth knowing before
  wondering why nothing appears on a fresh `docker-compose up` without also
  clicking a dev control or enabling Auto Mode.
- **No automated test suite.** Everything above was verified manually
  end-to-end (documented in `docs/mvp-roadmap.md`) rather than covered by
  unit/integration tests — a reasonable cut for an 8–14hr take-home, not
  something I'd skip on a real system.
- **No Docker for the app services**, only Postgres/Redis via
  `docker-compose`. The spec calls Docker "welcome but optional" for the
  whole system; containerizing five services (web/api/simulator/video-worker
  + infra) felt like polish time better spent elsewhere for this scope.
