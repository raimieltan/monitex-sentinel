"use client";

import { useState } from "react";
import type { OperatorStatus } from "@/types/event";

interface EventActionButtonsProps {
  status: OperatorStatus;
  disabled?: boolean;
  onAcknowledge: () => Promise<void>;
  onResolve: () => Promise<void>;
}

export function EventActionButtons({ status, disabled, onAcknowledge, onResolve }: EventActionButtonsProps) {
  const [pending, setPending] = useState<"acknowledge" | "resolve" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "acknowledge" | "resolve", action: () => Promise<void>) {
    setPending(kind);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : `failed to ${kind}`);
    } finally {
      setPending(null);
    }
  }

  const busy = disabled || pending !== null;

  if (status === "RESOLVED") {
    return (
      <button type="button" disabled className="w-full rounded-md bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-400">
        Resolved
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={status === "ACKNOWLEDGED" || busy}
          onClick={() => run("acknowledge", onAcknowledge)}
          className="flex-1 rounded-md bg-[#132A4C] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0d1f3a] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending === "acknowledge" ? "Acknowledging..." : status === "ACKNOWLEDGED" ? "Acknowledged" : "Acknowledge"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run("resolve", onResolve)}
          className="flex-1 rounded-md bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending === "resolve" ? "Resolving..." : "Mark Resolved"}
        </button>
      </div>
    </div>
  );
}
