import { z } from "zod";

export const EVENT_TYPES = [
  "motion_detected",
  "perimeter_breach",
  "door_forced",
  "glass_break",
  "smoke_detected",
  "fire_alarm",
  "object_detected",
  "loitering",
  "camera_offline",
  "sensor_fault",
  "panic_button",
] as const;

/**
 * Shape of a raw event as it arrives from the simulator (or, eventually, the
 * video worker). The feed is explicitly unreliable — fields can be missing
 * or confidence can be low/absent — so almost everything besides the
 * identifying fields is optional and gets a safe fallback in
 * `normalizeIncomingEvent` rather than failing validation outright.
 */
export const incomingEventSchema = z.object({
  event_id: z.string().min(1),
  site_id: z.string().min(1),
  zone: z.string().min(1),
  type: z.enum(EVENT_TYPES),
  source: z.enum(["camera", "sensor"]),
  confidence: z.number().min(0).max(1).nullable().optional(),
  timestamp: z.string().min(1).optional(),
  snapshot_url: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type IncomingEvent = z.infer<typeof incomingEventSchema>;

export interface ParseResult {
  success: boolean;
  data?: IncomingEvent;
  error?: string;
}

/** Validates a raw JSON payload without throwing. */
export function parseIncomingEvent(raw: unknown): ParseResult {
  const result = incomingEventSchema.safeParse(raw);
  if (!result.success) {
    return { success: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { success: true, data: result.data };
}

/** Normalized, DB-ready fields derived from a validated incoming event. */
export function normalizeIncomingEvent(event: IncomingEvent) {
  const timestamp = new Date(event.timestamp ?? Date.now());

  return {
    eventId: event.event_id,
    siteId: event.site_id,
    zone: event.zone,
    type: event.type,
    source: event.source,
    confidence: event.confidence ?? null,
    // Fall back to "now" if the timestamp was missing or unparseable.
    timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
    snapshotUrl: event.snapshot_url ?? null,
    metadata: event.metadata ?? {},
  };
}
