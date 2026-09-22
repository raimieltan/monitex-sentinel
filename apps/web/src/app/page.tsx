"use client";

import { EventCard } from "@/components/EventCard";
import { useEvents } from "@/hooks/useEvents";

export default function Home() {
  const { events, loading, error } = useEvents();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Sentinel — Live Events</h1>

        {loading && <p className="text-zinc-500 dark:text-zinc-400">Loading events…</p>}
        {error && <p className="text-red-600 dark:text-red-400">Failed to load events: {error}</p>}
        {!loading && !error && events.length === 0 && (
          <p className="text-zinc-500 dark:text-zinc-400">No events yet.</p>
        )}

        <div className="flex flex-col gap-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </main>
    </div>
  );
}
