import { LiveAlarmsTable } from "@/components/dashboard/live-alarms-table";
import { SiteFilter } from "@/components/dashboard/site-filter";
import type { SentinelEvent } from "@/types/event";

interface LiveAlarmsPanelProps {
  events: SentinelEvent[];
  sites: Array<{ id: string; name: string }>;
  selectedEventId: string | null;
  selectedSiteId: string | "ALL";
  loading?: boolean;
  onSiteChange: (siteId: string | "ALL") => void;
  onSelectEvent: (eventId: string) => void;
  onAcknowledge: (eventId: string) => Promise<void>;
  onResolve: (eventId: string) => Promise<void>;
}

export function LiveAlarmsPanel({
  events,
  sites,
  selectedEventId,
  selectedSiteId,
  loading,
  onSiteChange,
  onSelectEvent,
  onAcknowledge,
  onResolve,
}: LiveAlarmsPanelProps) {
  return (
    <section className="flex min-w-0 flex-1 flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
        <h2 className="text-lg font-bold text-slate-900">Live Alarms</h2>
        <SiteFilter value={selectedSiteId} sites={sites} onChange={onSiteChange} />
      </div>
      <LiveAlarmsTable
        events={events}
        selectedEventId={selectedEventId}
        loading={loading}
        onSelectEvent={onSelectEvent}
        onAcknowledge={onAcknowledge}
        onResolve={onResolve}
      />
    </section>
  );
}
