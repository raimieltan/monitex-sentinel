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

// Dev-only controls for the simulator, which doesn't stream anything until
// told to — avoids burning through a triage provider's rate limit before a
// demo actually starts.
export async function setSimulatorAutoMode(enabled: boolean): Promise<void> {
  const res = await fetch(`${API_URL}/internal/simulator/auto-mode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`POST /internal/simulator/auto-mode failed: ${res.status}`);
}

export async function streamManualEvents(count = 5): Promise<void> {
  const res = await fetch(`${API_URL}/internal/simulator/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count }),
  });
  if (!res.ok) throw new Error(`POST /internal/simulator/stream failed: ${res.status}`);
}

// Grants the video worker `count` manual-stream credits — it can't be sent
// events on demand like the simulator, so it draws these down one at a time
// as its motion detector actually fires against the looping video.
export async function streamManualVideoEvents(count = 5): Promise<void> {
  const res = await fetch(`${API_URL}/internal/simulator/video-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count }),
  });
  if (!res.ok) throw new Error(`POST /internal/simulator/video-stream failed: ${res.status}`);
}
