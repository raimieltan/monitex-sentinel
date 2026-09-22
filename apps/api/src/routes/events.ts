import { Router } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import { broadcastUpdatedEvent } from "../lib/socket.js";
import { acknowledgeEvent, listEvents, resolveEvent } from "../services/eventService.js";
import {
  addVideoBurstCredits,
  consumeVideoStreamPermit,
  ingestEvent,
  isAutoModeEnabled,
  setSimulatorAutoMode,
  triggerSimulatorBurst,
} from "../services/ingestion.js";

export const eventsRouter = Router();

eventsRouter.get("/events", async (_req, res) => {
  const events = await listEvents();
  res.json(events);
});

// Shared entry point into the validate -> persist -> enqueue -> broadcast
// pipeline for producers other than the simulator's WebSocket feed (e.g. the
// video worker). Responds immediately — triage happens asynchronously in the
// worker, and per spec, malformed events are logged and dropped rather than
// surfaced as client errors.
eventsRouter.post("/internal/events", (req, res) => {
  void ingestEvent(req.body);
  res.status(202).json({ status: "accepted" });
});

// Dev-only controls for the simulator, which no longer streams by default
// (see apps/simulator/stream.py) — used by the dashboard's dev buttons so a
// demo doesn't burn through a triage provider's rate limit unattended.
//
// The video worker has no persistent connection to push a command to, so
// it polls this to decide whether to post events at all — same "silent
// until armed" behavior as the simulator, driven by the same toggle.
eventsRouter.get("/internal/simulator/status", (_req, res) => {
  res.json({ autoMode: isAutoModeEnabled() });
});

eventsRouter.post("/internal/simulator/auto-mode", (req, res) => {
  const enabled = Boolean(req.body?.enabled);
  if (!setSimulatorAutoMode(enabled)) {
    res.status(503).json({ error: "simulator not connected" });
    return;
  }
  res.json({ autoMode: enabled });
});

eventsRouter.post("/internal/simulator/stream", (req, res) => {
  const count = Math.min(Math.max(Number(req.body?.count) || 5, 1), 20);
  if (!triggerSimulatorBurst(count)) {
    res.status(503).json({ error: "simulator not connected" });
    return;
  }
  res.status(202).json({ status: "accepted", count });
});

// Grants the video worker `count` manual-stream credits, drawn down one at
// a time as its motion detector actually fires (see consumeVideoStreamPermit
// in services/ingestion.ts) — it can't be sent N events on demand the way
// the simulator can, since it only has something to report when motion is
// detected in the looping video.
eventsRouter.post("/internal/simulator/video-stream", (req, res) => {
  const count = Math.min(Math.max(Number(req.body?.count) || 5, 1), 20);
  addVideoBurstCredits(count);
  res.status(202).json({ status: "accepted", count });
});

// Polled by the video worker immediately before each report to decide
// whether it's allowed to post (see apps/video-worker/worker.py).
eventsRouter.post("/internal/simulator/video-armed", (_req, res) => {
  res.json({ armed: consumeVideoStreamPermit() });
});

eventsRouter.patch("/events/:id/acknowledge", async (req, res) => {
  try {
    const event = await acknowledgeEvent(req.params.id!);
    broadcastUpdatedEvent(event);
    res.json(event);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      res.status(404).json({ error: "event not found" });
      return;
    }
    throw err;
  }
});

eventsRouter.patch("/events/:id/resolve", async (req, res) => {
  try {
    const event = await resolveEvent(req.params.id!);
    broadcastUpdatedEvent(event);
    res.json(event);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      res.status(404).json({ error: "event not found" });
      return;
    }
    throw err;
  }
});
