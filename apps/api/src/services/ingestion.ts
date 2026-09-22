import WebSocket from "ws";
import { env } from "../config/env.js";
import { broadcastNewEvent } from "../lib/socket.js";
import { enqueueTriageJob } from "../queues/triageQueue.js";
import { parseIncomingEvent } from "../schemas/event.js";
import { persistEvent } from "./eventService.js";

const RECONNECT_DELAY_MS = 3000;

// The simulator no longer streams by default (see apps/simulator/stream.py)
// — it waits for one of these control commands so a demo doesn't burn
// through a triage provider's rate limit before anyone clicks a dev
// button. Tracked as the currently-open socket so REST routes can reach it.
let simulatorSocket: WebSocket | null = null;

// Mirrors the simulator's auto-stream state so other producers (the video
// worker, which polls this over REST — see GET /internal/simulator/status —
// since it has no persistent connection to push a command to) stay silent
// by default too, instead of only the simulator respecting the dev toggle.
let autoModeEnabled = false;

// The video worker doesn't emit events on a schedule the way the simulator
// does — it only has something to report when its motion detector actually
// fires, whenever that happens to be. So a "manual burst" for video can't
// be pushed like the simulator's (send N events now); instead it's a
// credit balance the worker draws down one at a time, via
// POST /internal/simulator/video-armed, as real detections occur.
let videoBurstCredits = 0;

/** Adds `count` manual-stream credits for the video worker to draw down as detections occur. */
export function addVideoBurstCredits(count: number): void {
  videoBurstCredits += count;
}

/** Called by the video worker before each report: true if it should post (auto mode, or a burst credit consumed). */
export function consumeVideoStreamPermit(): boolean {
  if (autoModeEnabled) return true;
  if (videoBurstCredits > 0) {
    videoBurstCredits -= 1;
    return true;
  }
  return false;
}

function sendSimulatorCommand(cmd: Record<string, unknown>): boolean {
  if (!simulatorSocket || simulatorSocket.readyState !== WebSocket.OPEN) return false;
  simulatorSocket.send(JSON.stringify(cmd));
  return true;
}

/** Turns the simulator's continuous auto-stream on or off. Returns false if the simulator isn't connected. */
export function setSimulatorAutoMode(enabled: boolean): boolean {
  const ok = sendSimulatorCommand({ cmd: enabled ? "auto_on" : "auto_off" });
  if (ok) autoModeEnabled = enabled;
  return ok;
}

/** Whether auto mode is currently on — other event producers (e.g. the video worker) poll this. */
export function isAutoModeEnabled(): boolean {
  return autoModeEnabled;
}

/** Requests a one-off burst of `count` events from the simulator. Returns false if the simulator isn't connected. */
export function triggerSimulatorBurst(count: number): boolean {
  return sendSimulatorCommand({ cmd: "manual_burst", count });
}

/**
 * Runs the shared validate -> persist -> enqueue -> broadcast pipeline for a
 * single already-parsed event payload. Used by both the WebSocket handler
 * and any REST producer (e.g. the video worker) that feeds the same
 * pipeline. Never throws — a bad or failing event is logged and dropped so
 * it can't take down ingestion or block the rest of the stream.
 */
export async function ingestEvent(json: unknown): Promise<void> {
  const parsed = parseIncomingEvent(json);
  if (!parsed.success || !parsed.data) {
    console.warn(`[ingestion] dropped invalid event: ${parsed.error}`);
    return;
  }

  try {
    const event = await persistEvent(parsed.data);
    if (!event) return; // duplicate, already logged by eventService

    console.log(`[ingestion] persisted ${event.type} (${event.eventId}) from ${event.source}`);
    broadcastNewEvent(event);
    await enqueueTriageJob(event.id);
  } catch (err) {
    // Persistence/queueing failure for one event must not stop ingestion of
    // the next one.
    console.error(`[ingestion] failed to process event ${parsed.data.event_id}:`, err);
  }
}

/**
 * Handles a single raw WebSocket message from the simulator: parses the raw
 * bytes as JSON, then delegates to the shared `ingestEvent` pipeline. Never
 * throws — a non-JSON message is logged and dropped.
 */
async function handleRawMessage(raw: WebSocket.RawData): Promise<void> {
  let json: unknown;
  try {
    json = JSON.parse(raw.toString());
  } catch {
    console.warn("[ingestion] dropped message: not valid JSON");
    return;
  }

  await ingestEvent(json);
}

/**
 * Connects to the simulator's WebSocket feed and keeps reconnecting if the
 * connection drops (simulator may start after the API, or restart).
 */
export function startIngestion(): void {
  connect();
}

function connect(): void {
  console.log(`[ingestion] connecting to simulator at ${env.SIMULATOR_WS_URL}`);
  const ws = new WebSocket(env.SIMULATOR_WS_URL);
  simulatorSocket = ws;

  ws.on("open", () => {
    console.log("[ingestion] connected to simulator");
  });

  ws.on("message", (data) => {
    void handleRawMessage(data);
  });

  ws.on("error", (err) => {
    console.error(`[ingestion] websocket error: ${err.message}`);
  });

  ws.on("close", () => {
    if (simulatorSocket === ws) simulatorSocket = null;
    console.warn(`[ingestion] disconnected from simulator, retrying in ${RECONNECT_DELAY_MS}ms`);
    setTimeout(connect, RECONNECT_DELAY_MS);
  });
}
