import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, RefreshCw, ClipboardList, ChevronLeft, ChevronRight,
  UserCog, UserPlus, UserMinus, Pencil, Trash2, LogIn, LogOut,
  Settings, DollarSign, Users, Calendar, FileText, ShieldCheck,
  X, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const getToken = () =>
  typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;

function formatDate(ts: string) {
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
}

function formatTimeAgo(ts: string) {
  const now = Date.now();
  const then = new Date(ts).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(ts).date;
}

function getActivityConfig(type: string, description: string) {
  const t = type.toLowerCase();
  const d = description.toLowerCase();

  if (t.includes("add") || d.includes("add") || d.includes("creat") || d.includes("register")) {
    return { icon: UserPlus, color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", label: "Added" };
  }
  if (t.includes("delet") || d.includes("delet") || d.includes("remov")) {
    return { icon: Trash2, color: "bg-red-100 text-red-700", dot: "bg-red-500", label: "Deleted" };
  }
  if (t.includes("archiv") || d.includes("archiv")) {
    return { icon: UserMinus, color: "bg-amber-100 text-amber-700", dot: "bg-amber-500", label: "Archived" };
  }
  if (t.includes("edit") || t.includes("updat") || d.includes("edit") || d.includes("updat")) {
    return { icon: Pencil, color: "bg-blue-100 text-blue-700", dot: "bg-blue-500", label: "Updated" };
  }
  if (t.includes("login") || d.includes("login") || d.includes("sign in")) {
    return { icon: LogIn, color: "bg-purple-100 text-purple-700", dot: "bg-purple-500", label: "Login" };
  }
  if (t.includes("logout") || d.includes("logout") || d.includes("sign out")) {
    return { icon: LogOut, color: "bg-gray-100 text-gray-600", dot: "bg-gray-400", label: "Logout" };
  }
  if (t.includes("financ") || d.includes("giving") || d.includes("tithe") || d.includes("payment")) {
    return { icon: DollarSign, color: "bg-green-100 text-green-700", dot: "bg-green-500", label: "Finance" };
  }
  if (t.includes("attend") || d.includes("attend") || d.includes("service")) {
    return { icon: Calendar, color: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500", label: "Attendance" };
  }
  if (t.includes("member") || d.includes("member")) {
    return { icon: Users, color: "bg-cyan-100 text-cyan-700", dot: "bg-cyan-500", label: "Member" };
  }
  if (t.includes("setting") || d.includes("setting") || d.includes("config")) {
    return { icon: Settings, color: "bg-slate-100 text-slate-600", dot: "bg-slate-500", label: "Settings" };
  }
  if (t.includes("admin") || d.includes("admin") || d.includes("role") || d.includes("permission")) {
    return { icon: ShieldCheck, color: "bg-violet-100 text-violet-700", dot: "bg-violet-500", label: "Admin" };
  }
  return { icon: FileText, color: "bg-gray-100 text-gray-600", dot: "bg-gray-400", label: "Action" };
}

function parseDescription(description: string) {
  const match = description.match(/^(.*?)\[(.+?)\](.*)$/);
  if (match) {
    return { before: match[1].trim(), name: match[2].trim(), after: match[3].trim() };
  }
  return { before: description, name: null, after: "" };
}

const PAGE_SIZE = 10;

export default function AdminLogs() {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchLogs = useCallback(async (q: string, p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set("search", q);
      const res = await fetch(`/api/admin/activity-log?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Failed to load logs");
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchLogs(search, page); }, [search, page, fetchLogs]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const handleClear = () => {
    setSearch("");
    setSearchInput("");
    setPage(1);
  };

  const goTo = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pagePills = (() => {
    const pills: (number | "...")[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pills.push(i);
    } else {
      pills.push(1);
      if (page > 3) pills.push("...");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pills.push(i);
      if (page < totalPages - 2) pills.push("...");
      pills.push(totalPages);
    }
    return pills;
  })();

  const startEntry = (page - 1) * PAGE_SIZE + 1;
  const endEntry = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-4 max-w-3xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-700 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Activity Log</h1>
          </div>
          <p className="text-xs text-gray-500 mt-1 ml-10">
            Audit trail of all admin actions
            {total > 0 && (
              <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                {total.toLocaleString()} {total === 1 ? "entry" : "entries"}
              </span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchLogs(search, page)}
          className="gap-1.5 text-xs shrink-0 mt-1"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* ── Search ─────────────────────────────────────────────── */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            className="pl-9 pr-4 h-10 text-sm bg-white border-gray-200 rounded-xl focus-visible:ring-purple-500"
            placeholder="Search activities or admin name..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>
        {search ? (
          <Button type="button" variant="outline" size="sm" onClick={handleClear} className="h-10 px-3 rounded-xl">
            <X className="w-4 h-4" />
          </Button>
        ) : null}
        <Button type="submit" size="sm" className="h-10 px-4 bg-purple-700 hover:bg-purple-800 text-white rounded-xl">
          Search
        </Button>
      </form>

      {/* ── Log Cards ──────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex gap-3">
              <Skeleton className="h-9 w-9 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-3 w-16 self-start mt-1" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <ClipboardList className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-500">
            {search ? "No logs match your search." : "No activity logged yet."}
          </p>
          {search && (
            <button onClick={handleClear} className="mt-2 text-xs text-purple-600 underline underline-offset-2">
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((log, idx) => {
            const cfg = getActivityConfig(log.type, log.description);
            const Icon = cfg.icon;
            const { before, name, after } = parseDescription(log.description);
            const { date, time } = formatDate(log.createdAt);
            const sn = startEntry + idx;

            return (
              <div
                key={log.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-purple-100 transition-all duration-150"
              >
                <div className="flex gap-3 p-4">
                  {/* SN Badge */}
                  <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                    <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-gray-400 font-mono leading-none">{sn}</span>
                    </div>
                    <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    {/* Activity icon + description */}
                    <div className="flex items-start gap-2">
                      <div className={`w-7 h-7 rounded-lg ${cfg.color} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 leading-snug">
                          {before}
                          {name && (
                            <>
                              {" "}
                              <span className="font-semibold text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded-md text-xs">
                                {name}
                              </span>
                            </>
                          )}
                          {after && <span className="text-gray-600"> {after}</span>}
                        </p>

                        {/* Admin + Time row */}
                        <div className="flex items-center flex-wrap gap-2 mt-1.5">
                          {log.performedByName ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-full px-2 py-0.5">
                              <UserCog className="w-3 h-3 flex-shrink-0" />
                              {log.performedByName}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">
                              <ShieldCheck className="w-3 h-3" />
                              System
                            </span>
                          )}
                          <span className="text-xs text-gray-400">·</span>
                          <time className="text-xs text-gray-400" title={`${date} ${time}`}>
                            {date} &middot; {time}
                          </time>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ─────────────────────────────────────────── */}
      {!loading && total > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            {/* Entry count */}
            <p className="text-xs text-gray-400 whitespace-nowrap">
              <span className="font-medium text-gray-600">{startEntry}–{endEntry}</span>
              {" "}of {total.toLocaleString()}
            </p>

            {/* Controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => goTo(1)}
                disabled={page === 1}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => goTo(page - 1)}
                disabled={page === 1}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1">
                {pagePills.map((pill, i) =>
                  pill === "..." ? (
                    <span key={`e-${i}`} className="w-8 text-center text-xs text-gray-300 select-none">…</span>
                  ) : (
                    <button
                      key={pill}
                      onClick={() => goTo(pill as number)}
                      className={`h-8 w-8 rounded-lg text-xs font-medium transition-colors ${
                        pill === page
                          ? "bg-purple-700 text-white shadow-sm"
                          : "text-gray-500 hover:bg-gray-100"
                      }`}
                    >
                      {pill}
                    </button>
                  )
                )}
              </div>

              <button
                onClick={() => goTo(page + 1)}
                disabled={page === totalPages}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => goTo(totalPages)}
                disabled={page === totalPages}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Page indicator */}
          <p className="text-center text-xs text-gray-400 mt-1.5">
            Page <span className="font-medium text-gray-600">{page}</span> of{" "}
            <span className="font-medium text-gray-600">{totalPages}</span>
          </p>
        </div>
      )}
    </div>
  );
}
