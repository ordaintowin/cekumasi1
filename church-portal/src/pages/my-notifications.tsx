import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Bell, Heart, Loader2, CheckCheck, Megaphone, ArrowLeft, CheckCircle2, XCircle, Video, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

const getToken = () => (typeof localStorage !== "undefined" ? localStorage.getItem("token") : null);

function fmtAgo(dateStr: string) {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString("en-GH", { day: "numeric", month: "short" });
  } catch { return ""; }
}

const EMOJI_COLORS: Record<string, { bg: string; text: string }> = {
  "📢": { bg: "bg-blue-100",   text: "text-blue-700" },
  "🎉": { bg: "bg-yellow-100", text: "text-yellow-700" },
  "🙏": { bg: "bg-purple-100", text: "text-purple-700" },
  "✝️": { bg: "bg-indigo-100", text: "text-indigo-700" },
  "❤️": { bg: "bg-pink-100",   text: "text-pink-700" },
  "🔔": { bg: "bg-orange-100", text: "text-orange-700" },
  "📌": { bg: "bg-red-100",    text: "text-red-700" },
  "🌟": { bg: "bg-amber-100",  text: "text-amber-700" },
  "🎂": { bg: "bg-rose-100",   text: "text-rose-700" },
  "💍": { bg: "bg-emerald-100","text": "text-emerald-700" },
};

function emojiColor(emoji: string) {
  return EMOJI_COLORS[emoji] ?? { bg: "bg-gray-100", text: "text-gray-600" };
}

