import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Link } from "wouter";
import { Cake, Heart, Video, Bell, ChevronRight, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const getToken = () => (typeof localStorage !== "undefined" ? localStorage.getItem("token") : null);

function fmtDate(d: string | undefined | null) {
  if (!d) return "";
  try {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-GH", { day: "numeric", month: "long" });
  } catch { return ""; }
}

function Avatar({ name, photo, size = "md", color = "bg-purple-100 text-purple-700" }: { name: string; photo?: string | null; size?: "sm" | "md" | "lg"; color?: string }) {
  const sz = size === "lg" ? "w-14 h-14 text-xl" : size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold flex-shrink-0 overflow-hidden ${color}`}>
      {photo ? <img src={photo} alt={name} className="w-full h-full object-cover" /> : name[0]?.toUpperCase()}
    </div>
  );
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.25, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  } catch (_) {}
}

// FIX: compare midnight-to-midnight so "In 1 day" never rounds down to 0 → 365
function daysUntil(dateStr: string): number {
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d = new Date(dateStr + "T00:00:00");
  const thisYear = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (thisYear.getTime() < todayMidnight.getTime()) {
    thisYear.setFullYear(today.getFullYear() + 1);
  }
  return Math.round((thisYear.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
}

function isOwnBirthday(dob: string | null | undefined): boolean {
  if (!dob) return false;
  const today = new Date();
  const parts = dob.split("-");
  return today.getMonth() + 1 === parseInt(parts[1]) && today.getDate() === parseInt(parts[2]);
}

// Group married members into couple objects — avoids showing husband + wife as two separate cards
function groupCouples(members: any[]): any[] {
  const seen = new Set<number>();
  const result: any[] = [];
  for (const m of members) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    if (m.spouseId) seen.add(m.spouseId);
    const spouse = m.spouseId ? members.find((x: any) => x.id === m.spouseId) : null;
    const isMale = m.gender === "male";
    const husband = isMale ? m : (spouse?.gender === "male" ? spouse : m);
    const wife   = !isMale ? m : (spouse?.gender === "female" ? spouse : spouse);
    result.push({ ...m, _spouse: spouse, _husband: husband, _wife: wife });
  }
  return result;
}

function coupleDisplayName(c: any): string {
  const h = c._husband;
  const w = c._wife;
  if (!w || !c._spouse) return `${c.firstName} ${c.lastName}`;
  const sameLast = h.lastName === w.lastName;
  return sameLast
    ? `${h.firstName} & ${w.firstName} ${h.lastName}`
    : `${h.firstName} ${h.lastName} & ${w.firstName} ${w.lastName}`;
}

export default function Home() {
  const { user } = useAuth();
  const lastSeenIdRef = useRef<number>(
    parseInt(localStorage.getItem("lastAnnouncementId") || "0")
  );
  const hasPlayedRef = useRef(false);

  const [dismissedIds, setDismissedIds] = useState<number[]>(() =>
    JSON.parse(localStorage.getItem("dismissedAnnouncements") || "[]")
  );

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/home/feed"],
    queryFn: () =>
      fetch("/api/home/feed", { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const firstName = (user as any)?.memberName?.split(" ")[0] ?? user?.username ?? "Friend";
  const userDob = (user as any)?.dateOfBirth as string | null | undefined;
  const userMemberId = (user as any)?.memberId as number | null | undefined;
  const birthdayToday = isOwnBirthday(userDob);

  const announcements: any[] = data?.announcements ?? [];
  const rawTodayBirthdays: any[] = data?.todayBirthdays ?? [];
  const rawTodayAnniversaries: any[] = data?.todayAnniversaries ?? [];
  const upcomingBirthdays: any[] = data?.upcomingBirthdays ?? [];
  const rawUpcomingAnniversaries: any[] = data?.upcomingAnniversaries ?? [];
  const latestVideo: any = data?.latestVideo ?? null;
  const liveMeetings: any[] = data?.liveMeetings ?? [];

  // FIX: exclude the logged-in user from "Today's Birthdays" if the big hero card already celebrates them
  const todayBirthdays = birthdayToday && userMemberId
    ? rawTodayBirthdays.filter((m: any) => m.id !== userMemberId)
    : rawTodayBirthdays;

  // FIX: group anniversary couples so husband + wife appear as ONE card
  const todayAnniversaries = groupCouples(rawTodayAnniversaries);
  const upcomingAnniversaries = groupCouples(rawUpcomingAnniversaries);

  // FIX: detect if the logged-in user has an anniversary today (for the anniversary hero card)
  const ownAnniversaryCouple = userMemberId
    ? todayAnniversaries.find((c: any) => c.id === userMemberId || c._spouse?.id === userMemberId)
    : null;

  useEffect(() => {
    if (!announcements.length || hasPlayedRef.current) return;
    const latestId = announcements[0]?.id ?? 0;
    if (latestId > lastSeenIdRef.current) {
      hasPlayedRef.current = true;
      playChime();
      localStorage.setItem("lastAnnouncementId", String(latestId));
      lastSeenIdRef.current = latestId;
    }
  }, [announcements]);

  const visibleAnnouncements = announcements.filter(a => !dismissedIds.includes(a.id));

  function dismissAnnouncement(id: number) {
    const newDismissed = [...dismissedIds, id];
    setDismissedIds(newDismissed);
    localStorage.setItem("dismissedAnnouncements", JSON.stringify(newDismissed));
    if (id >= lastSeenIdRef.current) {
      localStorage.setItem("lastAnnouncementId", String(id));
      lastSeenIdRef.current = id;
    }
  }

  const hasContent = todayBirthdays.length > 0 || todayAnniversaries.length > 0 ||
    upcomingBirthdays.length > 0 || upcomingAnniversaries.length > 0 || latestVideo ||
    visibleAnnouncements.length > 0 || liveMeetings.length > 0 || birthdayToday || ownAnniversaryCouple;

  const announcementColors = [
    { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800", sub: "text-blue-600", btn: "text-blue-400 hover:text-blue-700 hover:bg-blue-100" },
    { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-800", sub: "text-purple-600", btn: "text-purple-400 hover:text-purple-700 hover:bg-purple-100" },
    { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", sub: "text-emerald-600", btn: "text-emerald-400 hover:text-emerald-700 hover:bg-emerald-100" },
    { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", sub: "text-amber-600", btn: "text-amber-400 hover:text-amber-700 hover:bg-amber-100" },
  ];

  return (
    <div className="space-y-6 max-w-2xl">

      {/* ── Hero / Greeting ─────────────────────────────────────── */}
      {birthdayToday ? (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-yellow-400 via-orange-400 to-pink-500 px-6 py-6 shadow-lg">
          <div className="absolute inset-0 opacity-10 text-9xl flex items-center justify-center select-none pointer-events-none">🎂</div>
          <div className="relative">
            <p className="text-yellow-100 text-sm font-medium mb-1">Today is your special day! 🎉</p>
            <h1 className="text-3xl font-extrabold text-white leading-tight">Happy Birthday, {firstName}!</h1>
            <p className="text-yellow-100 text-sm mt-2">Wishing you a day full of joy, love, and God's blessings. 🙏</p>
          </div>
          <div className="absolute bottom-2 right-4 text-4xl select-none opacity-60">🎈🎁</div>
        </div>
      ) : (
        <div className="rounded-2xl bg-gradient-to-br from-purple-700 to-purple-900 px-6 py-5 shadow-md">
          <p className="text-purple-300 text-xs font-medium mb-1">
            {new Date().toLocaleDateString("en-GH", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="text-2xl font-extrabold text-white">Welcome, {firstName} 👋</h1>
          <p className="text-purple-300 text-sm mt-1">Here's what's happening in Christ Embassy Kumasi 1</p>
        </div>
      )}

      {/* ── Anniversary Hero (shown when the logged-in user's anniversary is today) ── */}
      {ownAnniversaryCouple && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-pink-400 via-rose-500 to-red-500 px-6 py-6 shadow-lg">
          <div className="absolute inset-0 opacity-10 text-9xl flex items-center justify-center select-none pointer-events-none">💍</div>
          <div className="relative">
            <p className="text-pink-100 text-sm font-medium mb-1">Today is your anniversary! ❤️</p>
            <h1 className="text-2xl font-extrabold text-white leading-tight">
              Happy Anniversary, {coupleDisplayName(ownAnniversaryCouple)}!
            </h1>
            <p className="text-pink-100 text-sm mt-2">May God continue to bless and strengthen your union. 🙏</p>
          </div>
          <div className="absolute bottom-2 right-4 text-4xl select-none opacity-60">💍❤️</div>
        </div>
      )}

      {/* ── Live Meeting Banner ────────────────────────────────── */}
      {liveMeetings.length > 0 && (
        <section className="space-y-2">
          {liveMeetings.map((m: any) => (
            <Link key={m.id} href="/online-portal">
              <div className="flex items-center gap-3 bg-red-600 hover:bg-red-700 transition-colors rounded-2xl px-4 py-3.5 shadow-lg cursor-pointer">
                <span className="relative flex-shrink-0">
                  <span className="absolute inline-flex h-3 w-3 rounded-full bg-white opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-extrabold text-sm leading-tight">🔴 Live Now: {m.title}</p>
                  {m.description && <p className="text-red-100 text-xs mt-0.5 truncate">{m.description}</p>}
                  <p className="text-red-200 text-xs mt-0.5">Tap to join the meeting</p>
                </div>
                <ChevronRight className="w-5 h-5 text-red-200 flex-shrink-0" />
              </div>
            </Link>
          ))}
        </section>
      )}

      {/* ── Announcements ──────────────────────────────────────── */}
      {visibleAnnouncements.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Announcements</h2>
            <Link href="/my-notifications" className="text-xs text-blue-500 hover:text-blue-700">View all →</Link>
          </div>
          {visibleAnnouncements.map((a: any, idx: number) => {
            const col = announcementColors[idx % announcementColors.length];
            return (
              <div key={a.id} className={`flex items-start gap-3 ${col.bg} border ${col.border} rounded-xl px-4 py-3 shadow-sm`}>
                <span className="text-2xl select-none flex-shrink-0 mt-0.5">{a.emoji || "📢"}</span>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm leading-tight ${col.text}`}>{a.title}</p>
                  <p className={`text-xs mt-0.5 ${col.sub}`}>{a.message}</p>
                </div>
                <button
                  onClick={() => dismissAnnouncement(a.id)}
                  className={`p-1 rounded-full transition-colors flex-shrink-0 ${col.btn}`}
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </section>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {!isLoading && !hasContent && (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nothing special today</p>
            <p className="text-sm mt-1">Check back later for updates</p>
          </CardContent>
        </Card>
      )}

      {/* ── Today's Birthdays ──────────────────────────────────── */}
      {/* FIX: logged-in user is excluded from this list if the big hero card already shows their birthday */}
      {todayBirthdays.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Cake className="w-5 h-5 text-yellow-500" />
            <h2 className="font-bold text-gray-800">Today's Birthdays</h2>
            <Badge className="bg-yellow-100 text-yellow-700 border-0 ml-auto">{todayBirthdays.length}</Badge>
          </div>
          <div className="space-y-2.5">
            {todayBirthdays.map((m: any) => (
              <div key={m.id} className="relative overflow-hidden flex items-center gap-4 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-2xl px-4 py-3.5 shadow-sm">
                <Avatar name={`${m.firstName} ${m.lastName}`} photo={m.profilePhoto} size="lg" color="bg-yellow-200 text-yellow-800" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-base">{m.firstName} {m.lastName}</p>
                  <p className="text-sm text-yellow-600 font-medium">🎂 {fmtDate(m.dateOfBirth)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">🎉 Happy Birthday!</p>
                </div>
                <div className="text-4xl select-none opacity-50 flex-shrink-0">🎂</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Today's Anniversaries ─────────────────────────────── */}
      {/* FIX: couples share ONE card — badge count = number of couples, not individuals */}
      {todayAnniversaries.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-pink-500" />
            <h2 className="font-bold text-gray-800">Today's Anniversaries</h2>
            <Badge className="bg-pink-100 text-pink-700 border-0 ml-auto">{todayAnniversaries.length}</Badge>
          </div>
          <div className="space-y-2.5">
            {todayAnniversaries.map((c: any) => {
              const isCouple = !!c._spouse;
              const displayName = coupleDisplayName(c);
              const avatarLabel = isCouple
                ? `${c._husband.firstName[0]}${c._wife?.firstName?.[0] ?? ""}`.toUpperCase()
                : `${c.firstName[0]}`.toUpperCase();
              return (
                <div key={c.id} className="relative overflow-hidden flex items-center gap-4 bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-200 rounded-2xl px-4 py-3.5 shadow-sm">
                  {/* Couple avatars — two overlapping circles for couples, single for solo */}
                  {isCouple ? (
                    <div className="relative w-14 h-14 flex-shrink-0">
                      <div className="absolute left-0 top-1 w-10 h-10 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center font-bold text-sm z-10 border-2 border-white overflow-hidden">
                        {c._husband.profilePhoto
                          ? <img src={c._husband.profilePhoto} alt={c._husband.firstName} className="w-full h-full object-cover" />
                          : c._husband.firstName[0].toUpperCase()}
                      </div>
                      <div className="absolute right-0 bottom-1 w-10 h-10 rounded-full bg-pink-200 text-pink-800 flex items-center justify-center font-bold text-sm border-2 border-white overflow-hidden">
                        {c._wife?.profilePhoto
                          ? <img src={c._wife.profilePhoto} alt={c._wife?.firstName} className="w-full h-full object-cover" />
                          : (c._wife?.firstName?.[0] ?? "?").toUpperCase()}
                      </div>
                    </div>
                  ) : (
                    <Avatar name={`${c.firstName} ${c.lastName}`} photo={c.profilePhoto} size="lg" color="bg-pink-200 text-pink-800" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-base">{displayName}</p>
                    <p className="text-sm text-pink-600 font-medium">💍 {fmtDate(c.weddingDate)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      ❤️ {isCouple ? `Happy Anniversary to ${c._husband.firstName} & ${c._wife?.firstName ?? c._spouse.firstName}!` : "Happy Anniversary!"}
                    </p>
                  </div>
                  <div className="text-4xl select-none opacity-50 flex-shrink-0">💍</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Upcoming Birthdays & Anniversaries ────────────────── */}
      {(upcomingBirthdays.length > 0 || upcomingAnniversaries.length > 0) && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Coming Up (Next 7 Days)</h2>
          <div className="space-y-2">
            {[
              ...upcomingBirthdays.map(m => ({ ...m, _type: "birthday" as const })),
              ...upcomingAnniversaries.map(m => ({ ...m, _type: "anniversary" as const })),
            ]
              .sort((a, b) => {
                const da = a._type === "birthday" ? daysUntil(a.dateOfBirth) : daysUntil(a.weddingDate);
                const db_ = b._type === "birthday" ? daysUntil(b.dateOfBirth) : daysUntil(b.weddingDate);
                return da - db_;
              })
              .map((m: any) => {
                const isBday = m._type === "birthday";
                const dateStr = isBday ? m.dateOfBirth : m.weddingDate;
                const days = daysUntil(dateStr);
                // FIX: for anniversaries show couple name, for birthdays show individual
                const label = isBday
                  ? `${m.firstName} ${m.lastName}`
                  : coupleDisplayName(m);
                const avatarInitial = isBday
                  ? `${m.firstName[0]}`.toUpperCase()
                  : m._spouse
                    ? `${m._husband?.firstName?.[0] ?? m.firstName[0]}${m._wife?.firstName?.[0] ?? ""}`.toUpperCase()
                    : m.firstName[0].toUpperCase();
                return (
                  <div key={`${m._type}-${m.id}`} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm hover:shadow-md transition-shadow">
                    <span className="text-xl flex-shrink-0">{isBday ? "🎂" : "💍"}</span>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${isBday ? "bg-yellow-100 text-yellow-700" : "bg-pink-100 text-pink-700"}`}>
                      {avatarInitial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{label}</p>
                      <p className="text-xs text-gray-400">{isBday ? "Birthday" : "Anniversary"} · {fmtDate(dateStr)}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full ${isBday ? "bg-yellow-100 text-yellow-700" : "bg-pink-100 text-pink-600"}`}>
                        {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* ── Latest Video ──────────────────────────────────────── */}
      {latestVideo && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Latest from the Church</h2>
          <Link href="/online-portal">
            <div className="flex items-center gap-4 bg-purple-50 border border-purple-100 rounded-2xl px-4 py-3.5 hover:bg-purple-100 transition-colors cursor-pointer shadow-sm">
              <div className="w-14 h-14 rounded-xl bg-purple-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {latestVideo.youtubeId ? (
                  <img
                    src={`https://img.youtube.com/vi/${latestVideo.youtubeId}/default.jpg`}
                    alt={latestVideo.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Video className="w-6 h-6 text-purple-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 truncate">{latestVideo.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{fmtDate(latestVideo.date)}</p>
                {latestVideo.isLive && <Badge className="mt-1 bg-red-100 text-red-600 border-0 text-[10px]">● LIVE</Badge>}
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </div>
          </Link>
        </section>
      )}

    </div>
  );
}
