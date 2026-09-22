"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import type { CameraStreamStatus } from "@/types/event";

interface CameraStreamViewerProps {
  status: CameraStreamStatus;
  eventSnapshotUrl?: string | null;
}

export interface CameraStreamViewerHandle {
  captureSnapshot: () => string | null;
}

/** Renders the underlying feed. The exact source (looping sample clip today, real HLS/MJPEG/WebRTC later) stays hidden here. */
export const CameraStreamViewer = forwardRef<CameraStreamViewerHandle, CameraStreamViewerProps>(function CameraStreamViewer(
  { status, eventSnapshotUrl },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useImperativeHandle(ref, () => ({
    captureSnapshot: () => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return null;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0);
      return canvas.toDataURL("image/png");
    },
  }));

  const showVideo = status === "CONNECTING" || status === "LIVE" || status === "BUFFERING" || status === "RECONNECTING";
  const showSnapshotFallback = (status === "OFFLINE" || status === "UNAVAILABLE") && !!eventSnapshotUrl;
  const showBlankFallback = (status === "OFFLINE" || status === "UNAVAILABLE") && !eventSnapshotUrl;

  if (showSnapshotFallback) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={eventSnapshotUrl ?? undefined} alt="Last known snapshot from this camera" className="h-full w-full object-cover" />
    );
  }

  if (showBlankFallback) {
    return <div className="h-full w-full bg-slate-950" />;
  }

  return (
    <video
      ref={videoRef}
      src="/camera/sample.mp4"
      className={`h-full w-full object-cover transition-opacity ${showVideo && status === "LIVE" ? "opacity-100" : "opacity-60"}`}
      autoPlay
      loop
      muted
      playsInline
      // `loop` alone can silently fail to restart after a tab was
      // backgrounded/throttled — force the restart as a fallback.
      onEnded={(e) => {
        const video = e.currentTarget;
        video.currentTime = 0;
        void video.play();
      }}
      aria-label="Live camera feed"
    />
  );
});
