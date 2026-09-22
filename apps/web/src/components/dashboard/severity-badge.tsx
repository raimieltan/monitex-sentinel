import type { Severity, TriageStatus } from "@/types/event";

interface SeverityBadgeProps {
  severity?: Severity | null;
  triageStatus?: TriageStatus;
}

const STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  warning: "bg-amber-100 text-amber-800",
  info: "bg-slate-200 text-slate-700",
  pending: "bg-slate-100 text-slate-500",
  failed: "bg-slate-100 text-slate-400",
};

const LABELS: Record<string, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
  pending: "Pending",
  failed: "Unavailable",
};

export function SeverityBadge({ severity, triageStatus }: SeverityBadgeProps) {
  let key: keyof typeof LABELS;
  if (triageStatus === "FAILED") key = "failed";
  else if (!severity) key = "pending";
  else key = severity;

  return (
    <span className={`inline-block rounded px-2.5 py-1 text-xs font-semibold ${STYLES[key]}`}>{LABELS[key]}</span>
  );
}
