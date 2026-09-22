import type { SentinelEvent } from "@/types/event";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function fetchEvents(): Promise<SentinelEvent[]> {
  const res = await fetch(`${API_URL}/events`);
  if (!res.ok) throw new Error(`GET /events failed: ${res.status}`);
  return res.json();
}

export async function acknowledgeEvent(id: string): Promise<SentinelEvent> {
  const res = await fetch(`${API_URL}/events/${id}/acknowledge`, { method: "PATCH" });
  if (!res.ok) throw new Error(`PATCH /events/${id}/acknowledge failed: ${res.status}`);
  return res.json();
}

export async function resolveEvent(id: string): Promise<SentinelEvent> {
  const res = await fetch(`${API_URL}/events/${id}/resolve`, { method: "PATCH" });
  if (!res.ok) throw new Error(`PATCH /events/${id}/resolve failed: ${res.status}`);
  return res.json();
}
