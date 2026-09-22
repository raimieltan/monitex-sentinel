"use client";

import { useEffect, useState } from "react";
import { fetchEvents } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { SentinelEvent } from "@/types/event";

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function severityRank(event: SentinelEvent): number {
  // Untriaged events (severity still null) sort after everything triaged,
  // ahead of nothing — they just haven't been assessed yet.
  return event.severity ? (SEVERITY_RANK[event.severity] ?? 3) : 3;
}

function sortEvents(events: SentinelEvent[]): SentinelEvent[] {
  return [...events].sort((a, b) => {
    const rankDiff = severityRank(a) - severityRank(b);
    if (rankDiff !== 0) return rankDiff;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
}

/**
 * Loads the initial event list from `GET /events` (source of truth, survives
 * refresh/disconnect) then keeps it live via `event:new` / `event:updated`
 * socket broadcasts.
 */
export function useEvents() {
  const [events, setEvents] = useState<SentinelEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchEvents()
      .then((initial) => {
        if (!cancelled) setEvents(sortEvents(initial));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "failed to load events");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const socket = getSocket();

    const onNew = (event: SentinelEvent) => {
      setEvents((prev) => sortEvents([event, ...prev.filter((e) => e.id !== event.id)]));
    };

    const onUpdated = (event: SentinelEvent) => {
      setEvents((prev) => sortEvents(prev.map((e) => (e.id === event.id ? event : e))));
    };

    socket.on("event:new", onNew);
    socket.on("event:updated", onUpdated);

    return () => {
      cancelled = true;
      socket.off("event:new", onNew);
      socket.off("event:updated", onUpdated);
    };
  }, []);

  return { events, loading, error };
}
