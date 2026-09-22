/** Mirrors the Prisma `Event` model in `apps/api/prisma/schema.prisma`. */
export interface SentinelEvent {
  id: string;
  eventId: string;
  siteId: string;
  zone: string;
  type: string;
  source: string;
  confidence: number | null;
  timestamp: string;
  snapshotUrl: string | null;
  metadata: Record<string, unknown> | null;

  triageStatus: "PENDING" | "IN_PROGRESS" | "COMPLETE" | "FAILED";
  severity: "info" | "warning" | "critical" | null;
  threatAssessment: string | null;
  summary: string | null;
  recommendedAction: string | null;

  operatorStatus: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  acknowledgedAt: string | null;
  resolvedAt: string | null;

  createdAt: string;
  updatedAt: string;
}
