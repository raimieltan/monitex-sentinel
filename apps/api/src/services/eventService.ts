import { Prisma } from "../../generated/prisma/client.js";
import type { Event } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { normalizeIncomingEvent, type IncomingEvent } from "../schemas/event.js";

export type EventRecord = Event;

export const TRIAGE_STATUS = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETE: "COMPLETE",
  FAILED: "FAILED",
} as const;

export const OPERATOR_STATUS = {
  OPEN: "OPEN",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  RESOLVED: "RESOLVED",
} as const;

/**
 * Persists a validated event. Returns `null` (instead of throwing) if the
 * event is a duplicate of one we've already ingested (same `eventId`) — the
 * simulator/worker may redeliver on reconnect, and duplicates should be
 * silently dropped rather than crashing ingestion.
 */
export async function persistEvent(event: IncomingEvent): Promise<EventRecord | null> {
  const data = normalizeIncomingEvent(event);
  try {
    return await prisma.event.create({ data: { ...data, metadata: data.metadata as Prisma.InputJsonValue } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      console.warn(`[eventService] duplicate event_id ignored: ${data.eventId}`);
      return null;
    }
    throw err;
  }
}

export function listEvents(limit = 200): Promise<EventRecord[]> {
  return prisma.event.findMany({
    orderBy: { timestamp: "desc" },
    take: limit,
  });
}

export function getEventById(id: string): Promise<EventRecord | null> {
  return prisma.event.findUnique({ where: { id } });
}

export function acknowledgeEvent(id: string): Promise<EventRecord> {
  return prisma.event.update({
    where: { id },
    data: { operatorStatus: OPERATOR_STATUS.ACKNOWLEDGED, acknowledgedAt: new Date() },
  });
}

export function resolveEvent(id: string): Promise<EventRecord> {
  return prisma.event.update({
    where: { id },
    data: { operatorStatus: OPERATOR_STATUS.RESOLVED, resolvedAt: new Date() },
  });
}
