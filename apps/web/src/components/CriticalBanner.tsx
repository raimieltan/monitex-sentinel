import { AlertTriangle } from "lucide-react";
import type { SentinelEvent } from "@/types/event";

/**
 * Persistent top-of-page banner for open critical events (spec §18: any
 * single critical event must be prominently surfaced) — stays visible even
 * once the triggering card has scrolled out of view.
 */
export function CriticalBanner({ events }: { events: SentinelEvent[] }) {
  const openCritical = events.filter((e) => e.severity === "critical" && e.operatorStatus === "OPEN");
  if (openCritical.length === 0) return null;

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 bg-red-600 px-4 py-3 text-white shadow-md sm:px-6">
      <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
      <span className="font-semibold">
        {openCritical.length} open critical {openCritical.length === 1 ? "event" : "events"} requiring attention
      </span>
    </div>
  );
}
