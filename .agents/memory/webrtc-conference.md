---
name: WebRTC conference architecture
description: Custom polling-based WebRTC signaling system built to replace JaaS. No external API keys required.
---

## Architecture
- **Signaling**: REST polling, NOT WebSockets
  - Participants: `/api/conference/:id/participants` — polled every 3s
  - Signals (ICE/offer/answer/control): `/api/conference/:id/signals/:peerId?after=N` — polled every 1.2s
  - Messages: `/api/conference/:id/messages?after=N` — polled every 2s
  - Heartbeat ping: `/api/conference/:id/ping` — every 8s, timeout 15s
- **STUN**: stun.l.google.com:19302 + stun1.l.google.com:19302 (free, no keys)
- **Initiator rule**: peer with lexicographically lower `peerId` sends the offer (deterministic, no double-offer)

## Roles
- `admin` (roleLevel ≤ 3): full video, screen share, mute/unmute/kick/pin/co-host controls
- `member` (authenticated): audio only + chat + emoji reactions
- `guest` (unauthenticated): receive-only, no mic, no chat

## DB Tables (added)
- `meeting_participants` — live participants with lastPing/leftAt
- `meeting_signals` — signaling rows polled by toPeer
- `meeting_messages` — chat + system + reaction messages
- `online_meetings.restricted_groups` — JSON field for restricted access groups

## Meeting component props (church-portal/src/components/Meeting.tsx)
```ts
interface MeetingProps {
  meetingId: number;
  meetingTitle: string;
  peerId: string;   // crypto.randomUUID() generated in online-portal.tsx before join
  displayName: string;
  role: "admin" | "member" | "guest";
  onLeave: () => void;
}
```

**Why:** Replaced JaaS/HMS which required paid API keys (vpaas-magic-cookie tokens expired). Polling-based WebRTC works without any external API dependency.

**How to apply:** Any future conference feature should extend `/api/conference` routes and respect the role hierarchy. Never re-introduce JaaS/HMS tokens.
