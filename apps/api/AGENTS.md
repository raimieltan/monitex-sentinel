# apps/api

Express + TypeScript API. See the root `AGENTS.md` for the overall pipeline.

## Layout

```
src/
  index.ts              Bootstraps Express + HTTP server + Socket.IO,
                         starts ingestion and the triage worker.
  config/env.ts          All env vars read from here, nowhere else.
  lib/prisma.ts           Shared Prisma client (Prisma 7 needs a driver
                          adapter — @prisma/adapter-pg — not a bare URL).
  lib/redis.ts            Shared ioredis connection for BullMQ.
  lib/socket.ts            Socket.IO singleton + broadcast helpers
                          (event:new, event:updated).
  schemas/event.ts         Zod schema + normalization for incoming events.
  services/eventService.ts DB reads/writes for events, ack/resolve.
  services/ingestion.ts    WebSocket client -> simulator; validate,
                          persist, enqueue, broadcast. Never throws out of
                          the message handler — logs and drops bad events.
  services/triageProvider.ts  TriageProvider interface. OpenAITriageProvider
                          is used if OPENAI_API_KEY is set, otherwise
                          StubTriageProvider (deterministic, rule-based) so
                          the pipeline runs without a real key.
  queues/triageQueue.ts    BullMQ queue definition + defaultJobOptions
                          (3 attempts, exponential backoff).
  workers/triageWorker.ts  BullMQ worker: runs triage, updates the DB,
                          broadcasts event:updated. On exhausted retries,
                          marks the event triageStatus=FAILED and broadcasts
                          — ingestion is unaffected either way.
  routes/health.ts, routes/events.ts
```

## Things to know

- The ingestion WebSocket client auto-reconnects to the simulator (3s
  backoff) — it doesn't assume the simulator is already up when the API
  starts.
- Triage runs in a BullMQ worker in the same process as the API server, not
  a separate service — deliberate, to keep this small for a take-home. If
  this needs to scale, split `startTriageWorker()` out into its own
  entrypoint/process; the queue/worker boundary is already there.
- `triageWithTimeout` races the AI call against `TRIAGE_TIMEOUT_MS` so a
  hanging call fails fast and retries instead of blocking a worker slot
  indefinitely.
- Duplicate `event_id`s (e.g. simulator redelivery on reconnect) are caught
  via the unique constraint and silently dropped in `persistEvent`.
