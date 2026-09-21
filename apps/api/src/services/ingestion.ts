import WebSocket from "ws";
import { env } from "../config/env.js";
import { broadcastNewEvent } from "../lib/socket.js";
import { enqueueTriageJob } from "../queues/triageQueue.js";
import { parseIncomingEvent } from "../schemas/event.js";
import { persistEvent } from "./eventService.js";

const RECONNECT_DELAY_MS = 3000;

/**
 * Handles a single raw message from the simulator (or, in future, any other
 * producer feeding the same pipeline). Never throws — a bad message is
 * logged and dropped so one malformed event can't take down the ingestion
 * connection or block the rest of the stream.
 */
async function handleRawMessage(raw: WebSocket.RawData): Promise<void> {
  let json: unknown;
  try {
    json = JSON.parse(raw.toString());
  } catch {
    console.warn("[ingestion] dropped message: not valid JSON");
    return;
  }

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
 * Connects to the simulator's WebSocket feed and keeps reconnecting if the
 * connection drops (simulator may start after the API, or restart).
 */
export function startIngestion(): void {
  connect();
}

function connect(): void {
  console.log(`[ingestion] connecting to simulator at ${env.SIMULATOR_WS_URL}`);
  const ws = new WebSocket(env.SIMULATOR_WS_URL);

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
    console.warn(`[ingestion] disconnected from simulator, retrying in ${RECONNECT_DELAY_MS}ms`);
    setTimeout(connect, RECONNECT_DELAY_MS);
  });
}
