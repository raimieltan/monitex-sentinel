"use client";

import { useEffect, useState } from "react";
import type { CameraReference, CameraStreamStatus } from "@/types/event";

const CONNECT_DELAY_MS = 700;

/**
 * There's no real camera hardware/streaming protocol to connect to — this
 * simulates the connection lifecycle (CONNECTING -> LIVE, RECONNECTING on
 * demand) over the real looping video feed. It does not simulate detection
 * boxes; those come from apps/video-worker's real detector via event
 * metadata (see lib/event-utils.ts's parseDetections).
 */
export function useSimulatedCameraFeed(camera: CameraReference | null, reconnectKey: number) {
  const [status, setStatus] = useState<CameraStreamStatus>("CONNECTING");

  useEffect(() => {
    // Resets the connection state machine whenever the camera identity (or a
    // manual reconnect) changes — this drives a setTimeout below, not a pure
    // derivation of props, so it belongs in an effect.
    if (!camera) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("UNAVAILABLE");
      return;
    }
    setStatus((prev) => (prev === "LIVE" ? "RECONNECTING" : "CONNECTING"));
    const timeout = setTimeout(() => setStatus("LIVE"), CONNECT_DELAY_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera?.id, reconnectKey]);

  return { status };
}
