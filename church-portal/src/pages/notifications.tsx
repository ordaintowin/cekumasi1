import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCircle2, XCircle, Loader2, Film, User2, Clock, ArrowLeft, Video as VideoIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

const getToken = () => typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;

function fmt(m: any) {
  if (!m) return "Unknown Member";
  return `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || "Unknown Member";
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; }
}

function initials(m: any) {
  if (!m) return "?";
  return `${m.firstName?.[0] ?? ""}${m.lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

export default function Notifications() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const token = getToken();

  const isAdmin = !!(user && (user.roleLevel === 1 || (user as any).roleSubtype === "media"));

  const { data: requests = [], isLoading, isError } = useQuery<any[]>({
    queryKey: ["/api/notifications/pending-requests"],
    queryFn: () =>
      fetch("/api/notifications/pending-requests", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()),
    refetchInterval: 30_000,
    enabled: isAdmin,
  });

  const { data: meetingRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/notifications/meeting-join-requests"],
    queryFn: () =>
      fetch("/api/notifications/meeting-join-requests", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()),
    refetchInterval: 30_000,
    enabled: isAdmin,
  });

  const [denyRow, setDenyRow]       = useState<{ videoId: number; memberId: number; name: string } | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [busy, setBusy]             = useState<string | null>(null);
  const [meetingDenyRow, setMeetingDenyRow] = useState<{ meetingId: number; memberId: number; name: string } | null>(null);
  const [meetingDenyReason, setMeetingDenyReason] = useState("");

  async function approve(videoId: number, memberId: number) {
    const key = `grant-${videoId}-${memberId}`;
    setBusy(key);
    await fetch(`/api/videos/${videoId}/access-grant/${memberId}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    setBusy(null);
    qc.invalidateQueries({ queryKey: ["/api/notifications/pending-requests"] });
    qc.invalidateQueries({ queryKey: ["/api/notifications/summary"] });
  }

  async function deny(videoId: number, memberId: number) {
    const key = `reject-${videoId}-${memberId}`;
    setBusy(key);
    await fetch(`/api/videos/${videoId}/access-reject/${memberId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: denyReason || undefined }),
    });
    setBusy(null);
    setDenyRow(null);
    setDenyReason("");
    qc.invalidateQueries({ queryKey: ["/api/notifications/pending-requests"] });
    qc.invalidateQueries({ queryKey: ["/api/notifications/summary"] });
  }

  async function approveMeetingJoin(meetingId: number, memberId: number) {
    const key = `meeting-grant-${meetingId}-${memberId}`;
    setBusy(key);
    await fetch(`/api/meetings/${meetingId}/join-requests/${memberId}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    setBusy(null);
    qc.invalidateQueries({ queryKey: ["/api/notifications/meeting-join-requests"] });
    qc.invalidateQueries({ queryKey: ["/api/notifications/summary"] });
  }

  async function rejectMeetingJoin(meetingId: number, memberId: number) {
    const key = `meeting-reject-${meetingId}-${memberId}`;
    setBusy(key);
    await fetch(`/api/meetings/${meetingId}/join-requests/${memberId}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: meetingDenyReason || undefined }),
    });
    setBusy(null);
    setMeetingDenyRow(null);
    setMeetingDenyReason("");
    qc.invalidateQueries({ queryKey: ["/api/notifications/meeting-join-requests"] });
    qc.invalidateQueries({ queryKey: ["/api/notifications/summary"] });
  }

  const totalPending = (requests?.length ?? 0) + (meetingRequests?.length ?? 0);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => window.history.back()}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors flex-shrink-0"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
          <Bell className="w-5 h-5 text-purple-700" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Notifications</h1>
          <p className="text-xs text-gray-500">Pending access and join requests</p>
        </div>
        {!isLoading && totalPending > 0 && (
          <Badge className="ml-auto bg-red-100 text-red-700 border-0">{totalPending} pending</Badge>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading requests…</span>
        </div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          Could not load notifications. Please try again.
        </div>
      )}

      {!isLoading && !isError && totalPending === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
          <CheckCircle2 className="w-12 h-12 text-green-400" />
          <p className="font-semibold text-gray-600">All clear!</p>
          <p className="text-sm text-center">No pending requests at the moment.</p>
        </div>
      )}

      {/* Meeting join requests */}
      {(meetingRequests ?? []).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
            <VideoIcon className="w-4 h-4 text-green-600" /> Meeting Join Requests
          </h2>
          {(meetingRequests ?? []).map((r: any) => {
            const approveKey = `meeting-grant-${r.meetingId}-${r.memberId}`;
            const rejectKey  = `meeting-reject-${r.meetingId}-${r.memberId}`;
            const isDenying  = meetingDenyRow?.meetingId === r.meetingId && meetingDenyRow?.memberId === r.memberId;
            return (
              <div key={`mjr-${r.id}`} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 font-bold text-sm flex items-center justify-center flex-shrink-0">
                    {initials(r.member)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm leading-tight">{fmt(r.member)}</p>
                      <span className="flex items-center gap-1 text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
                        <Clock className="w-3 h-3" /> {fmtDate(r.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <VideoIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <p className="text-xs text-gray-600 truncate">
                        Meeting: {r.meeting?.title ?? `Meeting #${r.meetingId}`}
                      </p>
                    </div>
                    {r.message && (
                      <p className="text-[11px] text-gray-500 mt-0.5 italic">"{r.message}"</p>
                    )}
                  </div>
                </div>
                {isDenying && (
                  <div className="px-4 pb-3 space-y-2 border-t border-gray-100 pt-3 bg-red-50">
                    <p className="text-xs font-medium text-red-700">Reason for rejection (optional)</p>
                    <Textarea
                      value={meetingDenyReason}
                      onChange={e => setMeetingDenyReason(e.target.value)}
                      placeholder="e.g. This meeting is for leaders only."
                      className="text-sm h-20 resize-none border-red-200 focus:ring-red-300"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 text-xs h-8"
                        onClick={() => { setMeetingDenyRow(null); setMeetingDenyReason(""); }}>Cancel</Button>
                      <Button size="sm" className="flex-1 text-xs h-8 bg-red-600 hover:bg-red-700 text-white"
                        disabled={busy === rejectKey}
                        onClick={() => rejectMeetingJoin(r.meetingId, r.memberId)}>
                        {busy === rejectKey ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm Rejection"}
                      </Button>
                    </div>
                  </div>
                )}
                {!isDenying && (
                  <div className="px-4 pb-4 flex gap-2">
                    <Button size="sm" className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700 text-white gap-1.5"
                      disabled={busy === approveKey}
                      onClick={() => approveMeetingJoin(r.meetingId, r.memberId)}>
                      {busy === approveKey ? <><Loader2 className="w-3 h-3 animate-spin" /> Approving…</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Approve</>}
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                      disabled={!!busy}
                      onClick={() => { setMeetingDenyRow({ meetingId: r.meetingId, memberId: r.memberId, name: fmt(r.member) }); setMeetingDenyReason(""); }}>
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Video access requests */}
      {!isLoading && requests.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
            <Film className="w-4 h-4 text-purple-600" /> Video Access Requests
          </h2>
          {requests.map((r: any) => {
            const grantKey  = `grant-${r.videoId}-${r.memberId}`;
            const rejectKey = `reject-${r.videoId}-${r.memberId}`;
            const isDenying = denyRow?.videoId === r.videoId && denyRow?.memberId === r.memberId;
            return (
              <div key={`${r.videoId}-${r.memberId}`} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 font-bold text-sm flex items-center justify-center flex-shrink-0">
                    {initials(r.member)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm leading-tight">{fmt(r.member)}</p>
                      <span className="flex items-center gap-1 text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
                        <Clock className="w-3 h-3" /> {fmtDate(r.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Film className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <p className="text-xs text-gray-600 truncate">
                        {r.video?.title ?? `Video #${r.videoId}`}
                      </p>
                    </div>
                    {r.member?.cellName && (
                      <p className="text-[11px] text-purple-500 mt-0.5">
                        <User2 className="w-3 h-3 inline mr-0.5" />{r.member.cellName}
                      </p>
                    )}
                  </div>
                </div>
                {isDenying && (
                  <div className="px-4 pb-3 space-y-2 border-t border-gray-100 pt-3 bg-red-50">
                    <p className="text-xs font-medium text-red-700">Reason for denial (optional)</p>
                    <Textarea
                      value={denyReason}
                      onChange={e => setDenyReason(e.target.value)}
                      placeholder="e.g. This video requires group study completion first."
                      className="text-sm h-20 resize-none border-red-200 focus:ring-red-300"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 text-xs h-8"
                        onClick={() => { setDenyRow(null); setDenyReason(""); }}>Cancel</Button>
                      <Button size="sm" className="flex-1 text-xs h-8 bg-red-600 hover:bg-red-700 text-white"
                        disabled={busy === rejectKey}
                        onClick={() => deny(r.videoId, r.memberId)}>
                        {busy === rejectKey ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm Denial"}
                      </Button>
                    </div>
                  </div>
                )}
                {!isDenying && (
                  <div className="px-4 pb-4 flex gap-2">
                    <Button size="sm" className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700 text-white gap-1.5"
                      disabled={busy === grantKey}
                      onClick={() => approve(r.videoId, r.memberId)}>
                      {busy === grantKey
                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Approving…</>
                        : <><CheckCircle2 className="w-3.5 h-3.5" /> Approve Access</>}
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                      disabled={!!busy}
                      onClick={() => { setDenyRow({ videoId: r.videoId, memberId: r.memberId, name: fmt(r.member) }); setDenyReason(""); }}>
                      <XCircle className="w-3.5 h-3.5" /> Deny
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
