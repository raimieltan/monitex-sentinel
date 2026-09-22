import type { SentinelEvent } from "@/types/event";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-red-500 bg-red-50 dark:bg-red-950/40",
  high: "border-orange-400 bg-orange-50 dark:bg-orange-950/30",
  medium: "border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20",
  low: "border-zinc-300 bg-white dark:bg-zinc-900 dark:border-zinc-700",
};

const SEVERITY_BADGE_STYLES: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-yellow-500 text-black",
  low: "bg-zinc-400 text-white",
};

function formatType(type: string): string {
  return type.replace(/_/g, " ");
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function EventCard({ event }: { event: SentinelEvent }) {
  const isTriaging = event.triageStatus === "PENDING" || event.triageStatus === "IN_PROGRESS";
  const cardStyle = event.severity ? SEVERITY_STYLES[event.severity] : "border-zinc-200 bg-white dark:bg-zinc-900 dark:border-zinc-800";

  return (
    <div className={`rounded-lg border p-4 ${cardStyle}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold capitalize text-zinc-900 dark:text-zinc-50">{formatType(event.type)}</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {event.siteId} · {event.zone} · via {event.source}
            {event.confidence !== null && ` · ${Math.round(event.confidence * 100)}% confidence`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {event.severity ? (
            <span className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${SEVERITY_BADGE_STYLES[event.severity]}`}>
              {event.severity}
            </span>
          ) : (
            <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              triaging…
            </span>
          )}
          <span className="text-xs text-zinc-400">{formatTimestamp(event.timestamp)}</span>
        </div>
      </div>

      {isTriaging ? (
        <p className="mt-3 text-sm italic text-zinc-500 dark:text-zinc-400">AI triage in progress…</p>
      ) : event.triageStatus === "FAILED" ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">Triage failed — showing raw event only.</p>
      ) : (
        <div className="mt-3 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
          {event.summary && <p className="font-medium">{event.summary}</p>}
          {event.threatAssessment && <p>{event.threatAssessment}</p>}
          {event.recommendedAction && (
            <p className="text-zinc-500 dark:text-zinc-400">
              <span className="font-medium">Recommended:</span> {event.recommendedAction}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
        <span>Operator: {event.operatorStatus}</span>
      </div>
    </div>
  );
}
