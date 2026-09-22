# Project Sentinel — Operator Dashboard Component Specification

## 1. Scope

This document defines the frontend component architecture, props, states, interactions, and realtime behavior for the Project Sentinel operator dashboard.

The dashboard is desktop-first and optimized for real-time alarm monitoring. It must support:

- live alarm updates
- severity prioritization
- AI triage visibility
- acknowledge / resolve actions
- selected-event inspection
- live camera streaming
- snapshot fallback
- connection and stream health states

---

## 2. Page Composition

```text
OperatorDashboardPage
├── DashboardHeader
├── DashboardOverview
│   ├── DashboardTitle
│   └── KpiSummaryCards
│       └── KpiCard
└── DashboardWorkspace
    ├── LiveAlarmsPanel
    │   ├── LiveAlarmsHeader
    │   │   └── SiteFilter
    │   └── LiveAlarmsTable
    │       └── AlarmTableRow
    └── EventInspectionColumn
        ├── LiveCameraPanel
        │   ├── CameraPanelHeader
        │   ├── CameraStreamViewer
        │   ├── CameraOverlayLayer
        │   └── CameraControls
        └── SelectedEventPanel
            ├── EventMetadata
            ├── SeverityBadge
            ├── AiTriageSummary
            └── EventActionButtons
```

---

## 3. Shared Types

