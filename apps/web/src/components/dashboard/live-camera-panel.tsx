"use client";

import { useRef, useState } from "react";
import { CameraControls } from "@/components/dashboard/camera-controls";
import { CameraOverlayLayer } from "@/components/dashboard/camera-overlay-layer";
import { CameraStreamViewer, type CameraStreamViewerHandle } from "@/components/dashboard/camera-stream-viewer";
import { useSimulatedCameraFeed } from "@/hooks/useSimulatedCameraFeed";
import { formatDateTime, parseDetections } from "@/lib/event-utils";
import type { CameraReference, SentinelEvent } from "@/types/event";

// Matches apps/web/public/camera/sample.mp4's native resolution — used when
// an event carries no detection metadata (e.g. a plain motion_detected
// event), so the overlay layer still has a coordinate space to size against.
const DEFAULT_SOURCE_WIDTH = 1440;
const DEFAULT_SOURCE_HEIGHT = 1080;

const STATUS_OVERLAY_TEXT: Record<string, string> = {
  CONNECTING: "Connecting to camera...",
  BUFFERING: "Buffering...",
  RECONNECTING: "Reconnecting...",
  OFFLINE: "Camera offline",
  UNAVAILABLE: "Live stream unavailable",
};

interface LiveCameraPanelProps {
  event: SentinelEvent | null;
  camera: CameraReference | null;
}

export function LiveCameraPanel({ event, camera }: LiveCameraPanelProps) {
  const [reconnectKey, setReconnectKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<CameraStreamViewerHandle>(null);

  const { status } = useSimulatedCameraFeed(camera, reconnectKey);
  const detections = parseDetections(event);
  const overlays = detections?.overlays ?? [];
  const sourceWidth = detections?.sourceWidth ?? DEFAULT_SOURCE_WIDTH;
  const sourceHeight = detections?.sourceHeight ?? DEFAULT_SOURCE_HEIGHT;

  function handleReconnect() {
    setReconnectKey((k) => k + 1);
  }

  function handleFullscreen() {
    containerRef.current?.requestFullscreen?.();
  }

  function handleSnapshot() {
    const dataUrl = streamRef.current?.captureSnapshot();
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${camera?.name ?? "camera"}-snapshot.png`;
    link.click();
  }

  return (
    <section className="flex flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-bold text-slate-900">Live Camera</h2>
        <span className="text-sm text-slate-500">{camera?.name ?? "—"}</span>
      </div>

      {!event ? (
        <div className="flex aspect-[4/3] items-center justify-center bg-slate-50 px-6 text-center text-sm text-slate-400">
          Select an alarm to view its related camera feed.
        </div>
      ) : !camera ? (
        <div className="flex aspect-[4/3] items-center justify-center bg-slate-50 px-6 text-center text-sm text-slate-400">
          No camera is associated with this event.
        </div>
      ) : (
        <div ref={containerRef} className="relative aspect-[4/3] overflow-hidden bg-black">
          <CameraStreamViewer ref={streamRef} status={status} eventSnapshotUrl={event.snapshotUrl} />

          {status === "LIVE" && <CameraOverlayLayer detections={overlays} sourceWidth={sourceWidth} sourceHeight={sourceHeight} />}

          {STATUS_OVERLAY_TEXT[status] && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-medium text-white">
              {STATUS_OVERLAY_TEXT[status]}
              {status === "UNAVAILABLE" && event.snapshotUrl && <span className="ml-1 font-normal">— showing event snapshot</span>}
            </div>
          )}

          {status === "LIVE" && (
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-xs font-semibold text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
              LIVE
            </span>
          )}

          <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 font-mono text-xs text-white">
            {formatDateTime(event.timestamp)}
          </span>
        </div>
      )}

      <CameraControls
        canReconnect={!!camera && status !== "CONNECTING"}
        canSnapshot={!!camera && status === "LIVE"}
        canFullscreen={!!camera}
        onReconnect={handleReconnect}
        onSnapshot={handleSnapshot}
        onFullscreen={handleFullscreen}
      />
    </section>
  );
}
