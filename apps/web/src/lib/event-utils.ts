import type { CameraReference, DetectionOverlay, SentinelEvent, Severity } from "@/types/event";

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function severityRank(event: SentinelEvent): number {
  // Untriaged events (severity still null) sort after everything triaged.
  return event.severity ? SEVERITY_RANK[event.severity] : 3;
}

/** Unresolved before resolved, then severity descending, then newest first. */
export function sortEvents(events: SentinelEvent[]): SentinelEvent[] {
  return [...events].sort((a, b) => {
    const aResolved = a.operatorStatus === "RESOLVED";
    const bResolved = b.operatorStatus === "RESOLVED";
    if (aResolved !== bResolved) return aResolved ? 1 : -1;

    const rankDiff = severityRank(a) - severityRank(b);
    if (rankDiff !== 0) return rankDiff;

    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
}

export interface KpiCounts {
  critical: number;
  warning: number;
  info: number;
  total24h: number;
}

/** Critical/warning/info count active (unresolved) events; total24h counts everything from the last 24h. */
export function computeKpiCounts(events: SentinelEvent[]): KpiCounts {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  let critical = 0;
  let warning = 0;
  let info = 0;
  let total24h = 0;

  for (const event of events) {
    if (event.operatorStatus !== "RESOLVED") {
      if (event.severity === "critical") critical += 1;
      else if (event.severity === "warning") warning += 1;
      else if (event.severity === "info") info += 1;
    }
    if (now - new Date(event.timestamp).getTime() <= dayMs) total24h += 1;
  }

  return { critical, warning, info, total24h };
}

/** Newest unresolved critical > newest unresolved warning > newest unresolved > newest overall. */
export function selectDefaultEvent(events: SentinelEvent[]): SentinelEvent | null {
  if (events.length === 0) return null;
  const active = events.filter((e) => e.operatorStatus !== "RESOLVED");

  const byNewest = (list: SentinelEvent[]) =>
    [...list].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0] ?? null;

  const critical = byNewest(active.filter((e) => e.severity === "critical"));
  if (critical) return critical;

  const warning = byNewest(active.filter((e) => e.severity === "warning"));
  if (warning) return warning;

  const anyActive = byNewest(active);
  if (anyActive) return anyActive;

  return byNewest(events);
}

export function formatEventType(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function formatZone(zone: string): string {
  return zone
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function formatSite(siteId: string): string {
  return siteId.replace(/^site-/, "Site ");
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour12: false });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`;
}

/**
 * The pipeline has no camera model yet (video-worker is unbuilt), so the
 * camera shown per event is deterministically derived from site + zone —
 * the same zone always resolves to the same camera identity.
 */
export function cameraForEvent(event: SentinelEvent): CameraReference | null {
  if (event.source !== "camera") return null;
  const zoneLabel = formatZone(event.zone);
  const camNumber = (Math.abs(hashString(event.siteId + event.zone)) % 4) + 1;
  return {
    id: `${event.siteId}:${event.zone}`,
    name: `${zoneLabel} Cam ${String(camNumber).padStart(2, "0")}`,
    zone: event.zone,
  };
}

export interface ParsedDetections {
  overlays: DetectionOverlay[];
  sourceWidth: number;
  sourceHeight: number;
}

/**
 * Reads real detection boxes out of an event's loosely-typed metadata
 * (produced by apps/video-worker's object detector). Metadata is untrusted
 * input — anything malformed or missing is treated as "no detections",
 * never thrown.
 */
export function parseDetections(event: SentinelEvent | null): ParsedDetections | null {
  const metadata = event?.metadata;
  if (!metadata || typeof metadata !== "object") return null;

  const sourceWidth = metadata.sourceWidth;
  const sourceHeight = metadata.sourceHeight;
  const detections = metadata.detections;
  if (typeof sourceWidth !== "number" || typeof sourceHeight !== "number" || !Array.isArray(detections)) {
    return null;
  }

  const overlays: DetectionOverlay[] = [];
  detections.forEach((detection, index) => {
    if (!detection || typeof detection !== "object") return;
    const { label, confidence, bbox } = detection as Record<string, unknown>;
    if (typeof label !== "string" || typeof confidence !== "number" || !bbox || typeof bbox !== "object") return;
    const { x, y, width, height } = bbox as Record<string, unknown>;
    if (typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number") return;

    overlays.push({ id: `${event?.id ?? "event"}-${index}`, label, confidence, bbox: { x, y, width, height } });
  });

  return { overlays, sourceWidth, sourceHeight };
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
