import { LiveCameraPanel } from "@/components/dashboard/live-camera-panel";
import { SelectedEventPanel } from "@/components/dashboard/selected-event-panel";
import { cameraForEvent } from "@/lib/event-utils";
import type { SentinelEvent } from "@/types/event";

interface EventInspectionColumnProps {
  event: SentinelEvent | null;
  onAcknowledge: (eventId: string) => Promise<void>;
  onResolve: (eventId: string) => Promise<void>;
}

export function EventInspectionColumn({ event, onAcknowledge, onResolve }: EventInspectionColumnProps) {
  return (
    <div className="flex w-[425px] shrink-0 flex-col gap-4">
      <LiveCameraPanel event={event} camera={event ? cameraForEvent(event) : null} />
      <SelectedEventPanel event={event} onAcknowledge={onAcknowledge} onResolve={onResolve} />
    </div>
  );
}
