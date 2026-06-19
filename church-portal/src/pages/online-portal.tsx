import { useState, useEffect, useRef, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  Play, Plus, Video, Trash2, Tv, Loader2,
  Lock, ChevronLeft, ChevronRight, X,
  Clock, Pencil, Send,
  Shield, MessageCircle, Users,
  ChevronDown, ChevronUp, Minimize2, Maximize2,
  CheckCircle2, AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useListVideos, getListVideosQueryKey, useDeleteVideo } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMeetingContext } from "@/context/MeetingContext";

const VIDEOS_PER_PAGE = 8;

// ── helpers ──────────────────────────────────────────────────────────────────

function getYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? m[1] : null;
}

function getThumbnail(v: any): string {
  const ytId = getYoutubeId(v.embedUrl ?? "") ?? (v.youtubeId?.length === 11 ? v.youtubeId : null);
  if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
  return "";
}

function getEmbedSrc(v: any): string {
  return v.embedUrl || `https://www.youtube.com/embed/${v.youtubeId}?rel=0`;
}

class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data: any = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function apicall(path: string, method: string, body?: any) {
  const token = localStorage.getItem("token");
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error ?? "Request failed", res.status, data);
  }
  return res.json();
}

// ── sub-components ───────────────────────────────────────────────────────────

function WatcherPill({ w }: { w: any }) {
  const prefix = w.gender === "female" ? "Sis." : "Bro.";
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-purple-500 text-white rounded-full text-xs font-medium shadow-sm">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
      {prefix} {w.firstName} {w.lastName} is watching
    </span>
  );
}

function VideoThumbnail({ v, onClick }: { v: any; onClick: () => void }) {
  const thumb = getThumbnail(v);
  return (
    <button onClick={onClick} className="text-left w-full group focus:outline-none">
      {/* Thumbnail */}
      <div className="relative rounded-xl overflow-hidden bg-gray-900 aspect-video shadow-sm group-hover:shadow-lg transition-all duration-200">
        {thumb ? (
          <img src={thumb} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
            <Video className="w-8 h-8 text-gray-600" />
          </div>
        )}
        {/* Hover play overlay */}
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <Play className="w-4 h-4 text-purple-700 ml-0.5" />
          </div>
        </div>
        {/* LIVE badge — top-left */}
        {v.isLive && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-bold text-white bg-red-600 rounded px-1.5 py-0.5 leading-none shadow-sm pointer-events-none">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" /> LIVE
          </span>
        )}
        {/* Restricted badge — top-right (only when not live) */}
        {v.isRestricted && !v.isLive && (
          <span className="absolute top-2 right-2 inline-flex items-center text-[10px] font-bold text-white bg-orange-500 rounded px-1.5 py-0.5 leading-none shadow-sm pointer-events-none">
            🔒
          </span>
        )}
      </div>
      {/* Info block */}
      <div className="mt-2.5 space-y-0.5 px-0.5">
        <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">{v.title}</p>
        <p className="text-xs text-gray-400">
          {new Date(v.date).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}
        </p>
        {v.description && <p className="text-xs text-gray-400 line-clamp-1">{v.description}</p>}
      </div>
    </button>
  );
}

// ── ConferenceTab component (removed — to be replaced with new architecture) ──

