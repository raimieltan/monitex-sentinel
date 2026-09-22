"use client";

import { useEffect, useState } from "react";
import { fetchEvents } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { sortEvents } from "@/lib/event-utils";
import type { ConnectionStatus, SentinelEvent } from "@/types/event";

/**
 * Loads the initial event list from `GET /events` (source of truth, survives
 * refresh/disconnect) then keeps it live via `event:new` / `event:updated`
 * socket broadcasts, and tracks realtime connection health.
 */
export function useAlarmEvents() {
  const [events, setEvents] = useState<SentinelEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("RECONNECTING");

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

    const onConnect = () => setConnectionStatus("CONNECTED");
    const onDisconnect = () => setConnectionStatus("DISCONNECTED");
    const onReconnectAttempt = () => setConnectionStatus("RECONNECTING");

    socket.on("event:new", onNew);
    socket.on("event:updated", onUpdated);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.io.on("reconnect_attempt", onReconnectAttempt);

    // Read the socket's already-established connection state on mount, rather
    // than assuming "connecting" until the next `connect` event fires.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (socket.connected) setConnectionStatus("CONNECTED");

    return () => {
      cancelled = true;
      socket.off("event:new", onNew);
      socket.off("event:updated", onUpdated);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
    };
  }, []);

  return { events, loading, error, connectionStatus };
}
