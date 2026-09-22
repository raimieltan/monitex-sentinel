# Project Sentinel — MVP Roadmap (Vertical Slices)

Living document. Update checkboxes and status as work lands — this is not a
one-shot plan, keep it in sync with reality.

**Spec:** `docs/monitex-sentinel.md` (internal paraphrase) /
`Monitex_Technical_Assessment.pdf` (repo root — the actual take-home brief;
authoritative where the two differ)
**Architecture / conventions:** `AGENTS.md` (repo root)

Each slice below is a vertically-complete piece of the system: it produces
something demoable end-to-end, not just one layer. Slices are ordered by
dependency, not importance — do them roughly in order.

Status legend: ✅ done · 🚧 in progress · ⬜ not started

**Fix log:** severity was implemented as a 4-level `low`/`medium`/`high`/
`critical` scale in Slices 0–4; cross-checked against
`Monitex_Technical_Assessment.pdf` and corrected to the spec's 3-level
`info`/`warning`/`critical` scale (§3, §15) across
`apps/api/src/services/triageProvider.ts`, `apps/web/src/types/event.ts`,
`apps/web/src/hooks/useEvents.ts`, and `apps/web/src/components/EventCard.tsx`.
Any events triaged before this fix will still have the old string values in
the DB until re-triaged or the DB is reset.

---

## Slice 0 — Backend ingestion → triage → persistence pipeline ✅

**Status: done and verified end-to-end.**

- WebSocket ingestion from simulator (`apps/api/src/services/ingestion.ts`),
  auto-reconnect, per-message error isolation.
- Zod validation + normalization of incomplete/low-confidence events
  (`apps/api/src/schemas/event.ts`).
- Immediate persistence, duplicate `event_id` handled via unique constraint
  (`apps/api/src/services/eventService.ts`).
- BullMQ triage queue + worker, exponential backoff, `FAILED` state on
  exhausted retries (`apps/api/src/queues/triageQueue.ts`,
  `apps/api/src/workers/triageWorker.ts`).
- Stub triage provider (no `OPENAI_API_KEY` needed to run) +
  `OpenAITriageProvider` with hard timeout (`apps/api/src/services/triageProvider.ts`).
- Socket.IO `event:new` / `event:updated` broadcasts (`apps/api/src/lib/socket.ts`).
- REST: `GET /events`, `PATCH /events/:id/acknowledge`, `PATCH /events/:id/resolve`,
  `GET /health` (`apps/api/src/routes/`).

Nothing to do here for MVP purposes — later slices only *add* to this, they
don't need to touch it except where noted.

---

## Slice 1 — Shared ingestion path + `POST /internal/events` ✅

**Status: done and verified end-to-end.** `ingestEvent` extracted in
`apps/api/src/services/ingestion.ts`, `POST /internal/events` added in
`apps/api/src/routes/events.ts`. Verified: valid payload persists, triages,
and broadcasts identically to the WS path; invalid payload returns `202` and
is logged/dropped without being persisted.

Unlocks the video worker (Slice 4) by giving it (and any future producer) a
way into the same validate → persist → enqueue → broadcast pipeline that the
WebSocket path already uses, without duplicating that logic.

**Files:**
- Modify: `apps/api/src/services/ingestion.ts` — extract the body of
  `handleRawMessage` (from `parseIncomingEvent` onward) into an exported
  `ingestEvent(json: unknown): Promise<void>` that both the WS handler and
  the new REST route call. Keep `handleRawMessage` as the JSON.parse +
  delegate-to-`ingestEvent` wrapper.
- Modify: `apps/api/src/routes/events.ts` — add
  `POST /internal/events`, body parsed as JSON, calls `ingestEvent(req.body)`,
  responds `202 Accepted` immediately (don't wait on triage).

**Acceptance:**
- `curl -X POST localhost:4000/internal/events -d '{...valid event...}'`
  results in a persisted row, an `event:new` broadcast, and a triage job —
  same as a WS-delivered event.
- An invalid body returns `202` (per spec: ingestion never throws, bad
  events are logged and dropped, not surfaced as client errors) and is
  logged, not persisted.
- Existing WS ingestion tests/behavior unchanged.

---

## Slice 2 — Web dashboard shell: live event list ✅

**Status: done and verified end-to-end.** Built `apps/web/src/lib/socket.ts`,
`apps/web/src/lib/api.ts`, `apps/web/src/types/event.ts`,
`apps/web/src/hooks/useEvents.ts`, `apps/web/src/components/EventCard.tsx`,
and wired them into `apps/web/src/app/page.tsx`. Severity scale is
`info`/`warning`/`critical` per spec §3/§15 (see
`apps/api/src/services/triageProvider.ts`); sorting follows that 3-level
scale, critical first. Verified with the full stack running (docker-compose,
api, simulator, `yarn dev:web`):
simulator events land in the dashboard live, `GET /` renders 200 with the
initial "Loading events…" SSR state (no errors), and `GET /events` matches
what the socket feed delivers.

The single biggest remaining gap. `apps/web` is still the default
`create-next-app` scaffold — nothing has been built yet.

**Files:**
- Create: `apps/web/src/lib/socket.ts` — Socket.IO client singleton,
  connects to `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`).
