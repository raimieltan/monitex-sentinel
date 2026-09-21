# Project Sentinel — Project Requirements Specification

## 1. Purpose

Build a real-time alarm monitoring prototype that receives security events, processes camera/video detections, triages alarms with an LLM, and presents them to an operator in a live dashboard.

The system should focus on a reliable MVP rather than production-complete breadth. 

## 2. Core System Requirements

The project must contain these five functional areas:

* Real-time alarm ingestion
* Video-to-event processing
* AI triage
* Live operator dashboard
* Critical alerting



## 3. Real-Time Event Ingestion

The system must continuously consume alarm events from a WebSocket or SSE stream.

Requirements:

* Events must be processed continuously, not as a batch.
* Bursts of events must not block or crash the application.
* Invalid or malformed events must not stop ingestion.
* Incoming events should be validated before processing.
* Duplicate events should be handled safely.
* The ingestion layer must remain independent from slow AI processing.



## 4. Event Schema

Events must support the following fields:

```ts
{
  event_id: string
  site_id: string
  zone: string
  type: string
  source: "camera" | "sensor"
  confidence?: number
  timestamp: string
  snapshot_url?: string | null
  metadata?: Record<string, unknown>
}
```

Fields may be missing and confidence may be unreliable, so the system must handle incomplete input gracefully. 

## 5. Supported Event Types

```text
motion_detected
perimeter_breach
door_forced
glass_break
smoke_detected
fire_alarm
object_detected
loitering
camera_offline
sensor_fault
panic_button
```



## 6. Video Processing

The system must process a live or simulated video source using a background worker.

Requirements:

* Video decoding must not run on the main event-ingestion path.
* Frames should be sampled rather than necessarily processing every frame.
* The worker must perform at least lightweight detection.
* Motion detection is sufficient.
* Object/person detection is optional.
* A detection must generate a standard alarm event.
* Camera-generated events must enter the same processing pipeline as sensor events.



## 7. Video Sources

The system may use any of the following:

```text
looping MP4
webcam
HLS
RTSP
```



## 8. AI Triage

Every event must be triaged by an LLM.

The AI must produce:

```text
severity
threat assessment
operator summary
recommended action
```

Severity values:

```text
info
warning
critical
```

The system must judge whether the event is likely a real threat or likely a false positive.

The summary should be concise and operator-readable. 

## 9. AI Reliability

AI processing must not block alarm ingestion.

The system must handle:

```text
slow responses
timeouts
rate limits
invalid responses
malformed structured output
provider errors
```

Failures in the AI layer must not cause valid incoming alarms to be lost. 

## 10. Asynchronous Processing

AI triage should run asynchronously.

Expected processing model:

```text
event received
→ validate
→ persist
→ queue triage
→ process AI separately
→ update event
```

The event ingestion handler must not wait for the LLM before continuing to receive additional events.

## 11. Persistence

The system should persist incoming events and their triage results.

Each stored event should support:

```text
id
eventId
siteId
zone
type
source
confidence
timestamp
snapshotUrl
metadata

triageStatus
severity
threatAssessment
summary
recommendedAction

operatorStatus
acknowledgedAt
resolvedAt

createdAt
updatedAt
```

## 12. Triage Status

Supported triage states should include:

```text
PENDING
PROCESSING
COMPLETED
FAILED
```

## 13. Operator Status

Supported alarm states should include:

```text
OPEN
ACKNOWLEDGED
RESOLVED
```

## 14. Live Dashboard

The operator dashboard must update automatically as events arrive.

It must not require manual refresh.

Each alarm should show at minimum:

```text
severity
event type
site
zone
source
confidence
timestamp
AI summary
threat assessment
recommended action
operator status
```



## 15. Severity Prioritization

Events must be prioritized by severity.

Ordering:

```text
critical
warning
info
```

Critical events must stand out immediately. 

## 16. Operator Actions

The operator must be able to:

```text
acknowledge an alarm
resolve an alarm
```



## 17. Realtime Updates

The frontend should receive updates when:

```text
a new event arrives
AI triage finishes
an event is acknowledged
an event is resolved
```

A WebSocket-based realtime transport such as Socket.IO is appropriate.

## 18. Critical Alerting

Critical events must be highly visible.

The system must at minimum prominently surface any single critical event. 

## 19. Correlation

Optional correlation may detect repeated or combined events.

Example:

```text
multiple perimeter breaches
same site
short time window
→ escalation
```

This is a stretch feature, not a core requirement. 

## 20. Graceful Degradation

The application must remain usable when individual subsystems fail.

Examples:

```text
LLM unavailable
→ events still arrive and remain visible

video worker unavailable
→ sensor events continue

invalid event
→ reject/log only that event

queue delay
→ ingestion continues

realtime client disconnects
→ stored events remain available
```

## 21. Local Execution

The system must run locally from a clean checkout with documented setup instructions.

Docker is optional. 

## 22. Planned Stack

```text
Frontend
Next.js
TypeScript
Tailwind CSS

Backend
Node.js
Express
TypeScript

Realtime
WebSocket
Socket.IO

Database
PostgreSQL
Prisma

Queue
Redis
BullMQ

AI
OpenAI API

Video
Python
OpenCV

Infrastructure
Docker Compose

Package Manager
Yarn
```

## 23. Suggested API Surface

```text
GET    /health
GET    /events
GET    /events/:id
POST   /internal/events
PATCH  /events/:id/acknowledge
PATCH  /events/:id/resolve
```

## 24. Non-Goals

These are not required for the MVP:

```text
complex authentication
RBAC
multi-tenancy
Kubernetes
microservices
mobile apps
advanced user management
full SOC case management
billing
production-scale observability
```

## 25. Optional Features

Only after the core system works:

```text
event correlation
incident history
snapshots
operator false-positive feedback
AI latency/cost metrics
basic authentication
YOLO/object tracking
zone/tripwire detection
```

These align with the stretch goals listed in the assessment. 

That’s the actual **project spec only**. No demo script, no roadmap, no filler.
