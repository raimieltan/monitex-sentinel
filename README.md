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
