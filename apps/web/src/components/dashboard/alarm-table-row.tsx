"use client";

import { useState } from "react";
import { SeverityBadge } from "@/components/dashboard/severity-badge";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { formatEventType, formatSite, formatTime } from "@/lib/event-utils";
import type { SentinelEvent } from "@/types/event";

interface AlarmTableRowProps {
  event: SentinelEvent;
  selected: boolean;
  onSelect: () => void;
  onAcknowledge: () => Promise<void>;
  onResolve: () => Promise<void>;
}

export function AlarmTableRow({ event, selected, onSelect, onAcknowledge, onResolve }: AlarmTableRowProps) {
  const [pending, setPending] = useState(false);
  const isTriaging = event.triageStatus === "PENDING" || event.triageStatus === "IN_PROGRESS";
  const isCritical = event.severity === "critical" && event.operatorStatus !== "RESOLVED";
  const isResolved = event.operatorStatus === "RESOLVED";

  async function handleAction(e: React.MouseEvent, action: () => Promise<void>) {
    e.stopPropagation();
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  }

  let actionLabel: string;
  let actionHandler: () => Promise<void>;
  let actionStyle: string;
  if (event.operatorStatus === "OPEN") {
    actionLabel = "Acknowledge";
    actionHandler = onAcknowledge;
    actionStyle = "bg-[#132A4C] text-white hover:bg-[#0d1f3a]";
  } else if (event.operatorStatus === "ACKNOWLEDGED") {
    actionLabel = "Resolve";
    actionHandler = onResolve;
    actionStyle = "bg-slate-100 text-slate-700 hover:bg-slate-200";
  } else {
    actionLabel = "View";
    actionHandler = async () => onSelect();
    actionStyle = "bg-slate-100 text-slate-500 hover:bg-slate-200";
  }

  return (
    <tr
      onClick={onSelect}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-selected={selected}
      className={`cursor-pointer border-b border-slate-100 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#132A4C] ${
        selected ? "bg-slate-100 ring-1 ring-inset ring-[#132A4C]" : isCritical ? "bg-red-50 hover:bg-red-100/70" : "hover:bg-slate-50"
      } ${isResolved ? "opacity-60" : ""}`}
    >
      <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatTime(event.timestamp)}</td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatSite(event.siteId)}</td>
      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">{formatEventType(event.type)}</td>
      <td className="max-w-xs px-4 py-3 text-slate-600">
        {isTriaging ? (
          <span className="italic text-slate-400">Processing...</span>
        ) : event.triageStatus === "FAILED" ? (
          <span className="text-slate-400">AI triage unavailable.</span>
        ) : (
          event.summary ?? <span className="text-slate-400">No summary.</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <SeverityBadge severity={event.severity} triageStatus={event.triageStatus} />
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <StatusBadge status={event.operatorStatus} />
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <button
          type="button"
          disabled={pending}
          onClick={(e) => handleAction(e, actionHandler)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${actionStyle}`}
        >
          {pending ? "..." : actionLabel}
        </button>
      </td>
    </tr>
  );
}
