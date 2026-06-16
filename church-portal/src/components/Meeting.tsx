import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/hooks/use-toast";
import { Room, RoomEvent, Track, LocalAudioTrack, AudioPresets, VideoPresets, ConnectionQuality } from "livekit-client";

interface MeetingProps {
  meetingId: number;
  meetingTitle: string;
  peerId: string;
  displayName: string;
  role: "admin" | "co-host" | "member" | "guest";
  meetingType?: string;
  minimized?: boolean;
  globalFullScreen?: boolean;
  onExpand?: () => void;
  onMinimize?: () => void;
  onLeave: () => void;
}

interface FloatingEmoji {
  id: string;
  emoji: string;
  x: number;
}

async function confApi(method: string, path: string, body?: any) {
  const token = localStorage.getItem("token");
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt);
  }
  return res.json();
}

// ── SVG Icons ──────────────────────────────────────────────────────────────────
const MicIcon = ({ muted, size = 22 }: { muted: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {muted ? (
      <>
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
        <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </>
    ) : (
      <>
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </>
    )}
  </svg>
);

const VideoIcon = ({ on, size = 22 }: { on: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {on ? (
      <>
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </>
    ) : (
      <>
        <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
        <path d="M7.5 4H14a2 2 0 0 1 2 2v7.5" />
        <line x1="1" y1="1" x2="23" y2="23" />
        <polygon points="23 7 16 12 23 17 23 7" />
      </>
    )}
  </svg>
);

const ScreenIcon = ({ sharing, size = 22 }: { sharing: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    {sharing
      ? <><path d="M12 17v4" /><line x1="8" y1="21" x2="16" y2="21" /><polyline points="9 10 12 7 15 10" /><line x1="12" y1="7" x2="12" y2="14" /></>
      : <><path d="M12 17v4" /><line x1="8" y1="21" x2="16" y2="21" /></>
    }
  </svg>
);

const AudioShareIcon = ({ active, size = 22 }: { active: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill={active ? "currentColor" : "none"} />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

const ChatIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const PeopleIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const SmileIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M8 13s1.5 2 4 2 4-2 4-2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
);

const SettingsIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const PhoneIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.43 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.34 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.31 9.73" />
    <line x1="23" y1="1" x2="1" y2="23" />
  </svg>
);

const HandIcon = ({ raised, size = 22 }: { raised: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={raised ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
    <path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2" />
    <path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8" />
    <path d="M18 8a2 2 1 0 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
  </svg>
);

const MoreIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
);

// ── ChatPanelComponent — defined outside Meeting so the input never loses focus on re-renders ──
interface ChatPanelProps {
  newMsgCount: number;
  setShowChat: (v: boolean) => void;
  messages: any[];
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  onSend: (msg: string) => Promise<void>;
  canSpeak: boolean;
  height?: string | number;
}

const ChatPanelComponent = ({
  newMsgCount, setShowChat, messages, chatEndRef, onSend,
  canSpeak, height,
}: ChatPanelProps) => {
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = chatInput.trim();
    if (!msg || chatSending) return;
    setChatInput("");
    setChatSending(true);
    try {
      await onSend(msg);
    } catch {
      setChatInput(msg);
    } finally {
      setChatSending(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", background: "#18181b", borderLeft: "1px solid #27272a", width: 320, flexShrink: 0, height: height ?? "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderBottom: "1px solid #27272a", flexShrink: 0, background: "#1a1c2e" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>💬 Live Chat</span>
          {newMsgCount > 0 && <span style={{ background: "#7c3aed", color: "white", borderRadius: 999, padding: "1px 7px", fontSize: 10, fontWeight: 600 }}>{newMsgCount}</span>}
        </div>
        <button onClick={() => setShowChat(false)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 18, lineHeight: 1, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", fontSize: 12, minHeight: 0 }}>
        {messages.length === 0
          ? <div style={{ color: "#4b5563", textAlign: "center", marginTop: 24, fontSize: 11 }}>No messages yet. Say hello! 👋</div>
          : messages.map((m) => (
            <div key={m.id} style={{ marginBottom: 9 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#a78bfa", marginBottom: 2 }}>{m.senderName}</div>
              <div style={{ background: "#1e2030", borderRadius: 8, padding: "5px 10px", color: "#e5e7eb", lineHeight: 1.45, wordBreak: "break-word" }}>{m.content}</div>
            </div>
          ))}
        <div ref={chatEndRef} />
      </div>
      {canSpeak ? (
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: 6, padding: "7px 8px", borderTop: "1px solid #27272a", flexShrink: 0 }}>
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Send a message…"
            maxLength={300}
            style={{ flex: 1, background: "#09090b", border: "1px solid #3f3f46", color: "white", padding: "6px 10px", borderRadius: 6, fontSize: 12, outline: "none" }}
          />
          <button type="submit" disabled={!chatInput.trim() || chatSending}
            style={{ width: 32, height: 32, borderRadius: 6, background: "#7c3aed", border: "none", color: "white", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", opacity: !chatInput.trim() || chatSending ? 0.4 : 1, flexShrink: 0 }}>➤</button>
        </form>
      ) : (
        <p style={{ fontSize: 10, color: "#4b5563", textAlign: "center", padding: "8px 0", flexShrink: 0 }}>Guests cannot send messages</p>
      )}
    </div>
  );
};

export function Meeting({ meetingId, meetingTitle, peerId, displayName, role: initialRole, meetingType, minimized, globalFullScreen, onExpand, onMinimize, onLeave }: MeetingProps) {
  const { toast } = useToast();
  const [participants, setParticipants] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [admittingId, setAdmittingId] = useState<number | null>(null);
  const [joinRequestAlert, setJoinRequestAlert] = useState<{ name: string; memberId: number } | null>(null);
  const shownJoinRequestIdsRef = useRef<Set<number>>(new Set());
  const joinAlertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [myRole, setMyRole] = useState(initialRole);
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [unmutingAllowed, setUnmutingAllowed] = useState(true);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [mainStagePeerId, setMainStagePeerId] = useState<string | null>(null);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [showParticipantsFull, setShowParticipantsFull] = useState(false);
  const [participantSearch, setParticipantSearch] = useState("");
  const [handRaised, setHandRaised] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const [isLandMobile, setIsLandMobile] = useState(false);
  const [isAudioSharing, setIsAudioSharing] = useState(false);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [raisedHandsOrder, setRaisedHandsOrder] = useState<Array<{peerId: string; displayName: string; ts: number}>>([]);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [peerQuality, setPeerQuality] = useState<Map<string, ConnectionQuality>>(new Map());

  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState("");
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");
  const micSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [confirmKickPeerId, setConfirmKickPeerId] = useState<string | null>(null);
  const [confirmKickName, setConfirmKickName] = useState<string>("");
  const [pipPos, setPipPos] = useState<{ left: number; top: number } | null>(null);
  const pipDragState = useRef<{ startMouseX: number; startMouseY: number; startLeft: number; startTop: number } | null>(null);
  const pipContainerRef = useRef<HTMLDivElement>(null);
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(new Set());
  const [livekitStatus, setLivekitStatus] = useState<"connecting" | "connected" | "failed">("connecting");
  const [livekitError, setLivekitError] = useState<string | null>(null);

  const wakeLockRef = useRef<any>(null);
  const roomRef = useRef<Room | null>(null);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const sysAudioTrackRef = useRef<LocalAudioTrack | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const mainStageRef = useRef<HTMLDivElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const lastSignalIdRef = useRef(0);
  const lastMessageIdRef = useRef(0);
  const isMutedRef = useRef(true);
  const myRoleRef = useRef(initialRole);
  const unmutingAllowedRef = useRef(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const joinedRef = useRef(false);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScreenSharingRef = useRef(false);
  const sseRef = useRef<EventSource | null>(null);

  const isAdminOrCoHost = myRole === "admin" || myRole === "co-host";
  // Always show share buttons for admins; handle unsupported case inside the toggle fn with a user-facing message
  const canDisplayMedia = isAdminOrCoHost;

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { myRoleRef.current = myRole; }, [myRole]);
  useEffect(() => { unmutingAllowedRef.current = unmutingAllowed; }, [unmutingAllowed]);
  useEffect(() => { isScreenSharingRef.current = isScreenSharing; }, [isScreenSharing]);

  // ── Fullscreen ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      mainStageRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Persistent audio container — lives in document.body so audio never cuts
  // when the component switches between minimized/maximized/fullscreen modes.
  useEffect(() => {
    const el = document.createElement("div");
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("data-livekit-audio", "1");
    document.body.appendChild(el);
    audioContainerRef.current = el;
    return () => {
      el.querySelectorAll("audio").forEach((a) => { (a as HTMLAudioElement).srcObject = null; });
      document.body.removeChild(el);
    };
  }, []);

  // Wake Lock — keep screen/audio alive when minimized or tab hidden
  useEffect(() => {
    let released = false;
    async function acquireWakeLock() {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
          wakeLockRef.current.addEventListener("release", () => {
            if (!released) acquireWakeLock();
          });
        }
      } catch (_) {}
    }
    acquireWakeLock();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") acquireWakeLock();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      try { wakeLockRef.current?.release(); } catch (_) {}
    };
  }, []);

  // Bump this counter whenever localStreamRef changes so effects re-run
  const [localStreamVersion, setLocalStreamVersion] = useState(0);
  const bumpLocalStream = useCallback((stream: MediaStream | null) => {
    localStreamRef.current = stream;
    setLocalStreamVersion((v) => v + 1);
  }, []);

  // Keep local video in sync — re-runs on orientation, fullscreen, and minimized changes
  useLayoutEffect(() => {
    const vid = localVideoRef.current;
    if (!vid) return;
    const shouldShow = mainStagePeerId === peerId && (isVideoOn || isScreenSharing);
    if (shouldShow && localStreamRef.current) {
      if (vid.srcObject !== localStreamRef.current) {
        vid.srcObject = localStreamRef.current;
      }
      vid.play().catch(() => {});
    }
  }, [isVideoOn, isScreenSharing, mainStagePeerId, peerId, minimized, isLandMobile, isFullscreen, localStreamVersion]);

  // Keep remote video in sync — re-runs on orientation, fullscreen, and minimized changes
  useLayoutEffect(() => {
    const vid = remoteVideoRef.current;
    if (!vid || !mainStagePeerId || mainStagePeerId === peerId) return;
    const stream = remoteStreams.get(mainStagePeerId) ?? null;
    if (stream) {
      if (vid.srcObject !== stream) vid.srcObject = stream;
      vid.play().catch(() => {});
    }
  }, [mainStagePeerId, peerId, remoteStreams, minimized, isLandMobile, isFullscreen]);

  // Sync PiP video to main speaker stream whenever minimized
  useLayoutEffect(() => {
    if (!minimized) return;
    const el = pipVideoRef.current;
    if (!el) return;
    let stream: MediaStream | null = null;
    if (mainStagePeerId && mainStagePeerId !== peerId) {
      stream = remoteStreams.get(mainStagePeerId) ?? [...remoteStreams.values()][0] ?? null;
    } else {
      stream = [...remoteStreams.values()][0] ?? localStreamRef.current ?? null;
    }
    if (el.srcObject !== stream) {
      el.srcObject = stream;
      if (stream) el.play().catch(() => {});
    }
  });

  // ── Orientation detection ────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const isLand = window.matchMedia("(orientation: landscape)").matches;
      setIsLandMobile(isTouch && isLand);
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  // ── Camera track recovery on orientation change ───────────────────────────
  // iOS Safari kills the camera MediaStreamTrack when the device rotates.
  // After a short settle delay, re-fetch the live track from LiveKit and
  // bump localStreamRef so all video elements re-attach automatically.
  useEffect(() => {
    const recover = () => {
      // Give the browser ~400ms to settle the new orientation
      setTimeout(() => {
        if (!roomRef.current || !isVideoOn) return;
        const camPub = roomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
        if (!camPub?.track) return;
        const mst = camPub.track.mediaStreamTrack;
        // Refresh if the underlying track ended (iOS) or if our ref is stale
        const current = localStreamRef.current;
        const isStale = !current || mst.readyState === "ended" ||
          !current.getVideoTracks().includes(mst);
        if (isStale) {
          bumpLocalStream(new MediaStream([mst]));
        }
      }, 400);
    };
    window.addEventListener("orientationchange", recover);
    window.addEventListener("resize", recover);
    return () => {
      window.removeEventListener("orientationchange", recover);
      window.removeEventListener("resize", recover);
    };
  }, [isVideoOn, bumpLocalStream]);

  const scheduleHideOverlay = useCallback(() => {
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = setTimeout(() => setOverlayVisible(false), 3000);
  }, []);

  const handleVideoTouch = useCallback(() => {
    if (overlayVisible) {
      setOverlayVisible(false);
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    } else {
      setOverlayVisible(true);
      scheduleHideOverlay();
    }
  }, [overlayVisible, scheduleHideOverlay]);

  const handleVideoHoverEnter = useCallback(() => {
    setOverlayVisible(true);
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
  }, []);

  const handleVideoHoverLeave = useCallback(() => {
    setOverlayVisible(false);
  }, []);

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0] ?? "").join("").slice(0, 2).toUpperCase();

  // ── Enumerate devices ────────────────────────────────────────────────────────
  const enumerateDevices = useCallback(async () => {
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(devices.filter((d) => d.kind === "audioinput"));
      setVideoInputs(devices.filter((d) => d.kind === "videoinput"));
      setAudioOutputs(devices.filter((d) => d.kind === "audiooutput"));
      tmp?.getTracks().forEach((t) => t.stop());
    } catch {}
  }, []);

  useEffect(() => { enumerateDevices(); }, [enumerateDevices]);

  // ── applySpeakerToAll — route audio output via LiveKit ───────────────────────
  const applySpeakerToAll = useCallback(async (deviceId: string) => {
    if (roomRef.current && deviceId) {
      await roomRef.current.switchActiveDevice("audiooutput", deviceId).catch(() => {});
    }
  }, []);

  // ── toggleMic ────────────────────────────────────────────────────────────────
  const toggleMic = useCallback(async () => {
    if (myRoleRef.current === "guest") return;
    const canUnmute = myRoleRef.current === "admin" || myRoleRef.current === "co-host" || unmutingAllowedRef.current;
    if (isMutedRef.current && !canUnmute) return;

    if (!roomRef.current) {
      toast({ title: "Not connected", description: "Video server not connected yet. Please wait or reconnect.", variant: "destructive" });
      return;
    }

    const newMuted = !isMutedRef.current;
    isMutedRef.current = newMuted;
    setIsMuted(newMuted);

    await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted).catch((err: any) => {
      if (err?.name === "NotAllowedError") {
        toast({ title: "Microphone blocked", description: "Allow microphone access in your browser settings.", variant: "destructive" });
      }
    });
    try { await confApi("POST", `/api/conference/${meetingId}/ping`, { peerId, isMuted: newMuted }); } catch {}
  }, [meetingId, peerId, toast]);

  // ── handleMicChange ──────────────────────────────────────────────────────────
  const handleMicChange = (deviceId: string) => {
    setSelectedMicId(deviceId);
    if (micSwitchTimerRef.current) clearTimeout(micSwitchTimerRef.current);
    micSwitchTimerRef.current = setTimeout(async () => {
      if (roomRef.current) {
        await roomRef.current.switchActiveDevice("audioinput", deviceId || "default").catch(() => {});
      }
    }, 350);
  };

  // ── handleCameraChange ───────────────────────────────────────────────────────
  const handleCameraChange = (deviceId: string) => {
    setSelectedCameraId(deviceId);
    if (cameraSwitchTimerRef.current) clearTimeout(cameraSwitchTimerRef.current);
    cameraSwitchTimerRef.current = setTimeout(async () => {
      if (!isVideoOn || !roomRef.current) return;
      await roomRef.current.switchActiveDevice("videoinput", deviceId || "default").catch(() => {});
      // Refresh the local video stream from the new camera
      const camPub = roomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub?.track) {
        bumpLocalStream(new MediaStream([camPub.track.mediaStreamTrack]));
      }
    }, 350);
  };

  // ── toggleVideo ──────────────────────────────────────────────────────────────
  const toggleVideo = useCallback(async () => {
    if (myRoleRef.current !== "admin" && myRoleRef.current !== "co-host") return;
    if (!roomRef.current) {
      toast({ title: "Not connected", description: "Video server not connected. Please wait or use the Reconnect button.", variant: "destructive" });
      return;
    }

    if (!isVideoOn) {
      if (isScreenSharingRef.current) {
        await roomRef.current.localParticipant.setScreenShareEnabled(false).catch(() => {});
        localStreamRef.current = null;
        setIsScreenSharing(false);
        confApi("POST", `/api/conference/${meetingId}/broadcast`, {
          fromPeer: peerId, signalType: "screen-share-stop", payload: JSON.stringify({ peerId }),
        }).catch(() => {});
      }
      try {
        const camOptions = selectedCameraId ? { deviceId: selectedCameraId } : undefined;
        await roomRef.current.localParticipant.setCameraEnabled(true, camOptions);
        const camPub = roomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
        if (camPub?.track) {
          bumpLocalStream(new MediaStream([camPub.track.mediaStreamTrack]));
        }
        setIsVideoOn(true);
        setMainStagePeerId(peerId);
      } catch (err: any) {
        if (err?.name === "NotAllowedError") {
          toast({ title: "Camera blocked", description: "Allow camera access in your browser settings.", variant: "destructive" });
        } else {
          toast({ title: "Camera error", description: err?.message || "Could not start camera.", variant: "destructive" });
        }
      }
    } else {
      await roomRef.current.localParticipant.setCameraEnabled(false).catch(() => {});
      bumpLocalStream(null);
      setIsVideoOn(false);
      setMainStagePeerId((s) => (s === peerId ? null : s));
    }
  }, [isVideoOn, peerId, meetingId, selectedCameraId, toast, bumpLocalStream]);

  // ── toggleScreenShare ────────────────────────────────────────────────────────
  const toggleScreenShare = useCallback(async () => {
    if (!roomRef.current) return;

    if (!isScreenSharing) {
      // Check browser support upfront with a clear mobile-friendly message
      if (typeof (navigator.mediaDevices as any)?.getDisplayMedia !== "function") {
        const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
        toast({
          title: "Screen sharing not supported",
          description: isIOS
            ? "Screen sharing requires Safari 16.4 or later on iPhone/iPad. Update iOS in Settings → General → Software Update."
            : "Use Chrome 88+ on Android. Make sure your browser is up to date.",
          variant: "destructive",
        });
        return;
      }
      try {
        if (isVideoOn) {
          await roomRef.current.localParticipant.setCameraEnabled(false).catch(() => {});
          setIsVideoOn(false);
        }
        // Do NOT request audio here — iOS Safari rejects getDisplayMedia entirely when
        // audio:true is passed, and Android Chrome is also unreliable with it.
        // System audio sharing is handled separately via the Audio Share button.
        await roomRef.current.localParticipant.setScreenShareEnabled(true, {
          audio: false,
          contentHint: "detail",
        });
        const screenPub = roomRef.current.localParticipant.getTrackPublication(Track.Source.ScreenShare);
        if (screenPub?.track) {
          bumpLocalStream(new MediaStream([screenPub.track.mediaStreamTrack]));
          screenPub.track.mediaStreamTrack.onended = () => {
            setIsScreenSharing(false);
            setIsVideoOn(false);
            bumpLocalStream(null);
            setMainStagePeerId((s) => (s === peerId ? null : s));
            if (roomRef.current) {
              roomRef.current.localParticipant.setScreenShareEnabled(false).catch(() => {});
            }
            confApi("POST", `/api/conference/${meetingId}/broadcast`, {
              fromPeer: peerId, signalType: "screen-share-stop", payload: JSON.stringify({ peerId }),
            }).catch(() => {});
          };
        }
        setIsVideoOn(false);
        setIsScreenSharing(true);
        setMainStagePeerId(peerId);
        confApi("POST", `/api/conference/${meetingId}/broadcast`, {
          fromPeer: peerId, signalType: "screen-share-start", payload: JSON.stringify({ peerId }),
        }).catch(() => {});
      } catch (err: any) {
        if (err?.name === "NotAllowedError" || err?.name === "AbortError") {
          // User cancelled the system picker — silent
        } else if (err?.name === "NotSupportedError" || err?.name === "TypeError") {
          const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
          toast({
            title: "Screen sharing not supported",
            description: isIOS
              ? "Make sure you are using Safari 16.4+ on iOS. Screen sharing is not available in Chrome on iPhone."
              : "Your browser does not support screen sharing. Try Chrome 88+ on Android.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Screen sharing failed",
            description: "Tap 'Start now' when the system prompt appears, then return to this app.",
            variant: "destructive",
          });
          console.error("Screen share error:", err);
        }
      }
    } else {
      await roomRef.current.localParticipant.setScreenShareEnabled(false).catch(() => {});
      bumpLocalStream(null);
      screenStreamRef.current = null;
      setIsScreenSharing(false);
      setIsVideoOn(false);
      setMainStagePeerId((s) => (s === peerId ? null : s));
      confApi("POST", `/api/conference/${meetingId}/broadcast`, {
        fromPeer: peerId, signalType: "screen-share-stop", payload: JSON.stringify({ peerId }),
      }).catch(() => {});
    }
  }, [isScreenSharing, isVideoOn, peerId, meetingId, bumpLocalStream]);

  // ── toggleAudioShare ─────────────────────────────────────────────────────────
  const toggleAudioShare = useCallback(async () => {
    if (!roomRef.current) return;

    if (isAudioSharing) {
      // Unpublish the LiveKit system audio track
      if (sysAudioTrackRef.current) {
        await roomRef.current.localParticipant.unpublishTrack(sysAudioTrackRef.current).catch(() => {});
        sysAudioTrackRef.current.stop();
        sysAudioTrackRef.current = null;
      }
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setIsAudioSharing(false);
      toast({ title: "Device audio stopped" });
    } else {
      if (typeof (navigator.mediaDevices as any)?.getDisplayMedia !== "function") {
        toast({
          title: "Audio sharing not supported",
          description: "Device audio sharing requires Chrome on Android (v74+). Not supported on iOS Safari.",
          variant: "destructive",
        });
        return;
      }
      try {
        let stream: MediaStream | null = null;

        // Try audio-only first (Android Chrome), then fall back to video+audio
        try {
          stream = await (navigator.mediaDevices as any).getDisplayMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
            video: false,
          });
        } catch {
          try {
            stream = await (navigator.mediaDevices as any).getDisplayMedia({
              audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
              video: { width: 1, height: 1, frameRate: 1 },
            });
          } catch (err2: any) {
            if (err2?.name === "NotAllowedError" || err2?.name === "AbortError") {
              return;
            }
            toast({
              title: "Could not share audio",
              description: err2?.name === "NotSupportedError"
                ? "Device audio sharing requires Chrome on Android. Not supported on iOS."
                : "On Android: tap 'Share' then tick 'Share device audio'. On iPhone: use a laptop instead.",
              variant: "destructive",
            });
            return;
          }
        }

        if (!stream) return;

        // Drop video tracks — we only want the audio
        stream.getVideoTracks().forEach((t) => { t.stop(); stream!.removeTrack(t); });

        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) {
          stream.getTracks().forEach((t) => t.stop());
          toast({
            title: "No device audio captured",
            description: "On Android: tick 'Share device audio' before tapping Share. On iPhone: not supported.",
            variant: "destructive",
          });
          return;
        }

        screenStreamRef.current = stream;

        // Wrap in a LiveKit LocalAudioTrack and publish as Unknown so the real mic stays usable
        const livekitAudioTrack = new LocalAudioTrack(audioTrack, undefined, true);
        await roomRef.current.localParticipant.publishTrack(livekitAudioTrack, {
          source: Track.Source.Unknown,
        });
        sysAudioTrackRef.current = livekitAudioTrack;

        audioTrack.onended = async () => {
          if (!roomRef.current) return;
          if (sysAudioTrackRef.current) {
            await roomRef.current.localParticipant.unpublishTrack(sysAudioTrackRef.current).catch(() => {});
            sysAudioTrackRef.current.stop();
            sysAudioTrackRef.current = null;
          }
          screenStreamRef.current = null;
          setIsAudioSharing(false);
        };

        setIsAudioSharing(true);
        toast({ title: "Sharing device audio 🔊", description: "Participants can now hear your device audio." });
      } catch (err: any) {
        if (err?.name !== "NotAllowedError" && err?.name !== "AbortError") {
          toast({ title: "Could not share audio", description: err?.message || "On Android: tick 'Share device audio' when prompted.", variant: "destructive" });
        }
      }
    }
  }, [isAudioSharing, toast]);

  const showReaction = useCallback((emoji: string) => {
    const id = crypto.randomUUID();
    const x = 10 + Math.random() * 78;
    setFloatingEmojis((prev) => [...prev, { id, emoji, x }]);
    setTimeout(() => setFloatingEmojis((prev) => prev.filter((e) => e.id !== id)), 2600);
  }, []);

  const sendReaction = useCallback(async (emoji: string) => {
    showReaction(emoji);
    setActivePanel(null);
    try {
      await confApi("POST", `/api/conference/${meetingId}/broadcast`, {
        fromPeer: peerId, signalType: "reaction", payload: JSON.stringify({ emoji }),
      });
    } catch {}
  }, [meetingId, peerId, showReaction]);

  const toggleHandRaise = useCallback(async () => {
    const raised = !handRaised;
    setHandRaised(raised);
    try {
      await confApi("POST", `/api/conference/${meetingId}/broadcast`, {
        fromPeer: peerId, signalType: "hand-raise", payload: JSON.stringify({ raised }),
      });
    } catch {}
  }, [handRaised, meetingId, peerId]);

  const lowerHandForPeer = useCallback(async (targetPeerId: string) => {
    setRaisedHands((prev) => { const n = new Set(prev); n.delete(targetPeerId); return n; });
    setRaisedHandsOrder((prev) => prev.filter((h) => h.peerId !== targetPeerId));
    try {
      await confApi("POST", `/api/conference/${meetingId}/broadcast`, {
        fromPeer: peerId, signalType: "hand-lower", payload: JSON.stringify({ targetPeerId }),
      });
    } catch {}
  }, [meetingId, peerId]);

  // ── processSignals — handles non-WebRTC application signals ──────────────────
  const processSignals = useCallback(async () => {
    try {
      const signals: any[] = await confApi("GET", `/api/conference/${meetingId}/signals/${peerId}?after=${lastSignalIdRef.current}`);
      if (!signals.length) return;
      for (const sig of signals) {
        lastSignalIdRef.current = Math.max(lastSignalIdRef.current, sig.id);
        const from = sig.fromPeer;
        if (sig.signalType === "kicked") { onLeave(); return; }
        if (sig.signalType === "meeting-ended") { onLeave(); return; }
        if (sig.signalType === "force-mute") {
          isMutedRef.current = true;
          setIsMuted(true);
          if (roomRef.current) {
            await roomRef.current.localParticipant.setMicrophoneEnabled(false).catch(() => {});
          }
          continue;
        }
        if (sig.signalType === "role-changed") {
          try { const d = JSON.parse(sig.payload); setMyRole(d.role); } catch {} continue;
        }
        if (sig.signalType === "reaction") {
          try { const d = JSON.parse(sig.payload); showReaction(d.emoji); } catch {} continue;
        }
        if (sig.signalType === "hand-raise") {
          try {
            const d = JSON.parse(sig.payload);
            const raiserName = participants.find((p) => p.peerId === from)?.displayName ?? from;
            if (d.raised) {
              setRaisedHands((prev) => { const next = new Set(prev); next.add(from); return next; });
              setRaisedHandsOrder((prev) => {
                if (prev.some((h) => h.peerId === from)) return prev;
                return [...prev, { peerId: from, displayName: raiserName, ts: Date.now() }];
              });
              if (isAdminOrCoHost) {
                toast({ title: "✋ Hand Raised", description: `${raiserName} wants to speak`, duration: 4000 });
              }
            } else {
              setRaisedHands((prev) => { const next = new Set(prev); next.delete(from); return next; });
              setRaisedHandsOrder((prev) => prev.filter((h) => h.peerId !== from));
            }
          } catch {} continue;
        }
        if (sig.signalType === "hand-lower") {
          try {
            const d = JSON.parse(sig.payload);
            setRaisedHands((prev) => { const n = new Set(prev); n.delete(d.targetPeerId); return n; });
            setRaisedHandsOrder((prev) => prev.filter((h) => h.peerId !== d.targetPeerId));
            if (d.targetPeerId === peerId) setHandRaised(false);
          } catch {} continue;
        }
        if (sig.signalType === "screen-share-start") {
          try { setMainStagePeerId(from); } catch {} continue;
        }
        if (sig.signalType === "screen-share-stop") {
          try { setMainStagePeerId((s) => (s === from ? null : s)); } catch {} continue;
        }
        // WebRTC offer/answer/ice signals are ignored — LiveKit handles media transport
      }
    } catch {}
  }, [meetingId, peerId, onLeave, showReaction]);

  // ── updateParticipants — poll DB state (no peer creation needed with LiveKit) ─
  const updateParticipants = useCallback(async () => {
    try {
      const data: any[] = await confApi("GET", `/api/conference/${meetingId}/participants`);
      setParticipants(data);
    } catch {}
  }, [meetingId]);

  const updateMessages = useCallback(async () => {
    try {
      const data: any[] = await confApi("GET", `/api/conference/${meetingId}/messages?after=${lastMessageIdRef.current}`);
      if (data.length) {
        const humanOnly = data.filter((m) => m.msgType === "chat" && typeof m.content === "string");
        if (humanOnly.length) {
          setMessages((prev) => {
            const existing = new Set(prev.map((m) => m.id));
            return [...prev, ...humanOnly.filter((m) => !existing.has(m.id))];
          });
          setNewMsgCount((c) => c + humanOnly.length);
          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
        lastMessageIdRef.current = Math.max(...data.map((m) => m.id));
      }
    } catch {}
  }, [meetingId]);

  const heartbeat = useCallback(async () => {
    try {
      const d = await confApi("POST", `/api/conference/${meetingId}/ping`, { peerId, isMuted: isMutedRef.current });
      if (d.unmutingAllowed !== undefined) setUnmutingAllowed(d.unmutingAllowed);
    } catch {}
  }, [meetingId, peerId]);

  const fetchJoinRequests = useCallback(async () => {
    if (myRoleRef.current !== "admin" && myRoleRef.current !== "co-host") return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/meetings/${meetingId}/join-requests`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (res.ok) {
        const data = await res.json();
        setJoinRequests(Array.isArray(data) ? data : []);
      }
    } catch {}
  }, [meetingId]);

  const playJoinRequestSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.13;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.3, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.start(t);
        osc.stop(t + 0.5);
      });
    } catch {}
  }, []);

  useEffect(() => {
    if (!isAdminOrCoHost || joinRequests.length === 0) return;
    const newRequests = joinRequests.filter(r => !shownJoinRequestIdsRef.current.has(r.memberId ?? r.id));
    if (newRequests.length === 0) return;
    newRequests.forEach(r => shownJoinRequestIdsRef.current.add(r.memberId ?? r.id));
    const first = newRequests[0];
    const name = `${first.member?.firstName ?? ""} ${first.member?.lastName ?? ""}`.trim() || "Someone";
    playJoinRequestSound();
    if (joinAlertTimerRef.current) clearTimeout(joinAlertTimerRef.current);
    setJoinRequestAlert({ name, memberId: first.memberId });
    joinAlertTimerRef.current = setTimeout(() => setJoinRequestAlert(null), 8000);
  }, [joinRequests, isAdminOrCoHost, playJoinRequestSound]);

  const admitParticipant = useCallback(async (memberId: number) => {
    setAdmittingId(memberId);
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/meetings/${meetingId}/join-requests/${memberId}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      setJoinRequests((prev) => prev.filter((r: any) => r.memberId !== memberId));
    } catch {}
    finally { setAdmittingId(null); }
  }, [meetingId]);

  const denyParticipant = useCallback(async (memberId: number) => {
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/meetings/${meetingId}/join-requests/${memberId}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      setJoinRequests((prev) => prev.filter((r: any) => r.memberId !== memberId));
    } catch {}
  }, [meetingId]);

  // ── Mount — connect to LiveKit SFU ───────────────────────────────────────────
  const connectLiveKit = useCallback(async (cancelled: { v: boolean }) => {
    setLivekitStatus("connecting");
    setLivekitError(null);
    try {
      const res = await confApi("POST", `/api/conference/${meetingId}/livekit-token`, { peerId });
      if (cancelled.v) return;

      const isHost = myRoleRef.current === "admin" || myRoleRef.current === "co-host";

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: isHost ? 2 : 1,
        },
        videoCaptureDefaults: {
          resolution: isHost
            ? { width: 1920, height: 1080, frameRate: 30 }
            : { width: 1280, height: 720, frameRate: 24 },
        },
        publishDefaults: {
          audioPreset: isHost ? AudioPresets.musicStereo : AudioPresets.music,
          dtx: true,
          red: true,
          simulcast: true,
          videoSimulcastLayers: isHost
            ? [VideoPresets.h360, VideoPresets.h720, VideoPresets.h1080]
            : [VideoPresets.h180, VideoPresets.h360, VideoPresets.h720],
          videoEncoding: isHost
            ? { maxBitrate: 4_000_000, maxFramerate: 30 }
            : { maxBitrate: 1_500_000, maxFramerate: 24 },
          backupCodec: true,
        },
      });
      roomRef.current = room;

      // Remote track subscriptions → populate remoteStreams Map
      room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
        if (track.kind === Track.Kind.Video) {
          const stream = new MediaStream([track.mediaStreamTrack]);
          setRemoteStreams((prev) => new Map(prev).set(participant.identity, stream));
          setMainStagePeerId((cur) => {
            if (isScreenSharingRef.current && cur === peerId) return cur;
            return participant.identity;
          });
        }
        if (track.kind === Track.Kind.Audio) {
          const audioEl = track.attach() as HTMLAudioElement;
          audioEl.dataset.livekitPeer = participant.identity;
          audioEl.autoplay = true;
          (audioContainerRef.current ?? document.body).appendChild(audioEl);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
        if (track.kind === Track.Kind.Video) {
          const otherVideo = Array.from(participant.trackPublications.values()).find(
            (p) => p.kind === Track.Kind.Video && p.track && p.track !== track,
          );
          if (otherVideo?.track) {
            const stream = new MediaStream([otherVideo.track.mediaStreamTrack]);
            setRemoteStreams((prev) => new Map(prev).set(participant.identity, stream));
          } else {
            setRemoteStreams((prev) => { const n = new Map(prev); n.delete(participant.identity); return n; });
            setMainStagePeerId((s) => (s === participant.identity ? null : s));
          }
        }
        if (track.kind === Track.Kind.Audio) {
          track.detach();
        }
      });

      // Speaking detection via LiveKit
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const speaking = new Set<string>(
          speakers.map((s) => s.identity === peerId ? "__local__" : s.identity),
        );
        setSpeakingPeers(speaking);
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        setRemoteStreams((prev) => { const n = new Map(prev); n.delete(participant.identity); return n; });
        setMainStagePeerId((s) => (s === participant.identity ? null : s));
      });

      room.on(RoomEvent.Disconnected, (reason) => {
        if (!cancelled.v) {
          setSpeakingPeers(new Set());
          if (reason && reason !== "CLIENT_INITIATED") {
            setLivekitStatus("failed");
            setLivekitError("Disconnected from video server. Try reconnecting.");
          }
        }
      });

      room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
        const id = participant.isLocal ? "__local__" : participant.identity;
        setPeerQuality((prev) => new Map(prev).set(id, quality));
      });

      // When LiveKit re-publishes the local camera (e.g. iOS restarts it after rotation),
      // refresh localStreamRef so the video element stays live.
      room.on(RoomEvent.LocalTrackPublished, (pub) => {
        if (pub.source === Track.Source.Camera && pub.track) {
          bumpLocalStream(new MediaStream([pub.track.mediaStreamTrack]));
        }
      });

      await room.connect(res.url, res.token);
      if (cancelled.v) { room.disconnect(); return; }

      setLivekitStatus("connected");

      // Start with mic published but muted (guests don't publish)
      if (myRoleRef.current !== "guest") {
        await room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
        isMutedRef.current = true;
        setIsMuted(true);
      }
    } catch (err: any) {
      if (!cancelled.v) {
        const msg = err?.message || "Could not connect to video server";
        console.warn("[LiveKit] Connection failed:", msg, err);
        setLivekitStatus("failed");
        setLivekitError(msg);
        toast({
          title: "Video connection failed",
          description: msg.includes("Join the meeting first")
            ? "Session error — please leave and rejoin."
            : "Check your internet connection and try reconnecting.",
          variant: "destructive",
        });
      }
    }
  }, [meetingId, peerId, toast]);

  useEffect(() => {
    joinedRef.current = true;
    const cancelled = { v: false };

    connectLiveKit(cancelled);

    // ── SSE real-time connection — replaces participant/message/signal polling ──
    // One persistent HTTP stream replaces 3 setInterval DB polls.
    // On network hiccup the browser reconnects automatically; we pass updated
    // cursor positions so the server can replay anything missed.
    const connectSSE = () => {
      if (cancelled.v) return;
      const url =
        `/api/conference/${meetingId}/stream` +
        `?peerId=${encodeURIComponent(peerId)}` +
        `&role=${encodeURIComponent(myRoleRef.current)}` +
        `&afterSignal=${lastSignalIdRef.current}` +
        `&afterMessage=${lastMessageIdRef.current}`;

      const sse = new EventSource(url);
      sseRef.current = sse;

      // Full participant list is sent on connect + after every join/leave
      sse.addEventListener("participants", (e: MessageEvent) => {
        try { setParticipants(JSON.parse(e.data)); } catch {}
      });

      // Each new chat message is pushed the moment it's saved
      sse.addEventListener("message", (e: MessageEvent) => {
        try {
          const m = JSON.parse(e.data);
          if (m.msgType !== "chat" || typeof m.content !== "string") return;
          setMessages((prev) => {
            if (prev.some((x: any) => x.id === m.id)) return prev;
            lastMessageIdRef.current = Math.max(lastMessageIdRef.current, m.id);
            setNewMsgCount((c) => c + 1);
            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
            return [...prev, m];
          });
        } catch {}
      });

      // Application signals (kick, force-mute, reactions, hand-raise, role-change…)
      // arrive here instead of being polled every 2.5 s
      sse.addEventListener("signal", async (e: MessageEvent) => {
        try {
          const sig = JSON.parse(e.data);
          lastSignalIdRef.current = Math.max(lastSignalIdRef.current, sig.id);
          const from: string = sig.fromPeer;

          if (sig.signalType === "kicked") { onLeave(); return; }
          if (sig.signalType === "meeting-ended") { onLeave(); return; }
          if (sig.signalType === "force-mute") {
            isMutedRef.current = true;
            setIsMuted(true);
            roomRef.current?.localParticipant.setMicrophoneEnabled(false).catch(() => {});
            // Also directly disable the raw track so active audio stops immediately
            const micPub = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Microphone);
            if (micPub?.track?.mediaStreamTrack) {
              micPub.track.mediaStreamTrack.enabled = false;
            }
            try { await confApi("POST", `/api/conference/${meetingId}/ping`, { peerId, isMuted: true }); } catch {}
            return;
          }
          if (sig.signalType === "mute-all") {
            // Host muted all — disable mic regardless of role
            isMutedRef.current = true;
            setIsMuted(true);
            roomRef.current?.localParticipant.setMicrophoneEnabled(false).catch(() => {});
            // Also directly disable the raw track so active audio stops immediately
            const micPubAll = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Microphone);
            if (micPubAll?.track?.mediaStreamTrack) {
              micPubAll.track.mediaStreamTrack.enabled = false;
            }
            try { await confApi("POST", `/api/conference/${meetingId}/ping`, { peerId, isMuted: true }); } catch {}
            return;
          }
          if (sig.signalType === "role-changed") {
            try { const d = JSON.parse(sig.payload); setMyRole(d.role); } catch {}
            return;
          }
          if (sig.signalType === "reaction") {
            try { const d = JSON.parse(sig.payload); showReaction(d.emoji); } catch {}
            return;
          }
          if (sig.signalType === "hand-raise") {
            try {
              const d = JSON.parse(sig.payload);
              const raiserName = participants.find((p) => p.peerId === from)?.displayName ?? from;
              if (d.raised) {
                setRaisedHands((prev) => { const next = new Set(prev); next.add(from); return next; });
                setRaisedHandsOrder((prev) => {
                  if (prev.some((h) => h.peerId === from)) return prev;
                  return [...prev, { peerId: from, displayName: raiserName, ts: Date.now() }];
                });
                if (isAdminOrCoHost) {
                  toast({ title: "✋ Hand Raised", description: `${raiserName} wants to speak`, duration: 4000 });
                }
              } else {
                setRaisedHands((prev) => { const next = new Set(prev); next.delete(from); return next; });
                setRaisedHandsOrder((prev) => prev.filter((h) => h.peerId !== from));
              }
            } catch {}
            return;
          }
          if (sig.signalType === "hand-lower") {
            try {
              const d = JSON.parse(sig.payload);
              setRaisedHands((prev) => { const n = new Set(prev); n.delete(d.targetPeerId); return n; });
              setRaisedHandsOrder((prev) => prev.filter((h) => h.peerId !== d.targetPeerId));
              if (d.targetPeerId === peerId) setHandRaised(false);
            } catch {}
            return;
          }
          if (sig.signalType === "screen-share-start") {
            setMainStagePeerId(from); return;
          }
          if (sig.signalType === "screen-share-stop") {
            setMainStagePeerId((s) => (s === from ? null : s)); return;
          }
        } catch {}
      });

      // Join requests (admins/co-hosts only — server filters before sending)
      sse.addEventListener("joinRequests", (e: MessageEvent) => {
        try { setJoinRequests(JSON.parse(e.data)); } catch {}
      });

      // On error the browser will reconnect; we close and recreate with updated
      // cursor positions so we catch up on anything sent while disconnected
      sse.onerror = () => {
        sse.close();
        sseRef.current = null;
        if (!cancelled.v) setTimeout(connectSSE, 4000);
      };
    };

    connectSSE();

    // Heartbeat — only thing still polled; keeps presence record alive in DB
    const p4 = window.setInterval(heartbeat, 12000);
    // Join-requests slow fallback (SSE is real-time; this catches cold-start edge cases)
    const p5 = window.setInterval(fetchJoinRequests, 30000);
    fetchJoinRequests();

    return () => {
      cancelled.v = true;
      clearInterval(p4); clearInterval(p5);
      sseRef.current?.close();
      sseRef.current = null;
      if (joinedRef.current) confApi("POST", `/api/conference/${meetingId}/leave`, { peerId }).catch(() => {});
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      if (audioContainerRef.current) {
        audioContainerRef.current.querySelectorAll("audio").forEach((el) => {
          el.pause();
          el.srcObject = null;
          el.remove();
        });
      }
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    setNewMsgCount(0);
  }, [messages.length]);

  const onSend = useCallback(async (msg: string) => {
    if (myRole === "guest") return;
    await confApi("POST", `/api/conference/${meetingId}/message`, { peerId, content: msg, msgType: "chat" });
  }, [meetingId, peerId, myRole]);

  const control = async (action: string, targetPeerId?: string) => {
    try {
      const d = await confApi("POST", `/api/conference/${meetingId}/control`, { peerId, action, targetPeerId });
      if (d.unmutingAllowed !== undefined) setUnmutingAllowed(d.unmutingAllowed);
    } catch {}
  };

  const canSpeak = myRole !== "guest";
  const canUnmute = isAdminOrCoHost || unmutingAllowed;
  const mainStageStream = mainStagePeerId && mainStagePeerId !== peerId
    ? remoteStreams.get(mainStagePeerId) ?? null : null;

  const roleColor = myRole === "admin"
    ? { bg: "rgba(234,179,8,0.2)", text: "#facc15" }
    : myRole === "co-host"
    ? { bg: "rgba(59,130,246,0.2)", text: "#93c5fd" }
    : myRole === "guest"
    ? { bg: "rgba(107,114,128,0.2)", text: "#9ca3af" }
    : { bg: "rgba(168,85,247,0.2)", text: "#c4b5fd" };

  const togglePanel = (panel: string) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  // ── ParticipantCard ──────────────────────────────────────────────────────────
  const SignalBars = ({ quality }: { quality?: ConnectionQuality }) => {
    const bars = [
      { minQ: ConnectionQuality.Poor, color: quality === ConnectionQuality.Lost ? "#6b7280" : "#ef4444" },
      { minQ: ConnectionQuality.Good, color: quality === ConnectionQuality.Good || quality === ConnectionQuality.Excellent ? "#facc15" : "rgba(255,255,255,0.15)" },
      { minQ: ConnectionQuality.Excellent, color: quality === ConnectionQuality.Excellent ? "#4ade80" : "rgba(255,255,255,0.15)" },
    ];
    const heights = [4, 6, 8];
    if (quality === undefined) return null;
    return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: 9 }} title={`Signal: ${quality}`}>
        {bars.map((b, i) => (
          <div key={i} style={{ width: 3, height: heights[i], borderRadius: 1, background: quality !== ConnectionQuality.Lost && quality !== undefined ? (i === 0 ? (quality === ConnectionQuality.Poor || quality === ConnectionQuality.Good || quality === ConnectionQuality.Excellent ? "#ef4444" : "rgba(255,255,255,0.15)") : i === 1 ? (quality === ConnectionQuality.Good || quality === ConnectionQuality.Excellent ? "#facc15" : "rgba(255,255,255,0.15)") : (quality === ConnectionQuality.Excellent ? "#4ade80" : "rgba(255,255,255,0.15)")) : "rgba(255,255,255,0.15)" }} />
        ))}
      </div>
    );
  };

  const ParticipantCard = ({ p }: { p: any }) => {
    const isMe = p.peerId === peerId;
    const isHost = p.role === "admin" || p.role === "co-host";
    const hasVideo = remoteStreams.has(p.peerId);
    const hasRaisedHand = !isMe && raisedHands.has(p.peerId);
    const isSpeakingLocal = isMe && speakingPeers.has("__local__") && !isMuted;
    const isSpeakingRemote = !isMe && speakingPeers.has(p.peerId) && !p.isMuted;
    const isSpeaking = isSpeakingLocal || isSpeakingRemote;
    const qualityKey = isMe ? "__local__" : p.peerId;
    const quality = peerQuality.get(qualityKey);
    return (
      <div onClick={() => hasVideo ? setMainStagePeerId(p.peerId) : undefined}
        style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "7px 6px", borderRadius: 12, width: 68, cursor: hasVideo ? "pointer" : "default", background: hasRaisedHand ? "rgba(234,179,8,0.15)" : isMe ? "rgba(109,40,217,0.25)" : "rgba(255,255,255,0.04)", border: isSpeaking ? "1.5px solid rgba(74,222,128,0.7)" : hasRaisedHand ? "1px solid rgba(234,179,8,0.5)" : isMe ? "1px solid rgba(139,92,246,0.35)" : "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ position: "relative" }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: "bold", background: isMe ? "linear-gradient(135deg,#7c3aed,#db2777)" : "linear-gradient(135deg,#374151,#4b5563)", boxShadow: isSpeaking ? "0 0 0 2px rgba(74,222,128,0.5)" : "none" }}>{getInitials(p.displayName)}</div>
          <span style={{ position: "absolute", bottom: -1, right: -1, fontSize: 10 }}>
            {p.isMuted ? "🔇" : isSpeaking ? <span style={{ fontSize: 11, animation: "confPulse 0.6s infinite" }}>🎙️</span> : "🎙️"}
          </span>
          {isHost && <span style={{ position: "absolute", top: -2, left: -2, fontSize: 9 }}>⭐</span>}
          {hasRaisedHand && <span style={{ position: "absolute", top: -4, right: -4, fontSize: 14 }}>✋</span>}
          {quality !== undefined && (
            <span style={{ position: "absolute", bottom: -1, left: -2 }}>
              <SignalBars quality={quality} />
            </span>
          )}
        </div>
        <span style={{ fontSize: 9, color: "#d1d5db", width: "100%", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isMe ? "You" : p.displayName}</span>
        {isAdminOrCoHost && !isMe && (
          <div style={{ display: "flex", gap: 2 }}>
            <button onClick={(e) => { e.stopPropagation(); control("force-mute", p.peerId); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 9, color: "#6b7280", padding: 0 }}>🔇</button>
            <button onClick={(e) => { e.stopPropagation(); setConfirmKickPeerId(p.peerId); setConfirmKickName(p.displayName); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 9, color: "#ef4444", padding: 0 }}>✕</button>
            {p.role === "member" && <button onClick={(e) => { e.stopPropagation(); control("assign-host", p.peerId); }} title="Make Co-host" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 9, color: "#fbbf24", padding: 0 }}>★</button>}
            {p.role === "co-host" && <button onClick={(e) => { e.stopPropagation(); control("revoke-host", p.peerId); }} title="Remove Co-host" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 9, color: "#93c5fd", padding: 0 }}>✦</button>}
          </div>
        )}
      </div>
    );
  };

  // ── Toolbar button component ─────────────────────────────────────────────────
  const TBtn = ({
    icon, label, onClick, active = false, danger = false, disabled = false, badge = 0,
  }: {
    icon: React.ReactNode; label: string; onClick: () => void;
    active?: boolean; danger?: boolean; disabled?: boolean; badge?: number;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      style={{
        position: "relative",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        background: danger ? "rgba(220,38,38,0.85)" : active ? "rgba(139,92,246,0.28)" : "rgba(255,255,255,0.07)",
        border: active && !danger ? "1.5px solid rgba(139,92,246,0.55)" : "1.5px solid transparent",
        borderRadius: 12, padding: "9px 10px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.38 : 1,
        color: danger ? "white" : active ? "#c4b5fd" : "#9ca3af",
        minWidth: 58,
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
      }}
      className="conf-tbtn"
    >
      {icon}
      <span style={{ fontSize: 10, fontWeight: 500, whiteSpace: "nowrap", letterSpacing: "0.01em" }}>{label}</span>
      {badge > 0 && (
        <span style={{ position: "absolute", top: 5, right: 5, background: "#7c3aed", color: "white", borderRadius: 999, padding: "0 4px", fontSize: 9, fontWeight: 700, minWidth: 14, textAlign: "center" }}>{badge}</span>
      )}
    </button>
  );

  // ── Expandable panel above toolbar ──────────────────────────────────────────
  const PanelBox = ({ children }: { children: React.ReactNode }) => (
    <div style={{
      background: "#16162a",
      borderTop: "1px solid rgba(139,92,246,0.25)",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      padding: "12px 16px",
      flexShrink: 0,
    }}>
      {children}
    </div>
  );

  // ── PiP drag helpers ─────────────────────────────────────────────────────────
  const PIP_W = 268;
  const PIP_MIN_H = 60;

  const startPipDrag = (clientX: number, clientY: number) => {
    const el = pipContainerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    pipDragState.current = {
      startMouseX: clientX,
      startMouseY: clientY,
      startLeft: rect.left,
      startTop: rect.top,
    };
  };

  const movePipDrag = (clientX: number, clientY: number) => {
    if (!pipDragState.current) return;
    const dx = clientX - pipDragState.current.startMouseX;
    const dy = clientY - pipDragState.current.startMouseY;
    const newLeft = Math.max(0, Math.min(window.innerWidth - PIP_W, pipDragState.current.startLeft + dx));
    const newTop = Math.max(0, Math.min(window.innerHeight - PIP_MIN_H, pipDragState.current.startTop + dy));
    setPipPos({ left: newLeft, top: newTop });
  };

  const endPipDrag = () => { pipDragState.current = null; };

  // ── PiP mouse drag ────────────────────────────────────────────────────────────
  const handlePipMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === "BUTTON") return;
    e.preventDefault();
    startPipDrag(e.clientX, e.clientY);
    const onMove = (ev: MouseEvent) => movePipDrag(ev.clientX, ev.clientY);
    const onUp = () => {
      endPipDrag();
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // ── PiP touch drag (mobile) ───────────────────────────────────────────────────
  const handlePipTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === "BUTTON") return;
    const t = e.touches[0];
    startPipDrag(t.clientX, t.clientY);
  };

  const handlePipTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const t = e.touches[0];
    movePipDrag(t.clientX, t.clientY);
  };

  const handlePipTouchEnd = () => endPipDrag();

  // ── PiP mode — floating overlay injected into document.body via portal ────────
  if (minimized) {
    const hasVideo = !!(mainStagePeerId
      ? (mainStagePeerId !== peerId ? remoteStreams.get(mainStagePeerId) : localStreamRef.current)
      : ([...remoteStreams.values()][0] ?? localStreamRef.current));

    const pipStyle: React.CSSProperties = pipPos
      ? { position: "fixed", left: pipPos.left, top: pipPos.top, zIndex: 99999 }
      : { position: "fixed", bottom: 20, right: 20, zIndex: 99999 };

    return createPortal(
      <div
        ref={pipContainerRef}
        style={{
          ...pipStyle,
          width: 268, background: "#0d0d12",
          borderRadius: 16, overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.75), 0 0 0 1px rgba(139,92,246,0.25)",
          border: "1px solid rgba(139,92,246,0.2)",
          display: "flex", flexDirection: "column",
          cursor: "grab",
          userSelect: "none",
          touchAction: "none",
        }}
        onMouseDown={handlePipMouseDown}
        onTouchStart={handlePipTouchStart}
        onTouchMove={handlePipTouchMove}
        onTouchEnd={handlePipTouchEnd}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px 6px", background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", flexShrink: 0, display: "inline-block", animation: "confPulsePip 2s infinite" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "white", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meetingTitle}</span>
          <span style={{ fontSize: 9, color: "#9ca3af", flexShrink: 0 }}>{participants.length} online</span>
          <button
            onClick={onExpand}
            title="Return to meeting"
            style={{ flexShrink: 0, background: "rgba(139,92,246,0.18)", border: "1px solid rgba(139,92,246,0.35)", borderRadius: 6, color: "#c4b5fd", cursor: "pointer", padding: "3px 9px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            Maximize
          </button>
          <button
            onClick={onLeave}
            title="Leave meeting"
            style={{ flexShrink: 0, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 6, color: "#f87171", cursor: "pointer", padding: "3px 9px", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>
            Cancel
          </button>
        </div>

        <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", background: "#000", flexShrink: 0 }}>
          {hasVideo ? (
            <video
              ref={pipVideoRef}
              autoPlay
              playsInline
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#4c1d95)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "white" }}>
                {displayName.slice(0, 2).toUpperCase()}
              </div>
              <span style={{ fontSize: 10, color: "#6b7280" }}>No video</span>
            </div>
          )}
          {isMuted && (
            <div style={{ position: "absolute", bottom: 6, left: 8, background: "rgba(0,0,0,0.6)", borderRadius: 6, padding: "2px 6px", display: "flex", alignItems: "center", gap: 3 }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              <span style={{ fontSize: 9, color: "#f87171" }}>Muted</span>
            </div>
          )}
        </div>

        <div style={{ padding: "5px 10px 6px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span style={{ fontSize: 9, background: "rgba(139,92,246,0.18)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 999, padding: "1px 7px", fontWeight: 600, flexShrink: 0 }}>{myRole}</span>
          <span style={{ fontSize: 9, color: "#6b7280" }}>Drag to move · Maximize to return</span>
        </div>

        <style>{`@keyframes confPulsePip { 0%,100%{opacity:1}50%{opacity:.35} }`}</style>
      </div>,
      document.body
    );
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      position: globalFullScreen ? "fixed" : "relative",
      top: globalFullScreen ? 0 : undefined,
      left: globalFullScreen ? 0 : undefined,
      right: globalFullScreen ? 0 : undefined,
      bottom: globalFullScreen ? 0 : undefined,
      zIndex: globalFullScreen ? 9990 : undefined,
      width: globalFullScreen ? "100vw" : undefined,
      height: globalFullScreen ? "100dvh" : "calc(100vh - 100px)",
      minHeight: globalFullScreen ? undefined : 520,
      overflow: "hidden", background: "#09090b", color: "white", fontFamily: "inherit",
      borderRadius: globalFullScreen ? 0 : 16,
      boxShadow: globalFullScreen ? "none" : "0 25px 60px -10px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.15)",
      border: globalFullScreen ? "none" : "1px solid rgba(255,255,255,0.07)",
    }}>

      <style>{`
        @keyframes floatUp { 0% { transform:translateY(0) scale(1); opacity:1; } 80% { opacity:.8; } 100% { transform:translateY(-280px) scale(1.6); opacity:0; } }
        @keyframes confPulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
        @keyframes joinAlertIn { 0% { opacity:0; transform:translateX(-50%) translateY(-16px) scale(0.95); } 100% { opacity:1; transform:translateX(-50%) translateY(0) scale(1); } }
        .conf-tbtn:hover:not(:disabled) { filter: brightness(1.18); }
        .conf-tbtn:active:not(:disabled) { transform: scale(0.95); }
        @media (max-width: 768px) {
          .desktop-chat-panel { display: none !important; }
          .mobile-chat-below { display: flex !important; }
          .conf-tbtn { min-width: 44px !important; padding: 7px 6px !important; }
        }
        @media (min-width: 769px) {
          .mobile-chat-below { display: none !important; }
        }
      `}</style>


      {/* LiveKit connection status banner */}
      {livekitStatus !== "connected" && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 9000,
          background: livekitStatus === "failed" ? "rgba(220,38,38,0.92)" : "rgba(30,30,50,0.92)",
          color: "white", padding: "8px 16px",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
          fontSize: 13, fontWeight: 500, backdropFilter: "blur(8px)",
        }}>
          {livekitStatus === "connecting" ? (
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ animation: "confPulse 1.2s ease-in-out infinite" }}>
                <circle cx="8" cy="8" r="6" stroke="rgba(255,255,255,0.6)" strokeWidth="2" fill="none" />
              </svg>
              Connecting to video server…
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="white" strokeWidth="2" fill="none" /><line x1="8" y1="5" x2="8" y2="8.5" stroke="white" strokeWidth="2" strokeLinecap="round" /><circle cx="8" cy="11" r="1" fill="white" /></svg>
              {livekitError || "Video connection failed"}
              <button
                onClick={() => {
                  if (roomRef.current) { roomRef.current.disconnect(); roomRef.current = null; }
                  const c = { v: false };
                  connectLiveKit(c);
                }}
                style={{
                  background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)",
                  color: "white", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600,
                }}
              >Reconnect</button>
            </>
          )}
        </div>
      )}

      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 60, overflow: "hidden" }}>
        {floatingEmojis.map((fe) => (
          <span key={fe.id} style={{ position: "absolute", left: `${fe.x}%`, bottom: 100, fontSize: 28, animation: "floatUp 2.6s ease-out forwards", userSelect: "none" }}>{fe.emoji}</span>
        ))}
      </div>

      {joinRequestAlert && createPortal(
        <div style={{
          position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)",
          zIndex: 99998, minWidth: 320, maxWidth: 420, width: "90%",
          background: "linear-gradient(135deg, #1a1c2e 0%, #16162a 100%)",
          border: "1.5px solid rgba(234,179,8,0.5)",
          borderRadius: 16, padding: "16px 18px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.75), 0 0 0 1px rgba(234,179,8,0.15)",
          display: "flex", flexDirection: "column", gap: 12,
          animation: "joinAlertIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: "linear-gradient(135deg,#d97706,#b45309)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🔔</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "white", marginBottom: 2 }}>Join Request</div>
              <div style={{ fontSize: 13, color: "#fbbf24", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <strong>{joinRequestAlert.name}</strong> wants to join the meeting
              </div>
            </div>
            <button
              onClick={() => setJoinRequestAlert(null)}
              style={{ width: 26, height: 26, borderRadius: 6, background: "rgba(255,255,255,0.08)", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              ✕
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { admitParticipant(joinRequestAlert.memberId); setJoinRequestAlert(null); }}
              style={{ flex: 1, padding: "9px 0", borderRadius: 8, background: "#16a34a", border: "none", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              ✓ Admit
            </button>
            <button
              onClick={() => { denyParticipant(joinRequestAlert.memberId); setJoinRequestAlert(null); }}
              style={{ flex: 1, padding: "9px 0", borderRadius: 8, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#f87171", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              ✕ Deny
            </button>
          </div>
          {joinRequests.length > 1 && (
            <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
              +{joinRequests.length - 1} more waiting — open Participants to see all
            </div>
          )}
        </div>,
        document.body
      )}

      {confirmKickPeerId && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }}
          onClick={() => { setConfirmKickPeerId(null); setConfirmKickName(""); }}>
          <div style={{ background: "#18181b", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 14, padding: "28px 28px 20px", maxWidth: 340, width: "90%", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🚪</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "white", marginBottom: 8 }}>Remove Participant</div>
            <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 22, lineHeight: 1.5 }}>
              Remove <strong style={{ color: "white" }}>{confirmKickName}</strong> from this meeting? They will be disconnected immediately.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setConfirmKickPeerId(null); setConfirmKickName(""); }}
                style={{ flex: 1, padding: "10px 0", borderRadius: 8, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "#d1d5db", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={() => { control("kick", confirmKickPeerId!); setConfirmKickPeerId(null); setConfirmKickName(""); }}
                style={{ flex: 1, padding: "10px 0", borderRadius: 8, background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.5)", color: "#f87171", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                Remove
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showParticipantsFull && (
        <div style={{ position: "absolute", inset: 0, zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowParticipantsFull(false); setActivePanel(null); } }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />
          <div style={{ position: "relative", width: 340, maxWidth: "100%", height: "100%", background: "#111118", borderLeft: "1px solid rgba(139,92,246,0.2)", display: "flex", flexDirection: "column", zIndex: 1 }}>
            <div style={{ flexShrink: 0, padding: "14px 16px 10px", background: "#16162a", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: "white" }}>
                Participants <span style={{ fontWeight: 400, color: "#6b7280", fontSize: 12 }}>({participants.length})</span>
              </span>
              <button onClick={() => { setShowParticipantsFull(false); setActivePanel(null); }}
                style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}>
                ✕
              </button>
            </div>

            {isAdminOrCoHost && joinRequests.length > 0 && (
              <div style={{ flexShrink: 0, padding: "10px 12px 6px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                  ⏳ Waiting to Join ({joinRequests.length})
                </div>
                {joinRequests.map((r: any) => (
                  <div key={r.memberId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#374151,#6b7280)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {(r.name || r.displayName || "?").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)}
                    </div>
                    <span style={{ flex: 1, fontSize: 12, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name || r.displayName}</span>
                    <button onClick={() => admitParticipant(r.memberId)} style={{ padding: "4px 10px", background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.35)", borderRadius: 6, color: "#4ade80", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>✓ Admit</button>
                    <button onClick={() => denyParticipant(r.memberId)} style={{ padding: "4px 10px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 6, color: "#f87171", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ flexShrink: 0, padding: "10px 12px 6px" }}>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <span style={{ position: "absolute", left: 10, color: "#4b5563", fontSize: 14, pointerEvents: "none" }}>🔍</span>
                <input
                  type="text"
                  placeholder="Find a participant"
                  value={participantSearch}
                  onChange={(e) => setParticipantSearch(e.target.value)}
                  style={{ width: "100%", background: "#1e1e2e", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 8, padding: "8px 10px 8px 32px", color: "white", fontSize: 12, outline: "none", boxSizing: "border-box" }}
                />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
              {participants
                .filter((p) => !participantSearch || p.displayName.toLowerCase().includes(participantSearch.toLowerCase()))
                .map((p) => {
                  const isMe = p.peerId === peerId;
                  const isHost = p.role === "admin";
                  const isCo = p.role === "co-host";
                  const hasRaisedHand = !isMe && raisedHands.has(p.peerId);
                  const isSpeakingLocal = isMe && speakingPeers.has("__local__") && !isMuted;
                  const isSpeakingRemote = !isMe && speakingPeers.has(p.peerId) && !p.isMuted;
                  const isSpeakingFull = isSpeakingLocal || isSpeakingRemote;
                  const displayLabel = isHost
                    ? `Admin ${p.displayName}`
                    : isCo
                    ? `Co-host ${p.displayName}`
                    : p.displayName;

                  return (
                    <div key={p.peerId}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: isMe ? "rgba(109,40,217,0.08)" : "transparent", transition: "background 0.12s" }}
                      onMouseEnter={(e) => { if (!isMe) e.currentTarget.style.background = "rgba(139,92,246,0.07)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = isMe ? "rgba(109,40,217,0.08)" : "transparent"; }}>

                      <div style={{ position: "relative", flexShrink: 0 }}>
                        <div style={{ width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, background: isMe ? "linear-gradient(135deg,#7c3aed,#db2777)" : isHost ? "linear-gradient(135deg,#d97706,#b45309)" : isCo ? "linear-gradient(135deg,#2563eb,#1d4ed8)" : "linear-gradient(135deg,#374151,#6b7280)", color: "white", flexShrink: 0, boxShadow: isSpeakingFull ? "0 0 0 2.5px rgba(74,222,128,0.7)" : "none" }}>
                          {getInitials(p.displayName)}
                        </div>
                        {isSpeakingFull && !p.isMuted && (
                          <span style={{ position: "absolute", bottom: -2, right: -2, fontSize: 10, background: "rgba(74,222,128,0.9)", borderRadius: "50%", width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>🎙</span>
                        )}
                        {hasRaisedHand && (
                          <span style={{ position: "absolute", top: -4, right: -4, fontSize: 14 }}>✋</span>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {displayLabel}
                          </span>
                          {isMe && <span style={{ fontSize: 9, color: "#a78bfa", flexShrink: 0 }}>(you)</span>}
                        </div>
                        {(isHost || isCo) && (
                          <div style={{ fontSize: 9, color: isHost ? "#fbbf24" : "#93c5fd", fontWeight: 600, marginTop: 1, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            {isHost ? "⭐ Host" : "🔵 Co-host"}
                          </div>
                        )}
                      </div>

                      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                        {isAdminOrCoHost && !isMe ? (
                          <button
                            onClick={() => control("force-mute", p.peerId)}
                            title={p.isMuted ? "Unmute request" : "Mute participant"}
                            style={{ width: 30, height: 30, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: p.isMuted ? "#ef4444" : "#9ca3af" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                            {p.isMuted
                              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                            }
                          </button>
                        ) : (
                          <span style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", color: p.isMuted ? "#ef4444" : "#6b7280" }}>
                            {p.isMuted
                              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                            }
                          </span>
                        )}

                        {isAdminOrCoHost && !isMe && raisedHands.has(p.peerId) && (
                          <button
                            onClick={() => lowerHandForPeer(p.peerId)}
                            title="Lower hand"
                            style={{ width: 30, height: 30, borderRadius: 6, background: "rgba(234,179,8,0.12)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(234,179,8,0.25)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(234,179,8,0.12)")}>
                            ✋
                          </button>
                        )}

                        {isAdminOrCoHost && !isMe && p.role === "member" && (
                          <button
                            onClick={() => control("assign-host", p.peerId)}
                            title="Make Co-host"
                            style={{ width: 30, height: 30, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fbbf24", fontSize: 14 }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                            ⭐
                          </button>
                        )}
                        {isAdminOrCoHost && !isMe && p.role === "co-host" && (
                          <button
                            onClick={() => control("revoke-host", p.peerId)}
                            title="Remove Co-host"
                            style={{ width: 30, height: 30, borderRadius: 6, background: "rgba(59,130,246,0.1)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#93c5fd", fontSize: 11, fontWeight: 700 }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(59,130,246,0.25)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(59,130,246,0.1)")}>
                            ✦
                          </button>
                        )}

                        {isAdminOrCoHost && !isMe && p.role !== "admin" && (
                          <button
                            onClick={() => { setConfirmKickPeerId(p.peerId); setConfirmKickName(p.displayName); }}
                            title="Remove from meeting"
                            style={{ width: 30, height: 30, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444", fontSize: 14 }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.1)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              {participants.filter((p) => !participantSearch || p.displayName.toLowerCase().includes(participantSearch.toLowerCase())).length === 0 && (
                <div style={{ textAlign: "center", color: "#4b5563", fontSize: 12, padding: "32px 16px" }}>No participants found</div>
              )}
            </div>

            {isAdminOrCoHost && (
              <div style={{ flexShrink: 0, padding: "10px 14px", background: "#16162a", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", gap: 8 }}>
                <button onClick={() => control("mute-all")}
                  style={{ flex: 1, padding: "9px 12px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#d1d5db", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  🔕 Mute All
                </button>
                <button onClick={() => control("toggle-unmute-rule")}
                  style={{ flex: 1, padding: "9px 12px", background: unmutingAllowed ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)", border: unmutingAllowed ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: unmutingAllowed ? "#4ade80" : "#f87171", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  {unmutingAllowed ? "🔓 Mics Open" : "🔒 Mics Locked"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          CINEMA MODE — mobile landscape
      ══════════════════════════════════════════════════ */}
      {isLandMobile && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#000", display: "flex", alignItems: "stretch" }}>
          <div style={{ position: "relative", flex: 1, cursor: "pointer", userSelect: "none" }}
            onTouchStart={handleVideoTouch} onClick={handleVideoTouch}>
            <div style={{ position: "absolute", inset: 0 }}>
              {mainStagePeerId === peerId && (isVideoOn || isScreenSharing)
                ? <video ref={localVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                : mainStageStream
                ? <video autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} ref={remoteVideoRef} />
                : <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    <div style={{ width: 80, height: 80, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: "bold", background: "linear-gradient(135deg,#6d28d9,#db2777)" }}>{getInitials(displayName)}</div>
                    <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>Audio-Only Mode</p>
                  </div>
              }
              {isScreenSharing && <div style={{ position: "absolute", top: 10, left: 10, background: "#1d4ed8", borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: "bold" }}>🖥️ SCREEN SHARE</div>}
              {isVideoOn && !isScreenSharing && mainStagePeerId === peerId && <div style={{ position: "absolute", top: 10, left: 10, background: "#dc2626", borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: "bold" }}>● LIVE</div>}
              <button
                onClick={toggleFullscreen}
                title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                style={{ position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.15)", color: "white", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, lineHeight: 1 }}>
                {isFullscreen ? "⛾" : "⛶"}
              </button>
            </div>
            <div style={{ position: "absolute", inset: 0, pointerEvents: overlayVisible ? "auto" : "none", transition: "opacity 0.35s ease", opacity: overlayVisible ? 1 : 0 }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, background: "linear-gradient(to bottom,rgba(0,0,0,0.8) 0%,transparent 100%)", padding: "12px 16px 30px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", display: "inline-block", animation: "confPulse 2s infinite", flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meetingTitle}</span>
                <span style={{ fontSize: 10, background: "rgba(255,255,255,0.12)", borderRadius: 999, padding: "2px 8px" }}>{participants.length} online</span>
                <span style={{ fontSize: 10, background: roleColor.bg, color: roleColor.text, borderRadius: 999, padding: "2px 8px", fontWeight: 600 }}>{myRole}</span>
              </div>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top,rgba(0,0,0,0.95) 0%,rgba(0,0,0,0.6) 60%,transparent 100%)", padding: "20px 12px 10px" }}
                onTouchStart={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                {/* Participants strip */}
                <div style={{ overflowX: "auto", marginBottom: 8, scrollbarWidth: "none" }}>
                  <div style={{ display: "flex", gap: 6, width: "max-content" }}>
                    {participants.map((p) => <ParticipantCard key={p.peerId} p={p} />)}
                  </div>
                </div>
                {/* Floating toolbar controls */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "nowrap", overflowX: "auto", scrollbarWidth: "none" }}>
                  {canSpeak && (
                    <button onClick={toggleMic} title={isMuted ? "Unmute" : "Mute"}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: isMuted ? "rgba(255,255,255,0.07)" : "rgba(139,92,246,0.28)", border: isMuted ? "1.5px solid transparent" : "1.5px solid rgba(139,92,246,0.55)", borderRadius: 10, padding: "7px 9px", color: isMuted ? "#9ca3af" : "#c4b5fd", cursor: "pointer", flexShrink: 0 }}>
                      <MicIcon muted={isMuted} size={18} />
                      <span style={{ fontSize: 9, fontWeight: 500 }}>{isMuted ? "Unmute" : "Mute"}</span>
                    </button>
                  )}
                  {isAdminOrCoHost && (
                    <button onClick={toggleVideo} title={isVideoOn ? "Stop Video" : "Camera"}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: isVideoOn ? "rgba(139,92,246,0.28)" : "rgba(255,255,255,0.07)", border: isVideoOn ? "1.5px solid rgba(139,92,246,0.55)" : "1.5px solid transparent", borderRadius: 10, padding: "7px 9px", color: isVideoOn ? "#c4b5fd" : "#9ca3af", cursor: "pointer", flexShrink: 0 }}>
                      <VideoIcon on={isVideoOn} size={18} />
                      <span style={{ fontSize: 9, fontWeight: 500 }}>{isVideoOn ? "Stop" : "Camera"}</span>
                    </button>
                  )}
                  {isAdminOrCoHost && (
                    <button onClick={toggleScreenShare} title={isScreenSharing ? "Stop Share" : "Screen"}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: isScreenSharing ? "rgba(59,130,246,0.28)" : "rgba(255,255,255,0.07)", border: isScreenSharing ? "1.5px solid rgba(59,130,246,0.55)" : "1.5px solid transparent", borderRadius: 10, padding: "7px 9px", color: isScreenSharing ? "#93c5fd" : "#9ca3af", cursor: "pointer", flexShrink: 0 }}>
                      <ScreenIcon sharing={isScreenSharing} size={18} />
                      <span style={{ fontSize: 9, fontWeight: 500 }}>{isScreenSharing ? "Stop" : "Screen"}</span>
                    </button>
                  )}
                  <button onClick={() => { setShowChat((v) => !v); setNewMsgCount(0); }} title="Chat"
                    style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: showChat ? "rgba(139,92,246,0.28)" : "rgba(255,255,255,0.07)", border: showChat ? "1.5px solid rgba(139,92,246,0.55)" : "1.5px solid transparent", borderRadius: 10, padding: "7px 9px", color: showChat ? "#c4b5fd" : "#9ca3af", cursor: "pointer", flexShrink: 0 }}>
                    <ChatIcon size={18} />
                    <span style={{ fontSize: 9, fontWeight: 500 }}>Chat</span>
                    {!showChat && newMsgCount > 0 && <span style={{ position: "absolute", top: 4, right: 4, background: "#7c3aed", color: "white", borderRadius: 999, width: 14, height: 14, fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{newMsgCount}</span>}
                  </button>
                  {canSpeak && !isAdminOrCoHost && (
                    <button onClick={toggleHandRaise} title={handRaised ? "Lower Hand" : "Raise Hand"}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: handRaised ? "rgba(234,179,8,0.2)" : "rgba(255,255,255,0.07)", border: handRaised ? "1.5px solid rgba(234,179,8,0.4)" : "1.5px solid transparent", borderRadius: 10, padding: "7px 9px", color: handRaised ? "#fbbf24" : "#9ca3af", cursor: "pointer", flexShrink: 0 }}>
                      <HandIcon raised={handRaised} size={18} />
                      <span style={{ fontSize: 9, fontWeight: 500 }}>{handRaised ? "Lower" : "Hand"}</span>
                    </button>
                  )}
                  {onMinimize && (
                    <button onClick={onMinimize} title="Minimize"
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "rgba(255,255,255,0.07)", border: "1.5px solid transparent", borderRadius: 10, padding: "7px 9px", color: "#9ca3af", cursor: "pointer", flexShrink: 0 }}>
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>
                      <span style={{ fontSize: 9, fontWeight: 500 }}>Float</span>
                    </button>
                  )}
                  <button onClick={onLeave} title="Leave"
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "rgba(220,38,38,0.85)", border: "1.5px solid transparent", borderRadius: 10, padding: "7px 9px", color: "white", cursor: "pointer", flexShrink: 0 }}>
                    <PhoneIcon size={18} />
                    <span style={{ fontSize: 9, fontWeight: 500 }}>Leave</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          {showChat && (
            <ChatPanelComponent
              newMsgCount={newMsgCount}
              setShowChat={setShowChat}
              messages={messages}
              chatEndRef={chatEndRef}
              onSend={onSend}
              canSpeak={canSpeak}
              height="100%"
            />
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          NORMAL MODE — PC + mobile portrait
      ══════════════════════════════════════════════════ */}
      {!isLandMobile && (
        <>
          {/* ── Header bar ── */}
          <div style={{ flexShrink: 0, background: "#0f0f14", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 14px", zIndex: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, overflow: "hidden" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", flexShrink: 0, display: "inline-block", animation: "confPulse 2s infinite" }} />
              <span style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meetingTitle}</span>
              <span style={{ fontSize: 10, background: "rgba(255,255,255,0.08)", borderRadius: 999, padding: "1px 8px", flexShrink: 0 }}>{participants.length} online</span>
              {!unmutingAllowed && <span style={{ fontSize: 9, background: "rgba(249,115,22,0.15)", color: "#fb923c", borderRadius: 999, padding: "1px 7px", flexShrink: 0 }}>🔒 Host controls mic</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 10, background: roleColor.bg, color: roleColor.text, borderRadius: 999, padding: "2px 9px", fontWeight: 600 }}>{myRole}</span>
              {globalFullScreen && onMinimize && (
                <button
                  onClick={onMinimize}
                  title="Minimize to corner"
                  style={{
                    background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 7, color: "#d1d5db", cursor: "pointer", padding: "3px 10px",
                    fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4,
                  }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
                    <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
                  </svg>
                  Minimize
                </button>
              )}
            </div>
          </div>

          {isAdminOrCoHost && joinRequests.length > 0 && (
            <div style={{ flexShrink: 0, background: "rgba(234,179,8,0.12)", borderBottom: "1px solid rgba(234,179,8,0.25)", padding: "6px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                🔔 {joinRequests.length} waiting to join
              </span>
              {joinRequests.map((r: any) => {
                const firstName = r.member?.firstName ?? "";
                const lastName  = r.member?.lastName  ?? "";
                const name = `${firstName} ${lastName}`.trim() || "Unknown";
                const cell = r.member?.cellName ?? "";
                return (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: "5px 10px" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#d97706,#b45309)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "white", flexShrink: 0 }}>
                      {(firstName[0] ?? "") + (lastName[0] ?? "")}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "white", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {name}
                      </span>
                      {cell && <span style={{ fontSize: 10, color: "#9ca3af", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cell}</span>}
                    </div>
                    <button
                      disabled={admittingId === r.memberId}
                      onClick={() => admitParticipant(r.memberId)}
                      style={{ flexShrink: 0, padding: "4px 10px", background: "#16a34a", border: "none", borderRadius: 6, color: "white", fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: admittingId === r.memberId ? 0.6 : 1 }}>
                      {admittingId === r.memberId ? "…" : "Admit"}
                    </button>
                    <button
                      onClick={() => denyParticipant(r.memberId)}
                      style={{ flexShrink: 0, padding: "4px 10px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 6, color: "#f87171", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Body: left column + chat ── */}
          <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>

            {/* LEFT COLUMN */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>

              {/* ── Video area ── */}
              <div
                ref={mainStageRef}
                style={{ position: "relative", flex: "1 1 0", minHeight: 120, width: "100%", overflow: "hidden", background: "#000" }}
                onMouseEnter={handleVideoHoverEnter}
                onMouseLeave={handleVideoHoverLeave}
                onTouchStart={handleVideoTouch}
              >
                <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
                  <video ref={localVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "contain", display: mainStagePeerId === peerId && (isVideoOn || isScreenSharing) ? "block" : "none" }} />
                  <video autoPlay playsInline ref={remoteVideoRef} style={{ width: "100%", height: "100%", objectFit: "contain", display: mainStagePeerId !== peerId && mainStageStream ? "block" : "none" }} />
                  {!(mainStagePeerId === peerId && (isVideoOn || isScreenSharing)) && !mainStageStream && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: "#09090b" }}>
                      <div style={{ width: 80, height: 80, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: "bold", background: "linear-gradient(135deg,#6d28d9,#db2777)" }}>{getInitials(displayName)}</div>
                      <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>Audio-Only Mode</p>
                    </div>
                  )}

                  {mainStagePeerId && mainStagePeerId !== peerId && raisedHands.has(mainStagePeerId) && (
                    <div style={{ position: "absolute", top: 44, left: "50%", transform: "translateX(-50%)", background: "rgba(234,179,8,0.85)", borderRadius: 8, padding: "4px 12px", display: "flex", alignItems: "center", gap: 6, zIndex: 10 }}>
                      <span style={{ fontSize: 18 }}>✋</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1000" }}>
                        {participants.find((p) => p.peerId === mainStagePeerId)?.displayName ?? "Participant"} raised hand
                      </span>
                      {isAdminOrCoHost && (
                        <button onClick={() => lowerHandForPeer(mainStagePeerId!)} style={{ marginLeft: 4, background: "rgba(0,0,0,0.2)", border: "none", borderRadius: 4, color: "#1a1000", cursor: "pointer", fontSize: 10, padding: "2px 6px", fontWeight: 700 }}>Lower</button>
                      )}
                    </div>
                  )}

                  {isScreenSharing && <div style={{ position: "absolute", top: 10, left: 10, background: "#1d4ed8", borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: "bold" }}>🖥️ SCREEN SHARE</div>}
                  {isVideoOn && !isScreenSharing && mainStagePeerId === peerId && <div style={{ position: "absolute", top: 10, left: 10, background: "#dc2626", borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: "bold" }}>● LIVE</div>}
                  <button
                    onClick={toggleFullscreen}
                    title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    style={{ position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.15)", color: "white", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, lineHeight: 1 }}>
                    {isFullscreen ? "⛾" : "⛶"}
                  </button>

                  <div style={{ position: "absolute", inset: 0, pointerEvents: "none", transition: "opacity 0.3s ease", opacity: overlayVisible ? 1 : 0 }}>
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 100%)", padding: "20px 14px 8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: "0 1px 3px rgba(0,0,0,0.9)", color: "#e5e7eb" }}>{meetingTitle}</span>
                        {isScreenSharing && <span style={{ fontSize: 9, background: "rgba(29,78,216,0.6)", color: "#93c5fd", borderRadius: 999, padding: "1px 7px" }}>Sharing screen</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Participants strip ── */}
              <div style={{ flexShrink: 0, padding: "8px 14px 6px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Participants · {participants.length}</span>
                  <button onClick={() => { setShowParticipantsFull(true); setParticipantSearch(""); }} style={{ fontSize: 10, color: "#a78bfa", background: "rgba(139,92,246,0.1)", border: "none", cursor: "pointer", padding: "2px 8px", borderRadius: 4 }}>👥 See All</button>
                </div>
                <div style={{ overflowX: "auto", paddingBottom: 4 }}>
                  <div style={{ display: "flex", gap: 7, width: "max-content" }}>
                    {participants.length === 0
                      ? <div style={{ fontSize: 12, color: "#4b5563", padding: "16px 4px" }}>Waiting for participants…</div>
                      : participants.map((p) => <ParticipantCard key={p.peerId} p={p} />)}
                  </div>
                </div>
              </div>

              {/* ── Expandable panels ── */}
              {activePanel === "reactions" && (
                <PanelBox>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#a78bfa" }}>Send a Reaction</span>
                    <button onClick={() => setActivePanel(null)} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#9ca3af", borderRadius: 6, width: 22, height: 22, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {["❤️", "👍", "😂", "🎉", "🙏", "🔥", "👏", "😮"].map((e) => (
                      <button key={e} onClick={() => sendReaction(e)}
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 12px", fontSize: 22, cursor: "pointer", transition: "background 0.15s" }}
                        onMouseEnter={(ev) => (ev.currentTarget.style.background = "rgba(139,92,246,0.25)")}
                        onMouseLeave={(ev) => (ev.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                      >{e}</button>
                    ))}
                  </div>
                  {canSpeak && !isAdminOrCoHost && (
                    <button onClick={toggleHandRaise}
                      style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, background: handRaised ? "rgba(234,179,8,0.2)" : "rgba(255,255,255,0.07)", border: handRaised ? "1px solid rgba(234,179,8,0.4)" : "1px solid transparent", borderRadius: 8, padding: "7px 14px", color: handRaised ? "#fbbf24" : "#9ca3af", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      <HandIcon raised={handRaised} size={16} />
                      {handRaised ? "Lower Hand" : "Raise Hand"}
                    </button>
                  )}
                </PanelBox>
              )}

              {activePanel === "settings" && (
                <PanelBox>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#a78bfa", display: "flex", alignItems: "center", gap: 6 }}>
                      <SettingsIcon size={14} /> Device Settings
                    </span>
                    <button onClick={() => setActivePanel(null)} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#9ca3af", borderRadius: 6, width: 22, height: 22, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {myRole !== "guest" && audioInputs.length > 0 && (
                      <div style={{ flex: "1 1 180px", display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>🎙️ Microphone</label>
                        <select value={selectedMicId} onChange={(e) => handleMicChange(e.target.value)}
                          style={{ background: "#09090b", color: "white", border: "1px solid rgba(139,92,246,0.35)", padding: "6px 8px", borderRadius: 7, fontSize: 11, outline: "none", cursor: "pointer" }}>
                          <option value="">Default Microphone</option>
                          {audioInputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic (${d.deviceId.slice(0, 8)})`}</option>)}
                        </select>
                      </div>
                    )}
                    {isAdminOrCoHost && videoInputs.length > 0 && (
                      <div style={{ flex: "1 1 180px", display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>📷 Camera</label>
                        <select value={selectedCameraId} onChange={(e) => handleCameraChange(e.target.value)}
                          style={{ background: "#09090b", color: "white", border: "1px solid rgba(139,92,246,0.35)", padding: "6px 8px", borderRadius: 7, fontSize: 11, outline: "none", cursor: "pointer" }}>
                          <option value="">Default Camera</option>
                          {videoInputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera (${d.deviceId.slice(0, 8)})`}</option>)}
                        </select>
                      </div>
                    )}
                    {audioOutputs.length > 0 && (
                      <div style={{ flex: "1 1 180px", display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>🔊 Speaker</label>
                        <select value={selectedSpeakerId} onChange={(e) => { setSelectedSpeakerId(e.target.value); applySpeakerToAll(e.target.value); }}
                          style={{ background: "#09090b", color: "white", border: "1px solid rgba(139,92,246,0.35)", padding: "6px 8px", borderRadius: 7, fontSize: 11, outline: "none", cursor: "pointer" }}>
                          <option value="">Default Speaker</option>
                          {audioOutputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker (${d.deviceId.slice(0, 8)})`}</option>)}
                        </select>
                      </div>
                    )}
                    {audioInputs.length === 0 && videoInputs.length === 0 && audioOutputs.length === 0 && (
                      <p style={{ fontSize: 11, color: "#4b5563", margin: 0 }}>No devices detected. Grant microphone/camera permission first.</p>
                    )}
                  </div>
                </PanelBox>
              )}

              {activePanel === "hands" && isAdminOrCoHost && (
                <PanelBox>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#fbbf24", display: "flex", alignItems: "center", gap: 6 }}>
                      ✋ Raised Hands
                      {raisedHandsOrder.length > 0 && (
                        <span style={{ background: "rgba(234,179,8,0.2)", color: "#fbbf24", border: "1px solid rgba(234,179,8,0.35)", borderRadius: 999, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>{raisedHandsOrder.length}</span>
                      )}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {raisedHandsOrder.length > 0 && (
                        <button
                          onClick={() => { raisedHandsOrder.forEach((h) => lowerHandForPeer(h.peerId)); }}
                          style={{ background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 6, color: "#fbbf24", cursor: "pointer", padding: "3px 9px", fontSize: 10, fontWeight: 600 }}>
                          Lower All
                        </button>
                      )}
                      <button onClick={() => setActivePanel(null)} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#9ca3af", borderRadius: 6, width: 22, height: 22, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                    </div>
                  </div>

                  {raisedHandsOrder.length === 0 ? (
                    <div style={{ padding: "16px 0", textAlign: "center" }}>
                      <div style={{ fontSize: 24, marginBottom: 6 }}>🙌</div>
                      <p style={{ fontSize: 11, color: "#4b5563", margin: 0 }}>No hands raised</p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {raisedHandsOrder.map((h, i) => {
                        const elapsed = Math.round((Date.now() - h.ts) / 1000);
                        const timeLabel = elapsed < 60 ? `${elapsed}s ago` : `${Math.floor(elapsed / 60)}m ago`;
                        return (
                          <div key={h.peerId} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(234,179,8,0.07)", border: "1px solid rgba(234,179,8,0.18)", borderRadius: 8, padding: "7px 10px" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", width: 16, flexShrink: 0 }}>#{i + 1}</span>
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#db2777)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "white", flexShrink: 0 }}>
                              {h.displayName.slice(0, 2).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.displayName}</div>
                              <div style={{ fontSize: 9, color: "#6b7280" }}>{timeLabel}</div>
                            </div>
                            <button
                              onClick={() => lowerHandForPeer(h.peerId)}
                              style={{ flexShrink: 0, background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 6, color: "#fbbf24", cursor: "pointer", padding: "3px 9px", fontSize: 10, fontWeight: 600 }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(234,179,8,0.3)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(234,179,8,0.15)")}>
                              Lower
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </PanelBox>
              )}

              {activePanel === "more" && isAdminOrCoHost && (
                <PanelBox>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#a78bfa" }}>Host Controls</span>
                    <button onClick={() => setActivePanel(null)} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#9ca3af", borderRadius: 6, width: 22, height: 22, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => { control("mute-all"); setActivePanel(null); }}
                      style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "7px 14px", color: "#9ca3af", fontSize: 12, cursor: "pointer" }}>
                      🔕 Mute All
                    </button>
                    <button onClick={() => { control("toggle-unmute-rule"); setActivePanel(null); }}
                      style={{ display: "flex", alignItems: "center", gap: 6, background: unmutingAllowed ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", border: unmutingAllowed ? "1px solid rgba(34,197,94,0.35)" : "1px solid rgba(239,68,68,0.35)", borderRadius: 8, padding: "7px 14px", color: unmutingAllowed ? "#4ade80" : "#f87171", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      {unmutingAllowed ? "🔓 Mics Open" : "🔒 Mics Locked"}
                    </button>
                  </div>
                </PanelBox>
              )}

              {/* ── TOOLBAR ── */}
              <div style={{
                flexShrink: 0,
                background: "#0f0f14",
                borderTop: "1px solid rgba(255,255,255,0.07)",
                padding: "8px 12px",
                paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
                display: "flex",
                alignItems: "center",
                gap: 6,
                overflowX: "auto",
                scrollbarWidth: "none",
                WebkitOverflowScrolling: "touch",
              } as React.CSSProperties}>
                {canSpeak && (
                  <TBtn
                    icon={<MicIcon muted={isMuted} />}
                    label={isMuted ? "Unmute" : "Mute"}
                    onClick={toggleMic}
                    active={!isMuted}
                    disabled={isMuted && !canUnmute}
                  />
                )}

                {isAdminOrCoHost && (
                  <TBtn
                    icon={<VideoIcon on={isVideoOn} />}
                    label={isVideoOn ? "Stop Video" : "Camera"}
                    onClick={toggleVideo}
                    active={isVideoOn}
                  />
                )}

                {isAdminOrCoHost && canDisplayMedia && (
                  <TBtn
                    icon={<ScreenIcon sharing={isScreenSharing} />}
                    label={isScreenSharing ? "Stop Share" : "Screen"}
                    onClick={toggleScreenShare}
                    active={isScreenSharing}
                  />
                )}

                <TBtn
                  icon={<ChatIcon />}
                  label="Chat"
                  onClick={() => { setShowChat((v) => !v); setNewMsgCount(0); setActivePanel(null); }}
                  active={showChat}
                  badge={showChat ? 0 : newMsgCount}
                />

                <TBtn
                  icon={<PeopleIcon />}
                  label="People"
                  onClick={() => { setShowParticipantsFull((v) => !v); setParticipantSearch(""); }}
                  active={showParticipantsFull}
                />

                {isAdminOrCoHost && (
                  <TBtn
                    icon={<span style={{ fontSize: 16, lineHeight: 1 }}>✋</span>}
                    label="Hands"
                    onClick={() => togglePanel("hands")}
                    active={activePanel === "hands"}
                    badge={raisedHands.size}
                  />
                )}

                {!isAdminOrCoHost && canSpeak && (
                  <TBtn
                    icon={<HandIcon raised={handRaised} />}
                    label={handRaised ? "Lower" : "Hand"}
                    onClick={toggleHandRaise}
                    active={handRaised}
                  />
                )}

                <TBtn
                  icon={<SmileIcon />}
                  label="Reactions"
                  onClick={() => togglePanel("reactions")}
                  active={activePanel === "reactions"}
                />

                <TBtn
                  icon={<SettingsIcon />}
                  label="Settings"
                  onClick={() => { if (activePanel !== "settings") enumerateDevices(); togglePanel("settings"); }}
                  active={activePanel === "settings"}
                />

                {isAdminOrCoHost && (
                  <TBtn
                    icon={<MoreIcon />}
                    label="More"
                    onClick={() => togglePanel("more")}
                    active={activePanel === "more"}
                  />
                )}

                <TBtn
                  icon={<PhoneIcon />}
                  label="Leave"
                  onClick={onLeave}
                  danger
                />
              </div>
            </div>

            {showChat && (
              <div style={{ display: "flex", flexDirection: "column", background: "#18181b", borderLeft: "1px solid #27272a", width: 310, flexShrink: 0, minHeight: 0 }}
                className="desktop-chat-panel">
                <ChatPanelComponent
                  newMsgCount={newMsgCount}
                  setShowChat={setShowChat}
                  messages={messages}
                  chatEndRef={chatEndRef}
                  onSend={onSend}
                  canSpeak={canSpeak}
                />
              </div>
            )}
          </div>

          {showChat && (
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 280, zIndex: 50, display: "none" }} className="mobile-chat-below">
              <ChatPanelComponent
                newMsgCount={newMsgCount}
                setShowChat={setShowChat}
                messages={messages}
                chatEndRef={chatEndRef}
                onSend={onSend}
                canSpeak={canSpeak}
                height={280}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
