---
name: SSE meeting real-time push
description: Meeting participants/messages/signals delivered via SSE not polling; architecture decisions for this monorepo
---

## Rule
`GET /conference/:id/stream` is the SSE endpoint. Clients open one EventSource instead of 4 setIntervals.

**Why:** 500 clients × 3 polls/user = massive DB hammering. SSE inverts the model — server pushes on change.

## Key files
- `api-server/src/meetingBus.ts` — in-process EventEmitter pub/sub (no Redis needed for single server)
- `api-server/src/routes/conference.ts` — publishes events after every DB write; SSE endpoint at GET /:id/stream
- `church-portal/src/components/Meeting.tsx` — connectSSE() inside mount useEffect; sseRef for cleanup

## How to apply
- Any new route that writes meeting data (messages, signals, participants) MUST call publishMeeting() after the DB write
- broadcast route now stores 1 row with toPeer='__broadcast__' instead of N per-peer rows
- SSE filters signals server-side: only sends to matching peerId or '__broadcast__'
- Heartbeat (ping) still runs every 12 s — presence tracking still needs DB
- Join-requests still slow-polled (30 s) as fallback since that route is outside conference.ts