- Create: `apps/web/src/lib/api.ts` — thin fetch wrapper for `GET /events`,
  `PATCH /events/:id/acknowledge`, `PATCH /events/:id/resolve`.
- Create: `apps/web/src/types/event.ts` — TS type mirroring the Prisma
  `Event` model (id, eventId, siteId, zone, type, source, confidence,
  timestamp, snapshotUrl, metadata, triageStatus, severity,
  threatAssessment, summary, recommendedAction, operatorStatus,
  acknowledgedAt, resolvedAt, createdAt, updatedAt).
- Create: `apps/web/src/hooks/useEvents.ts` — loads initial list via
  `GET /events` on mount, then merges `event:new` (prepend) and
  `event:updated` (replace by id) socket messages into state. This is what
  satisfies spec §20 ("realtime client disconnects → stored events remain
  available") — the initial REST fetch is the source of truth, sockets are
  the delta feed.
- Modify: `apps/web/src/app/page.tsx` — render the event list using the
  hook above.
- Create: `apps/web/src/components/EventCard.tsx` — one alarm card:
  severity, event type, site, zone, source, confidence, timestamp, AI
  summary, threat assessment, recommended action, operator status (spec §14
  field list — display all of them).

**Behavior:**
- List sorted by severity first (`critical` > `warning` > `info`, per spec
  §15), then by timestamp descending within a severity band.
- Events with `triageStatus: PENDING/PROCESSING` show a "triaging…" state
  instead of blank severity/summary fields (severity is nullable until
  triage completes).

**Acceptance:**
- Run simulator + API + `yarn dev:web`; new simulator events appear in the
  dashboard within a second of being persisted, without a page refresh.
- Refreshing the browser still shows all previously-seen events (proves the
  `GET /events` fallback works, not just the socket feed).

---

## Slice 3 — Operator actions (acknowledge / resolve) ✅

**Status: done and verified end-to-end.** `EventCard` now has "Acknowledge"
(visible when `operatorStatus === "OPEN"`) and "Resolve" (visible when
`operatorStatus !== "RESOLVED"`) buttons, calling the existing
`acknowledgeEvent`/`resolveEvent` helpers in `apps/web/src/lib/api.ts`. No
optimistic local mutation — buttons show a per-action loading state and the
UI updates when `event:updated` lands, same as the roadmap called for. A
failed request (e.g. 404) sets a visible inline error instead of a silent
no-op. Verified via direct API calls: acknowledge/resolve flip
`operatorStatus` and set `resolvedAt`, and a bad id returns `404`.

**Files:**
- Modify: `apps/web/src/components/EventCard.tsx` — "Acknowledge" button
  (visible when `operatorStatus === "OPEN"`) and "Resolve" button (visible
  when `operatorStatus !== "RESOLVED"`).
- Modify: `apps/web/src/lib/api.ts` — already has the two PATCH calls from
  Slice 2; wire them to the buttons.
- Modify: `apps/web/src/hooks/useEvents.ts` — no change needed if
  `event:updated` already merges by id (Slice 2 covers this); an
  optimistic update isn't required — the broadcast round-trip is fast
  enough that the button can just show a disabled/loading state until the
  socket update lands.

**Acceptance:**
- Clicking "Acknowledge" flips `operatorStatus` to `ACKNOWLEDGED` in the UI
  without a manual refresh, on the *same* browser tab that clicked it, via
  the `event:updated` broadcast (not a local-only state mutation) — proves
  the round trip through the API.
- A 404 (already-deleted/bad id) surfaces as a visible error, not a silent
  no-op.

---

## Slice 4 — Critical alerting prominence ✅

**Status: done, logic verified via API; visual appearance not yet confirmed
in an actual browser (no browser-automation tool available in this
session).** Added distinct critical styling to `EventCard` (red ring +
`AlertTriangle` icon next to the title, on top of the existing red
border/badge from Slice 2) and a new `apps/web/src/components/CriticalBanner.tsx`
mounted above the list in `page.tsx`, shown when ≥1 event has
`severity === "critical" && operatorStatus === "OPEN"`. Verified via the API
that posting a critical event and later resolving it correctly moves it in
and out of that filter condition, and that the page still compiles/serves
(200, no server errors) with the banner code path present. Recommend a
manual visual check in-browser before considering this fully done.

Spec §18: "the system must at minimum prominently surface any single
critical event."

**Files:**
- Modify: `apps/web/src/components/EventCard.tsx` — distinct visual
  treatment for `severity === "critical"` (color, border, icon — not just a
  text label buried in the card).
- Create: `apps/web/src/components/CriticalBanner.tsx` — a persistent
  top-of-page banner/count when ≥1 `OPEN` critical event exists, so it's
  visible even if the card itself has scrolled out of view.
- Modify: `apps/web/src/app/page.tsx` — mount the banner above the list.

**Acceptance:**
- Trigger a critical event via the simulator (or `POST /internal/events`
  once Slice 1 lands); banner appears within a second and disappears once
  the event is resolved or no critical `OPEN` events remain.

---

## Slice 5 — Video worker (`apps/video-worker`) ✅

**Status: done and verified end-to-end.** `worker.py` loops a local sample
MP4, samples every Nth frame, runs frame-differencing motion detection, and
POSTs `motion_detected` events (`source: "camera"`) to
`POST /internal/events` with a cooldown so continuous motion doesn't flood
the pipeline. Added `generate_sample_video.py` (synthesizes a short looping
clip locally — no external video download dependency); `sample.mp4` is
gitignored and regenerated per checkout. Verified live: ran the worker
against a generated sample, confirmed `motion_detected`/`source: camera`
events persisted and triaged to `COMPLETE` identically to sensor events, and
confirmed a missing `VIDEO_PATH` logs and retries instead of crashing.
`AGENTS.md` rewritten with the real integration contract.

**Files:**
- Modify: `apps/video-worker/worker.py` — OpenCV capture loop over a
  looping MP4 (spec §7, simplest option — no camera/RTSP hardware
  dependency for a take-home). Sample every Nth frame (not every frame,
  per spec §6). Run frame-differencing motion detection (lightweight,
  sufficient per spec §6 — object/person detection is explicitly optional).
- On a motion detection above threshold, POST a `motion_detected` event
  (matching the schema in spec §4, `source: "camera"`) to
  `POST /internal/events` on the API.
- Modify: `apps/video-worker/requirements.txt` if an HTTP client beyond
  `requests` (already likely present) is needed.
- Modify: `apps/video-worker/AGENTS.md` — replace the "deferred scope
  marker" framing with the actual integration contract once built.

**Acceptance:**
- Running `worker.py` against a sample MP4 produces `motion_detected`
  events that show up in the dashboard exactly like sensor events — same
  triage pipeline, same card rendering, `source: "camera"` displayed.
- Video decode failures or a missing video file log and exit/retry — they
  must not be able to take down the API (they're a separate process, so
  this is mostly "don't crash the worker itself unnecessarily").

---

## Slice 6 — Local run polish & docs ✅

**Status: done and verified end-to-end.** Root `README.md` updated: stack
description, venv setup, and running steps now cover the video worker
(including the one-time `generate_sample_video.py` step), services table
adds video-worker, pipeline diagram shows it as a second producer into the
shared `ingestEvent` path, and the REST table lists `POST /internal/events`.
`apps/web/.env.example` and `apps/video-worker/.env.example` both exist.
Sanity pass done by stopping every process and restarting all five pieces
(docker-compose, api, simulator, web, video-worker) exactly per the README
— confirmed `GET /health` and `GET /` both 200, and `GET /events` showed
both `sensor`/`camera`-sourced simulator events and video-worker
`motion_detected` events flowing end to end.

Spec §21: must run locally from a clean checkout with documented setup.

---

## Stretch / optional (only after everything above works)

Per spec §25 — do not start these before Slices 1–6 are done.

- ⬜ `GET /events/:id` + a detail view (spec's suggested API surface lists
  it; MVP dashboard can get away with the list view showing all fields
  inline instead).
- ⬜ Event correlation (spec §19 — repeated perimeter breaches, same site,
  short window → escalation).
- ⬜ Snapshot display (`snapshot_url` is already in the schema and rendered
  as a plain field in Slice 2; an actual image preview is stretch).
- ⬜ Operator false-positive feedback loop.
- ⬜ AI latency/cost metrics.
- ⬜ Basic authentication.
- ✅ YOLO/object detection in the video worker — done post-Slice-6:
  `worker.py` runs a real YOLOv5-nano (ONNX, `cv2.dnn`) forward pass on
  motion-triggering frames and reports `object_detected` events with real
  pixel-space bounding boxes, merged into the same ingestion pipeline. See
  `apps/video-worker/AGENTS.md`.
- ⬜ Zone/tripwire detection in the video worker.

---

## Non-goals (explicitly out of scope per spec §24)

Complex auth, RBAC, multi-tenancy, Kubernetes, microservices split, mobile
apps, advanced user management, full SOC case management, billing,
production-scale observability.
