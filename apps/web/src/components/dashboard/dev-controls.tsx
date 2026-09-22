"use client";

import { useState } from "react";
import { setSimulatorAutoMode, streamManualEvents, streamManualVideoEvents } from "@/lib/api";

/**
 * Dev-only controls for the simulator and video worker, both of which
 * stream nothing until told to — lets a demo fire a bounded burst of
 * events on demand instead of risking a triage provider's rate limit
 * getting hit before anyone's ready.
 */
export function DevControls() {
  const [autoMode, setAutoMode] = useState(false);
  const [pending, setPending] = useState<"stream" | "video-stream" | "auto" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleStream() {
    setPending("stream");
    setError(null);
    try {
      await streamManualEvents(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to stream events");
    } finally {
      setPending(null);
    }
  }

  async function handleStreamVideo() {
    setPending("video-stream");
    setError(null);
    try {
      await streamManualVideoEvents(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to stream CCTV events");
    } finally {
      setPending(null);
    }
  }

  async function handleToggleAuto() {
    const next = !autoMode;
    setPending("auto");
    setError(null);
    try {
      await setSimulatorAutoMode(next);
      setAutoMode(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to toggle auto mode");
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm">
      <span className="font-semibold uppercase tracking-wide text-amber-700">Dev</span>
      <button
        type="button"
        disabled={busy}
        onClick={handleStream}
        className="rounded-md border border-amber-300 bg-white px-3 py-1 font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending === "stream" ? "Streaming..." : "Stream 5 Events"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={handleStreamVideo}
        title="Grants the video worker 5 credits, posted as its motion detector actually fires — not instant"
        className="rounded-md border border-amber-300 bg-white px-3 py-1 font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending === "video-stream" ? "Arming..." : "Stream 5 CCTV Events"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={handleToggleAuto}
        className={`rounded-md border px-3 py-1 font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
          autoMode ? "border-green-300 bg-green-100 text-green-800 hover:bg-green-200" : "border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
        }`}
      >
        {pending === "auto" ? "Switching..." : autoMode ? "Auto Mode: ON" : "Auto Mode: OFF"}
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}
