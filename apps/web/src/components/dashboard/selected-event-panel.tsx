import { EventActionButtons } from "@/components/dashboard/event-action-buttons";
import { SeverityBadge } from "@/components/dashboard/severity-badge";
import { formatDateTime, formatEventType, formatSite, formatZone } from "@/lib/event-utils";
import type { SentinelEvent } from "@/types/event";

interface SelectedEventPanelProps {
  event: SentinelEvent | null;
  onAcknowledge: (eventId: string) => Promise<void>;
  onResolve: (eventId: string) => Promise<void>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{children}</span>
    </div>
  );
}

export function SelectedEventPanel({ event, onAcknowledge, onResolve }: SelectedEventPanelProps) {
  if (!event) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
        Select an alarm to inspect its details.
      </section>
    );
  }

  const isTriaging = event.triageStatus === "PENDING" || event.triageStatus === "IN_PROGRESS";
  const isFailed = event.triageStatus === "FAILED";

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-base font-bold text-slate-900">Selected Event</h2>

      <div className="flex flex-col gap-2">
        <Row label="Time">{formatDateTime(event.timestamp)}</Row>
        <Row label="Site">{formatSite(event.siteId)}</Row>
        <Row label="Event">{formatEventType(event.type)}</Row>
        <Row label="Zone">{formatZone(event.zone)}</Row>
        <Row label="Source">{event.source}</Row>
        {event.confidence !== null && <Row label="Confidence">{Math.round(event.confidence * 100)}%</Row>}
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Severity</span>
          <SeverityBadge severity={event.severity} triageStatus={event.triageStatus} />
        </div>
      </div>

      <div className="border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-900">AI Summary</h3>
        {isTriaging ? (
          <p className="mt-1 text-sm italic text-slate-400">Triage in progress...</p>
        ) : isFailed ? (
          <p className="mt-1 text-sm text-slate-500">AI triage unavailable. Raw event details remain available.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-600">{event.summary ?? "No summary available."}</p>
            {event.threatAssessment && <p className="mt-1 text-sm text-slate-500">{event.threatAssessment}</p>}
            {event.recommendedAction && (
              <div className="mt-3">
                <h4 className="text-sm font-semibold text-slate-900">Recommended action</h4>
                <p className="mt-1 text-sm text-slate-600">{event.recommendedAction}</p>
              </div>
            )}
          </>
        )}
      </div>

      <EventActionButtons
        status={event.operatorStatus}
        onAcknowledge={() => onAcknowledge(event.id)}
        onResolve={() => onResolve(event.id)}
      />
    </section>
  );
}
