"use client";

import { useEffect, useState } from "react";
import type { ConnectionStatus } from "@/types/event";

const STATUS_STYLES: Record<ConnectionStatus, { dot: string; label: string }> = {
  CONNECTED: { dot: "bg-green-400", label: "Live" },
  RECONNECTING: { dot: "bg-amber-400", label: "Reconnecting" },
  DISCONNECTED: { dot: "bg-red-400", label: "Disconnected" },
};

export function DashboardHeader({ connectionStatus }: { connectionStatus: ConnectionStatus }) {
  // Local clock only — must never trigger a data refetch.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Renders null on the server to avoid a hydration mismatch, then syncs
    // to the real clock immediately on mount instead of waiting a full second.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const { dot, label } = STATUS_STYLES[connectionStatus];

  return (
    <header className="flex items-center justify-between bg-[#132A4C] px-6 py-4">
      <span className="text-lg font-bold tracking-wide text-white">MONITEX SECURITY</span>
      <div className="flex items-center gap-4 text-sm text-slate-200">
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
          {label}
        </span>
        <time className="tabular-nums">
          {now ? now.toLocaleTimeString(undefined, { hour12: false }) : "--:--:--"}
        </time>
      </div>
    </header>
  );
}