```ts
export type Severity = "info" | "warning" | "critical";

export type OperatorStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "RESOLVED";

export type TriageStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type CameraStreamStatus =
  | "CONNECTING"
  | "LIVE"
  | "BUFFERING"
  | "OFFLINE"
  | "RECONNECTING"
  | "UNAVAILABLE";

export interface AlarmEvent {
  id: string;
  eventId: string;

  siteId: string;
  siteName?: string;

  zone: string;
  type: string;
  source: "camera" | "sensor";

  confidence?: number;
  timestamp: string;

  snapshotUrl?: string | null;
  metadata?: Record<string, unknown>;

  triageStatus: TriageStatus;
  severity?: Severity | null;
  threatAssessment?: string | null;
  summary?: string | null;
  recommendedAction?: string | null;

  operatorStatus: OperatorStatus;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;

  camera?: CameraReference | null;
}

export interface CameraReference {
  id: string;
  name: string;
  zone: string;
  streamUrl?: string | null;
  snapshotUrl?: string | null;
  streamType?: "HLS" | "MJPEG" | "WEBRTC" | "MP4";
}

export interface DetectionOverlay {
  id: string;
  label: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

---

## 4. `OperatorDashboardPage`

### Responsibility

Top-level dashboard container. Owns page-level selection, filters, realtime subscriptions, and initial loading state.

### State

```ts
interface OperatorDashboardState {
  events: AlarmEvent[];
  selectedEventId: string | null;
  selectedSiteId: string | "ALL";
  connectionStatus: "CONNECTED" | "RECONNECTING" | "DISCONNECTED";
  isInitialLoading: boolean;
}
```

### Behavior

- fetch initial event list on mount
- connect to realtime transport after mount
- insert new events as they arrive
- update existing events after AI triage or operator actions
- recalculate KPI counts when event state changes
- keep selected event synchronized with updates
- select highest-priority active event when no event is selected
- do not automatically override an event the operator is actively reviewing unless product behavior explicitly requires it

### Realtime events

Recommended client events:

```text
event:new
event:updated
event:acknowledged
event:resolved
system:status
camera:status
```

---

## 5. `DashboardHeader`

### Responsibility

Display product identity, realtime system state, and local clock.

### Props

```ts
interface DashboardHeaderProps {
  connectionStatus:
    | "CONNECTED"
    | "RECONNECTING"
    | "DISCONNECTED";
  currentTime: Date;
}
```

### Rendering

Left:

```text
MONITEX SECURITY
```

Right:

```text
● Live     10:24:17
```

### States

#### Connected
- green status indicator
- label: `Live`

#### Reconnecting
- amber status indicator
- label: `Reconnecting`

#### Disconnected
- muted/red indicator
- label: `Disconnected`

### Notes

The clock updates locally every second. It must not trigger data refetching.

---

## 6. `DashboardOverview`

### Responsibility

Render the page title and summary cards.

### Layout

```text
Operator Dashboard                 [Critical] [Warnings] [Info] [Total 24h]
Live alarms from your sites,
with AI triage
```

---

## 7. `DashboardTitle`

### Props

```ts
interface DashboardTitleProps {
  title?: string;
  subtitle?: string;
}
```

### Defaults

```ts
title = "Operator Dashboard";
subtitle = "Live alarms from your sites, with AI triage";
```

---

## 8. `KpiSummaryCards`

### Responsibility

Display real-time alarm counts.

### Props

```ts
interface KpiSummaryCardsProps {
  critical: number;
  warning: number;
  info: number;
  total24h: number;
}
```

### Child component

```ts
interface KpiCardProps {
  label: string;
  value: number;
  variant: "critical" | "warning" | "info" | "neutral";
}
```

### Behavior

Counts update immediately when:

- a new event arrives
- AI changes event severity
- event status changes if cards only count active events
- initial data finishes loading

### Product rule

Define one counting strategy and keep it consistent.

Recommended:

- Critical / Warning / Info = active, unresolved events
- Total (24h) = all events created within last 24 hours

---

## 9. `LiveAlarmsPanel`

### Responsibility

Container for the event work queue.

### Props

```ts
interface LiveAlarmsPanelProps {
  events: AlarmEvent[];
  selectedEventId: string | null;
  selectedSiteId: string | "ALL";
  onSiteChange: (siteId: string | "ALL") => void;
  onSelectEvent: (eventId: string) => void;
  onAcknowledge: (eventId: string) => Promise<void>;
  onResolve: (eventId: string) => Promise<void>;
}
```

---

## 10. `LiveAlarmsHeader`

### Responsibility

Display section title and filters.

### Elements

```text
Live Alarms                           Show: [All Sites ▼]
```

---

## 11. `SiteFilter`

### Props

```ts
interface SiteFilterProps {
  value: string | "ALL";
  sites: Array<{
    id: string;
    name: string;
  }>;
  onChange: (siteId: string | "ALL") => void;
}
```

### Behavior

- filters visible rows
- must not mutate event data
- preserves current selection if selected event remains visible
- if selected event becomes hidden, keep detail state unless product behavior explicitly clears it

---

## 12. `LiveAlarmsTable`

### Responsibility

Render the operator's primary event queue.

### Columns

```text
Time
Site
Event
AI Summary
Severity
Status
Action
```

### Props

```ts
interface LiveAlarmsTableProps {
  events: AlarmEvent[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  onAcknowledge: (eventId: string) => Promise<void>;
  onResolve: (eventId: string) => Promise<void>;
}
```

### Default sorting

Sort active events using:

1. unresolved before resolved
2. severity descending
3. newest first

Severity order:

```text
critical
warning
info
unclassified / pending
```

### Empty state

```text
No alarms match the current filter.
```

### Loading state

Use skeleton rows rather than a blocking spinner.

---

## 13. `AlarmTableRow`

### Responsibility

Render one alarm and its primary operator action.

### Props

```ts
interface AlarmTableRowProps {
  event: AlarmEvent;
  selected: boolean;
  onSelect: () => void;
  onAcknowledge: () => Promise<void>;
  onResolve: () => Promise<void>;
}
```

### Visual states

#### Critical
- strong severity badge
- subtle critical row tint
- must remain readable

#### Selected
- explicit row highlight or outline
- selection must not rely only on severity color

#### New arrival
- optional short-lived entry highlight

#### Resolved
- lower visual emphasis

### Action rules

```ts
if (operatorStatus === "OPEN") {
  action = "Acknowledge";
}

if (operatorStatus === "ACKNOWLEDGED") {
  action = "Resolve";
}

if (operatorStatus === "RESOLVED") {
  action = "View";
}
```

### Pending AI state

When triage is incomplete:

```text
AI Summary: Processing...
Severity: Pending
```

Do not hide the event while waiting for AI.

---

## 14. `SeverityBadge`

### Props

```ts
interface SeverityBadgeProps {
  severity?: Severity | null;
  triageStatus?: TriageStatus;
}
```

### Rendering

```text
critical -> Critical
warning  -> Warning
info     -> Info
pending  -> Pending
failed   -> Unavailable
```

Color must not be the only communication mechanism.

---

## 15. `StatusBadge`

### Props

```ts
interface StatusBadgeProps {
  status: OperatorStatus;
}
```

### Rendering

```text
OPEN         -> New
ACKNOWLEDGED -> Acknowledged
RESOLVED     -> Resolved
```

---

# 16. `EventInspectionColumn`

### Responsibility

Right-side inspection workspace containing the camera and selected event details.

### Layout

```text
LiveCameraPanel
SelectedEventPanel
```

On smaller screens, stack below the alarms table.

---

## 17. `LiveCameraPanel`

### Responsibility

Show the camera associated with the currently selected event.

### Props

```ts
interface LiveCameraPanelProps {
  event: AlarmEvent | null;
  camera: CameraReference | null;
  streamStatus: CameraStreamStatus;
  overlays?: DetectionOverlay[];
  onReconnect?: () => void;
  onSnapshot?: () => void;
  onFullscreen?: () => void;
}
```

### Header

Left:

```text
Live Camera
```

Right:

```text
North Perimeter
```

Prefer actual camera name when available:

```text
North Perimeter Cam 02
```

### No-selection state

```text
Select an alarm to view its related camera feed.
```

### No-camera state

```text
No camera is associated with this event.
```

---

## 18. `CameraStreamViewer`

### Responsibility

Render the live camera stream or fallback media.

### Props

```ts
interface CameraStreamViewerProps {
  camera: CameraReference;
  status: CameraStreamStatus;
  eventSnapshotUrl?: string | null;
  overlays?: DetectionOverlay[];
}
```

### Stream source priority

```text
1. live stream
2. latest camera frame
3. event snapshot
4. unavailable placeholder
```

### Supported MVP source types

Recommended order of implementation simplicity:

```text
HLS
MJPEG
MP4 simulation
WebRTC
```

The exact stream implementation should remain hidden behind this component.

### Stream behavior

When selected event changes:

1. resolve related camera
2. stop previous stream if required
3. connect to new stream
4. display connecting state
5. render stream when ready

---

## 19. `CameraStreamStatus`

### States

#### `CONNECTING`

Overlay:

```text
Connecting to camera...
```

#### `LIVE`

Show:

```text
● LIVE
```

#### `BUFFERING`

Overlay:

```text
Buffering...
```

#### `RECONNECTING`

Overlay:

```text
Reconnecting...
```

#### `OFFLINE`

Display:

```text
Camera offline
```

Allow retry if appropriate.

#### `UNAVAILABLE`

Display:

```text
Live stream unavailable
```

Fall back to snapshot when possible.

---

## 20. `CameraOverlayLayer`

### Responsibility

Render computer-vision detections over the video.

### Props

```ts
interface CameraOverlayLayerProps {
  detections: DetectionOverlay[];
  sourceWidth: number;
  sourceHeight: number;
}
```

### Detection rendering

Example:

```text
┌──────────────┐
│ person 0.87  │
│              │
│              │
└──────────────┘
```

### Requirements

- bounding boxes scale with the displayed video size
- coordinates must remain correct when video aspect ratio changes
- overlays must not intercept pointer events
- hide overlays when no detection data exists

---

## 21. `CameraControls`

### MVP controls

```text
Fullscreen
Reconnect
Snapshot
```

### Optional controls

```text
Mute
Pause live
Switch camera
Go to event moment
```

### Props

```ts
interface CameraControlsProps {
  canReconnect: boolean;
  canSnapshot: boolean;
  canFullscreen: boolean;
  onReconnect?: () => void;
  onSnapshot?: () => void;
  onFullscreen?: () => void;
}
```

---

## 22. Video Timestamp Overlay

Display the source stream timestamp when available.

Example:

```text
2026-09-26 10:24:03
```

Do not use the browser's current time as the stream timestamp unless they are known to be equivalent.

---

## 23. Snapshot Fallback

When a stream fails but the event has a snapshot:

Render the snapshot and clearly label it:

```text
Live stream unavailable
Showing event snapshot
```

A static image must never be visually presented as a live stream.

---

## 24. `SelectedEventPanel`

### Responsibility

Render details and operator actions for the selected event.

### Props

```ts
interface SelectedEventPanelProps {
  event: AlarmEvent | null;
  isUpdating?: boolean;
  onAcknowledge: (eventId: string) => Promise<void>;
  onResolve: (eventId: string) => Promise<void>;
}
```

### No-selection state

```text
Select an alarm to inspect its details.
```

---

## 25. Event Metadata

Display:

```text
Time
Site
Event
Severity
```

Recommended optional fields:

```text
Zone
Source
Confidence
Threat assessment
```

Do not overload the panel with raw JSON.

---

## 26. AI Triage Summary

### Completed

Render:

```text
AI Summary

Person seen near fence after hours.
Likely trespasser.

Recommended action

Verify on camera. If unauthorized,
contact on-site security.
```

### Pending

```text
AI Summary

Triage in progress...
```

### Failed

```text
AI Summary

AI triage unavailable.
Raw event details remain available.
```

---

## 27. `EventActionButtons`

### Props

```ts
interface EventActionButtonsProps {
  status: OperatorStatus;
  disabled?: boolean;
  onAcknowledge: () => Promise<void>;
  onResolve: () => Promise<void>;
}
```

### Rules

#### OPEN

```text
[Acknowledge] [Mark Resolved]
```

`Mark Resolved` may remain available if direct resolution is permitted.

#### ACKNOWLEDGED

```text
[Acknowledged] [Mark Resolved]
```

The first button is disabled.

#### RESOLVED

```text
[Resolved]
```

No destructive or duplicate action should be triggered.

### Mutation behavior

For action requests:

1. disable relevant button
2. send request
3. update event from API/realtime result
4. show failure state if request fails
5. restore button if operation failed

Avoid fake success unless optimistic updates are intentionally implemented.

---

## 28. Realtime Client Hook

Recommended abstraction:

```ts
useAlarmRealtime()
```

### Suggested interface

```ts
interface AlarmRealtimeHandlers {
  onNewEvent: (event: AlarmEvent) => void;
  onUpdatedEvent: (event: AlarmEvent) => void;
  onSystemStatus: (
    status: "CONNECTED" | "RECONNECTING" | "DISCONNECTED"
  ) => void;
}
```

### Responsibilities

- establish Socket.IO connection
- subscribe once
- clean up listeners on unmount
- reconnect automatically
- avoid duplicate listeners during React development rendering

---

## 29. Initial Data Hook

Recommended abstraction:

```ts
useAlarmEvents()
```

### Responsibilities

- initial `GET /events`
- loading state
- error state
- event replacement/update helpers
- optional filter handling

---

## 30. Suggested API Contracts

### `GET /events`

Response:

```ts
{
  events: AlarmEvent[];
}
```

### `PATCH /events/:id/acknowledge`

Response:

```ts
{
  event: AlarmEvent;
}
```

### `PATCH /events/:id/resolve`

Response:

```ts
{
  event: AlarmEvent;
}
```

### Optional camera endpoint

```text
GET /cameras/:id
```

Response:

```ts
{
  camera: CameraReference;
}
```

---

## 31. Realtime Payload Contracts

### `event:new`

```ts
AlarmEvent
```

### `event:updated`

```ts
AlarmEvent
```

### `event:acknowledged`

```ts
AlarmEvent
```

### `event:resolved`

```ts
AlarmEvent
```

### `camera:status`

```ts
{
  cameraId: string;
  status: CameraStreamStatus;
}
```

---

## 32. Selection Rules

### Initial selection

After initial load:

1. newest unresolved critical event
2. otherwise newest unresolved warning
3. otherwise newest unresolved event
4. otherwise newest event

### During realtime updates

Do not constantly switch selection whenever a new event arrives.

Recommended behavior:

- preserve operator selection
- if no event is selected, select highest-priority active event
- optionally surface a separate critical alert indicator for newly arriving critical events

---

## 33. Critical Event Behavior

When a critical event arrives:

- insert into table immediately
- update critical KPI
- place according to priority sorting
- apply short entry emphasis
- do not require page refresh
- do not hide while AI data is still processing

Optional:

- visual toast
- audible notification
- explicit `New critical alarm` banner

These should remain separate from the event table logic.

---

## 34. Loading States

### Initial page load

Use:

- KPI skeletons
- table skeleton rows
- camera placeholder
- event detail placeholder

### Incremental realtime updates

Do not block the entire dashboard.

Only update affected components.

---

## 35. Error States

### Initial events request failure

Show inline dashboard error with retry.

### Realtime disconnect

Keep existing events visible.

Header becomes:

```text
● Reconnecting
```

### AI failure

Keep raw event visible.

### Camera failure

Keep selected event details visible and use snapshot fallback.

### Operator mutation failure

Show inline or toast error and leave status unchanged.

---

## 36. Desktop Layout

Recommended grid:

```css
grid-template-columns: minmax(0, 1fr) 425px;
```

The left alarms panel gets remaining width.

The right inspection column remains readable and stable.

---

## 37. Responsive Layout

### Desktop

```text
alarms | camera/details
```

### Tablet

Either:

```text
alarms | narrower inspection
```

or stack inspection below when width becomes insufficient.

### Mobile

```text
KPI
alarms
camera
event details
```

Mobile optimization is secondary; this is an operator desktop application.

---

## 38. Accessibility Requirements

- all action buttons keyboard accessible
- table rows selectable without requiring pointer precision
- severity must include readable text
- status must include readable text
- visible focus states
- sufficient contrast
- video controls require accessible labels
- do not communicate critical state only through red coloring

---

## 39. Recommended File Structure

```text
src/
├── app/
│   └── page.tsx
│
├── components/
│   └── dashboard/
│       ├── dashboard-header.tsx
│       ├── dashboard-overview.tsx
│       ├── dashboard-title.tsx
│       ├── kpi-summary-cards.tsx
│       ├── kpi-card.tsx
│       ├── live-alarms-panel.tsx
│       ├── live-alarms-table.tsx
│       ├── alarm-table-row.tsx
│       ├── site-filter.tsx
│       ├── severity-badge.tsx
│       ├── status-badge.tsx
│       ├── live-camera-panel.tsx
│       ├── camera-stream-viewer.tsx
│       ├── camera-overlay-layer.tsx
│       ├── camera-controls.tsx
│       ├── selected-event-panel.tsx
│       └── event-action-buttons.tsx
│
├── hooks/
│   ├── use-alarm-events.ts
│   └── use-alarm-realtime.ts
│
├── lib/
│   ├── api.ts
│   ├── socket.ts
│   └── event-utils.ts
│
└── types/
    └── alarm.ts
```

Avoid splitting components further unless a component has meaningful independent responsibility.

---

## 40. MVP Acceptance Criteria

The dashboard component implementation is complete when:

- header reflects realtime connection state
- KPI cards update from real event data
- alarm rows render from API data
- rows are ordered by operational priority
- site filtering works
- selecting a row updates event details
- selected row is visually clear
- AI triage pending/completed/failed states render correctly
- acknowledge works
- resolve works
- realtime `event:new` updates the table without refresh
- realtime `event:updated` updates AI content without refresh
- camera panel loads the camera associated with the selected event
- camera panel distinguishes live video from snapshot fallback
- camera panel handles loading, buffering, offline, reconnecting, and unavailable states
- detection boxes can render over the video when detection metadata exists
- current event details remain usable when the camera or AI layer fails
- the dashboard remains usable when realtime connectivity temporarily drops

---

## 41. Non-Goals for This UI

Do not expand the dashboard into:

- user administration
- role management
- billing
- customer management
- advanced reporting
- full incident case management
- camera configuration tools
- video archive management
- complex analytics
- multi-page SOC platform

This screen should remain focused on one job:

**receive, understand, inspect, acknowledge, and resolve live alarms.**
