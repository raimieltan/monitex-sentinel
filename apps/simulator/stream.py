"""
Sentinel event simulator.

Serves a WebSocket at ws://localhost:8765 and pushes randomly generated
sensor/camera events to every connected client (the API's ingestion
service). Occasionally fires a "burst" of several events in quick
succession, and occasionally emits a deliberately malformed event, to
exercise the API's validation and burst-handling behavior.

Pacing is configurable via env vars (see .env.example) — turn burst
frequency/size down or widen the inter-event delay if a downstream LLM
provider's rate limit is getting hit harder than you want to demonstrate.
"""
import asyncio
import json
import os
import random
import uuid
from datetime import datetime, timezone

import websockets
from dotenv import load_dotenv

load_dotenv()

HOST = "localhost"
PORT = 8765

# Steady-state delay between single events (seconds).
EVENT_INTERVAL_MIN_SECONDS = float(os.environ.get("EVENT_INTERVAL_MIN_SECONDS", "1.0"))
EVENT_INTERVAL_MAX_SECONDS = float(os.environ.get("EVENT_INTERVAL_MAX_SECONDS", "3.0"))
# Chance each cycle fires a burst instead of a single event.
BURST_PROBABILITY = float(os.environ.get("BURST_PROBABILITY", "0.15"))
# How many events land in one burst.
BURST_MIN_SIZE = int(os.environ.get("BURST_MIN_SIZE", "3"))
BURST_MAX_SIZE = int(os.environ.get("BURST_MAX_SIZE", "8"))
# Delay between events within a burst (seconds) — the knob that most
# directly controls how many triage requests/minute a burst generates.
BURST_INTERVAL_SECONDS = float(os.environ.get("BURST_INTERVAL_SECONDS", "0.05"))
# Chance of emitting a deliberately malformed event (missing "type").
INVALID_EVENT_PROBABILITY = float(os.environ.get("INVALID_EVENT_PROBABILITY", "0.05"))

EVENT_TYPES = [
    "motion_detected",
    "perimeter_breach",
    "door_forced",
    "glass_break",
    "smoke_detected",
    "fire_alarm",
    "object_detected",
    "loitering",
    "camera_offline",
    "sensor_fault",
    "panic_button",
]

SOURCES = ["camera", "sensor"]
SITES = ["site-114", "site-207", "site-309"]
ZONES = ["north-perimeter", "south-gate", "loading-dock", "lobby", "server-room"]


def make_event(force_invalid: bool = False) -> dict:
    event = {
        "event_id": f"evt_{uuid.uuid4().hex[:10]}",
        "site_id": random.choice(SITES),
        "zone": random.choice(ZONES),
        "type": random.choice(EVENT_TYPES),
        "source": random.choice(SOURCES),
        "confidence": round(random.uniform(0.3, 0.99), 2),
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "snapshot_url": None,
        "metadata": {},
    }

    if force_invalid:
        # Simulate a flaky sensor: drop the type field entirely so the API
        # has to reject this one without crashing ingestion.
        del event["type"]
        return event

    # Real-world feeds are noisy: sometimes confidence or timestamp is
    # missing outright.
    if random.random() < 0.1:
        del event["confidence"]
    if random.random() < 0.05:
        del event["timestamp"]

    return event


async def producer(websocket):
    print(f"[simulator] client connected: {websocket.remote_address}")
    try:
        while True:
            # Occasional burst of events to exercise queueing under load.
            if random.random() < BURST_PROBABILITY:
                burst_size = random.randint(BURST_MIN_SIZE, BURST_MAX_SIZE)
                print(f"[simulator] emitting burst of {burst_size} events")
                for _ in range(burst_size):
                    await websocket.send(json.dumps(make_event()))
                    await asyncio.sleep(BURST_INTERVAL_SECONDS)
            else:
                force_invalid = random.random() < INVALID_EVENT_PROBABILITY
                await websocket.send(json.dumps(make_event(force_invalid)))

            await asyncio.sleep(random.uniform(EVENT_INTERVAL_MIN_SECONDS, EVENT_INTERVAL_MAX_SECONDS))
    except websockets.exceptions.ConnectionClosed:
        print(f"[simulator] client disconnected: {websocket.remote_address}")


async def main():
    async with websockets.serve(producer, HOST, PORT):
        print(f"[simulator] listening on ws://{HOST}:{PORT}")
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
