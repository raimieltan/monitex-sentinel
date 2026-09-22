import { Router } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import { broadcastUpdatedEvent } from "../lib/socket.js";
import { acknowledgeEvent, listEvents, resolveEvent } from "../services/eventService.js";
import { ingestEvent } from "../services/ingestion.js";

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
