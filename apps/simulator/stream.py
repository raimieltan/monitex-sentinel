"""
Sentinel event simulator.

Serves a WebSocket at ws://localhost:8765 and pushes randomly generated
sensor/camera events to every connected client (the API's ingestion
service). Occasionally fires a "burst" of several events in quick
succession, and occasionally emits a deliberately malformed event, to
exercise the API's validation and burst-handling behavior.
"""
import asyncio
import json
import random
import uuid
from datetime import datetime, timezone

import websockets

HOST = "localhost"
PORT = 8765

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
            if random.random() < 0.15:
                burst_size = random.randint(3, 8)
                print(f"[simulator] emitting burst of {burst_size} events")
                for _ in range(burst_size):
                    await websocket.send(json.dumps(make_event()))
                    await asyncio.sleep(0.05)
            else:
                force_invalid = random.random() < 0.05
                await websocket.send(json.dumps(make_event(force_invalid)))

            await asyncio.sleep(random.uniform(1.0, 3.0))
    except websockets.exceptions.ConnectionClosed:
        print(f"[simulator] client disconnected: {websocket.remote_address}")


async def main():
    async with websockets.serve(producer, HOST, PORT):
        print(f"[simulator] listening on ws://{HOST}:{PORT}")
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
