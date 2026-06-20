import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { MeetingProvider, useMeetingContext } from "@/context/MeetingContext";
import { Meeting } from "@/components/Meeting";
import Layout from "@/components/Layout";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Members from "@/pages/members";
import Fellowship from "@/pages/fellowship";
import FirstTimers from "@/pages/first-timers";
import Finance from "@/pages/finance";
import Settings from "@/pages/settings";
import Departments from "@/pages/departments";
import Children from "@/pages/children";
import Teens from "@/pages/teens";
import Families from "@/pages/families";
import Attendance from "@/pages/attendance";
import Reports from "@/pages/reports";
import Archives from "@/pages/archives";
import Profile from "@/pages/profile";
import OnlinePortal from "@/pages/online-portal";
import Notifications from "@/pages/notifications";
import MyNotifications from "@/pages/my-notifications";
import Home from "@/pages/home";
import AdminLogs from "@/pages/admin-logs";
import Help from "@/pages/help";
import NotFound from "@/pages/not-found";
import JoinMeeting from "@/pages/join-meeting";
import PublicRegister from "@/pages/public-register";
import { Loader2 } from "lucide-react";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import { useState, useEffect } from "react";

const queryClient = new QueryClient();

// Pages each role level/subtype may access
const ACCESS_MAP: Record<string, string[]> = {
  "2":              ["/finance", "/reports", "/online-portal", "/my-notifications"],
  "3/pfcc":         ["/members", "/fellowship", "/children", "/teens", "/attendance", "/first-timers", "/reports", "/my-notifications"],
  "3/first_timers": ["/first-timers", "/attendance", "/reports", "/my-notifications"],
  "3/pcd":          ["/families", "/departments", "/attendance", "/my-notifications"],
  "3/media":        ["/online-portal", "/attendance", "/notifications", "/reports", "/my-notifications"],
  "3/children":     ["/children", "/teens", "/attendance", "/reports", "/my-notifications"],
  "3/registration": ["/attendance", "/my-notifications"],
  "4":              ["/members", "/attendance", "/reports", "/profile", "/online-portal", "/departments", "/home", "/my-notifications", "/help"],
  "5":              ["/profile", "/online-portal", "/home", "/my-notifications", "/departments", "/help"],
};

function canAccess(user: any, path: string): boolean {
  if (!user) return false;
  const level: number = user.roleLevel;
  const sub: string = user.roleSubtype || "";
  if (level === 1) return true;
  const key = level === 3 ? `3/${sub}` : String(level);
  const allowed = ACCESS_MAP[key] ?? [];
  return allowed.some((p) => path === p || path.startsWith(p + "/"));
}

function getHomeRoute(user: any): string {
  if (!user) return "/login";
  const level: number = user.roleLevel;
  const sub: string = user.roleSubtype || "";
  if (level === 1) return "/";
  if (level === 2) return "/finance";
  if (level === 3) {
    if (sub === "pfcc")         return "/fellowship";
    if (sub === "first_timers") return "/first-timers";
    if (sub === "pcd")          return "/families";
    if (sub === "media")        return "/online-portal";
    if (sub === "children")     return "/children";
    if (sub === "registration") return "/attendance";
  }
  if (level === 4) return "/home";
  return "/home";
}

function ProtectedRoute({ component: Component, routePath, ...rest }: any) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Redirect to="/login" />;

  const checkPath = routePath ?? location;
  if (!canAccess(user, checkPath)) {
    return <Redirect to={getHomeRoute(user)} />;
  }

  return (
    <Layout>
      <Component {...rest} />
    </Layout>
  );
}

function Router() {
  const { user } = useAuth();

  return (
    <Switch>
      <Route path="/login">
        {user ? <Redirect to={getHomeRoute(user)} /> : <Login />}
      </Route>

      <Route path="/"            component={() => <ProtectedRoute component={Dashboard}    routePath="/" />} />
      <Route path="/home"        component={() => <ProtectedRoute component={Home}         routePath="/home" />} />
      <Route path="/members"     component={() => <ProtectedRoute component={Members}      routePath="/members" />} />
      <Route path="/fellowship"  component={() => <ProtectedRoute component={Fellowship}   routePath="/fellowship" />} />
      <Route path="/departments" component={() => <ProtectedRoute component={Departments}  routePath="/departments" />} />
      <Route path="/children"    component={() => <ProtectedRoute component={Children}     routePath="/children" />} />
      <Route path="/teens"       component={() => <ProtectedRoute component={Teens}        routePath="/teens" />} />
      <Route path="/families"    component={() => <ProtectedRoute component={Families}     routePath="/families" />} />
      <Route path="/attendance"  component={() => <ProtectedRoute component={Attendance}   routePath="/attendance" />} />
      <Route path="/first-timers" component={() => <ProtectedRoute component={FirstTimers} routePath="/first-timers" />} />
      <Route path="/reports"     component={() => <ProtectedRoute component={Reports}      routePath="/reports" />} />
      <Route path="/finance"     component={() => <ProtectedRoute component={Finance}      routePath="/finance" />} />
      <Route path="/archives"    component={() => <ProtectedRoute component={Archives}     routePath="/archives" />} />
      <Route path="/settings"    component={() => <ProtectedRoute component={Settings}     routePath="/settings" />} />
      <Route path="/profile"     component={() => <ProtectedRoute component={Profile}      routePath="/profile" />} />
      <Route path="/online-portal" component={() => <ProtectedRoute component={OnlinePortal} routePath="/online-portal" />} />
      <Route path="/notifications"    component={() => <ProtectedRoute component={Notifications}    routePath="/notifications" />} />
      <Route path="/my-notifications" component={() => <ProtectedRoute component={MyNotifications} routePath="/my-notifications" />} />
      <Route path="/admin-logs"       component={() => <ProtectedRoute component={AdminLogs}        routePath="/admin-logs" />} />
      <Route path="/help"             component={() => <ProtectedRoute component={Help}             routePath="/help" />} />

      <Route path="/register" component={() => <PublicRegister />} />

      <Route path="/join/:id">
        {(params: any) => <JoinMeeting meetingId={parseInt(params?.id || "0")} />}
      </Route>

      <Route component={() => (
        <Layout>
          <NotFound />
        </Layout>
      )} />
    </Switch>
  );
}

function GlobalMeeting() {
  const { joinedMeeting, setJoinedMeeting, myPeerId } = useMeetingContext();
  const [location, setLocation] = useLocation();
  const [manualPip, setManualPip] = useState(false);

  // Auto-float to PiP whenever the user switches to another app or tab
  useEffect(() => {
    if (!joinedMeeting) return;
    const onVisibilityChange = () => {
      if (document.hidden) setManualPip(true);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [joinedMeeting]);

  if (!joinedMeeting) return null;

  const isOnPortal = location === "/online-portal";
  const isMinimized = !isOnPortal || manualPip;

  return (
    <Meeting
      meetingId={joinedMeeting.id}
      meetingTitle={joinedMeeting.title}
      peerId={myPeerId}
      displayName={joinedMeeting.myDisplayName}
      role={joinedMeeting.myRole}
      meetingType={joinedMeeting.meetingType}
      minimized={isMinimized}
      globalFullScreen={!isMinimized}
      onExpand={() => { setManualPip(false); setLocation("/online-portal"); }}
      onMinimize={() => setManualPip(true)}
      onLeave={() => setJoinedMeeting(null)}
    />
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <MeetingProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
              <GlobalMeeting />
            </WouterRouter>
          </MeetingProvider>
        </AuthProvider>
        <Toaster />
        <PWAInstallBanner />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
