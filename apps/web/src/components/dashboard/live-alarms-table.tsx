import { AlarmTableRow } from "@/components/dashboard/alarm-table-row";
import type { SentinelEvent } from "@/types/event";

const COLUMNS = ["Time", "Site", "Event", "AI Summary", "Severity", "Status", "Action"];

interface LiveAlarmsTableProps {
  events: SentinelEvent[];
  selectedEventId: string | null;
  loading?: boolean;
  onSelectEvent: (eventId: string) => void;
  onAcknowledge: (eventId: string) => Promise<void>;
  onResolve: (eventId: string) => Promise<void>;
}

export function LiveAlarmsTable({
  events,
  selectedEventId,
  loading,
  onSelectEvent,
  onAcknowledge,
  onResolve,
}: LiveAlarmsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {COLUMNS.map((col) => (
              <th key={col} className="whitespace-nowrap px-4 py-3 font-semibold">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading &&
            [0, 1, 2, 3, 4].map((i) => (
              <tr key={i} className="border-b border-slate-100">
                {COLUMNS.map((col) => (
                  <td key={col} className="px-4 py-3">
                    <div className="h-4 w-full max-w-[120px] animate-pulse rounded bg-slate-100" />
                  </td>
                ))}
              </tr>
            ))}

          {!loading && events.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-sm text-slate-400">
                No alarms match the current filter.
              </td>
            </tr>
          )}

          {!loading &&
            events.map((event) => (
              <AlarmTableRow
                key={event.id}
                event={event}
                selected={event.id === selectedEventId}
                onSelect={() => onSelectEvent(event.id)}
                onAcknowledge={() => onAcknowledge(event.id)}
                onResolve={() => onResolve(event.id)}
              />
            ))}
        </tbody>
      </table>
    </div>
  );
}
