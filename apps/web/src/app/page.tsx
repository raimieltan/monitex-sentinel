"use client";

import { useMemo, useState } from "react";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { DevControls } from "@/components/dashboard/dev-controls";
import { EventInspectionColumn } from "@/components/dashboard/event-inspection-column";
import { LiveAlarmsPanel } from "@/components/dashboard/live-alarms-panel";
import { useAlarmEvents } from "@/hooks/useAlarmEvents";
import { acknowledgeEvent, resolveEvent } from "@/lib/api";
import { computeKpiCounts, formatSite, selectDefaultEvent } from "@/lib/event-utils";

export default function OperatorDashboardPage() {
  const { events, loading, error, connectionStatus } = useAlarmEvents();
  const [manualSelectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | "ALL">("ALL");

  // Fall back to the highest-priority active event whenever the operator
  // hasn't made an explicit selection — derived, not stored, so it never
  // fights with a manual selection.
  const defaultEventId = useMemo(() => selectDefaultEvent(events)?.id ?? null, [events]);
  const selectedEventId = manualSelectedEventId ?? defaultEventId;

  const sites = useMemo(() => {
    const ids = Array.from(new Set(events.map((e) => e.siteId))).sort();
    return ids.map((id) => ({ id, name: formatSite(id) }));
  }, [events]);

  const filteredEvents = useMemo(
    () => (selectedSiteId === "ALL" ? events : events.filter((e) => e.siteId === selectedSiteId)),
    [events, selectedSiteId],
  );

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;
  const kpis = computeKpiCounts(events);

  async function handleAcknowledge(eventId: string) {
    await acknowledgeEvent(eventId);
  }

  async function handleResolve(eventId: string) {
    await resolveEvent(eventId);
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <DashboardHeader connectionStatus={connectionStatus} />
      <DevControls />
      <DashboardOverview {...kpis} loading={loading} />

      <main className="flex flex-1 gap-4 px-6 pb-6">
        {error && (
          <div className="w-full rounded-lg border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
            Failed to load events: {error}
          </div>
        )}

        {!error && (
          <>
            <LiveAlarmsPanel
              events={filteredEvents}
              sites={sites}
              selectedEventId={selectedEventId}
              selectedSiteId={selectedSiteId}
              loading={loading}
              onSiteChange={setSelectedSiteId}
              onSelectEvent={setSelectedEventId}
              onAcknowledge={handleAcknowledge}
              onResolve={handleResolve}
            />
            <EventInspectionColumn event={selectedEvent} onAcknowledge={handleAcknowledge} onResolve={handleResolve} />
          </>
        )}
      </main>
    </div>
  );
}
