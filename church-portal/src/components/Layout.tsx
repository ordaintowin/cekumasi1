import { ReactNode, useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Network,
  Baby,
  Smile,
  Home,
  HomeIcon,
  CalendarCheck,
  CheckSquare,
  BarChart2,
  Banknote,
  Archive,
  Settings,
  User,
  Building2,
  Globe,
  Bell,
} from "lucide-react";
import { Button } from "./ui/button";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
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

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [notifCount, setNotifCount] = useState(0);
  const [announcementCount, setAnnouncementCount] = useState(0);
  const lastAnnouncementIdRef = useRef<number>(
    parseInt(typeof localStorage !== "undefined" ? localStorage.getItem("lastAnnouncementId") || "0" : "0")
  );
  const hasChimedRef = useRef(false);

  const isAdmin = user && (user.roleLevel === 1 || (user.roleLevel === 3 && (user as any).roleSubtype === "media"));
  const notifCountRef = useRef<number>(
    parseInt(typeof localStorage !== "undefined" ? localStorage.getItem("adminNotifCount") || "0" : "0")
  );
  const adminNotifInitRef = useRef(false);

  useEffect(() => {
    if (!isAdmin) return;
    const token = localStorage.getItem("token");
    const fetchNotifs = () => {
      fetch("/api/notifications/summary", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => {
          const newCount = (d.pendingAccessRequests ?? 0) + (d.pendingMeetingJoinRequests ?? 0);
          if (adminNotifInitRef.current && newCount > notifCountRef.current) {
            playChime();
          }
          notifCountRef.current = newCount;
          if (typeof localStorage !== "undefined") localStorage.setItem("adminNotifCount", String(newCount));
          adminNotifInitRef.current = true;
          setNotifCount(newCount);
        })
        .catch(() => {});
    };
    fetchNotifs();
    const id = setInterval(fetchNotifs, 30_000);
    return () => clearInterval(id);
  }, [isAdmin]);

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem("token");

    const fetchAnnouncements = () => {
      fetch("/api/announcements", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then((rows: any[]) => {
          if (!Array.isArray(rows)) return;
          const unread = rows.filter((a: any) => !a.isRead);
          setAnnouncementCount(unread.length);

          if (unread.length > 0) {
            const latestId = unread[0]?.id ?? 0;
            if (latestId > lastAnnouncementIdRef.current && !hasChimedRef.current) {
              hasChimedRef.current = true;
              lastAnnouncementIdRef.current = latestId;
              localStorage.setItem("lastAnnouncementId", String(latestId));
              playChime();
              setTimeout(() => { hasChimedRef.current = false; }, 5000);
            }
          }
        })
        .catch(() => {});
    };
    fetchAnnouncements();
    const id = setInterval(fetchAnnouncements, 30_000);
    return () => clearInterval(id);
  }, [user]);

  const [birthdayDismissed, setBirthdayDismissed] = useState(() => {
    const year = new Date().getFullYear();
    return typeof localStorage !== "undefined" && localStorage.getItem(`birthday_ack_${year}`) === "1";
  });

  function dismissBirthday() {
    const year = new Date().getFullYear();
    localStorage.setItem(`birthday_ack_${year}`, "1");
    setBirthdayDismissed(true);
  }

  if (!user) return <>{children}</>;

  const level = user.roleLevel;
  const sub = (user as any).roleSubtype || "";

  const isLevel1 = level === 1;
  const isLevel2 = level === 2;
  const isLevel3 = level === 3;
  const isLevel4 = level === 4;
  const isLevel5 = level === 5;

  const isPFCC         = isLevel3 && sub === "pfcc";
  const isFirstTimers  = isLevel3 && sub === "first_timers";
  const isPCD          = isLevel3 && sub === "pcd";
  const isMedia        = isLevel3 && sub === "media";
  const isChildren     = isLevel3 && sub === "children";
  const isRegistration = isLevel3 && sub === "registration";

  const showHome        = isLevel4 || isLevel5;
  const showDashboard   = isLevel1;
  const showMembers     = isLevel1 || isPFCC || isLevel4;
  const showFellowship  = isLevel1 || isPFCC;
  const showFamilies    = isLevel1 || isPCD;
  const showChildren    = isLevel1 || isPFCC || isChildren;
  const showTeens       = isLevel1 || isPFCC || isChildren;
  const showDepartments = isLevel1 || isPCD || isLevel4 || isLevel5;
  const showAttendance  = isLevel1 || isPFCC || isPCD || isRegistration || isFirstTimers || isLevel4 || isMedia || isChildren;
  const showFirstTimers = isLevel1 || isPFCC || isFirstTimers;
  const showOnlinePortal = isLevel1 || isMedia || isLevel5 || isLevel4;
  const showReports     = isLevel1 || isPFCC || isLevel2 || isFirstTimers || isLevel4 || isChildren || isMedia;
  const showFinance     = isLevel1 || isLevel2;
  const showArchives    = isLevel1;
  const showSettings    = isLevel1;
  const showProfile = isLevel4 || isLevel5;
  const showNotifications = isLevel1 || isMedia;

  const navGroups = [
    {
      label: "Overview",
      items: [
        showDashboard && { href: "/", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
        showHome && { href: "/home", label: "Home", icon: <HomeIcon className="w-4 h-4" /> },
        showProfile && { href: "/profile", label: "My Profile", icon: <User className="w-4 h-4" /> },
      ].filter(Boolean) as NavItem[],
    },
    {
      label: "People",
      items: [
        showMembers && { href: "/members", label: "Members", icon: <Users className="w-4 h-4" /> },
        showFellowship && { href: "/fellowship", label: "Fellowship", icon: <Network className="w-4 h-4" /> },
        showFamilies && { href: "/families", label: "Families", icon: <Home className="w-4 h-4" /> },
      ].filter(Boolean) as NavItem[],
    },
    {
      label: "Ministry",
      items: [
        showChildren && { href: "/children", label: "Children's Church", icon: <Baby className="w-4 h-4" /> },
        showTeens && { href: "/teens", label: "Teens Church", icon: <Smile className="w-4 h-4" /> },
        showDepartments && { href: "/departments", label: "Departments", icon: <Building2 className="w-4 h-4" /> },
      ].filter(Boolean) as NavItem[],
    },
    {
      label: "Services",
      items: [
        showAttendance && { href: "/attendance", label: "Attendance", icon: <CalendarCheck className="w-4 h-4" /> },
        showFirstTimers && { href: "/first-timers", label: "First Timers", icon: <UserPlus className="w-4 h-4" /> },
        showOnlinePortal && { href: "/online-portal", label: (isLevel5 || isLevel4) ? "Watch Media" : "Online Portal", icon: <Globe className="w-4 h-4" /> },
      ].filter(Boolean) as NavItem[],
    },
    {
      label: "Reports & Admin",
      items: [
        showReports && { href: "/reports", label: "Reports", icon: <BarChart2 className="w-4 h-4" /> },
        showFinance && { href: "/finance", label: "Finance", icon: <Banknote className="w-4 h-4" /> },
        showArchives && { href: "/archives", label: "Archives", icon: <Archive className="w-4 h-4" /> },
        showSettings && { href: "/settings", label: "Settings", icon: <Settings className="w-4 h-4" /> },
        showNotifications && { href: "/notifications", label: "Notifications", icon: <Bell className="w-4 h-4" />, badge: notifCount > 0 ? notifCount : undefined },
      ].filter(Boolean) as NavItem[],
    },
  ].filter(g => g.items.length > 0);

  const initials = (user.memberName || user.username).substring(0, 2).toUpperCase();
  const subLabel: Record<string, string> = {
    pfcc: "PFCC Staff (3a)", first_timers: "First Timers Staff (3b)",
    pcd: "PCD Admin (3c)", media: "Media Admin (3d)",
    children: "Children's Teacher", registration: "Registration",
  };
  const roleLabel = level === 1 ? "Super Admin"
    : level === 2 ? "Finance Admin"
    : level === 3 ? (subLabel[sub] ?? "Staff")
    : level === 4 ? "Leader"
    : "Member";

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-gray-50">
        <Sidebar className="border-r border-purple-900/20" style={{ "--sidebar-background": "222 15% 15%" } as any}>
          <SidebarHeader className="border-b border-white/10 px-4 py-3 bg-[#3b1a6b]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 flex items-center justify-center">
                <img src="/logo.png" alt="CE Kumasi 1" className="w-8 h-8 object-contain" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm text-white leading-tight">CE Kumasi 1</span>
                <span className="text-xs text-purple-200">Christ Embassy</span>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="flex-1 overflow-y-auto bg-[#2d1454] py-2">
            {navGroups.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel className="text-purple-300/70 text-xs font-semibold uppercase tracking-wider px-3 py-1">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const isActive = item.href === "/"
                        ? location === "/"
                        : location.startsWith(item.href);
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton asChild isActive={isActive}>
                            <Link href={item.href} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${isActive ? "bg-yellow-400 text-purple-900 font-semibold" : "text-purple-100 hover:bg-white/10"}`}>
                              {item.icon}
                              <span className="flex-1">{item.label}</span>
                              {item.badge != null && item.badge > 0 && (
                                <span className="min-w-[18px] h-4.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 animate-pulse">
                                  {item.badge}
                                </span>
                              )}
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
                <SidebarSeparator className="bg-white/10 my-1" />
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter className="border-t border-white/10 p-3 bg-[#2d1454]">
            <div className="flex items-center gap-2 px-1 pb-2">
              <div className="w-8 h-8 rounded-full bg-yellow-400/20 flex items-center justify-center text-yellow-300 font-bold text-xs flex-shrink-0">
                {initials}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="font-medium text-white text-xs truncate">{user.memberName || user.username}</span>
                <span className="text-xs text-purple-300 truncate">{roleLabel}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-red-300 hover:text-red-200 hover:bg-white/10 text-xs"
              onClick={logout}
            >
              Sign out
            </Button>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-12 border-b flex items-center px-4 bg-white shadow-sm">
            <SidebarTrigger className="md:hidden" />
            <span className="font-bold ml-3 text-purple-800 flex-1 md:hidden">CE Kumasi 1</span>
            <div className="hidden md:flex flex-1" />

            {/* Announcement bell — all logged-in members */}
            {!isAdmin && (
              <Link href="/my-notifications" className="relative flex items-center justify-center p-2 ml-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer" title="View notifications">
                <Bell className="w-5 h-5 text-gray-600" />
                {announcementCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center px-0.5 animate-pulse">
                    {announcementCount}
                  </span>
                )}
              </Link>
            )}

            {/* Admin notification bell — access & meeting join requests */}
            {isAdmin && (
              <Link href="/notifications" className="relative flex items-center justify-center p-2 ml-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer" title="Pending requests">
                <Bell className="w-5 h-5 text-gray-600" />
                {notifCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-0.5 animate-pulse">
                    {notifCount}
                  </span>
                )}
              </Link>
            )}
          </header>

          <div className="flex-1 overflow-auto p-4 md:p-6">
            <div className="max-w-5xl mx-auto w-full">
            {/* Birthday banner */}
            {(() => {
              const dob = (user as any).dateOfBirth as string | null | undefined;
              if (!dob || birthdayDismissed) return null;
              const today = new Date();
              const parts = dob.split("-");
              const mm = parts[1];
              const dd = parts[2];
              const isBirthday = today.getMonth() + 1 === parseInt(mm) && today.getDate() === parseInt(dd);
              if (!isBirthday) return null;
              return (
                <div className="mb-4 flex items-center gap-3 bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-3 shadow-sm">
                  <span className="text-2xl select-none">🎂</span>
                  <div className="flex-1">
                    <p className="font-semibold text-yellow-900 text-sm leading-tight">Happy Birthday, {(user as any).memberName?.split(" ")[0] ?? "Friend"}! 🎉</p>
                    <p className="text-xs text-yellow-700 mt-0.5">Wishing you a wonderful day filled with joy. God bless you!</p>
                  </div>
                  <button onClick={dismissBirthday} className="text-yellow-500 hover:text-yellow-800 transition-colors p-1 rounded-full hover:bg-yellow-100 flex-shrink-0">
                    <span className="text-lg font-bold leading-none">×</span>
                  </button>
                </div>
              );
            })()}
            {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
