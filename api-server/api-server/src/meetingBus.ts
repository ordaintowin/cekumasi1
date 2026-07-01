import { EventEmitter } from "events";

const bus = new EventEmitter();
bus.setMaxListeners(0);

export interface MeetingEvent {
  type: "participants" | "message" | "signal" | "joinRequests";
  data: unknown;
}

export function publishMeeting(meetingId: number, event: MeetingEvent): void {
  bus.emit(`meeting:${meetingId}`, event);
}

export function subscribeMeeting(
  meetingId: number,
  fn: (event: MeetingEvent) => void,
): () => void {
  bus.on(`meeting:${meetingId}`, fn);
  return () => bus.off(`meeting:${meetingId}`, fn);
}