export default function MyNotifications() {
  const queryClient = useQueryClient();
  const hasMarkedRef = useRef(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data: all = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/announcements"],
    queryFn: () =>
      fetch("/api/announcements", { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const unreadCount = all.filter((a: any) => !a.isRead).length;
  const displayed = filter === "unread" ? all.filter((a: any) => !a.isRead) : all;

  async function markAllRead() {
    await fetch("/api/announcements/read-all", {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
    }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
  }

  async function markOneRead(id: number) {
    await fetch(`/api/announcements/${id}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
    }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
  }

  useEffect(() => {
    if (hasMarkedRef.current || !all.length) return;
    const hasUnread = all.some((a: any) => !a.isRead);
    if (!hasUnread) return;
    hasMarkedRef.current = true;
    markAllRead();
  }, [all.length]);

  return (
    <div className="max-w-lg flex flex-col h-full">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="mb-5">
        {/* Back button */}
        <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-purple-700 font-medium mb-3 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-sm flex-shrink-0">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 leading-tight">Notifications</h1>
            <p className="text-xs text-gray-400">Messages from church admin</p>
          </div>
          {unreadCount > 0 && (
            <Badge className="bg-blue-500 text-white border-0 text-xs px-2.5 py-1 rounded-full animate-pulse">
              {unreadCount} new
            </Badge>
          )}
        </div>

        {/* Filter tabs + Mark all read */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                filter === "all"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              All
              {all.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-gray-200 text-gray-500 rounded-full px-1.5 py-0.5">
                  {all.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                filter === "unread"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Unread
              {unreadCount > 0 && (
                <span className="ml-1.5 text-[10px] bg-blue-500 text-white rounded-full px-1.5 py-0.5">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* ── Loading ────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center py-20 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading notifications…</span>
        </div>
      )}

      {/* ── Empty ─────────────────────────────────────────────── */}
      {!isLoading && displayed.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-gray-400 select-none">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Bell className="w-7 h-7 text-gray-300" />
          </div>
          <p className="font-semibold text-gray-500 text-base">
            {filter === "unread" ? "All caught up!" : "No notifications yet"}
          </p>
          <p className="text-sm text-gray-400 mt-1 text-center max-w-xs">
            {filter === "unread"
              ? "You've read all your notifications."
              : "Admin messages and announcements will appear here."}
          </p>
          {filter === "unread" && all.length > 0 && (
            <button
              onClick={() => setFilter("all")}
              className="mt-3 text-xs text-blue-500 hover:text-blue-700 font-medium"
            >
              View all notifications
            </button>
          )}
        </div>
      )}

      {/* ── Notification list ─────────────────────────────────── */}
      {!isLoading && displayed.length > 0 && (
        <div className="space-y-2.5 overflow-y-auto pb-6">
          {displayed.map((a: any) => {
            const isRead = a.isRead;
            const isPersonal = !!a.targetMemberId;
            const isGranted       = a.type === "video_access_granted";
            const isRejected      = a.type === "video_access_rejected";
            const isMeetingApproved = a.type === "meeting_join_approved";
            const isMeetingRejected = a.type === "meeting_join_rejected";
            const isVideoAccess   = isGranted || isRejected;
            const isMeetingResult = isMeetingApproved || isMeetingRejected;
            const isAnyRejected   = isRejected || isMeetingRejected;
            const isAnyApproved   = isGranted || isMeetingApproved;
            const { bg } = emojiColor(a.emoji || "📢");

            return (
              <div
                key={a.id}
                onClick={() => { if (!isRead) markOneRead(a.id); }}
                className={`group relative rounded-2xl border transition-all duration-200 ${
                  isAnyRejected && !isRead
                    ? "bg-red-50 border-red-200 shadow-sm cursor-pointer hover:shadow-md"
                    : isAnyApproved && !isRead
                    ? "bg-green-50 border-green-200 shadow-sm cursor-pointer hover:shadow-md"
                    : isRead
                    ? "bg-gray-50 border-gray-100 cursor-default"
                    : "bg-white border-gray-200 shadow-sm cursor-pointer hover:shadow-md hover:border-blue-100"
                }`}
              >
                {/* Unread indicator bar */}
                {!isRead && (
                  <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ml-0 rounded-l-2xl ${
                    isAnyRejected ? "bg-red-500" : isAnyApproved ? "bg-green-500" : "bg-blue-500"
                  }`} />
                )}

                <div className="flex items-start gap-3 px-4 py-3.5">
                  {/* Icon/Emoji avatar */}
                  {(isVideoAccess || isMeetingResult) ? (
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isAnyApproved ? "bg-green-100" : "bg-red-100"
                    } ${isRead ? "opacity-60" : ""}`}>
                      {isMeetingResult
                        ? (isMeetingApproved
                            ? <Users className="w-5 h-5 text-green-600" />
                            : <Users className="w-5 h-5 text-red-500" />)
                        : (isGranted
                            ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                            : <XCircle className="w-5 h-5 text-red-500" />)
                      }
                    </div>
                  ) : (
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${bg} ${isRead ? "opacity-60" : ""}`}>
                      {a.emoji || "📢"}
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm leading-tight ${isRead ? "font-medium text-gray-500" : "font-bold text-gray-900"}`}>
                            {a.title}
                          </p>
                          {isVideoAccess && (
                            <span className={`inline-flex items-center gap-0.5 text-[10px] border rounded-full px-1.5 py-0.5 font-medium flex-shrink-0 ${
                              isGranted
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-red-50 text-red-600 border-red-200"
                            }`}>
                              <Video className="w-2.5 h-2.5" />
                              {isGranted ? "Approved" : "Rejected"}
                            </span>
                          )}
                          {isMeetingResult && (
                            <span className={`inline-flex items-center gap-0.5 text-[10px] border rounded-full px-1.5 py-0.5 font-medium flex-shrink-0 ${
                              isMeetingApproved
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-red-50 text-red-600 border-red-200"
                            }`}>
                              <Users className="w-2.5 h-2.5" />
                              {isMeetingApproved ? "Admitted" : "Not Admitted"}
                            </span>
                          )}
                          {!isVideoAccess && !isMeetingResult && isPersonal && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] bg-pink-50 text-pink-600 border border-pink-200 rounded-full px-1.5 py-0.5 font-medium flex-shrink-0">
                              <Heart className="w-2.5 h-2.5" /> Personal
                            </span>
                          )}
                        </div>
                        <p className={`text-sm mt-0.5 leading-snug ${isRead ? "text-gray-400" : "text-gray-600"}`}>
                          {a.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Megaphone className="w-3 h-3 text-gray-300 flex-shrink-0" />
                          <span className="text-[11px] text-gray-400">{fmtAgo(a.createdAt)}</span>
                        </div>
                      </div>

                      {/* Read / Unread dot + Dismiss */}
                      <div className="flex-shrink-0 pt-0.5 flex flex-col items-end gap-1.5">
                        {isRead ? (
                          <CheckCheck className="w-4 h-4 text-gray-300" />
                        ) : (
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ring-2 animate-pulse ${
                            isAnyRejected ? "bg-red-500 ring-red-100" : isAnyApproved ? "bg-green-500 ring-green-100" : "bg-blue-500 ring-blue-100"
                          }`} />
                        )}
                        {/* Dismiss button for rejected unread */}
                        {isAnyRejected && !isRead && (
                          <button
                            onClick={e => { e.stopPropagation(); markOneRead(a.id); }}
                            className="text-[10px] text-red-400 hover:text-red-600 border border-red-200 rounded-full px-2 py-0.5 bg-white hover:bg-red-50 transition-colors"
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
