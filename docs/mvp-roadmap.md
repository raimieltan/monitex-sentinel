# Project Sentinel — MVP Roadmap (Vertical Slices)

Living document. Update checkboxes and status as work lands — this is not a
one-shot plan, keep it in sync with reality.

**Spec:** `docs/monitex-sentinel.md`
**Architecture / conventions:** `AGENTS.md` (repo root)

Each slice below is a vertically-complete piece of the system: it produces
something demoable end-to-end, not just one layer. Slices are ordered by
dependency, not importance — do them roughly in order.

Status legend: ✅ done · 🚧 in progress · ⬜ not started

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

## Slice 2 — Web dashboard shell: live event list ⬜

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

## Slice 3 — Operator actions (acknowledge / resolve) ⬜

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

## Slice 4 — Critical alerting prominence ⬜

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

## Slice 5 — Video worker (`apps/video-worker`) ⬜

`apps/video-worker/worker.py` is currently a 0-line stub; venv and
`requirements.txt` are already set up. Depends on Slice 1
(`POST /internal/events`).

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

## Slice 6 — Local run polish & docs ⬜

Spec §21: must run locally from a clean checkout with documented setup.

- Update root `README.md` with the video-worker startup step once Slice 5
  lands (currently only simulator + api + web are documented).
- Add `apps/web/.env.example` for `NEXT_PUBLIC_API_URL` if introduced in
  Slice 2.
- Sanity pass: clean `git clone`, follow the README verbatim, confirm all
  four processes (docker-compose, api, simulator, web [+ video-worker])
  come up and events flow end to end.

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
- ⬜ YOLO/object tracking, zone/tripwire detection in the video worker.

---

## Non-goals (explicitly out of scope per spec §24)

Complex auth, RBAC, multi-tenancy, Kubernetes, microservices split, mobile
apps, advanced user management, full SOC case management, billing,
production-scale observability.
