import type { OperatorStatus } from "@/types/event";

const DOT_STYLES: Record<OperatorStatus, string> = {
  OPEN: "bg-red-500",
  ACKNOWLEDGED: "bg-slate-400",
  RESOLVED: "bg-green-500",
};

const LABELS: Record<OperatorStatus, string> = {
  OPEN: "New",
  ACKNOWLEDGED: "Acknowledged",
  RESOLVED: "Resolved",
};

export function StatusBadge({ status }: { status: OperatorStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm ${status === "RESOLVED" ? "text-slate-400" : "text-slate-600"}`}
    >
      <span className={`h-2 w-2 rounded-full ${DOT_STYLES[status]}`} aria-hidden />
      {LABELS[status]}
    </span>
  );
}