function _ConferenceTab_REMOVED({ canManageRequests, canManage, user, toast }: { canManageRequests: boolean; canManage: boolean; user: any; toast: any }) {
  const [activeMeeting, setActiveMeeting] = useState<any>(null);
  const [meetingLoading, setMeetingLoading] = useState(true);
  const [joinStatus, setJoinStatus] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [addMeetingOpen, setAddMeetingOpen] = useState(false);
  const [meetingForm, setMeetingForm] = useState({ title: "", description: "" });
  const [meetingFormLoading, setMeetingFormLoading] = useState(false);
  const [meetings, setMeetings] = useState<any[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchActive = useCallback(async () => {
    try {
      const data = await apicall("/api/online-meetings/active", "GET");
      setActiveMeeting(data);
    } catch { setActiveMeeting(null); }
    finally { setMeetingLoading(false); }
  }, []);

  const fetchMeetings = useCallback(async () => {
    if (!canManage) return;
    try {
      const data = await apicall("/api/online-meetings", "GET");
      setMeetings(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }, [canManage]);

  const fetchJoinStatus = useCallback(async (meetingId: number) => {
    if (!user?.memberId || canManageRequests) return;
    try {
      const data = await apicall(`/api/meetings/${meetingId}/my-join-status`, "GET");
      setJoinStatus(data.status);
    } catch { /* ignore */ }
  }, [user, canManageRequests]);

  const fetchJoinRequests = useCallback(async (meetingId: number) => {
    if (!canManageRequests) return;
    try {
      const data = await apicall(`/api/meetings/${meetingId}/join-requests`, "GET");
      setJoinRequests(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }, [canManageRequests]);

  useEffect(() => {
    fetchActive();
    fetchMeetings();
  }, [fetchActive, fetchMeetings]);

  useEffect(() => {
    if (!activeMeeting) return;
    fetchJoinStatus(activeMeeting.id);
    fetchJoinRequests(activeMeeting.id);
    pollRef.current = setInterval(() => {
      fetchJoinStatus(activeMeeting.id);
      fetchJoinRequests(activeMeeting.id);
    }, 15_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeMeeting, fetchJoinStatus, fetchJoinRequests]);

  const handleJoinRequest = async () => {
    if (!activeMeeting) return;
    setJoinLoading(true);
    try {
      await apicall(`/api/meetings/${activeMeeting.id}/join-request`, "POST");
      setJoinStatus("pending");
      toast({ title: "Request sent", description: "The admin will review your request shortly." });
    } catch {
      toast({ title: "Failed to send request", variant: "destructive" });
    } finally { setJoinLoading(false); }
  };

  const approveRequest = async (memberId: number) => {
    if (!activeMeeting) return;
    const key = `approve-${memberId}`;
    setApprovingId(key);
    try {
      await apicall(`/api/meetings/${activeMeeting.id}/join-requests/${memberId}/approve`, "POST");
      setJoinRequests(prev => prev.filter(r => r.memberId !== memberId));
      toast({ title: "Request approved" });
    } catch { toast({ title: "Failed to approve", variant: "destructive" }); }
    finally { setApprovingId(null); }
  };

  const rejectRequest = async (memberId: number) => {
    if (!activeMeeting) return;
    const key = `reject-${memberId}`;
    setApprovingId(key);
    try {
      await apicall(`/api/meetings/${activeMeeting.id}/join-requests/${memberId}/reject`, "POST");
      setJoinRequests(prev => prev.filter(r => r.memberId !== memberId));
      toast({ title: "Request rejected" });
    } catch { toast({ title: "Failed to reject", variant: "destructive" }); }
    finally { setApprovingId(null); }
  };

  const toggleMeetingActive = async (meeting: any, active: boolean) => {
    try {
      await apicall(`/api/online-meetings/${meeting.id}`, "PATCH", { isActive: active });
      fetchActive();
      fetchMeetings();
      toast({ title: active ? "Meeting started" : "Meeting ended" });
    } catch { toast({ title: "Failed to update meeting", variant: "destructive" }); }
  };

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingForm.title.trim()) return;
    setMeetingFormLoading(true);
    try {
      await apicall("/api/online-meetings", "POST", meetingForm);
      fetchMeetings();
      setAddMeetingOpen(false);
      setMeetingForm({ title: "", description: "" });
      toast({ title: "Meeting created" });
    } catch { toast({ title: "Failed to create meeting", variant: "destructive" }); }
    finally { setMeetingFormLoading(false); }
  };

  if (meetingLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      {/* Admin: pending join requests panel */}
      {canManageRequests && joinRequests.length > 0 && activeMeeting && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden text-xs">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 border-b border-amber-200">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
            <span className="font-semibold text-amber-900">
              {joinRequests.length} join request{joinRequests.length > 1 ? "s" : ""} pending
            </span>
            {joinRequests.length > 1 && (
              <button
                onClick={() => joinRequests.forEach(r => approveRequest(r.memberId))}
                className="ml-auto text-green-700 bg-green-100 hover:bg-green-200 border border-green-200 rounded px-2 py-0.5 transition-colors">
                Approve All
              </button>
            )}
          </div>
          {joinRequests.map((r: any) => {
            const name = `${r.member?.firstName ?? ""} ${r.member?.lastName ?? ""}`.trim() || "Unknown";
            const approveKey = `approve-${r.memberId}`;
            const rejectKey  = `reject-${r.memberId}`;
            return (
              <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 bg-white/60 border-b border-amber-100 last:border-0">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-[10px] font-bold text-green-700 flex-shrink-0">
                  {(r.member?.firstName?.[0] ?? "") + (r.member?.lastName?.[0] ?? "")}
                </div>
                <span className="font-medium text-gray-800 truncate">{name}</span>
                {r.member?.cellName && <span className="text-gray-400 truncate flex-1">· {r.member.cellName}</span>}
                {r.message && <span className="italic text-gray-400 truncate flex-1">"{r.message}"</span>}
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    disabled={approvingId === approveKey || approvingId === rejectKey}
                    onClick={() => approveRequest(r.memberId)}
                    className="px-2 py-0.5 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50 transition-colors">
                    {approvingId === approveKey ? "…" : "Let In"}
                  </button>
                  <button
                    disabled={approvingId === approveKey || approvingId === rejectKey}
                    onClick={() => rejectRequest(r.memberId)}
                    className="px-2 py-0.5 border border-red-300 text-red-600 hover:bg-red-50 rounded disabled:opacity-50 transition-colors">
                    {approvingId === rejectKey ? "…" : "✕"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Active meeting card */}
      {activeMeeting ? (
        <div className="rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse flex-shrink-0" />
            <span className="text-sm font-bold">LIVE NOW</span>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{activeMeeting.title}</h2>
              {activeMeeting.description && <p className="text-sm text-gray-500 mt-0.5">{activeMeeting.description}</p>}
            </div>

            {/* Room link */}
            {activeMeeting.roomCode && (
              <div className="bg-white/70 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <div>
                  <p className="text-xs text-gray-500 font-medium">Meeting Room</p>
                  <p className="text-sm font-mono text-gray-700 break-all">{activeMeeting.roomCode}</p>
                </div>
              </div>
            )}

            {/* Admin controls */}
            {canManage && (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => toggleMeetingActive(activeMeeting, false)}
                  className="flex-1 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors">
                  End Meeting
                </button>
              </div>
            )}

            {/* Member join request */}
            {!canManage && !canManageRequests && (
              <div className="pt-1">
                {joinStatus === "approved" ? (
                  <div className="flex items-center gap-2 text-green-700 bg-green-100 rounded-xl px-4 py-3 text-sm font-medium">
                    <Shield className="w-4 h-4 flex-shrink-0" /> You have been approved to join
                  </div>
                ) : joinStatus === "pending" ? (
                  <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm">
                    <Clock className="w-4 h-4 flex-shrink-0" /> Your request is pending approval
                  </div>
                ) : joinStatus === "rejected" ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
                      <X className="w-4 h-4 flex-shrink-0" /> Your request was not approved
                    </div>
                    <button
                      onClick={handleJoinRequest}
                      disabled={joinLoading}
                      className="w-full py-2 text-sm font-semibold bg-purple-700 hover:bg-purple-800 text-white rounded-xl transition-colors disabled:opacity-60">
                      {joinLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Request Again"}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleJoinRequest}
                    disabled={joinLoading || !user?.memberId}
                    className="w-full py-2.5 text-sm font-semibold bg-purple-700 hover:bg-purple-800 text-white rounded-xl transition-colors disabled:opacity-60">
                    {joinLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Request to Join Meeting"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <Users className="w-8 h-8 text-gray-300" />
          </div>
          <p className="font-semibold text-gray-500">No active meeting right now</p>
          <p className="text-sm text-gray-400">Check back later or ask your admin to start a session.</p>
        </div>
      )}

      {/* Admin: manage meetings */}
      {canManage && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">All Meetings</h3>
            <Dialog open={addMeetingOpen} onOpenChange={setAddMeetingOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-purple-700 hover:bg-purple-800 text-white">
                  <Plus className="w-3.5 h-3.5 mr-1" /> New Meeting
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle>Create Meeting</DialogTitle></DialogHeader>
                <form onSubmit={handleCreateMeeting} className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label>Title *</Label>
                    <Input value={meetingForm.title} onChange={e => setMeetingForm(f => ({ ...f, title: e.target.value }))} required placeholder="e.g. Sunday Leaders' Meeting" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Description</Label>
                    <Textarea value={meetingForm.description} onChange={e => setMeetingForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" className="h-20 resize-none" />
                  </div>
                  <Button type="submit" disabled={meetingFormLoading} className="w-full bg-purple-700 hover:bg-purple-800 text-white">
                    {meetingFormLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Create Meeting
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          {meetings.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No meetings yet. Create one above.</p>
          ) : (
            <div className="space-y-2">
              {meetings.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.title}</p>
                    {m.description && <p className="text-xs text-gray-400 truncate">{m.description}</p>}
                  </div>
                  {m.isActive ? (
                    <span className="text-[10px] font-bold text-green-700 bg-green-100 rounded-full px-2 py-0.5 flex items-center gap-1 flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" /> LIVE
                    </span>
                  ) : (
                    <button
                      onClick={() => toggleMeetingActive(m, true)}
                      className="text-xs text-purple-700 border border-purple-200 hover:bg-purple-50 rounded-lg px-3 py-1 transition-colors flex-shrink-0">
                      Start
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Video Conference Tab ──────────────────────────────────────────────────────

// ── Live-meeting alert: plays a chime + shows a system notification ───────────
async function playLiveMeetingAlert(title: string) {
  // 1. Web Audio chime (works even if page is in foreground)
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const freqs = [880, 1100, 1320];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.25, t0 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
      osc.start(t0);
      osc.stop(t0 + 0.4);
    });
  } catch {}

  // 2. System notification (shows even when app is backgrounded on mobile)
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("🔴 Meeting is Live!", {
        body: `"${title}" has started — tap to join now`,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        vibrate: [200, 80, 200, 80, 400],
        tag: "live-meeting",
        requireInteraction: false,
        data: { url: "/online-portal" },
      } as NotificationOptions);
    } else {
      new Notification("🔴 Meeting is Live!", {
        body: `"${title}" has started — tap to join now`,
        icon: "/icon-192.png",
      });
    }
  } catch {}
}

const MEETING_TYPE_LABELS: Record<string, string> = {
  open: "Open — Everyone Welcome",
  restricted: "Restricted — Admin Approval",
};

function VideoConferenceTab({ canManage, user }: { canManage: boolean; user: any }) {
  const { toast } = useToast();
  const { joinedMeeting, setJoinedMeeting, myPeerId } = useMeetingContext();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [joinLoadingId, setJoinLoadingId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", description: "", meetingType: "open" });
  const [editOpen, setEditOpen] = useState(false);
  const [editMeeting, setEditMeeting] = useState<any>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", meetingType: "open" });
  const [editLoading, setEditLoading] = useState(false);
  const [joinStatuses, setJoinStatuses] = useState<Record<number, "none" | "pending" | "approved">>({});
  const [requestingJoinId, setRequestingJoinId] = useState<number | null>(null);
  const [startLoadingId, setStartLoadingId] = useState<number | null>(null);
  const [conflictMeeting, setConflictMeeting] = useState<{ conflictTitle: string; conflictId: number } | null>(null);
  const [endConfirmMeeting, setEndConfirmMeeting] = useState<any>(null);
  const [endingMeetingId, setEndingMeetingId] = useState<number | null>(null);
  const [deleteConfirmMeeting, setDeleteConfirmMeeting] = useState<any>(null);
  const [deletingMeetingId, setDeletingMeetingId] = useState<number | null>(null);
  const [endReportMeeting, setEndReportMeeting] = useState<any>(null);
  const [endReportData, setEndReportData] = useState<any[]>([]);
  const [endReportLoading, setEndReportLoading] = useState(false);

  const prevLiveIdsRef = useRef<Set<number>>(new Set());

  const fetchJoinStatusesForRestricted = useCallback(async (meetingsList: any[]) => {
    if (!user?.memberId) return;
    const restricted = meetingsList.filter((m: any) => m.isActive && m.meetingType === "restricted");
    for (const m of restricted) {
      try {
        const data = await apicall(`/api/meetings/${m.id}/my-join-status`, "GET");
        setJoinStatuses(prev => ({ ...prev, [m.id]: data.status === "approved" ? "approved" : data.status === "pending" ? "pending" : "none" }));
      } catch {}
    }
  }, [user]);

  const fetchMeetings = useCallback(async () => {
    try {
      const data = await apicall("/api/online-meetings", "GET");
      const list = Array.isArray(data) ? data : [];
      setMeetings(list);
      fetchJoinStatusesForRestricted(list);

      // Detect newly-live meetings and fire a notification + sound
      // Restricted meetings are private — never notify regular members
      const nowLiveIds = new Set<number>(list.filter((m: any) => m.isActive).map((m: any) => m.id as number));
      const newlyLive = list.filter((m: any) => m.isActive && !prevLiveIdsRef.current.has(m.id) && m.meetingType !== "restricted");
      prevLiveIdsRef.current = nowLiveIds;

      for (const m of newlyLive) {
        playLiveMeetingAlert(m.title);
      }
    } catch {}
    finally { setLoadingMeetings(false); }
  }, [fetchJoinStatusesForRestricted]);

  useEffect(() => {
    // Request notification permission once on mount
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    fetchMeetings();
    const t = setInterval(fetchMeetings, 30_000);
    return () => clearInterval(t);
  }, [fetchMeetings]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setCreateLoading(true);
    try {
      await apicall("/api/online-meetings", "POST", {
        title: form.title,
        description: form.description,
        meetingType: form.meetingType,
      });
      setCreateOpen(false);
      setForm({ title: "", description: "", meetingType: "open" });
      fetchMeetings();
      toast({ title: "Meeting created" });
    } catch (err: any) {
      toast({ title: "Failed to create meeting", description: err.message, variant: "destructive" });
    } finally { setCreateLoading(false); }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMeeting) return;
    setEditLoading(true);
    try {
      await apicall(`/api/online-meetings/${editMeeting.id}`, "PATCH", {
        title: editForm.title,
        description: editForm.description,
        meetingType: editForm.meetingType,
      });
      setEditOpen(false);
      setEditMeeting(null);
      fetchMeetings();
      toast({ title: "Meeting updated" });
    } catch (err: any) {
      toast({ title: "Failed to update meeting", description: err.message, variant: "destructive" });
    } finally { setEditLoading(false); }
  };

  const handleRequestJoin = async (meeting: any) => {
    setRequestingJoinId(meeting.id);
    try {
      await apicall(`/api/meetings/${meeting.id}/join-request`, "POST");
      setJoinStatuses(prev => ({ ...prev, [meeting.id]: "pending" }));
      toast({ title: "Request sent", description: "The admin will admit you when they see your request." });
    } catch {
      toast({ title: "Failed to send request", variant: "destructive" });
    } finally { setRequestingJoinId(null); }
  };

  const handleToggleActive = async (meeting: any, active: boolean) => {
    setStartLoadingId(meeting.id);
    try {
      await apicall(`/api/online-meetings/${meeting.id}`, "PATCH", { isActive: active });
      fetchMeetings();
      toast({ title: active ? "Meeting started — participants can now join" : "Meeting ended" });
    } catch (err: any) {
      if (err?.status === 409 && err?.data?.conflictTitle) {
        setConflictMeeting({ conflictTitle: err.data.conflictTitle, conflictId: err.data.conflictId });
      } else {
        toast({ title: "Action failed", description: err?.message, variant: "destructive" });
      }
    }
    finally { setStartLoadingId(null); }
  };

  const handleDelete = async (meeting: any) => {
    try {
      await apicall(`/api/online-meetings/${meeting.id}`, "DELETE");
      fetchMeetings();
      toast({ title: "Meeting deleted" });
    } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteConfirmMeeting) return;
    const meeting = deleteConfirmMeeting;
    setDeletingMeetingId(meeting.id);
    setDeleteConfirmMeeting(null);
    try {
      await apicall(`/api/online-meetings/${meeting.id}`, "DELETE");
      fetchMeetings();
      toast({ title: "Meeting deleted" });
    } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
    finally { setDeletingMeetingId(null); }
  };

  const handleEndMeetingConfirmed = async () => {
    if (!endConfirmMeeting) return;
    const meeting = endConfirmMeeting;
    setEndConfirmMeeting(null);
    setEndingMeetingId(meeting.id);
    try {
      await apicall(`/api/online-meetings/${meeting.id}`, "PATCH", { isActive: false });
      fetchMeetings();
      toast({ title: "Meeting ended" });
      setEndReportLoading(true);
      try {
        const rows = await apicall(`/api/meetings/${meeting.id}/participants-report`, "GET");
        setEndReportData(Array.isArray(rows) ? rows : []);
      } catch { setEndReportData([]); }
      finally { setEndReportLoading(false); }
      setEndReportMeeting(meeting);
    } catch { toast({ title: "Failed to end meeting", variant: "destructive" }); }
    finally { setEndingMeetingId(null); }
  };

  const handleJoin = async (meeting: any) => {
    setJoinLoadingId(meeting.id);
    try {
      const data = await apicall("/api/conference/" + meeting.id + "/join", "POST", { peerId: myPeerId });
      setJoinedMeeting({ ...meeting, myRole: data.role, myDisplayName: data.displayName, unmutingAllowed: data.unmutingAllowed });
    } catch (err: any) {
      toast({ title: "Could not join meeting", description: err.message, variant: "destructive" });
    } finally { setJoinLoadingId(null); }
  };

  const activeMeeting = meetings.find((m) => m.isActive);

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Video Conferencing</h2>
          <p className="text-sm text-gray-500 mt-0.5">Host or join live video/audio meetings for Christ Embassy Kumasi 1</p>
        </div>
        {canManage && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-purple-700 hover:bg-purple-800 text-white gap-2">
                <Plus className="w-4 h-4" /> Create Meeting
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Create New Meeting</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Meeting Title *</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    required
                    placeholder="e.g. Sunday Service Leadership Briefing"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Meeting Type</Label>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { value: "open", label: "Open", desc: "Everyone can join — includes a shareable link for guests without accounts" },
                      { value: "restricted", label: "Restricted", desc: "Members request to join — admin admits each person from inside the meeting" },
                    ].map(opt => (
                      <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${form.meetingType === opt.value ? "border-purple-400 bg-purple-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                        <input type="radio" name="meetingType" value={opt.value} checked={form.meetingType === opt.value} onChange={() => setForm(f => ({ ...f, meetingType: opt.value }))} className="mt-0.5 accent-purple-700" />
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Description (optional)</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Brief description of the meeting purpose…"
                    rows={2}
                    className="resize-none"
                  />
                </div>
                <Button type="submit" className="w-full bg-purple-700 hover:bg-purple-800 text-white" disabled={createLoading}>
                  {createLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : "Create Meeting"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Meeting list */}
      {loadingMeetings ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
        </div>
      ) : meetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-purple-50 flex items-center justify-center">
            <Video className="w-8 h-8 text-purple-400" />
          </div>
          <h3 className="font-semibold text-gray-900">No meetings yet</h3>
          <p className="text-sm text-gray-500 max-w-xs">
            {canManage ? "Create a meeting to get started. You can set the type and invite specific groups." : "No meetings have been scheduled yet. Check back soon."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((meeting) => {
            const isActive = meeting.isActive;
            const typeLabel = MEETING_TYPE_LABELS[meeting.meetingType ?? "open"] ?? "Open — Everyone Welcome";
            const typeColor = meeting.meetingType === "restricted"
              ? "bg-orange-100 text-orange-700 border-orange-200"
              : "bg-green-100 text-green-700 border-green-200";
            const myJoinStatus = joinStatuses[meeting.id] ?? "none";
            const isRestricted = meeting.meetingType === "restricted";

            return (
              <div
                key={meeting.id}
                className={`rounded-2xl border p-4 space-y-3 transition-shadow ${
                  isActive
                    ? "border-purple-200 bg-gradient-to-br from-purple-50 to-white shadow-md"
                    : "border-gray-100 bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-green-600 rounded-full px-2 py-0.5 shrink-0">
                          <span className="w-1 h-1 rounded-full bg-white animate-pulse" />LIVE
                        </span>
                      )}
                      <h3 className="font-semibold text-gray-900 text-sm truncate">{meeting.title}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold border rounded-full px-2 py-0.5 shrink-0 ${typeColor}`}>
                        {typeLabel}
                      </span>
                      {isActive && (
                        <span className="text-[10px] text-gray-500 shrink-0">
                          {meeting.restrictionOff ? "🎙️ Open mic" : "🔒 Locked"}
                        </span>
                      )}
                      {meeting.description && (
                        <p className="text-xs text-gray-400 truncate hidden sm:block">{meeting.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isActive && canManage && (
                      <Button
                        size="sm"
                        className="bg-purple-700 hover:bg-purple-800 text-white text-xs gap-1"
                        disabled={joinLoadingId === meeting.id}
                        onClick={() => handleJoin(meeting)}
                      >
                        {joinLoadingId === meeting.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Video className="w-3 h-3" />}
                        <span className="hidden xs:inline">Join</span>
                      </Button>
                    )}
                    {isActive && !canManage && !isRestricted && (
                      <Button
                        size="sm"
                        className="bg-purple-700 hover:bg-purple-800 text-white text-xs gap-1"
                        disabled={joinLoadingId === meeting.id}
                        onClick={() => handleJoin(meeting)}
                      >
                        {joinLoadingId === meeting.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Video className="w-3 h-3" />}
                        <span className="hidden xs:inline">Join</span>
                      </Button>
                    )}
                    {isActive && !canManage && isRestricted && myJoinStatus === "approved" && (
                      <Button
                        size="sm"
                        className="bg-purple-700 hover:bg-purple-800 text-white text-xs gap-1"
                        disabled={joinLoadingId === meeting.id}
                        onClick={() => handleJoin(meeting)}
                      >
                        {joinLoadingId === meeting.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Video className="w-3 h-3" />}
                        <span className="hidden xs:inline">Join</span>
                      </Button>
                    )}
                    {isActive && !canManage && isRestricted && myJoinStatus === "pending" && (
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                        ⏳ Pending…
                      </span>
                    )}
                    {isActive && !canManage && isRestricted && myJoinStatus === "none" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-orange-700 border-orange-300 hover:bg-orange-50 text-xs gap-1"
                        disabled={requestingJoinId === meeting.id}
                        onClick={() => handleRequestJoin(meeting)}
                      >
                        {requestingJoinId === meeting.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        Request to Join
                      </Button>
                    )}
                    {canManage && (
                      <>
                        {!isActive ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-700 border-green-200 hover:bg-green-50 text-xs gap-1"
                            disabled={startLoadingId === meeting.id}
                            onClick={() => handleToggleActive(meeting, true)}
                          >
                            {startLoadingId === meeting.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                            Start
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50 text-xs gap-1"
                            disabled={endingMeetingId === meeting.id}
                            onClick={() => setEndConfirmMeeting(meeting)}
                          >
                            {endingMeetingId === meeting.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                            End
                          </Button>
                        )}
                        {!isActive && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-blue-500 border-blue-200 hover:bg-blue-50 text-xs px-2"
                            onClick={() => { setEditMeeting(meeting); setEditForm({ title: meeting.title, description: meeting.description ?? "", meetingType: meeting.meetingType ?? "open" }); setEditOpen(true); }}
                          >
                            ✏️
                          </Button>
                        )}
                        {!isActive && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-gray-400 border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-xs px-2"
                            disabled={deletingMeetingId === meeting.id}
                            onClick={() => setDeleteConfirmMeeting(meeting)}
                          >
                            {deletingMeetingId === meeting.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {meeting.description && (
                  <p className="text-xs text-gray-400 line-clamp-1 sm:hidden -mt-1">{meeting.description}</p>
                )}
                {isActive && (
                  <p className="text-[10px] text-gray-400 -mt-1">
                    Room: <span className="font-mono font-semibold text-gray-600">{meeting.roomCode}</span>
                  </p>
                )}

                {/* How to join — only shown when active + open type */}
                {isActive && meeting.meetingType === "open" && (
                  <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2 space-y-1.5">
                    <div className="text-xs text-green-700 font-medium">🔗 Invite link — share with anyone to join as a guest</div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-[10px] font-mono text-gray-600 bg-white border border-green-200 rounded px-2 py-1 truncate select-all">
                        {typeof window !== "undefined" ? `${window.location.origin}/join/${meeting.id}` : ""}
                      </code>
                      <button
                        onClick={() => {
                          const link = `${window.location.origin}/join/${meeting.id}`;
                          navigator.clipboard.writeText(link).catch(() => {});
                          const el = document.createElement("div");
                          el.textContent = "Link copied!";
                          el.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#166534;color:white;padding:6px 14px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;pointer-events:none;";
                          document.body.appendChild(el);
                          setTimeout(() => el.remove(), 1800);
                        }}
                        className="shrink-0 text-[10px] font-semibold text-green-700 bg-green-100 hover:bg-green-200 border border-green-200 rounded px-2 py-1 transition-colors"
                      >
                        📋 Copy
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400">Guests open this link → enter their name → join as viewer (watch, listen, chat, react)</p>
                  </div>
                )}
                {isActive && isRestricted && canManage && (
                  <div className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-1.5">
                    🔒 <span className="font-medium">Restricted meeting</span> — members must request to join. You'll see their requests inside the meeting.
                  </div>
                )}
                {isActive && isRestricted && !canManage && myJoinStatus === "none" && (
                  <div className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-1.5">
                    🔒 <span className="font-medium">Restricted</span> — tap <em>Request to Join</em> and the admin will let you in.
                  </div>
                )}
                {isActive && isRestricted && !canManage && myJoinStatus === "pending" && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                    ⏳ <span className="font-medium">Request sent</span> — waiting for the admin to admit you.
                  </div>
                )}
                {isActive && isRestricted && !canManage && myJoinStatus === "approved" && (
                  <div className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-1.5">
                    ✅ <span className="font-medium">Approved!</span> You can now join the meeting.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty active meeting note for non-admins */}
      {!activeMeeting && !loadingMeetings && meetings.length > 0 && !canManage && (
        <div className="text-center py-6 text-sm text-gray-500">
          No meeting is currently live. Check back when the admin starts one.
        </div>
      )}

      {/* ── End Meeting Confirmation Dialog ─────────────────────────────── */}
      <Dialog open={!!endConfirmMeeting} onOpenChange={open => { if (!open) setEndConfirmMeeting(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
              End Meeting?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-gray-700">Are you sure you want to end this meeting?</p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <p className="text-sm font-semibold text-gray-900 break-all line-clamp-2">{endConfirmMeeting?.title}</p>
            </div>
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              This will end the meeting for all participants and remove it. A report will be generated.
            </p>
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEndConfirmMeeting(null)}>
                No, Keep Going
              </Button>
              <Button type="button" className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={handleEndMeetingConfirmed}>
                Yes, End Meeting
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Meeting Already Live Conflict Dialog ────────────────────────── */}
      <Dialog open={!!conflictMeeting} onOpenChange={open => { if (!open) setConflictMeeting(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
              Meeting Already in Progress
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-gray-700">
              Another meeting is currently live. Only one meeting can be active at a time.
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <span className="text-red-500 mt-0.5 shrink-0">🔴</span>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Live now</p>
                <p className="text-sm font-bold text-gray-900 break-words">{conflictMeeting?.conflictTitle}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              End the live meeting first, then you can start this one.
            </p>
            <Button
              type="button"
              className="w-full bg-gray-900 hover:bg-gray-800 text-white"
              onClick={() => setConflictMeeting(null)}
            >
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Meeting Dialog ──────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={open => { if (!open) { setEditOpen(false); setEditMeeting(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Meeting</DialogTitle></DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Meeting Title *</Label>
              <Input
                value={editForm.title}
                onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                required
                placeholder="Meeting title"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Meeting Type</Label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { value: "open", label: "Open", desc: "Everyone can join" },
                  { value: "restricted", label: "Restricted", desc: "Members request to join — admin admits each person" },
                ].map(opt => (
                  <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${editForm.meetingType === opt.value ? "border-purple-400 bg-purple-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                    <input type="radio" name="editMeetingType" value={opt.value} checked={editForm.meetingType === opt.value} onChange={() => setEditForm(f => ({ ...f, meetingType: opt.value }))} className="mt-0.5 accent-purple-700" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description"
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => { setEditOpen(false); setEditMeeting(null); }}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-purple-700 hover:bg-purple-800 text-white" disabled={editLoading}>
                {editLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Meeting Confirmation Dialog ──────────────────────────── */}
      <Dialog open={!!deleteConfirmMeeting} onOpenChange={open => { if (!open) setDeleteConfirmMeeting(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-800">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Delete Meeting?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-gray-700">Are you sure you want to permanently delete this meeting?</p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <p className="text-sm font-semibold text-gray-900 break-all line-clamp-2">{deleteConfirmMeeting?.title}</p>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              This action cannot be undone.
            </p>
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setDeleteConfirmMeeting(null)}>
                Cancel
              </Button>
              <Button type="button" className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={handleDeleteConfirmed}>
                Yes, Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Meeting End Report Dialog ────────────────────────────────────── */}
      <Dialog open={!!endReportMeeting} onOpenChange={open => { if (!open) { setEndReportMeeting(null); setEndReportData([]); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              Meeting Ended — Report
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <p className="text-sm font-semibold text-gray-900 break-all line-clamp-2">{endReportMeeting?.title}</p>
            </div>

            {endReportLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-purple-700">{endReportData.length}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Total Participants</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-blue-700">
                      {endReportData.filter((r: any) => r.first_name || r.firstName).length}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Registered Members</p>
                  </div>
                </div>

                {endReportData.length > 0 && (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Attendance</p>
                    {endReportData.map((r: any, i: number) => {
                      const firstName = r.first_name ?? r.firstName ?? "";
                      const lastName  = r.last_name  ?? r.lastName  ?? "";
                      const name = firstName || lastName ? `${firstName} ${lastName}`.trim() : r.display_name ?? r.displayName ?? "Guest";
                      const cell = r.cell_name ?? r.cellName ?? "";
                      const role = r.role ?? "";
                      return (
                        <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
                          <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-[10px] font-bold text-purple-700 flex-shrink-0">
                            {name.split(" ").map((n: string) => n[0] ?? "").join("").slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">{name}</p>
                            {cell && <p className="text-[10px] text-gray-400 truncate">{cell}</p>}
                          </div>
                          {role === "admin" || role === "co-host" ? (
                            <span className="text-[9px] font-bold text-purple-700 bg-purple-100 rounded px-1.5 py-0.5 flex-shrink-0">{role}</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                {endReportData.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-3">No participant records found.</p>
                )}
              </>
            )}

            <Button className="w-full bg-purple-700 hover:bg-purple-800 text-white" onClick={() => { setEndReportMeeting(null); setEndReportData([]); }}>
              Close Report
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function OnlinePortal() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = (user?.roleLevel ?? 5) <= 3;
  const isLeader = (user as any)?.roleLevel === 4;
  // Only super admin (level 1) and media admin (3d) can approve/reject access requests
  const canManageRequests = user?.roleLevel === 1 || (user as any)?.roleSubtype === "media";

  const [activePortalTab, setActivePortalTab] = useState<"videos" | "conference">("videos");

  // Reject dialog state
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; memberId: number; videoId: number; name: string; reason: string }>({
    open: false, memberId: 0, videoId: 0, name: "", reason: "",
  });



  // Video list
  const { data: videos = [], isLoading: videosLoading } = useListVideos({
    query: { queryKey: getListVideosQueryKey() },
  });
  const deleteVideo = useDeleteVideo({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
        toast({ title: "Video removed" });
      },
    },
  });

  const liveVideos = (videos as any[]).filter((v: any) => v.isLive);
  // All videos sorted: live first, then by date descending
  const allVideos = [
    ...(videos as any[]).filter((v: any) => v.isLive),
    ...(videos as any[]).filter((v: any) => !v.isLive),
  ];

  // Pagination (all videos)
  const [archivePage, setArchivePage] = useState(1);
  const archiveTotalPages = Math.ceil(allVideos.length / VIDEOS_PER_PAGE);
  const pageVideos = allVideos.slice((archivePage - 1) * VIDEOS_PER_PAGE, archivePage * VIDEOS_PER_PAGE);

  // Selected video player
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  // Access / presence state (for live videos)
  const [hasAccess, setHasAccess] = useState(false);
  const [accessStatus, setAccessStatus] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [watchers, setWatchers] = useState<any[]>([]);
  const [accessRequests, setAccessRequests] = useState<any[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watcherPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const requestsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Add video form
  const [addVideoOpen, setAddVideoOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [videoForm, setVideoForm] = useState({
    title: "", youtubeUrl: "", date: new Date().toISOString().split("T")[0], isLive: false, isRestricted: false, description: "",
  });
  const [copied, setCopied] = useState(false);

  // Edit video
  const [editVideoOpen, setEditVideoOpen] = useState(false);
  const [editVideoTarget, setEditVideoTarget] = useState<any>(null);
  const [editVideoForm, setEditVideoForm] = useState({
    title: "", youtubeUrl: "", date: "", isRestricted: false, description: "",
  });
  const [editVideoLoading, setEditVideoLoading] = useState(false);
  const [endLiveConfirm, setEndLiveConfirm] = useState(false);
  const [endLiveLoading, setEndLiveLoading] = useState(false);

  // Live video chat state
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastChatIdRef = useRef<number>(0);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Mobile collapsible panels + Picture-in-Picture
  const [chatOpen, setChatOpen] = useState(false);
  const [watchersOpen, setWatchersOpen] = useState(false);
  const [pipMode, setPipMode] = useState(false);
  const pipRef = useRef<HTMLDivElement>(null);
  const pipDragRef = useRef<{ startX: number; startY: number; initLeft: number; initTop: number } | null>(null);

  // Global pending access requests panel (admin)
  const [globalPendingRequests, setGlobalPendingRequests] = useState<any[]>([]);
  const globalPendingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);


  // ── access check when selecting a live video ──────────────────────────────
  const checkAccess = useCallback(async (videoId: number, isRestricted: boolean) => {
    if (!user) return;
    if (!isRestricted) { setHasAccess(true); setAccessStatus("granted"); setRejectionReason(null); return; }
    if (canManage || isLeader) { setHasAccess(true); setAccessStatus("granted"); setRejectionReason(null); return; }
    try {
      const data = await apicall(`/api/videos/${videoId}/access`, "GET");
      setHasAccess(data.hasAccess);
      setAccessStatus(data.requestStatus);
      setRejectionReason(data.rejectionReason ?? null);
    } catch { /* ignore */ }
  }, [user, canManage, isLeader]);

  // ── fetch who's watching ──────────────────────────────────────────────────
  const fetchWatchers = useCallback(async (videoId: number) => {
    try {
      const data = await apicall(`/api/videos/${videoId}/watchers`, "GET");
      setWatchers(data);
    } catch { /* ignore */ }
  }, []);

  // ── fetch pending requests (admin) ────────────────────────────────────────
  const fetchRequests = useCallback(async (videoId: number) => {
    if (!canManageRequests) return;
    setRequestsLoading(true);
    try {
      const data = await apicall(`/api/videos/${videoId}/access-requests`, "GET");
      setAccessRequests(data);
    } catch { /* ignore */ }
    finally { setRequestsLoading(false); }
  }, [canManageRequests]);

  // ── when a video is selected ──────────────────────────────────────────────
  const openVideo = useCallback(async (v: any) => {
    setSelectedVideo(v);
    setWatchers([]);
    setHasAccess(false);
    setAccessStatus(null);
    setRejectionReason(null);
    setAccessRequests([]);
    setChatMessages([]);
    setChatInput("");
    lastChatIdRef.current = 0;
    setChatOpen(false);
    setWatchersOpen(false);
    setPipMode(false);

    setTimeout(() => playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);

    // Always check access for any restricted video (not just live)
    await checkAccess(v.id, v.isRestricted ?? false);

    if (v.isLive) {
      await fetchWatchers(v.id);
    }
    // Load pending access requests for admin on any restricted video
    if (canManageRequests && v.isRestricted) {
      await fetchRequests(v.id);
    }
  }, [checkAccess, fetchWatchers, fetchRequests, canManageRequests]);

  // ── heartbeat while watching live ─────────────────────────────────────────
  useEffect(() => {
    if (!selectedVideo?.isLive || !hasAccess || !user) return;

    const videoId = selectedVideo.id;

    const ping = () =>
      apicall(`/api/videos/${videoId}/watch/join`, "POST").catch(() => {});

    // Ping immediately so current user appears right away, then every 12s
    ping();
    heartbeatRef.current = setInterval(ping, 12_000);

    // Separate watcher-list refresh every 8s so all viewers see joins/leaves quickly
    fetchWatchers(videoId);
    watcherPollRef.current = setInterval(() => fetchWatchers(videoId), 15_000);

    return () => {
      clearInterval(heartbeatRef.current!);
      clearInterval(watcherPollRef.current!);
      apicall(`/api/videos/${videoId}/watch/leave`, "POST").catch(() => {});
    };
  }, [selectedVideo?.id, selectedVideo?.isLive, hasAccess, user, fetchWatchers]);

  // ── poll for access requests while admin has a restricted video open ────────
  useEffect(() => {
    if (!selectedVideo?.isRestricted || !canManageRequests) return;
    requestsPollRef.current = setInterval(() => fetchRequests(selectedVideo.id), 10_000);
    return () => { clearInterval(requestsPollRef.current!); };
  }, [selectedVideo?.id, selectedVideo?.isRestricted, canManageRequests, fetchRequests]);

  // ── auto-poll access status for restricted videos waiting for approval ────
  useEffect(() => {
    if (!selectedVideo?.isRestricted || hasAccess || !user) return;
    const videoId = selectedVideo.id;
    const poll = setInterval(async () => {
      try {
        const data = await apicall(`/api/videos/${videoId}/access`, "GET");
        if (data.hasAccess) {
          setHasAccess(true);
          setAccessStatus("granted");
          setRejectionReason(null);
          toast({ title: "Access granted!", description: "You can now watch this video." });
        } else {
          setAccessStatus(data.requestStatus);
          setRejectionReason(data.rejectionReason ?? null);
        }
      } catch { /* ignore */ }
    }, 8_000);
    return () => clearInterval(poll);
  }, [selectedVideo?.id, selectedVideo?.isRestricted, hasAccess, user]);

  // ── poll video state to detect mid-watch restriction changes ─────────────
  useEffect(() => {
    if (!selectedVideo || !user) return;
    const videoId = selectedVideo.id;
    const wasRestricted = selectedVideo.isRestricted;
    const poll = setInterval(async () => {
      try {
        const latest = await apicall(`/api/videos/${videoId}`, "GET");
        // Sync restriction & live status into selectedVideo
        setSelectedVideo((prev: any) => {
          if (!prev || prev.id !== videoId) return prev;
          return { ...prev, isRestricted: latest.isRestricted, isLive: latest.isLive };
        });
        // Restriction just turned ON while user was watching
        if (latest.isRestricted && !wasRestricted && !canManage && !isLeader) {
          const accessData = await apicall(`/api/videos/${videoId}/access`, "GET");
          setHasAccess(accessData.hasAccess);
          setAccessStatus(accessData.requestStatus);
        }
        // Restriction just turned OFF — open to everyone
        if (!latest.isRestricted && wasRestricted && !canManage && !isLeader) {
          setHasAccess(true);
          setAccessStatus("granted");
        }
      } catch { /* ignore */ }
    }, 10_000);
    return () => clearInterval(poll);
  }, [selectedVideo?.id, selectedVideo?.isLive, selectedVideo?.isRestricted, canManage, isLeader, user]);

  // ── fetch and poll chat messages for live video ───────────────────────────
  const fetchChatMessages = useCallback(async (videoId: number, afterId: number) => {
    try {
      const data = await apicall(`/api/videos/${videoId}/chat?after=${afterId}`, "GET");
      if (Array.isArray(data) && data.length > 0) {
        setChatMessages(prev => {
          const newMsgs = data.filter((m: any) => !prev.some((p: any) => p.id === m.id));
          return [...prev, ...newMsgs];
        });
        lastChatIdRef.current = Math.max(...data.map((m: any) => m.id), lastChatIdRef.current);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!selectedVideo?.isLive || !hasAccess || !user) return;
    fetchChatMessages(selectedVideo.id, 0);
    chatPollRef.current = setInterval(() => fetchChatMessages(selectedVideo.id, lastChatIdRef.current), 6_000);
    return () => { clearInterval(chatPollRef.current!); };
  }, [selectedVideo?.id, selectedVideo?.isLive, hasAccess, user, fetchChatMessages]);

  useEffect(() => {
    if (!showEmojiPicker) return;
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showEmojiPicker]);

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !selectedVideo || chatSending) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatSending(true);
    try {
      const data = await apicall(`/api/videos/${selectedVideo.id}/chat`, "POST", { message: msg });
      setChatMessages(prev => {
        if (prev.some((m: any) => m.id === data.id)) return prev;
        return [...prev, data];
      });
      lastChatIdRef.current = Math.max(data.id, lastChatIdRef.current);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch {
      toast({ title: "Could not send message", variant: "destructive" });
      setChatInput(msg);
    } finally { setChatSending(false); }
  };

  // ── global pending access requests (admin) ────────────────────────────────
  const fetchGlobalPendingRequests = useCallback(async () => {
    if (!canManageRequests) return;
    try {
      const data = await apicall("/api/notifications/pending-requests", "GET");
      setGlobalPendingRequests(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }, [canManageRequests]);

  useEffect(() => {
    if (!canManageRequests) return;
    fetchGlobalPendingRequests();
    globalPendingPollRef.current = setInterval(fetchGlobalPendingRequests, 15_000);
    return () => { clearInterval(globalPendingPollRef.current!); };
  }, [canManageRequests, fetchGlobalPendingRequests]);

  const approveGlobalRequest = async (videoId: number, memberId: number, key: string) => {
    setApprovingId(key);
    try {
      await apicall(`/api/videos/${videoId}/access-grant/${memberId}`, "POST");
      setGlobalPendingRequests(prev => prev.filter(r => !(r.videoId === videoId && r.memberId === memberId)));
      // Also refresh the inline player requests if this video is open
      if (selectedVideo?.id === videoId) await fetchRequests(videoId);
      toast({ title: "Access granted" });
    } catch { toast({ title: "Failed to grant access", variant: "destructive" }); }
    finally { setApprovingId(null); }
  };

  const rejectGlobalRequest = async (videoId: number, memberId: number, key: string) => {
    setApprovingId(key);
    try {
      await apicall(`/api/videos/${videoId}/access-reject/${memberId}`, "POST", {});
      setGlobalPendingRequests(prev => prev.filter(r => !(r.videoId === videoId && r.memberId === memberId)));
      if (selectedVideo?.id === videoId) await fetchRequests(videoId);
      toast({ title: "Request rejected" });
    } catch { toast({ title: "Failed to reject", variant: "destructive" }); }
    finally { setApprovingId(null); }
  };

  // ── request access ────────────────────────────────────────────────────────
  const requestAccess = async () => {
    if (!selectedVideo) return;
    setAccessLoading(true);
    try {
      await apicall(`/api/videos/${selectedVideo.id}/access-request`, "POST");
      setAccessStatus("pending");
      setRejectionReason(null);
      toast({ title: "Access requested", description: "An admin will grant you access shortly." });
    } catch {
      toast({ title: "Failed to send request", variant: "destructive" });
    } finally { setAccessLoading(false); }
  };

  // ── grant access (admin) ──────────────────────────────────────────────────
  const grantAccess = async (memberId: number) => {
    if (!selectedVideo) return;
    try {
      await apicall(`/api/videos/${selectedVideo.id}/access-grant/${memberId}`, "POST");
      await fetchRequests(selectedVideo.id);
      await fetchWatchers(selectedVideo.id);
      toast({ title: "Access granted" });
    } catch {
      toast({ title: "Failed to grant access", variant: "destructive" });
    }
  };

  // ── bulk grant all pending (admin) ────────────────────────────────────────
  const grantAllAccess = async () => {
    if (!selectedVideo || accessRequests.length === 0) return;
    try {
      await Promise.all(
        accessRequests.map(r => apicall(`/api/videos/${selectedVideo.id}/access-grant/${r.memberId}`, "POST"))
      );
      await fetchRequests(selectedVideo.id);
      await fetchWatchers(selectedVideo.id);
      toast({ title: `Access granted to ${accessRequests.length} member${accessRequests.length > 1 ? "s" : ""}` });
    } catch {
      toast({ title: "Failed to grant access to some members", variant: "destructive" });
    }
  };

  // ── reject access (admin) ─────────────────────────────────────────────────
  const rejectAccess = async () => {
    const videoId = rejectDialog.videoId || selectedVideo?.id;
    if (!videoId) return;
    try {
      await apicall(`/api/videos/${videoId}/access-reject/${rejectDialog.memberId}`, "POST", { reason: rejectDialog.reason });
      setGlobalPendingRequests(prev => prev.filter(r => !(r.videoId === videoId && r.memberId === rejectDialog.memberId)));
      setRejectDialog({ open: false, memberId: 0, videoId: 0, name: "", reason: "" });
      if (selectedVideo?.id === videoId) await fetchRequests(videoId);
      toast({ title: "Request rejected" });
    } catch {
      toast({ title: "Failed to reject request", variant: "destructive" });
    }
  };

  // ── add video ─────────────────────────────────────────────────────────────
  const handleAddVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoForm.youtubeUrl) { toast({ title: "URL required", variant: "destructive" }); return; }
    setAddLoading(true);
    try {
      await apicall("/api/videos", "POST", {
        title: videoForm.title,
        youtubeUrl: videoForm.youtubeUrl,
        date: videoForm.date,
        isLive: videoForm.isLive,
        isRestricted: videoForm.isRestricted,
        description: videoForm.description,
      });
      queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
      setAddVideoOpen(false);
      setVideoForm({ title: "", youtubeUrl: "", date: new Date().toISOString().split("T")[0], isLive: false, isRestricted: false, description: "" });
      toast({ title: "Video added to library" });
    } catch (err: any) {
      toast({ title: "Failed to add video", description: err.message, variant: "destructive" });
    } finally { setAddLoading(false); }
  };

  // ── end live ──────────────────────────────────────────────────────────────
  const endLive = async () => {
    if (!selectedVideo) return;
    setEndLiveLoading(true);
    try {
      await apicall(`/api/videos/${selectedVideo.id}/end-live`, "POST");
      queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
      setSelectedVideo((v: any) => v ? { ...v, isLive: false, liveEnded: true } : v);
      setEndLiveConfirm(false);
      toast({ title: "Live ended", description: "The live stream has been ended." });
    } catch (err: any) {
      toast({ title: "Failed to end live", description: err.message, variant: "destructive" });
    } finally { setEndLiveLoading(false); }
  };

  const toggleVideoRestricted = async (v: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apicall(`/api/videos/${v.id}`, "PATCH", { isRestricted: !v.isRestricted });
      queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
    } catch { toast({ title: "Failed to update video", variant: "destructive" }); }
  };

  const closePlayer = () => {
    if (selectedVideo?.isLive && hasAccess) {
      apicall(`/api/videos/${selectedVideo.id}/watch/leave`, "POST").catch(() => {});
    }
    setSelectedVideo(null);
  };

  // ── edit video ────────────────────────────────────────────────────────────
  const openEditVideo = (v: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditVideoTarget(v);
    setEditVideoForm({
      title: v.title ?? "",
      youtubeUrl: v.embedUrl ?? (v.youtubeId ? `https://www.youtube.com/watch?v=${v.youtubeId}` : ""),
      date: v.date ? v.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      isRestricted: v.isRestricted ?? false,
      description: v.description ?? "",
    });
    setEditVideoOpen(true);
  };

  const handleEditVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editVideoTarget) return;
    setEditVideoLoading(true);
    try {
      await apicall(`/api/videos/${editVideoTarget.id}`, "PATCH", {
        title: editVideoForm.title,
        youtubeUrl: editVideoForm.youtubeUrl,
        date: editVideoForm.date,
        isRestricted: editVideoForm.isRestricted,
        description: editVideoForm.description,
      });
      queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
      setEditVideoOpen(false);
      setEditVideoTarget(null);
      toast({ title: "Video updated" });
    } catch (err: any) {
      toast({ title: "Failed to update video", description: err.message, variant: "destructive" });
    } finally { setEditVideoLoading(false); }
  };


  // ── if not logged in ──────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 space-y-4">
        <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center">
          <Lock className="w-8 h-8 text-purple-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Members Only</h2>
        <p className="text-gray-500 max-w-sm">You need to be logged in as a member to access the online video portal.</p>
        <Button className="bg-purple-700 text-white" onClick={() => window.location.href = "/login"}>
          Sign In
        </Button>
      </div>
    );
  }


  return (
    <div className="space-y-6">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Online Portal</h1>
        <p className="text-sm text-gray-500 mt-1">Watch services and training meetings from Christ Embassy Kumasi 1</p>
      </div>

      {/* ── Portal tabs ─────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit border border-gray-200">
        <button
          onClick={() => setActivePortalTab("videos")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${activePortalTab === "videos" ? "bg-white shadow-sm text-purple-700 font-semibold" : "text-gray-500 hover:text-gray-800"}`}
        >
          Videos
        </button>
        <button
          onClick={() => setActivePortalTab("conference")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${activePortalTab === "conference" ? "bg-white shadow-sm text-purple-700 font-semibold" : "text-gray-500 hover:text-gray-800"}`}
        >
          Video Conferencing
        </button>
      </div>

      {/* Video Conferencing — Coming Soon */}
      <div style={{ display: activePortalTab === "conference" ? "block" : "none" }}>
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-5">
          <div className="w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center">
            <Video className="w-10 h-10 text-purple-400" />
          </div>
          <div className="space-y-2">
            <span className="inline-block text-xs font-bold tracking-widest text-purple-500 uppercase bg-purple-50 border border-purple-200 rounded-full px-3 py-1">
              Coming Soon
            </span>
            <h2 className="text-xl font-bold text-gray-800 mt-2">Video Conferencing</h2>
            <p className="text-sm text-gray-500 max-w-sm">
              Live video meetings for the church community are on the way. Check back soon!
            </p>
          </div>
        </div>
      </div>

      {activePortalTab !== "conference" && <>

      {/* ════════════════ VIDEO LIBRARY ════════════════ */}
      <div className="space-y-8">

          {/* ── Global pending access requests (admin) — compact, hidden when a video is open ── */}
          {canManageRequests && globalPendingRequests.length > 0 && !selectedVideo && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden text-xs">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 border-b border-amber-200">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
                <span className="font-semibold text-amber-900">
                  {globalPendingRequests.length} access request{globalPendingRequests.length > 1 ? "s" : ""} pending
                </span>
                {globalPendingRequests.length > 1 && (
                  <button
                    onClick={() => globalPendingRequests.forEach(r => approveGlobalRequest(r.videoId, r.memberId, `grant-${r.videoId}-${r.memberId}`))}
                    className="ml-auto text-green-700 bg-green-100 hover:bg-green-200 border border-green-200 rounded px-2 py-0.5 transition-colors">
                    Approve All
                  </button>
                )}
              </div>
              {globalPendingRequests.map((r: any) => {
                const approveKey = `grant-${r.videoId}-${r.memberId}`;
                const rejectKey  = `reject-${r.videoId}-${r.memberId}`;
                const memberName = r.member ? `${r.member.firstName ?? ""} ${r.member.lastName ?? ""}`.trim() : "Unknown";
                const videoTitle = r.video?.title ?? `Video #${r.videoId}`;
                return (
                  <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 bg-white/60 border-b border-amber-100 last:border-0">
                    <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-[10px] font-bold text-purple-700 flex-shrink-0">
                      {(r.member?.firstName?.[0] ?? "") + (r.member?.lastName?.[0] ?? "")}
                    </div>
                    <span className="font-medium text-gray-800 truncate">{memberName}</span>
                    <span className="text-gray-400 truncate flex-1">· {videoTitle}</span>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        disabled={approvingId === approveKey || approvingId === rejectKey}
                        onClick={() => approveGlobalRequest(r.videoId, r.memberId, approveKey)}
                        className="px-2 py-0.5 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50 transition-colors">
                        {approvingId === approveKey ? "…" : "Let In"}
                      </button>
                      <button
                        disabled={approvingId === approveKey}
                        onClick={() => setRejectDialog({ open: true, memberId: r.memberId, videoId: r.videoId, name: memberName, reason: "" })}
                        className="px-2 py-0.5 border border-red-300 text-red-600 hover:bg-red-50 rounded disabled:opacity-50 transition-colors">
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Video dialog (admin) — opened via button in section header */}
          {canManage && (
            <Dialog open={addVideoOpen} onOpenChange={setAddVideoOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Add Video to Library</DialogTitle></DialogHeader>
                <form onSubmit={handleAddVideo} className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label>Video Title *</Label>
                    <Input value={videoForm.title} onChange={e => setVideoForm(f => ({ ...f, title: e.target.value }))} required placeholder="e.g. Sunday Service — May 2026" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Video URL *</Label>
                    <Input value={videoForm.youtubeUrl} onChange={e => setVideoForm(f => ({ ...f, youtubeUrl: e.target.value }))} required placeholder="YouTube, Vimeo, or embed URL" />
                    <p className="text-xs text-gray-400">Paste a YouTube link, Vimeo link, or any embed URL</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Service Date</Label>
                    <Input type="date" value={videoForm.date} onChange={e => setVideoForm(f => ({ ...f, date: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Description (optional)</Label>
                    <Textarea value={videoForm.description} onChange={e => setVideoForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description..." rows={2} className="resize-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none p-3 rounded-lg border hover:bg-red-50 transition-colors">
                      <input type="checkbox" checked={videoForm.isLive} onChange={e => setVideoForm(f => ({ ...f, isLive: e.target.checked }))} className="w-4 h-4 accent-red-600" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">Mark as Live</p>
                        <p className="text-xs text-gray-500">Shows LIVE badge at top</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer select-none p-3 rounded-lg border hover:bg-orange-50 transition-colors">
                      <input type="checkbox" checked={videoForm.isRestricted} onChange={e => setVideoForm(f => ({ ...f, isRestricted: e.target.checked }))} className="w-4 h-4 accent-orange-600" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">Mark as Restricted</p>
                        <p className="text-xs text-gray-500">Requires admin approval</p>
                      </div>
                    </label>
                  </div>
                  <Button type="submit" className="w-full bg-purple-700 text-white" disabled={addLoading}>
                    {addLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Adding...</> : "Add Video"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}

          {/* Inline player */}
          {selectedVideo && (
            <div ref={playerRef} className="space-y-4">
              {/* ── Player header ─────────────────────────────────────────── */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Top row: LIVE bar (only when live) */}
                {selectedVideo.isLive && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-red-600">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse flex-shrink-0" />
                    <span className="text-xs font-bold text-white tracking-wide uppercase flex-1">Live Now</span>
                    {canManage && (
                      <button
                        onClick={() => setEndLiveConfirm(true)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-white hover:bg-red-50 rounded-md px-2.5 py-1 transition-colors whitespace-nowrap flex-shrink-0"
                      >
                        End Live
                      </button>
                    )}
                  </div>
                )}
                {/* Bottom row: title + meta + close */}
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-bold text-gray-900 truncate leading-snug">{selectedVideo.title}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(selectedVideo.date).toLocaleDateString("en-GH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </p>
                    {selectedVideo.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{selectedVideo.description}</p>
                    )}
                  </div>
                  <button
                    onClick={closePlayer}
                    className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* ── ACCESS REQUESTS BANNER (admin) — shown ABOVE video ─────────────── */}
              {canManageRequests && accessRequests.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden text-xs">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 border-b border-amber-200">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
                    <span className="font-semibold text-amber-900">
                      {accessRequests.length} member{accessRequests.length > 1 ? "s" : ""} requesting to watch
                    </span>
                    {accessRequests.length > 1 && (
                      <button onClick={grantAllAccess}
                        className="ml-auto text-green-700 bg-green-100 hover:bg-green-200 border border-green-200 rounded px-2 py-0.5 transition-colors">
                        Approve All
                      </button>
                    )}
                  </div>
                  {accessRequests.map((r: any) => (
                    <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 bg-white/60 border-b border-amber-100 last:border-0">
                      <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-[10px] font-bold text-purple-700 flex-shrink-0">
                        {(r.member?.firstName?.[0] ?? "") + (r.member?.lastName?.[0] ?? "")}
                      </div>
                      <span className="font-medium text-gray-800 truncate flex-1">
                        {r.member?.firstName} {r.member?.lastName}
                        {r.member?.cellName && <span className="text-gray-400 font-normal"> · {r.member.cellName}</span>}
                      </span>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => grantAccess(r.memberId)}
                          className="px-2 py-0.5 bg-green-600 hover:bg-green-700 text-white rounded transition-colors">
                          Let In
                        </button>
                        <button onClick={() => setRejectDialog({ open: true, memberId: r.memberId, videoId: selectedVideo?.id ?? 0, name: `${r.member?.firstName ?? ""} ${r.member?.lastName ?? ""}`.trim(), reason: "" })}
                          className="px-2 py-0.5 border border-red-300 text-red-600 hover:bg-red-50 rounded transition-colors">
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Restricted with no access → full locked screen (stops the video entirely) */}
              {selectedVideo.isRestricted && !hasAccess ? (
                <div className="rounded-2xl border-2 border-dashed border-purple-200 bg-purple-50 p-10 text-center space-y-4">
                  <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${accessStatus === "rejected" ? "bg-red-100" : "bg-purple-100"}`}>
                    <Lock className={`w-8 h-8 ${accessStatus === "rejected" ? "text-red-500" : "text-purple-600"}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-lg">
                      {accessStatus === "rejected" ? "Access Request Rejected" : "Video Restricted"}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {accessStatus === "pending"
                        ? "Your request has been sent — the admin will admit you shortly."
                        : accessStatus === "rejected"
                        ? "An admin has reviewed your request."
                        : "This video is restricted. Request access to watch."}
                    </p>
                  </div>

                  {accessStatus === "rejected" ? (
                    <div className="flex flex-col items-center gap-3">
                      {/* Rejection pill + reason */}
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded-full text-sm font-medium">
                        <X className="w-3.5 h-3.5" />
                        Request Rejected
                        {rejectionReason && <span className="text-red-500 font-normal">· {rejectionReason}</span>}
                      </div>
                      {/* Try Again + Cancel row */}
                      <div className="flex items-center gap-2">
                        <Button size="sm" className="bg-purple-700 text-white px-4 text-xs" onClick={requestAccess} disabled={accessLoading}>
                          {accessLoading ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Sending…</> : "Try Again"}
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs px-4 border-gray-300 text-gray-500" onClick={() => setSelectedVideo(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : accessStatus === "pending" ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                        <Clock className="w-4 h-4" /> Waiting for admin approval
                      </div>
                      <p className="text-xs text-gray-400">Checking automatically every few seconds…</p>
                    </div>
                  ) : (
                    <Button className="bg-purple-700 text-white px-6" onClick={requestAccess} disabled={accessLoading}>
                      {accessLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</> : "Request Access to Watch"}
                    </Button>
                  )}
                </div>
              ) : (
                /* Video player + side panel — shown when access is granted or video is not restricted */
                <div className={`flex ${selectedVideo.isLive ? "flex-col lg:flex-row" : "flex-col"} gap-3`}>
                  {/* ── Video player ── */}
                  <div className={selectedVideo.isLive ? "lg:flex-1 min-w-0" : "w-full"}>
                    <div className="relative rounded-2xl overflow-hidden border-2 border-pink-400 bg-black shadow-xl" style={{ aspectRatio: "16/9" }}>
                      <iframe
                        src={pipMode ? undefined : getEmbedSrc(selectedVideo)}
                        title={selectedVideo.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                        allowFullScreen
                        className="w-full h-full border-0"
                      />
                      {/* LIVE badge */}
                      {selectedVideo.isLive && (
                        <div className="absolute top-3 left-3 pointer-events-none">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-red-500/80 rounded-full px-1.5 py-0.5 leading-none">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" />LIVE
                          </span>
                        </div>
                      )}
                      {/* PiP / mini-player button */}
                      <button
                        onClick={() => setPipMode(p => !p)}
                        title="Picture in picture"
                        className="absolute top-3 right-3 z-10 w-8 h-8 rounded-lg bg-black/50 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
                      >
                        <Minimize2 className="w-4 h-4" />
                      </button>
                      {/* PiP active overlay */}
                      {pipMode && (
                        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-3">
                          <Tv className="w-10 h-10 text-pink-400" />
                          <p className="text-white text-sm font-medium">Playing in mini player</p>
                          <button
                            onClick={() => setPipMode(false)}
                            className="text-xs text-pink-300 border border-pink-400/40 rounded-full px-3 py-1 hover:bg-pink-500/20 transition-colors"
                          >
                            Return to main player
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Live chat panel ── */}
                  {selectedVideo.isLive && (
                    <div className="lg:w-80 flex flex-col rounded-2xl border border-pink-200 bg-white shadow-md overflow-hidden">
                      {/* Header — tappable on mobile to toggle */}
                      <button
                        type="button"
                        className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white flex-shrink-0 w-full text-left"
                        onClick={() => setChatOpen(p => !p)}
                      >
                        <MessageCircle className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm font-semibold flex-1">Live Chat</span>
                        {!chatOpen && chatMessages.length > 0 && (
                          <span className="text-[10px] font-bold bg-white/25 rounded-full px-2 py-0.5 mr-1">
                            {chatMessages.length}
                          </span>
                        )}
                        <div className="w-2 h-2 rounded-full bg-green-300 animate-pulse flex-shrink-0" />
                        {/* Arrow — mobile only, desktop always shows chat in sidebar */}
                        <span className="ml-1 lg:hidden">
                          {chatOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </span>
                      </button>

                      {/* Chat body — always visible on lg, toggle-controlled on mobile */}
                      <div className={`${chatOpen ? "flex" : "hidden"} lg:flex flex-col`} style={{ minHeight: "220px", maxHeight: "380px" }}>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
                          {chatMessages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                              <MessageCircle className="w-8 h-8 text-gray-300 mb-2" />
                              <p className="text-xs text-gray-400">No messages yet. Say hello!</p>
                            </div>
                          ) : (
                            chatMessages.map((m: any) => {
                              const isMe = m.userId === (user as any)?.id;
                              const memberName = m.member
                                ? `${m.member.firstName ?? ""} ${m.member.lastName ?? ""}`.trim()
                                : null;
                              const name = memberName || m.senderLabel || "User";
                              return (
                                <div key={m.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                                  {!isMe && <span className="text-[10px] font-semibold text-purple-700 mb-0.5 px-1">{name}</span>}
                                  <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm leading-snug shadow-sm ${isMe ? "bg-gradient-to-br from-pink-500 to-purple-600 text-white rounded-br-sm" : "bg-white text-gray-800 border border-gray-100 rounded-bl-sm"}`}>
                                    {m.message}
                                  </div>
                                </div>
                              );
                            })
                          )}
                          <div ref={chatEndRef} />
                        </div>
                        {user ? (
                          <div className="border-t border-pink-100 bg-white flex-shrink-0">
                            {showEmojiPicker && (
                              <div ref={emojiPickerRef} className="p-2 border-b border-pink-100 bg-white">
                                <div className="grid grid-cols-8 gap-0.5">
                                  {[
                                    "😀","😂","😍","🥰","😎","🤩","😇","🙏",
                                    "❤️","🔥","🎉","👏","✨","💯","🙌","💪",
                                    "😢","😮","😡","🤔","😅","😴","🤣","😬",
                                    "👍","👎","🫶","🤝","✌️","👋","🫡","💫",
                                    "🎶","🕊️","⛪","📖","🌟","🌈","🌸","🍀",
                                    "😊","🥹","😋","🤗","😶","🙃","🫠","🥲",
                                  ].map(emoji => (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={() => { setChatInput(prev => prev + emoji); setShowEmojiPicker(false); }}
                                      className="text-lg p-0.5 rounded hover:bg-pink-50 transition-colors leading-none"
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            <form onSubmit={sendChatMessage} className="flex gap-1.5 p-2">
                              <button
                                type="button"
                                onClick={() => setShowEmojiPicker(p => !p)}
                                className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-pink-500 hover:bg-pink-50 transition-colors flex-shrink-0 text-base"
                                title="Add emoji"
                              >
                                😊
                              </button>
                              <input
                                type="text"
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                placeholder="Type a message…"
                                maxLength={300}
                                className="flex-1 text-sm px-3 py-1.5 rounded-xl border border-gray-200 focus:outline-none focus:border-pink-400 focus:ring-1 focus:ring-pink-200 min-w-0"
                              />
                              <button type="submit" disabled={!chatInput.trim() || chatSending}
                                className="w-8 h-8 flex items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 text-white disabled:opacity-40 hover:opacity-90 transition-opacity flex-shrink-0">
                                <Send className="w-3.5 h-3.5" />
                              </button>
                            </form>
                          </div>
                        ) : (
                          <div className="p-3 text-center text-xs text-gray-400 border-t">Log in to chat</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Watching now — collapsible on mobile */}
              {selectedVideo.isLive && hasAccess && watchers.length > 0 && (
                <div className="rounded-2xl border border-green-100 bg-gradient-to-r from-green-50 to-emerald-50 overflow-hidden">
                  {/* Header — tappable on mobile to toggle */}
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-4 py-3 border-b border-green-100 text-left"
                    onClick={() => setWatchersOpen(p => !p)}
                  >
                    <Users className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <p className="text-sm font-semibold text-green-800 flex-1">Watching now</p>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> {watchers.length}
                    </span>
                    {/* Download report button — admins only */}
                    {canManage && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const sessions = await apicall(`/api/videos/${selectedVideo.id}/watcher-sessions`, "GET");
                            const now = new Date();
                            const dateStr = now.toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });
                            const timeStr = now.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" });
                            const liveStarted = selectedVideo.liveStartedAt
                              ? new Date(selectedVideo.liveStartedAt).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })
                              : "N/A";
                            const header = `#,Full Name,Title,Fellowship,Time Joined,Total Duration\n`;
                            const csvRows = sessions.map((w: any, i: number) => {
                              const name = `${w.firstName ?? ""} ${w.lastName ?? ""}`.trim();
                              const title = w.title ?? "";
                              const fellowship = w.cellName ?? "";
                              const joined = w.firstJoinedAt
                                ? new Date(w.firstJoinedAt).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })
                                : "";
                              const ms = w.totalDurationMs ?? 0;
                              const h = Math.floor(ms / 3600000);
                              const m = Math.floor((ms % 3600000) / 60000);
                              const s = Math.floor((ms % 60000) / 1000);
                              const dur = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
                              return `${i + 1},"${name}","${title}","${fellowship}","${joined}","${dur}"`;
                            }).join("\n");
                            const csv = `Christ Embassy Kumasi 1 — Live Viewers Report\nVideo: ${selectedVideo.title}\nLive Started: ${liveStarted}\nReport Downloaded: ${dateStr}  ${timeStr}\nTotal Viewers: ${sessions.length}\n\n${header}${csvRows}`;
                            const blob = new Blob([csv], { type: "text/csv" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `live-report-${selectedVideo.title.replace(/\s+/g, "-").toLowerCase()}-${now.toISOString().slice(0, 10)}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                          } catch {
                            toast({ title: "Failed to download report", variant: "destructive" });
                          }
                        }}
                        className="flex items-center gap-1.5 text-xs text-green-700 bg-white border border-green-200 hover:bg-green-50 rounded-lg px-2.5 py-1 transition-colors font-medium"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"/></svg>
                        <span className="hidden sm:inline">Download</span>
                      </button>
                    )}
                    {/* Toggle chevron */}
                    <span className="ml-1">
                      {watchersOpen ? <ChevronUp className="w-4 h-4 text-green-600" /> : <ChevronDown className="w-4 h-4 text-green-600" />}
                    </span>
                  </button>
                  {/* Scrollable numbered list — toggle-controlled */}
                  <div className={`${watchersOpen ? "block" : "hidden"} overflow-y-auto`} style={{ maxHeight: "260px" }}>
                    {watchers.map((w: any, index: number) => {
                      const prefix = w.gender === "female" ? "Sis." : "Bro.";
                      return (
                        <div key={w.memberId} className={`flex items-center gap-3 px-4 py-2 ${index % 2 === 0 ? "bg-white/40" : "bg-white/70"} border-b border-green-50 last:border-0`}>
                          <span className="text-[11px] font-bold text-gray-400 w-5 text-right flex-shrink-0">{index + 1}</span>
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                            {(w.firstName?.[0] ?? "") + (w.lastName?.[0] ?? "")}
                          </div>
                          <span className="text-xs font-medium text-gray-800 flex-1 truncate">
                            {prefix} {w.firstName} {w.lastName}
                          </span>
                          {w.cellName && (
                            <span className="text-[10px] text-gray-400 truncate max-w-[90px] hidden sm:block">{w.cellName}</span>
                          )}
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {videosLoading && (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading videos...
            </div>
          )}

          {/* All Videos (live ones appear first with LIVE badge, same card size) */}
          {!videosLoading && allVideos.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-gray-900 flex items-center gap-2 flex-1 min-w-0">
                  <Video className="w-4 h-4 text-purple-600 flex-shrink-0" />
                  <span className="truncate">Featured Videos</span>
                  <span className="text-sm font-normal text-gray-400 flex-shrink-0">({allVideos.length})</span>
                  {liveVideos.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                      {liveVideos.length} Live
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {archiveTotalPages > 1 && <p className="text-xs text-gray-400">Pg {archivePage}/{archiveTotalPages}</p>}
                  {canManage && (
                    <button
                      onClick={() => setAddVideoOpen(true)}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold bg-purple-700 hover:bg-purple-800 text-white rounded-xl px-3 py-1.5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Video
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {pageVideos.map((v: any) => (
                  <div key={v.id} className="group relative min-w-0">
                    <VideoThumbnail v={v} onClick={() => openVideo(v)} />
                    {/* Admin action buttons — pinned to thumbnail top-right, clipped by thumbnail's own overflow-hidden */}
                    {canManage && (
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                           style={{ top: "8px", right: "8px" }}>
                        <button
                          onClick={(e) => toggleVideoRestricted(v, e)}
                          title={v.isRestricted ? "Remove restriction" : "Make restricted"}
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] shadow transition-colors ${v.isRestricted ? "bg-orange-500 text-white hover:bg-orange-700" : "bg-black/60 text-white hover:bg-orange-500"}`}
                        >
                          🔒
                        </button>
                        <button
                          onClick={(e) => openEditVideo(v, e)}
                          className="w-6 h-6 rounded-full bg-black/60 shadow flex items-center justify-center text-white hover:bg-blue-600 transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteVideo.mutate({ id: v.id }); }}
                          className="w-6 h-6 rounded-full bg-black/60 shadow flex items-center justify-center text-white hover:bg-red-600 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {archiveTotalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button size="sm" variant="outline" disabled={archivePage <= 1} onClick={() => setArchivePage(p => p - 1)}>
                    <ChevronLeft className="w-4 h-4 mr-1" /> Prev
                  </Button>
                  <div className="flex gap-1">
                    {Array.from({ length: archiveTotalPages }).map((_, i) => (
                      <button key={i} onClick={() => setArchivePage(i + 1)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${archivePage === i + 1 ? "bg-purple-700 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  <Button size="sm" variant="outline" disabled={archivePage >= archiveTotalPages} onClick={() => setArchivePage(p => p + 1)}>
                    Next <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              )}
            </section>
          )}

          {/* Empty state */}
          {!videosLoading && (videos as any[]).length === 0 && (
            <div className="text-center py-20 text-gray-400 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-gray-100 flex items-center justify-center">
                <Video className="w-8 h-8 opacity-40" />
              </div>
              <p className="font-semibold text-gray-500">No videos in the library yet</p>
              {canManage && (
                <button
                  onClick={() => setAddVideoOpen(true)}
                  className="inline-flex items-center gap-2 text-sm font-semibold bg-purple-700 hover:bg-purple-800 text-white rounded-xl px-4 py-2 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add First Video
                </button>
              )}
            </div>
          )}
        </div>




      {/* ── Floating Mini-Player (PiP) ───────────────────────────────────── */}
      {pipMode && selectedVideo && (
        <div
          ref={pipRef}
          className="fixed bottom-4 right-4 z-50 rounded-2xl overflow-hidden shadow-2xl border-2 border-pink-400 bg-black"
          style={{ width: "min(320px, calc(100vw - 32px))", aspectRatio: "16/9" }}
        >
          <iframe
            src={getEmbedSrc(selectedVideo)}
            title={selectedVideo.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            className="w-full h-full border-0"
          />
          {/* Mini-player controls overlay */}
          <div className="absolute inset-0 flex flex-col pointer-events-none">
            {/* Top bar */}
            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-gradient-to-b from-black/70 to-transparent pointer-events-auto">
              {selectedVideo.isLive && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-white bg-red-500/80 rounded-full px-1.5 py-0.5 leading-none">
                  <span className="w-1 h-1 rounded-full bg-white animate-pulse inline-block" />LIVE
                </span>
              )}
              <span className="text-white text-[10px] font-medium flex-1 truncate">{selectedVideo.title}</span>
            </div>
            {/* Bottom bar */}
            <div className="mt-auto flex justify-end gap-1 p-1.5 bg-gradient-to-t from-black/60 to-transparent pointer-events-auto">
              <button
                onClick={() => setPipMode(false)}
                title="Expand player"
                className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center transition-colors"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
              <button
                onClick={() => { setPipMode(false); setSelectedVideo(null); }}
                title="Close"
                className="w-6 h-6 rounded-full bg-white/20 hover:bg-red-500/70 text-white flex items-center justify-center transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Video Dialog ────────────────────────────────────────────── */}
      <Dialog open={editVideoOpen} onOpenChange={setEditVideoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Video</DialogTitle></DialogHeader>
          <form onSubmit={handleEditVideo} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Video Title *</Label>
              <Input value={editVideoForm.title} onChange={e => setEditVideoForm(f => ({ ...f, title: e.target.value }))} required placeholder="e.g. Sunday Service — May 2026" />
            </div>
            <div className="space-y-1.5">
              <Label>Video URL *</Label>
              <Input value={editVideoForm.youtubeUrl} onChange={e => setEditVideoForm(f => ({ ...f, youtubeUrl: e.target.value }))} required placeholder="YouTube, Vimeo, or embed URL" />
              <p className="text-xs text-gray-400">Paste a YouTube link, Vimeo link, or any embed URL</p>
            </div>
            <div className="space-y-1.5">
              <Label>Service Date</Label>
              <Input type="date" value={editVideoForm.date} onChange={e => setEditVideoForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea value={editVideoForm.description} onChange={e => setEditVideoForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description..." rows={2} className="resize-none" />
            </div>
            <label className="flex items-center gap-3 cursor-pointer select-none p-3 rounded-lg border hover:bg-orange-50 transition-colors">
              <input type="checkbox" checked={editVideoForm.isRestricted} onChange={e => setEditVideoForm(f => ({ ...f, isRestricted: e.target.checked }))} className="w-4 h-4 accent-orange-600" />
              <div>
                <p className="text-sm font-medium text-gray-800">Mark as Restricted</p>
                <p className="text-xs text-gray-500">Requires admin approval</p>
              </div>
            </label>
            <Button type="submit" className="w-full bg-purple-700 text-white" disabled={editVideoLoading}>
              {editVideoLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>


      {/* ── End Live Confirmation Dialog ─────────────────────────────────── */}
      <Dialog open={endLiveConfirm} onOpenChange={setEndLiveConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
              End Live Stream?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-gray-700">
              Are you sure you want to end the live stream for:
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <p className="text-sm font-semibold text-gray-900 break-all line-clamp-3">
                {selectedVideo?.title}
              </p>
            </div>
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              This cannot be undone — once ended, this video cannot be made live again.
            </p>
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEndLiveConfirm(false)} disabled={endLiveLoading}>
                No, Keep Live
              </Button>
              <Button type="button" className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={endLive} disabled={endLiveLoading}>
                {endLiveLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Ending...</> : "Yes, End Live"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Reject Access Dialog ──────────────────────────────────────────── */}
      <Dialog open={rejectDialog.open} onOpenChange={open => { if (!open) setRejectDialog({ open: false, memberId: 0, videoId: 0, name: "", reason: "" }); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Access Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-gray-600">
              Rejecting access for <span className="font-semibold text-gray-800">{rejectDialog.name}</span>.
            </p>
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Input
                placeholder="e.g. Not yet a verified member"
                value={rejectDialog.reason}
                onChange={e => setRejectDialog(d => ({ ...d, reason: e.target.value }))}
              />
            </div>
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setRejectDialog(d => ({ ...d, open: false }))}>
                Cancel
              </Button>
              <Button type="button" className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={rejectAccess}>
                Reject Request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      </>}
    </div>
  );
}
