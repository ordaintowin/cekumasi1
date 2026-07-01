import { useEffect, useState } from "react";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey, useGetUpcomingBirthdays, getGetUpcomingBirthdaysQueryKey, useGetRecentActivity, getGetRecentActivityQueryKey, useGetActiveService, getGetActiveServiceQueryKey, useListMembers, getListMembersQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Users, UserPlus, Baby, Network, Layers, Grid3x3, CalendarCheck, Home, Gift, Activity, AlertTriangle, CheckCircle2, ChevronRight, Heart, VideoIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value?: number;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
  href?: string;
}

function StatCard({ title, value, sub, icon, accent, href }: StatCardProps) {
  const inner = (
    <div className={`relative bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-200 active:scale-95`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`} />
      <div className="pl-4 pr-3 py-3.5 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${accent.replace("bg-", "bg-").replace("-600", "-100").replace("-500", "-100").replace("-700", "-100")}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide leading-none mb-1 truncate">{title}</p>
          <p className="text-2xl font-extrabold text-gray-900 leading-none">{value ?? "—"}</p>
          {sub && <p className="text-[11px] text-gray-400 mt-1 leading-tight truncate">{sub}</p>}
        </div>
      </div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function ActivityDot({ type }: { type: string }) {
  const map: Record<string, string> = {
    new_member: "bg-purple-400",
    first_timer: "bg-blue-400",
    attendance: "bg-green-400",
    giving: "bg-yellow-400",
  };
  return <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${map[type] ?? "bg-gray-300"}`} />;
}

export default function Dashboard() {
  const [activeMeeting, setActiveMeeting] = useState<any>(null);

  useEffect(() => {
    const fetchMeeting = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/meetings/active", { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setActiveMeeting(data);
      } catch { }
    };
    fetchMeeting();
    const t = setInterval(fetchMeeting, 30_000);
    return () => clearInterval(t);
  }, []);

  const { data: summary, isLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });
  const { data: birthdayList } = useGetUpcomingBirthdays({
    query: { queryKey: getGetUpcomingBirthdaysQueryKey() },
  });
  const { data: recentActivity } = useGetRecentActivity({
    query: { queryKey: getGetRecentActivityQueryKey() },
  });
  const { data: activeService } = useGetActiveService({
    query: { queryKey: getGetActiveServiceQueryKey() },
  });
  const { data: marriedMembersData } = useListMembers(
    { page: 1, limit: 500, type: "member" },
    { query: { queryKey: [...getListMembersQueryKey({ limit: 500, type: "member" }), "married"] } }
  );

  const s = summary as any;
  const birthdays: any[] = (birthdayList as any)?.birthdays ?? [];
  const activity: any[] = (recentActivity as any) ?? [];
  const svc = activeService as any;

  const upcomingAnniversaries = (() => {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const results: any[] = [];
    const seen = new Set<number>();
    const allMembers: any[] = (marriedMembersData?.data ?? []) as any[];
    for (const m of allMembers) {
      if (!m.weddingDate || seen.has(m.id)) continue;
      const wed = new Date(m.weddingDate);
      if (isNaN(wed.getTime())) continue;
      const thisYear = new Date(now.getFullYear(), wed.getMonth(), wed.getDate());
      const nextYear = new Date(now.getFullYear() + 1, wed.getMonth(), wed.getDate());
      const upcoming = thisYear >= todayMidnight ? thisYear : nextYear;
      const days = Math.round((upcoming.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
      if (days <= 10) {
        seen.add(m.id);
        if (m.spouseId) seen.add(m.spouseId);
        const spouse = m.spouseId ? allMembers.find((x: any) => x.id === m.spouseId) : null;
        const husband = m.gender === "male" ? m : (spouse?.gender === "male" ? spouse : m);
        const wife = m.gender === "female" ? m : (spouse?.gender === "female" ? spouse : spouse);
        const husbandTitle = husband?.title ? `${husband.title} ` : "";
        const wifeTitle = wife?.title ? `${wife.title} ` : "";
        const displayName = spouse
          ? `${husbandTitle}${husband.firstName} & ${wifeTitle}${wife?.firstName ?? spouse.firstName} ${husband.lastName}`
          : `${m.title ? `${m.title} ` : ""}${m.firstName} ${m.lastName}`;
        results.push({ ...m, displayName, spouseFirstName: spouse?.firstName, weddingDateObj: wed, upcomingDate: upcoming, daysUntil: days });
      }
    }
    return results.sort((a, b) => a.daysUntil - b.daysUntil);
  })();

  const today = new Date();
  const greeting = today.getHours() < 12 ? "Good morning" : today.getHours() < 17 ? "Good afternoon" : "Good evening";

  const stats: StatCardProps[] = [
    {
      title: "Total Members", value: s?.totalMembers,
      sub: `+${s?.newMembersThisMonth ?? 0} this month`,
      icon: <Users className="w-5 h-5 text-purple-600" />,
      accent: "bg-purple-500", href: "/members",
    },
    {
      title: "First Timers", value: s?.totalFirstTimers,
      sub: `${s?.firstTimersThisMonth ?? 0} this month`,
      icon: <UserPlus className="w-5 h-5 text-blue-600" />,
      accent: "bg-blue-500", href: "/first-timers",
    },
    {
      title: "Children", value: s?.totalChildren,
      icon: <Baby className="w-5 h-5 text-pink-600" />,
      accent: "bg-pink-500", href: "/children",
    },
    {
      title: "Teens", value: s?.totalTeens,
      icon: <Baby className="w-5 h-5 text-orange-500" />,
      accent: "bg-orange-400", href: "/teens",
    },
    {
      title: "Cells", value: s?.totalCells,
      icon: <Network className="w-5 h-5 text-green-600" />,
      accent: "bg-green-500", href: "/fellowship",
    },
    {
      title: "Senior Cells", value: s?.totalSeniorCells,
      icon: <Layers className="w-5 h-5 text-indigo-600" />,
      accent: "bg-indigo-500", href: "/fellowship",
    },
    {
      title: "PCFs", value: s?.totalPcfs,
      icon: <Grid3x3 className="w-5 h-5 text-yellow-600" />,
      accent: "bg-yellow-400", href: "/fellowship",
    },
    {
      title: "Families", value: s?.totalFamilies,
      icon: <Home className="w-5 h-5 text-rose-600" />,
      accent: "bg-rose-500", href: "/families",
    },
  ];

  return (
    <div className="space-y-5 pb-4">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{greeting} 👋</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {today.toLocaleDateString("en-GH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <span className="self-start sm:self-auto text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-full px-3 py-1">
          Christ Embassy Kumasi 1
        </span>
      </div>

      {/* ── Alert Banners ───────────────────────────────────────── */}
      <div className="space-y-2">
        {svc?.id && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-green-800 truncate">Live: {svc.name}</p>
              <p className="text-xs text-green-600">{svc.checkinsCount ?? 0} checked in</p>
            </div>
            <Link href="/attendance" className="text-green-700 text-xs font-semibold bg-green-100 hover:bg-green-200 rounded-lg px-2.5 py-1 transition-colors flex-shrink-0 flex items-center gap-0.5">
              Manage <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        )}

        {activeMeeting?.isActive && (
          <div className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-xl px-3 py-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center flex-shrink-0">
              <VideoIcon className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-purple-800 truncate">Live: {activeMeeting.title}</p>
              <p className="text-xs text-purple-500">Video conference in progress</p>
            </div>
            <Link href="/online-portal" className="text-purple-700 text-xs font-semibold bg-purple-100 hover:bg-purple-200 rounded-lg px-2.5 py-1 transition-colors flex-shrink-0 flex items-center gap-0.5">
              Join <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        )}

        {s?.cellsWithoutLeaders > 0 && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="text-sm text-amber-800 flex-1 min-w-0">
              <span className="font-semibold">{s.cellsWithoutLeaders}</span> cells without a leader
            </p>
            <Link href="/fellowship" className="text-amber-700 text-xs font-semibold bg-amber-100 hover:bg-amber-200 rounded-lg px-2.5 py-1 transition-colors flex-shrink-0 flex items-center gap-0.5">
              Fix <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        )}
      </div>

      {/* ── Stat Cards ─────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {stats.map((s) => (
            <StatCard key={s.title} {...s} />
          ))}
        </div>
      )}

      {/* ── Bottom Panels ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Upcoming Birthdays */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
            <Gift className="w-4 h-4 text-pink-500 flex-shrink-0" />
            <h2 className="text-sm font-semibold text-gray-700 flex-1">Upcoming Birthdays</h2>
          </div>
          <div className="px-4 py-2">
            {birthdays.filter((b: any) => b.daysUntil <= 10).length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">No birthdays in the next 10 days</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {birthdays
                  .filter((b: any) => b.daysUntil <= 10)
                  .sort((a: any, b: any) => a.daysUntil - b.daysUntil)
                  .slice(0, 6)
                  .map((b: any) => {
                    const nameInitial = (b.memberName ?? "?")[0];
                    const dateDisplay = b.date ? (() => {
                      const d = new Date(b.date);
                      return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GH", { day: "numeric", month: "short" });
                    })() : "";
                    return (
                      <div key={`${b.type ?? "member"}-${b.memberId ?? b.memberName}-${b.date}`} className="flex items-center gap-2.5 py-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${b.type === "child" ? "bg-blue-100 text-blue-700" : b.type === "teen" ? "bg-teal-100 text-teal-700" : "bg-pink-100 text-pink-700"}`}>
                          {nameInitial}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{b.memberName}</p>
                          <p className="text-xs text-gray-400">{dateDisplay}</p>
                        </div>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${b.daysUntil === 0 ? "bg-pink-100 text-pink-700" : "bg-gray-100 text-gray-500"}`}>
                          {b.daysUntil === 0 ? "🎂 Today" : `${b.daysUntil}d`}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Anniversaries */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
            <Heart className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <h2 className="text-sm font-semibold text-gray-700 flex-1">Upcoming Anniversaries</h2>
          </div>
          <div className="px-4 py-2">
            {upcomingAnniversaries.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">No anniversaries in the next 10 days</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {upcomingAnniversaries.slice(0, 6).map((m: any) => {
                  const years = m.upcomingDate.getFullYear() - m.weddingDateObj.getFullYear();
                  const initials = m.spouseFirstName
                    ? `${m.firstName[0]}${m.spouseFirstName[0]}`
                    : `${m.firstName?.[0] ?? ""}${m.lastName?.[0] ?? ""}`;
                  return (
                    <div key={m.id} className="flex items-center gap-2.5 py-2.5">
                      <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-700 text-xs font-bold flex-shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{m.displayName}</p>
                        <p className="text-xs text-gray-400">{m.upcomingDate.toLocaleDateString("en-GH", { day: "numeric", month: "short" })} · {years} yr{years !== 1 ? "s" : ""}</p>
                      </div>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${m.daysUntil === 0 ? "bg-rose-100 text-rose-700" : "bg-gray-100 text-gray-500"}`}>
                        {m.daysUntil === 0 ? "💍 Today" : `${m.daysUntil}d`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden md:col-span-2">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
            <Activity className="w-4 h-4 text-purple-500 flex-shrink-0" />
            <h2 className="text-sm font-semibold text-gray-700 flex-1">Recent Activity</h2>
          </div>
          <div className="px-4 py-2">
            {activity.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">No recent activity</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {activity.slice(0, 8).map((item: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 py-2.5">
                    <ActivityDot type={item.type} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 leading-snug">{item.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.timeAgo ?? new Date(item.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
