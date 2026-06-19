import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { CameraQRScanner } from "@/components/CameraQRScanner";
import { downloadJsonAsExcel } from "@/utils/excel";
import {
  useListServices, getListServicesQueryKey,
  useGetActiveService, getGetActiveServiceQueryKey,
  useGetServiceAttendance, getGetServiceAttendanceQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CheckCircle2, XCircle, Plus, Search, CalendarCheck, Users,
  Download, ArrowLeft, Scan, Edit2, X, UserPlus, Clock,
  Baby, Smile, ChevronDown, ChevronRight, ArrowRight, BarChart2, Trash2, QrCode,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── helpers ──────────────────────────────────────────────────────────────────

const getToken = () =>
  typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      ...((opts.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    const err: any = new Error(d.error || "Request failed");
    err.data = d;
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const today = new Date().toISOString().split("T")[0];

function canCloseService(service: any): boolean {
  if (!service) return false;
  // Allow close after 4 hours from service start time
  const serviceTime = service.time || "08:00";
  const [h, m] = serviceTime.split(":").map(Number);
  const serviceDate = service.date || today;
  const serviceStart = new Date(`${serviceDate}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
  const fourHoursLater = new Date(serviceStart.getTime() + 4 * 60 * 60 * 1000);
  return new Date() >= fourHoursLater;
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" });
}

async function exportToExcel(service: any, attendanceData: any) {
  const rows: any[] = [];
  for (const row of attendanceData?.attendeeList ?? []) {
    rows.push({
      "Service": service?.name ?? "",
      "Date": service?.date ?? "",
      "Name": row.name,
      "Type": row.type === "first_timer" ? "First Timer" : "Member",
      "Fellowship": row.fellowship ?? "",
      "PCF": row.pcfName ?? "",
      "Senior Cell": row.scName ?? "",
      "Time": row.checkInTime ? new Date(row.checkInTime).toLocaleTimeString() : "",
    });
  }
  await downloadJsonAsExcel(rows, "Attendance", `Attendance_${service?.date ?? "export"}.xlsx`);
}

// ─── types ────────────────────────────────────────────────────────────────────

type View = "services" | "register";
type RegTab = "search" | "id" | "qr" | "firsttimer" | "returning" | "child" | "teen";
type RegResult = { type: "success" | "error"; name: string; detail: string } | null;

// ─── InvitedBySearch ──────────────────────────────────────────────────────────

function InvitedBySearch({
  value, label, onChange,
}: { value: { id: number; name: string; fellowship?: string } | null; label: string; onChange: (v: any) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const d = await apiFetch(`/api/members?search=${encodeURIComponent(query)}&limit=6`);
        setResults(d.data ?? []);
        setOpen(true);
      } catch { setResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-purple-50">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-purple-800">{value.name}</p>
          {value.fellowship && <p className="text-xs text-purple-500">{value.fellowship}</p>}
        </div>
        <button type="button" onClick={() => onChange(null)} className="text-gray-400 hover:text-red-500">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        placeholder={label}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {results.map(m => (
            <button key={m.id} type="button"
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-purple-50 text-left text-sm border-b last:border-0"
              onMouseDown={() => {
                onChange({ id: m.id, name: `${m.title ? m.title + " " : ""}${m.firstName} ${m.lastName}`, fellowship: m.cellName || undefined });
                setQuery(""); setOpen(false);
              }}>
              <span className="flex-1 font-medium text-gray-800">{m.title ? m.title + " " : ""}{m.firstName} {m.lastName}</span>
              {m.cellName && <span className="text-xs text-gray-400">{m.cellName}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── HierarchyView ────────────────────────────────────────────────────────────

function HierarchyNode({ node, level, onCellClick }: { node: any; level: "pcf" | "sc" | "cell"; onCellClick: (cell: any) => void }) {
  const [open, setOpen] = useState(true);
  const pct = node.total > 0 ? Math.round((node.checkedIn / node.total) * 100) : 0;

  const colors = {
    pcf: { bg: "bg-purple-50", border: "border-purple-200", badge: "bg-purple-600 text-white", text: "text-purple-900", label: "PCF" },
    sc: { bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-500 text-white", text: "text-blue-800", label: "Senior Cell" },
    cell: { bg: "bg-gray-50", border: "border-gray-200", badge: "bg-gray-600 text-white", text: "text-gray-800", label: "Cell" },
  }[level];

  if (level === "cell") {
    return (
      <button
        onClick={() => onCellClick(node)}
        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border ${colors.border} ${colors.bg} hover:opacity-90 transition-opacity text-left`}
      >
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${colors.badge}`}>{colors.label}</span>
        <span className={`font-semibold text-sm flex-1 ${colors.text}`}>{node.name}</span>
        <span className="text-xs text-gray-500 font-mono">
          <span className="font-bold text-green-700">{node.checkedIn}</span>
          <span className="text-gray-400">/{node.total}</span>
        </span>
        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
      </button>
    );
  }

  const children = level === "pcf" ? node.seniorCells : node.cells;
  const childLevel = level === "pcf" ? "sc" : "cell";

  return (
    <div className={`rounded-xl border ${colors.border} overflow-hidden`}>
      <button
        className={`w-full flex items-center gap-3 px-4 py-3 ${colors.bg} text-left`}
        onClick={() => setOpen(o => !o)}
      >
        {open ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${colors.badge}`}>{colors.label}</span>
        <span className={`font-bold text-sm flex-1 ${colors.text}`}>{node.name}</span>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-bold text-green-700">{node.checkedIn}</span>
          <span className="text-gray-400">/ {node.total} members</span>
          <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-gray-400">({pct}%)</span>
        </div>
      </button>
      {open && (children ?? []).length > 0 && (
        <div className="px-4 pb-3 pt-2 space-y-2">
          {children.map((child: any) => (
            <HierarchyNode key={child.id} node={child} level={childLevel as any} onCellClick={onCellClick} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AttendeeTable ────────────────────────────────────────────────────────────

function AttendeeTable({ attendeeList, onMemberClick }: { attendeeList: any[]; onMemberClick: (row: any) => void }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return attendeeList;
    return attendeeList.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.fellowship ?? "").toLowerCase().includes(q) ||
      (r.pcfName ?? "").toLowerCase().includes(q) ||
      (r.scName ?? "").toLowerCase().includes(q)
    );
  }, [attendeeList, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Search by name or fellowship..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <span className="text-xs text-gray-500">{filtered.length} attendees</span>
      </div>

      <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Fellowship</TableHead>
              <TableHead className="hidden md:table-cell">Time</TableHead>
              <TableHead>Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-400">No attendees found</TableCell></TableRow>
            ) : (
              paginated.map((row, i) => (
                <TableRow key={`${row.type}-${row.memberId ?? row.ftId}-${i}`} className="hover:bg-gray-50">
                  <TableCell className="text-gray-400 text-xs font-mono">{(page - 1) * PAGE_SIZE + i + 1}</TableCell>
                  <TableCell>
                    {row.type === "member" ? (
                      <button
                        onClick={() => onMemberClick(row)}
                        className="font-medium text-sm text-purple-700 hover:text-purple-900 hover:underline text-left"
                      >
                        {row.name}
                      </button>
                    ) : (
                      <span className="font-medium text-sm text-gray-800">{row.name}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-gray-500">
                    {row.fellowship
                      ? <span>{row.fellowship}{row.pcfName ? <span className="text-gray-300"> · {row.pcfName}</span> : ""}</span>
                      : <span className="text-gray-300 italic">—</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-gray-500 font-mono">{fmtTime(row.checkInTime)}</TableCell>
                  <TableCell>
                    {row.type === "first_timer" ? (
                      <Badge className="bg-yellow-100 text-yellow-800 border-0 text-xs">FT{row.fellowship ? ` · ${row.fellowship}` : ""}</Badge>
                    ) : row.type === "returning_first_timer" ? (
                      <Badge className="bg-orange-100 text-orange-800 border-0 text-xs">Returning FT{row.fellowship ? ` · ${row.fellowship}` : ""}</Badge>
                    ) : (
                      <Badge className="bg-purple-100 text-purple-700 border-0 text-xs">Member</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</Button>
          <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</Button>
        </div>
      )}
    </div>
  );
}

// ─── SimpleAttendeeList (RegisterPage live feed) ──────────────────────────────

function SimpleAttendeeList({ attendanceData, filterCellName, filterCellNames, serviceId, canUnregister, canDeleteCT, canDeleteFT, onDeleteChild, onDeleteTeen, deletingCtId }: {
  attendanceData: any;
  filterCellName?: string | null;
  filterCellNames?: Set<string> | null;
  serviceId?: number;
  canUnregister?: boolean;
  canDeleteCT?: boolean;
  canDeleteFT?: boolean;
  onDeleteChild?: (childId: number) => void;
  onDeleteTeen?: (teenId: number) => void;
  deletingCtId?: number | null;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const list: any[] = useMemo(() => {
    const all: any[] = attendanceData?.attendeeList ?? [];
    if (filterCellNames) return all.filter((r: any) => filterCellNames.has(r.fellowship));
    if (!filterCellName) return all;
    return all.filter((r: any) => r.fellowship === filterCellName);
  }, [attendanceData, filterCellName, filterCellNames]);
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const paginated = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const [confirmMemberId, setConfirmMemberId] = useState<number | null>(null);
  const [confirmCtKey, setConfirmCtKey] = useState<string | null>(null);
  const [confirmFtId, setConfirmFtId] = useState<number | null>(null);
  const [unregistering, setUnregistering] = useState(false);
  const [deletingFtId, setDeletingFtId] = useState<number | null>(null);

  async function handleUnregister(memberId: number) {
    if (!serviceId) return;
    setUnregistering(true);
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
    await fetch(`/api/services/${serviceId}/checkin/${memberId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setUnregistering(false);
    setConfirmMemberId(null);
    queryClient.invalidateQueries({ queryKey: [`/api/services/${serviceId}/attendance`] });
  }

  async function handleDeleteFt(ftId: number) {
    setDeletingFtId(ftId);
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
    await fetch(`/api/first-timers/${ftId}?permanent=true`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Removed from service registration" }),
    });
    setDeletingFtId(null);
    setConfirmFtId(null);
    if (serviceId) queryClient.invalidateQueries({ queryKey: [`/api/services/${serviceId}/attendance`] });
  }

  const showDeleteCol = canUnregister || canDeleteCT || canDeleteFT;

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [total, totalPages]);

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
        <span className="font-semibold text-sm text-gray-700 flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-500" /> Registered Today
        </span>
        <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">{total}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
              <th className="text-left px-3 py-2 w-8">SN</th>
              <th className="text-left px-3 py-2">Full Name</th>
              <th className="text-left px-3 py-2 hidden sm:table-cell">Fellowship</th>
              <th className="text-right px-3 py-2">Time</th>
              {showDeleteCol && <th className="px-3 py-2 w-8"></th>}
            </tr>
          </thead>
          <tbody>
            {total === 0 ? (
              <tr><td colSpan={showDeleteCol ? 5 : 4} className="text-center py-8 text-gray-400 text-sm">No registrations yet</td></tr>
            ) : (
              paginated.map((row: any, i: number) => {
                const isCT = row.type === "child" || row.type === "teen";
                const isFT = row.type === "first_timer" || row.type === "returning_first_timer";
                const ctId = row.type === "child" ? row.childId : row.teenId;
                const ctKey = isCT ? `${row.type}-${ctId}` : null;
                const isConfirmingMember = canUnregister && (row.type === "member" || row.type === "visitor") && confirmMemberId === row.memberId;
                const isConfirmingCt = isCT && canDeleteCT && confirmCtKey === ctKey;
                const isConfirmingFt = isFT && canDeleteFT && confirmFtId === row.ftId;
                const isAnyConfirming = isConfirmingMember || isConfirmingCt || isConfirmingFt;
                const isCtDeleting = isCT && deletingCtId === ctId;
                const isFtDeleting = isFT && deletingFtId === row.ftId;
                return (
                  <tr key={`${row.type}-${row.memberId ?? row.ftId ?? row.childId ?? row.teenId ?? i}`} className={`border-b last:border-0 hover:bg-gray-50 ${isAnyConfirming ? "bg-red-50" : ""}`}>
                    <td className="px-3 py-2 text-gray-400 font-mono">{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="px-3 py-2" colSpan={isAnyConfirming ? 3 : 1}>
                      {isAnyConfirming ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-red-700 font-medium">Unregister <span className="font-bold">{row.name}</span>?</span>
                          <div className="flex items-center gap-1">
                            <button
                              disabled={unregistering || isCtDeleting || isFtDeleting}
                              onClick={() => {
                                if (isConfirmingMember) {
                                  handleUnregister(row.memberId);
                                } else if (isConfirmingCt) {
                                  row.type === "child" ? onDeleteChild?.(ctId) : onDeleteTeen?.(ctId);
                                  setConfirmCtKey(null);
                                } else if (isConfirmingFt) {
                                  handleDeleteFt(row.ftId);
                                }
                              }}
                              className="text-[10px] bg-red-500 hover:bg-red-600 text-white rounded px-2 py-0.5 font-semibold disabled:opacity-50"
                            >{(unregistering || isCtDeleting || isFtDeleting) ? "…" : "Yes, remove"}</button>
                            <button
                              onClick={() => { setConfirmMemberId(null); setConfirmCtKey(null); setConfirmFtId(null); }}
                              className="text-[10px] bg-gray-200 hover:bg-gray-300 text-gray-700 rounded px-2 py-0.5 font-semibold"
                            >Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="font-medium text-gray-800 leading-tight">{row.name}</p>
                          <p className={`text-[10px] mt-0.5 font-semibold ${row.type === "first_timer" ? "text-yellow-600" : row.type === "returning_first_timer" ? "text-orange-600" : row.type === "child" ? "text-blue-600" : row.type === "teen" ? "text-teal-600" : "text-purple-600"}`}>
                            {row.type === "first_timer"
                              ? row.invitedByName
                                ? <>Invited by <span className="font-semibold">{row.invitedByName}</span></>
                                : "First Timer"
                              : row.type === "returning_first_timer"
                              ? row.invitedByName
                                ? <>Returning · Invited by <span className="font-semibold">{row.invitedByName}</span></>
                                : "Returning FT"
                              : row.type === "child" ? `Children's · ${row.class ?? ""}`
                              : row.type === "teen" ? "Teens Church"
                              : row.type === "visitor" ? "Visitor"
                              : (row.fellowship ?? "Member")}
                          </p>
                        </>
                      )}
                    </td>
                    {!isAnyConfirming && <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">{row.fellowship ?? <span className="text-gray-300">—</span>}</td>}
                    {!isAnyConfirming && <td className="text-right px-3 py-2 text-gray-500 font-mono whitespace-nowrap">{fmtTime(row.checkInTime)}</td>}
                    {showDeleteCol && (
                      <td className="px-2 py-1.5 text-right">
                        {!isAnyConfirming && (row.type === "member" || row.type === "visitor") && canUnregister ? (
                          <button
                            onClick={() => setConfirmMemberId(row.memberId)}
                            title="Unregister this member"
                            className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
                          ><Trash2 className="w-3.5 h-3.5" /></button>
                        ) : !isAnyConfirming && isCT && canDeleteCT ? (
                          <button
                            disabled={isCtDeleting}
                            onClick={() => setConfirmCtKey(ctKey)}
                            title={`Remove this ${row.type} from service`}
                            className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors disabled:opacity-40"
                          >{isCtDeleting ? <span className="text-[10px]">…</span> : <Trash2 className="w-3.5 h-3.5" />}</button>
                        ) : !isAnyConfirming && isFT && canDeleteFT ? (
                          <button
                            disabled={isFtDeleting}
                            onClick={() => setConfirmFtId(row.ftId)}
                            title="Remove this first timer entry"
                            className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors disabled:opacity-40"
                          >{isFtDeleting ? <span className="text-[10px]">…</span> : <Trash2 className="w-3.5 h-3.5" />}</button>
                        ) : null}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</Button>
          <span className="text-xs text-gray-500">Page {page} / {totalPages}</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</Button>
        </div>
      )}
    </div>
  );
}

// ─── FellowshipSummaryTable (Services view) ───────────────────────────────────

function FellowshipSummaryTable({ attendanceData, loading, onExport, myCellName, leaderScope, isChildrenAdmin }: { attendanceData: any; loading?: boolean; onExport?: () => void; myCellName?: string | null; leaderScope?: { type: "cell" | "sc" | "pcf"; name: string }; isChildrenAdmin?: boolean }) {
  const [selectedFellowship, setSelectedFellowship] = useState<any>(null);
  const [selectedScope, setSelectedScope] = useState<{ name: string; memberList: any[]; returningList?: any[] } | null>(null);
  const [childrenTeensDialog, setChildrenTeensDialog] = useState<{ type: "children" | "teens"; list: any[]; ftList: any[] } | null>(null);
  const [childrenTeensPage, setChildrenTeensPage] = useState(1);
  const [expandedPcfs, setExpandedPcfs] = useState<Set<string>>(() => leaderScope?.type === "pcf" ? new Set([leaderScope.name]) : new Set());
  const [expandedScs, setExpandedScs] = useState<Set<string>>(() => leaderScope?.type === "sc" ? new Set([`standalone|${leaderScope.name}`]) : new Set());

  function togglePcf(name: string) {
    setExpandedPcfs(s => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });
  }
  function toggleSc(key: string) {
    setExpandedScs(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  const childrenCount = (attendanceData?.childrenList ?? []).length;
  const teensCount = (attendanceData?.teensList ?? []).length;

  const { ftByCell, unassignedFT, unassignedFTList, unassignedReturning, unassignedReturnList, visitorList, childrenFT, teensFT, childrenFTList, teensFTList, allFTByCell, returningByCell } = useMemo(() => {
    const ftByCell = new Map<string, number>();
    const allFTByCell = new Map<string, any[]>();
    const returningByCell = new Map<string, any[]>();
    let unassignedFT = 0;
    let unassignedReturning = 0;
    const unassignedReturnList: any[] = [];
    let childrenFT = 0;
    let teensFT = 0;
    const childrenFTList: any[] = [];
    const teensFTList: any[] = [];
    const unassignedFTList: any[] = [];
    const visitorList: any[] = [];
    for (const row of attendanceData?.attendeeList ?? []) {
      if (row.type === "first_timer") {
        if (row.fellowship === "Children's") {
          childrenFT++;
          childrenFTList.push(row);
        } else if (row.fellowship === "Teens") {
          teensFT++;
          teensFTList.push(row);
        } else if (row.fellowship) {
          ftByCell.set(row.fellowship, (ftByCell.get(row.fellowship) ?? 0) + 1);
          const arr = allFTByCell.get(row.fellowship) ?? [];
          allFTByCell.set(row.fellowship, [...arr, row]);
        } else {
          unassignedFT++;
          unassignedFTList.push(row);
        }
      } else if (row.type === "returning_first_timer") {
        if (row.fellowship === "Children's") {
          childrenFTList.push(row);
        } else if (row.fellowship === "Teens") {
          teensFTList.push(row);
        } else if (row.fellowship) {
          const arr = returningByCell.get(row.fellowship) ?? [];
          returningByCell.set(row.fellowship, [...arr, row]);
        } else {
          unassignedReturning++;
          unassignedReturnList.push(row);
        }
      } else if (row.type === "visitor") {
        visitorList.push(row);
      }
    }
    return { ftByCell, unassignedFT, unassignedFTList, unassignedReturning, unassignedReturnList, visitorList, childrenFT, teensFT, childrenFTList, teensFTList, allFTByCell, returningByCell };
  }, [attendanceData]);

  const { groups, totalMembers, totalFT } = useMemo(() => {
    let totalFT = 0;
    for (const row of attendanceData?.attendeeList ?? []) {
      if (row.type === "first_timer") totalFT++;
    }
    const result: any[] = [];

    for (const pcf of attendanceData?.hierarchy ?? []) {
      let pcfMembers = 0, pcfFT = 0;
      const scs: any[] = [];
      for (const sc of pcf.seniorCells ?? []) {
        let scMembers = 0, scFT = 0;
        const cells: any[] = [];
        for (const cell of sc.cells ?? []) {
          const ft = ftByCell.get(cell.name) ?? 0;
          const returning = returningByCell.get(cell.name) ?? [];
          scMembers += cell.checkedIn + returning.length; scFT += ft;
          cells.push({
            type: "cell", id: cell.id, name: cell.name,
            members: cell.checkedIn + returning.length, ft, total: cell.checkedIn + returning.length + ft,
            memberList: cell.members ?? [],
            returningList: returning,
            ftList: allFTByCell.get(cell.name) ?? [],
          });
        }
        cells.sort((a, b) => b.members - a.members || b.total - a.total);
        pcfMembers += scMembers; pcfFT += scFT;
        const allMembersForSC = cells.flatMap((c: any) => (c.memberList ?? []).map((m: any) => ({ ...m, cellName: c.name })));
        const allReturningForSC = cells.flatMap((c: any) => (c.returningList ?? []).map((r: any) => ({ ...r, cellName: c.name })));
        scs.push({ name: sc.name, members: scMembers, ft: scFT, total: scMembers + scFT, cells, allMemberList: allMembersForSC, allReturningList: allReturningForSC });
      }
      scs.sort((a, b) => b.members - a.members || b.total - a.total);
      const allMembersForPCF = scs.flatMap((s: any) => (s.allMemberList ?? []).map((m: any) => ({ ...m, scName: s.name })));
      const allReturningForPCF = scs.flatMap((s: any) => (s.allReturningList ?? []).map((r: any) => ({ ...r, scName: s.name })));
      result.push({ type: "pcf", name: pcf.name, members: pcfMembers, ft: pcfFT, total: pcfMembers + pcfFT, seniorCells: scs, allMemberList: allMembersForPCF, allReturningList: allReturningForPCF });
    }

    for (const sc of attendanceData?.standaloneSeniorCells ?? []) {
      let scMembers = 0, scFT = 0;
      const cells: any[] = [];
      for (const cell of sc.cells ?? []) {
        const ft = ftByCell.get(cell.name) ?? 0;
        const returning = returningByCell.get(cell.name) ?? [];
        scMembers += cell.checkedIn + returning.length; scFT += ft;
        cells.push({
          type: "cell", id: cell.id, name: cell.name,
          members: cell.checkedIn + returning.length, ft, total: cell.checkedIn + returning.length + ft,
          memberList: cell.members ?? [],
          returningList: returning,
          ftList: allFTByCell.get(cell.name) ?? [],
        });
      }
      cells.sort((a, b) => b.members - a.members || b.total - a.total);
      const allMembersForSC = cells.flatMap((c: any) => (c.memberList ?? []).map((m: any) => ({ ...m, cellName: c.name })));
      const allReturningForSC = cells.flatMap((c: any) => (c.returningList ?? []).map((r: any) => ({ ...r, cellName: c.name })));
      result.push({ type: "sc", name: sc.name, members: scMembers, ft: scFT, total: scMembers + scFT, cells, allMemberList: allMembersForSC, allReturningList: allReturningForSC });
    }

    for (const cell of attendanceData?.standaloneGroups ?? []) {
      const ft = ftByCell.get(cell.name) ?? 0;
      const returning = returningByCell.get(cell.name) ?? [];
      result.push({
        type: "cell", id: cell.id, name: cell.name,
        members: cell.checkedIn + returning.length, ft, total: cell.checkedIn + returning.length + ft,
        memberList: cell.members ?? [],
        returningList: returning,
        ftList: allFTByCell.get(cell.name) ?? [],
      });
    }

    result.sort((a, b) => b.members - a.members || b.total - a.total);
    const totalMembers = result.reduce((a, g) => a + g.members, 0);
    return { groups: result, totalMembers, totalFT };
  }, [attendanceData, ftByCell, allFTByCell, returningByCell]);

  const grandTotal = totalMembers + totalFT;

  const displayGroups = useMemo(() => {
    if (!leaderScope) return groups;
    switch (leaderScope.type) {
      case "pcf":
        return groups.filter((g: any) => g.type === "pcf" && g.name === leaderScope.name);
      case "sc": {
        const standalone = groups.find((g: any) => g.type === "sc" && g.name === leaderScope.name);
        if (standalone) return [standalone];
        for (const g of groups) {
          if (g.type === "pcf") {
            const sc = (g.seniorCells ?? []).find((s: any) => s.name === leaderScope.name);
            if (sc) return [{ type: "sc", name: sc.name, members: sc.members, ft: sc.ft, total: sc.total, cells: sc.cells, allMemberList: sc.allMemberList, allReturningList: sc.allReturningList }];
          }
        }
        return [];
      }
      case "cell": {
        const standaloneCell = groups.find((g: any) => g.type === "cell" && g.name === leaderScope.name);
        if (standaloneCell) return [standaloneCell];
        for (const g of groups) {
          if (g.type === "sc") {
            const cell = (g.cells ?? []).find((c: any) => c.name === leaderScope.name);
            if (cell) return [{ ...cell, type: "cell" }];
          }
          if (g.type === "pcf") {
            for (const sc of g.seniorCells ?? []) {
              const cell = (sc.cells ?? []).find((c: any) => c.name === leaderScope.name);
              if (cell) return [{ ...cell, type: "cell" }];
            }
          }
        }
        return [];
      }
      default: return groups;
    }
  }, [groups, leaderScope]);

  if (loading) return (
    <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
  );
  if (!attendanceData || (leaderScope ? displayGroups.length === 0 : groups.length === 0)) return (
    <p className="text-center text-sm text-gray-400 py-6">No fellowship data available</p>
  );

  const PCF_BG = "white";

  return (
    <>
      <div className="rounded-xl border overflow-hidden bg-white shadow-sm">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <span className="font-semibold text-sm text-gray-700 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-gray-500" /> Fellowship Attendance Summary
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              {leaderScope
                ? `${displayGroups.reduce((a, g: any) => a + g.members, 0)}M · ${displayGroups.reduce((a, g: any) => a + g.ft, 0)}FT · ${displayGroups.reduce((a, g: any) => a + g.total, 0)} total`
                : `${totalMembers + unassignedReturning}M · ${totalFT}FT · ${childrenCount + teensCount} Ch/Tn · ${grandTotal + unassignedReturning + childrenCount + teensCount} total`}
            </span>
            {onExport && (
              <Button size="sm" variant="outline" className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50" onClick={onExport}>
                <Download className="w-3 h-3 mr-1" /> Export
              </Button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <th className="text-left px-3 py-2 w-7">#</th>
                <th className="text-left px-3 py-2">Fellowship</th>
                <th className="text-right px-3 py-2 w-20">Members</th>
                <th className="text-right px-3 py-2 w-12">FT</th>
                <th className="text-right px-3 py-2 w-16">Total</th>
              </tr>
            </thead>
            <tbody>
              {!isChildrenAdmin && displayGroups.map((group, gi) => {
                if (group.type === "pcf") {
                  const pcfExpanded = expandedPcfs.has(group.name);
                  return (
                    <Fragment key={`pcf-${gi}`}>
                      <tr className="border-b cursor-pointer hover:bg-gray-50 font-bold text-gray-900 select-none bg-white"
                        onClick={() => togglePcf(group.name)}>
                        <td className="px-3 py-2.5 text-center text-xs text-gray-500">{gi + 1}</td>
                        <td className="px-3 py-2.5 text-sm">
                          <span className="flex items-center gap-1.5">
                            {pcfExpanded ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
                            {group.name}
                          </span>
                        </td>
                        <td className="text-right px-3 py-2.5 text-sm bg-violet-50 text-violet-700">
                          <button className="hover:underline font-bold" onClick={e => { e.stopPropagation(); setSelectedScope({ name: group.name, memberList: group.allMemberList ?? [], returningList: group.allReturningList ?? [] }); }}>
                            {group.members}
                          </button>
                        </td>
                        <td className="text-right px-3 py-2.5 text-sm bg-yellow-50 text-yellow-700">{group.ft}</td>
                        <td className="text-right px-3 py-2.5 text-sm bg-green-50 text-green-800 font-bold">{group.total}</td>
                      </tr>
                      {pcfExpanded && (group.seniorCells ?? []).map((sc: any, si: number) => {
                        const scKey = `${group.name}|${sc.name}`;
                        const scExpanded = expandedScs.has(scKey);
                        return (
                          <Fragment key={`sc-${si}`}>
                            <tr className="border-b border-gray-200 bg-gray-50 cursor-pointer hover:bg-gray-100 select-none"
                              onClick={() => toggleSc(scKey)}>
                              <td className="px-3 py-2" />
                              <td className="px-3 py-2 pl-6 text-gray-700 text-xs font-semibold">
                                <span className="flex items-center gap-1">
                                  {scExpanded ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                                  {sc.name}
                                </span>
                              </td>
                              <td className="text-right px-3 py-2 bg-violet-50 text-violet-700 text-xs font-bold">
                                <button className="hover:underline" onClick={e => { e.stopPropagation(); setSelectedScope({ name: sc.name, memberList: sc.allMemberList ?? [], returningList: sc.allReturningList ?? [] }); }}>
                                  {sc.members}
                                </button>
                              </td>
                              <td className="text-right px-3 py-2 bg-yellow-50 text-yellow-700 text-xs font-bold">{sc.ft}</td>
                              <td className="text-right px-3 py-2 bg-green-50 text-green-800 text-xs font-bold">{sc.total}</td>
                            </tr>
                            {scExpanded && (sc.cells ?? []).map((cell: any, ci: number) => {
                              const isMyCell = myCellName && cell.name === myCellName;
                              return (
                                <tr key={`${cell.name}-${ci}`}
                                  className={`border-b cursor-pointer active:bg-purple-100 ${isMyCell ? "bg-purple-50 border-purple-200 hover:bg-purple-100" : "border-gray-100 hover:bg-gray-50"}`}
                                  onClick={() => setSelectedFellowship(cell)}>
                                  <td className="px-3 py-1.5" />
                                  <td className="px-3 py-1.5 pl-12 text-xs">
                                    <span className={isMyCell ? "text-purple-800 font-semibold" : "text-gray-700"}>{cell.name}</span>
                                    {isMyCell && <span className="ml-2 text-[10px] bg-purple-200 text-purple-800 rounded-full px-1.5 py-0.5 font-bold">My Cell</span>}
                                  </td>
                                  <td className="text-right px-3 py-1.5 bg-violet-50 text-violet-700 text-xs font-semibold">{cell.members}</td>
                                  <td className="text-right px-3 py-1.5 bg-yellow-50 text-yellow-600 text-xs">{cell.ft}</td>
                                  <td className="text-right px-3 py-1.5 bg-green-50 text-green-700 text-xs font-semibold">{cell.total}</td>
                                </tr>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                } else if (group.type === "sc") {
                  const scKey = `standalone|${group.name}`;
                  const scExpanded = expandedScs.has(scKey);
                  return (
                    <Fragment key={`sc-top-${gi}`}>
                      <tr className="border-b cursor-pointer hover:bg-gray-50 font-bold text-gray-900 select-none bg-white"
                        onClick={() => toggleSc(scKey)}>
                        <td className="px-3 py-2.5 text-center text-xs text-gray-500">{gi + 1}</td>
                        <td className="px-3 py-2.5 text-sm">
                          <span className="flex items-center gap-1.5">
                            {scExpanded ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
                            {group.name}
                          </span>
                        </td>
                        <td className="text-right px-3 py-2.5 text-sm bg-violet-50 text-violet-700">
                          <button className="hover:underline font-bold" onClick={e => { e.stopPropagation(); setSelectedScope({ name: group.name, memberList: group.allMemberList ?? [], returningList: group.allReturningList ?? [] }); }}>
                            {group.members}
                          </button>
                        </td>
                        <td className="text-right px-3 py-2.5 text-sm bg-yellow-50 text-yellow-700">{group.ft}</td>
                        <td className="text-right px-3 py-2.5 text-sm bg-green-50 text-green-800 font-bold">{group.total}</td>
                      </tr>
                      {scExpanded && (group.cells ?? []).map((cell: any, ci: number) => {
                        const isMyCell = myCellName && cell.name === myCellName;
                        return (
                          <tr key={`${cell.name}-${ci}`}
                            className={`border-b cursor-pointer active:bg-purple-100 ${isMyCell ? "bg-purple-50 border-purple-200 hover:bg-purple-100" : "border-gray-100 hover:bg-gray-50"}`}
                            onClick={() => setSelectedFellowship(cell)}>
                            <td className="px-3 py-1.5" />
                            <td className="px-3 py-1.5 pl-8 text-xs">
                              <span className={isMyCell ? "text-purple-800 font-semibold" : "text-gray-700"}>{cell.name}</span>
                              {isMyCell && <span className="ml-2 text-[10px] bg-purple-200 text-purple-800 rounded-full px-1.5 py-0.5 font-bold">My Cell</span>}
                            </td>
                            <td className="text-right px-3 py-1.5 bg-violet-50 text-violet-700 text-xs font-semibold">{cell.members}</td>
                            <td className="text-right px-3 py-1.5 bg-yellow-50 text-yellow-600 text-xs">{cell.ft}</td>
                            <td className="text-right px-3 py-1.5 bg-green-50 text-green-700 text-xs font-semibold">{cell.total}</td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                } else {
                  const isMyCell = myCellName && group.name === myCellName;
                  return (
                    <Fragment key={`cell-${gi}`}>
                      <tr className={`border-b cursor-pointer hover:bg-gray-50 font-bold select-none ${isMyCell ? "bg-purple-50 text-purple-900" : "bg-white text-gray-900"}`}
                        onClick={() => setSelectedFellowship(group)}>
                        <td className="px-3 py-2.5 text-center text-xs text-gray-500">{gi + 1}</td>
                        <td className="px-3 py-2.5 text-sm">
                          {group.name}
                          {isMyCell && <span className="ml-2 text-[10px] bg-purple-200 text-purple-800 rounded-full px-1.5 py-0.5 font-bold">My Cell</span>}
                        </td>
                        <td className="text-right px-3 py-2.5 text-sm bg-violet-50 text-violet-700">{group.members}</td>
                        <td className="text-right px-3 py-2.5 text-sm bg-yellow-50 text-yellow-700">{group.ft}</td>
                        <td className="text-right px-3 py-2.5 text-sm bg-green-50 text-green-800 font-bold">{group.total}</td>
                      </tr>
                    </Fragment>
                  );
                }
              })}
              {(!leaderScope || isChildrenAdmin) && (childrenCount > 0 || childrenFT > 0) && (
                <tr className="border-b border-blue-100 bg-blue-50 cursor-pointer hover:bg-blue-100" onClick={() => { setChildrenTeensDialog({ type: "children", list: attendanceData?.childrenList ?? [], ftList: childrenFTList }); setChildrenTeensPage(1); }}>
                  <td className="px-3 py-2 text-blue-400 text-xs text-center font-bold">—</td>
                  <td className="px-3 py-2 text-blue-800 text-xs font-semibold">👶 Children's Church</td>
                  <td className="text-right px-3 py-2 text-blue-700 text-xs font-bold">{childrenCount}</td>
                  <td className="text-right px-3 py-2 text-xs font-bold">{childrenFT > 0 ? <span className="text-yellow-600">{childrenFT}</span> : <span className="text-blue-400">—</span>}</td>
                  <td className="text-right px-3 py-2 bg-green-50 text-green-700 text-xs font-bold">{childrenCount + childrenFT}</td>
                </tr>
              )}
              {(!leaderScope || isChildrenAdmin) && (teensCount > 0 || teensFT > 0) && (
                <tr className="border-b border-teal-100 bg-teal-50 cursor-pointer hover:bg-teal-100" onClick={() => { setChildrenTeensDialog({ type: "teens", list: attendanceData?.teensList ?? [], ftList: teensFTList }); setChildrenTeensPage(1); }}>
                  <td className="px-3 py-2 text-teal-400 text-xs text-center font-bold">—</td>
                  <td className="px-3 py-2 text-teal-800 text-xs font-semibold">😊 Teens Church</td>
                  <td className="text-right px-3 py-2 text-teal-700 text-xs font-bold">{teensCount}</td>
                  <td className="text-right px-3 py-2 text-xs font-bold">{teensFT > 0 ? <span className="text-yellow-600">{teensFT}</span> : <span className="text-teal-400">—</span>}</td>
                  <td className="text-right px-3 py-2 bg-green-50 text-green-700 text-xs font-bold">{teensCount + teensFT}</td>
                </tr>
              )}
              {!leaderScope && !isChildrenAdmin && (
                <tr className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-400 text-xs">—</td>
                  <td className="px-3 py-2 text-xs text-gray-500 italic">No Fellowship</td>
                  <td className="text-right px-3 py-2 text-xs bg-violet-50 text-violet-600 font-semibold">
                    {(unassignedReturning + visitorList.length) > 0 ? (
                      <button
                        className="hover:underline font-bold"
                        onClick={() => setSelectedFellowship({
                          name: "No Fellowship",
                          memberList: visitorList.map((v: any) => ({ ...v, checkedIn: true, memberName: v.name })),
                          returningList: unassignedReturnList,
                          ftList: [],
                          ft: 0,
                        })}
                      >
                        {unassignedReturning + visitorList.length}
                      </button>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="text-right px-3 py-2 text-xs bg-yellow-50 text-yellow-600 font-semibold">
                    {unassignedFT > 0 ? (
                      <button
                        className="hover:underline font-bold"
                        onClick={() => setSelectedFellowship({
                          name: "No Fellowship — Uninvited First Timers",
                          memberList: [],
                          returningList: [],
                          ftList: unassignedFTList,
                          ft: unassignedFT,
                        })}
                      >
                        {unassignedFT}
                      </button>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="text-right px-3 py-2 text-xs bg-green-50 text-green-700 font-semibold">
                    {(unassignedReturning + visitorList.length + unassignedFT) > 0 ? unassignedReturning + visitorList.length + unassignedFT : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              )}
              <tr className="border-t-2 border-gray-400 bg-gray-100 font-bold text-xs">
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5 text-gray-800 uppercase tracking-wide">Grand Total</td>
                <td className="text-right px-3 py-2.5 bg-violet-100 text-violet-800">
                  {isChildrenAdmin ? childrenCount + teensCount : totalMembers + unassignedReturning + visitorList.length + childrenCount + teensCount}
                </td>
                <td className="text-right px-3 py-2.5 bg-yellow-100 text-yellow-700">
                  {isChildrenAdmin ? childrenFT + teensFT : totalFT}
                </td>
                <td className="text-right px-3 py-2.5 bg-green-100 text-green-900">
                  {isChildrenAdmin ? childrenCount + teensCount + childrenFT + teensFT : totalMembers + unassignedReturning + visitorList.length + childrenCount + teensCount + totalFT}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {selectedFellowship && (
        <Dialog open={true} onOpenChange={() => setSelectedFellowship(null)}>
          <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-600" /> {selectedFellowship.name}
              </DialogTitle>
            </DialogHeader>
            <div className="flex gap-3 text-sm pb-3 border-b flex-wrap">
              <span><span className="font-bold text-green-700">{(selectedFellowship.memberList ?? []).filter((m: any) => m.checkedIn).length}</span> <span className="text-gray-500">present</span></span>
              <span><span className="font-bold text-red-600">{(selectedFellowship.memberList ?? []).filter((m: any) => !m.checkedIn).length}</span> <span className="text-gray-500">absent</span></span>
              {(selectedFellowship.returningList ?? []).length > 0 && <span><span className="font-bold text-orange-600">{(selectedFellowship.returningList ?? []).length}</span> <span className="text-gray-500">returning FT</span></span>}
              <span><span className="font-bold text-yellow-600">{selectedFellowship.ft}</span> <span className="text-gray-500">first timers</span></span>
            </div>
            <div className="overflow-y-auto flex-1 space-y-1 pr-1">
              {[...(selectedFellowship.memberList ?? [])].sort((a: any, b: any) => (b.checkedIn ? 1 : 0) - (a.checkedIn ? 1 : 0)).map((m: any, i: number) => (
                <div key={m.memberId} className={`flex items-center gap-2 px-2 py-1.5 rounded ${m.checkedIn ? "hover:bg-green-50" : "hover:bg-red-50 opacity-60"}`}>
                  <span className="text-xs text-gray-400 w-5 flex-shrink-0">{i + 1}</span>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden ${m.checkedIn ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-400"}`}>
                    {m.profilePhoto ? <img src={m.profilePhoto} alt="" className="w-full h-full object-cover" /> : (m.memberName?.[0] ?? "?")}
                  </div>
                  <span className={`text-sm font-medium flex-1 min-w-0 truncate ${m.checkedIn ? "text-gray-800" : "text-gray-400"}`}>{m.memberName}</span>
                  {m.checkedIn && <span className="text-xs text-gray-400 flex-shrink-0">{fmtTime(m.checkInTime)}</span>}
                  {m.checkedIn
                    ? <Badge className="bg-green-100 text-green-700 border-0 text-[10px] flex-shrink-0">Present</Badge>
                    : <Badge className="bg-red-100 text-red-600 border-0 text-[10px] flex-shrink-0">Absent</Badge>}
                </div>
              ))}
              {(selectedFellowship.returningList ?? []).map((rt: any, i: number) => (
                <div key={`rt-${i}`} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-orange-50">
                  <span className="text-xs text-gray-400 w-5 flex-shrink-0">{(selectedFellowship.memberList?.length ?? 0) + i + 1}</span>
                  <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 text-xs font-bold flex-shrink-0">{rt.name?.[0] ?? "?"}</div>
                  <span className="text-sm font-medium text-gray-800 flex-1 min-w-0 truncate">{rt.name}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{fmtTime(rt.checkInTime)}</span>
                  <Badge className="bg-orange-100 text-orange-700 border-0 text-[10px] flex-shrink-0">Returning FT</Badge>
                </div>
              ))}
              {(selectedFellowship.ftList ?? []).map((ft: any, i: number) => (
                <div key={`ft-${i}`} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-yellow-50">
                  <span className="text-xs text-gray-400 w-5 flex-shrink-0">{(selectedFellowship.memberList?.length ?? 0) + (selectedFellowship.returningList?.length ?? 0) + i + 1}</span>
                  <div className="w-7 h-7 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-700 text-xs font-bold flex-shrink-0">{ft.name?.[0] ?? "?"}</div>
                  <span className="text-sm font-medium text-gray-800 flex-1 min-w-0 truncate">{ft.name}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{fmtTime(ft.checkInTime)}</span>
                  <Badge className="bg-yellow-100 text-yellow-700 border-0 text-[10px] flex-shrink-0">FT</Badge>
                </div>
              ))}
              {(selectedFellowship.memberList ?? []).length === 0 && (selectedFellowship.returningList ?? []).length === 0 && (selectedFellowship.ftList ?? []).length === 0 && (
                <p className="text-center text-sm text-gray-400 py-6">No registrations from this fellowship yet</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {selectedScope && (
        <Dialog open={true} onOpenChange={() => setSelectedScope(null)}>
          <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-600" /> {selectedScope.name}
              </DialogTitle>
            </DialogHeader>
            <div className="flex gap-3 text-sm pb-3 border-b flex-wrap">
              <span><span className="font-bold text-green-700">{(selectedScope.memberList ?? []).filter((m: any) => m.checkedIn).length}</span> <span className="text-gray-500">present</span></span>
              <span><span className="font-bold text-red-600">{(selectedScope.memberList ?? []).filter((m: any) => !m.checkedIn).length}</span> <span className="text-gray-500">absent</span></span>
              {(selectedScope.returningList ?? []).length > 0 && <span><span className="font-bold text-orange-600">{(selectedScope.returningList ?? []).length}</span> <span className="text-gray-500">returning FT</span></span>}
              <span><span className="font-bold text-gray-700">{(selectedScope.memberList ?? []).length}</span> <span className="text-gray-500">total members</span></span>
            </div>
            <div className="overflow-y-auto flex-1 space-y-1 pr-1">
              {[...(selectedScope.memberList ?? [])].sort((a: any, b: any) => (b.checkedIn ? 1 : 0) - (a.checkedIn ? 1 : 0)).map((m: any, i: number) => (
                <div key={`${m.memberId}-${i}`} className={`flex items-center gap-2 px-2 py-1.5 rounded ${m.checkedIn ? "hover:bg-green-50" : "hover:bg-red-50 opacity-60"}`}>
                  <span className="text-xs text-gray-400 w-5 flex-shrink-0">{i + 1}</span>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden ${m.checkedIn ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-400"}`}>
                    {m.profilePhoto ? <img src={m.profilePhoto} alt="" className="w-full h-full object-cover" /> : (m.memberName?.[0] ?? "?")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${m.checkedIn ? "text-gray-800" : "text-gray-400"}`}>{m.memberName}</p>
                    {m.cellName && <p className="text-[10px] text-gray-400 truncate">{m.cellName}</p>}
                  </div>
                  {m.checkedIn && <span className="text-xs text-gray-400 flex-shrink-0">{fmtTime(m.checkInTime)}</span>}
                  {m.checkedIn
                    ? <Badge className="bg-green-100 text-green-700 border-0 text-[10px] flex-shrink-0">Present</Badge>
                    : <Badge className="bg-red-100 text-red-600 border-0 text-[10px] flex-shrink-0">Absent</Badge>}
                </div>
              ))}
              {(selectedScope.returningList ?? []).map((rt: any, i: number) => (
                <div key={`rt-${i}`} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-orange-50">
                  <span className="text-xs text-gray-400 w-5 flex-shrink-0">{(selectedScope.memberList?.length ?? 0) + i + 1}</span>
                  <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 text-xs font-bold flex-shrink-0">{rt.name?.[0] ?? "?"}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{rt.name}</p>
                    {rt.cellName && <p className="text-[10px] text-gray-400 truncate">{rt.cellName}</p>}
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{fmtTime(rt.checkInTime)}</span>
                  <Badge className="bg-orange-100 text-orange-700 border-0 text-[10px] flex-shrink-0">Returning FT</Badge>
                </div>
              ))}
              {(selectedScope.memberList ?? []).length === 0 && (selectedScope.returningList ?? []).length === 0 && (
                <p className="text-center text-sm text-gray-400 py-6">No members in this group yet</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {childrenTeensDialog && (() => {
        const ITEMS_PER_PAGE = 10;
        const totalPages = Math.ceil(childrenTeensDialog.list.length / ITEMS_PER_PAGE);
        const startIdx = (childrenTeensPage - 1) * ITEMS_PER_PAGE;
        const pageItems = childrenTeensDialog.list.slice(startIdx, startIdx + ITEMS_PER_PAGE);
        const isChildren = childrenTeensDialog.type === "children";
        return (
          <Dialog open={true} onOpenChange={() => setChildrenTeensDialog(null)}>
            <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {isChildren ? "👶" : "😊"} {isChildren ? "Children's Church" : "Teens Church"}
                </DialogTitle>
              </DialogHeader>
              <div className="flex gap-3 text-sm pb-2 border-b flex-wrap">
                <span><span className="font-bold">{childrenTeensDialog.list.length}</span> <span className="text-gray-500">registered</span></span>
                {childrenTeensDialog.ftList.length > 0 && <span><span className="font-bold text-yellow-600">{childrenTeensDialog.ftList.filter((f: any) => f.type === "first_timer").length}</span> <span className="text-gray-500">first timers invited</span></span>}
                {childrenTeensDialog.ftList.filter((f: any) => f.type === "returning_first_timer").length > 0 && <span><span className="font-bold text-orange-500">{childrenTeensDialog.ftList.filter((f: any) => f.type === "returning_first_timer").length}</span> <span className="text-gray-500">returning</span></span>}
              </div>
              <div className="overflow-y-auto flex-1 space-y-1 pr-1">
                {pageItems.map((item: any, i: number) => (
                  <div key={item.id ?? item.childId ?? item.teenId ?? i} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50">
                    <span className="text-xs text-gray-400 w-5 flex-shrink-0">{startIdx + i + 1}</span>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isChildren ? "bg-blue-100 text-blue-700" : "bg-teal-100 text-teal-700"}`}>
                      {(item.name ?? item.firstName ?? "?")?.[0] ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{item.name ?? `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim()}</p>
                      {item.class && <p className="text-[10px] text-gray-400 capitalize">{item.class.replace(/_/g, " ")}</p>}
                    </div>
                    {item.checkInTime && <span className="text-xs text-gray-400 flex-shrink-0">{fmtTime(item.checkInTime)}</span>}
                    <Badge className={`border-0 text-[10px] flex-shrink-0 ${isChildren ? "bg-blue-100 text-blue-700" : "bg-teal-100 text-teal-700"}`}>
                      {isChildren ? "Child" : "Teen"}
                    </Badge>
                  </div>
                ))}
                {childrenTeensDialog.ftList.length > 0 && (
                  <>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide pt-3 pb-1 px-2 border-t mt-2">First Timers Invited</p>
                    {childrenTeensDialog.ftList.map((ft: any, i: number) => (
                      <div key={`ft-${i}`} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-yellow-50">
                        <span className="text-xs text-gray-400 w-5 flex-shrink-0">{i + 1}</span>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${ft.type === "returning_first_timer" ? "bg-orange-100 text-orange-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {ft.name?.[0] ?? "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{ft.name}</p>
                          {ft.invitedByName && <p className="text-[10px] text-gray-400">Invited by {ft.invitedByName}</p>}
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0">{fmtTime(ft.checkInTime)}</span>
                        <Badge className={`border-0 text-[10px] flex-shrink-0 ${ft.type === "returning_first_timer" ? "bg-orange-100 text-orange-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {ft.type === "returning_first_timer" ? "Returning" : "FT"}
                        </Badge>
                      </div>
                    ))}
                  </>
                )}
                {pageItems.length === 0 && childrenTeensDialog.ftList.length === 0 && <p className="text-center text-sm text-gray-400 py-6">No registrations yet</p>}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t">
                  <button disabled={childrenTeensPage <= 1} onClick={() => setChildrenTeensPage(p => p - 1)} className="px-3 py-1.5 text-xs font-semibold rounded-lg border hover:bg-gray-50 disabled:opacity-40">← Prev</button>
                  <span className="text-xs text-gray-500">Page {childrenTeensPage} of {totalPages}</span>
                  <button disabled={childrenTeensPage >= totalPages} onClick={() => setChildrenTeensPage(p => p + 1)} className="px-3 py-1.5 text-xs font-semibold rounded-lg border hover:bg-gray-50 disabled:opacity-40">Next →</button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        );
      })()}
    </>
  );
}

// ─── RegisterPage ─────────────────────────────────────────────────────────────

function RegisterPage({
  serviceId, serviceName, onBack, queryClient,
}: { serviceId: number; serviceName: string; onBack: () => void; queryClient: any }) {
  const { user } = useAuth();
  const myCellName = ((user as any)?.roleLevel ?? 5) <= 3 ? null : ((user as any)?.leadsCellName ?? null);

  // Fellowship scope filter for member search (leaders see only their hierarchy)
  const isLeaderUser = (user as any)?.roleLevel === 4;
  const leaderFellowshipSuffix = isLeaderUser
    ? ((user as any)?.leadsPcfId ? `&pcfId=${(user as any).leadsPcfId}`
      : (user as any)?.leadsSeniorCellId ? `&seniorCellId=${(user as any).leadsSeniorCellId}`
      : (user as any)?.leadsCellId ? `&cellId=${(user as any).leadsCellId}`
      : "")
    : "";

  const { data: attendanceData } = useGetServiceAttendance(serviceId, { refetchInterval: 5000 });
  const totalCount = (attendanceData?.attendeeList ?? []).length;
  const memberCount = (attendanceData?.attendeeList ?? []).filter((r: any) => r.type === "member" || r.type === "visitor" || r.type === "returning_first_timer").length;
  const ftCount = (attendanceData?.attendeeList ?? []).filter((r: any) => r.type === "first_timer").length;

  // For leaders: compute the set of cell names within their scope (cell/SC/PCF)
  const leaderCellNames = useMemo<Set<string> | null>(() => {
    if (!isLeaderUser) return null;
    const leadsCellName   = (user as any)?.leadsCellName;
    const leadsSCId       = (user as any)?.leadsSeniorCellId;
    const leadsPcfId      = (user as any)?.leadsPcfId;
    if (leadsCellName) return new Set([leadsCellName]);
    if (leadsSCId) {
      const allSCs = [
        ...(attendanceData?.standaloneSeniorCells ?? []),
        ...(attendanceData?.hierarchy ?? []).flatMap((p: any) => p.seniorCells ?? []),
      ];
      const mySC = allSCs.find((sc: any) => sc.id === leadsSCId);
      if (mySC) return new Set((mySC.cells ?? []).map((c: any) => c.name));
    }
    if (leadsPcfId) {
      const myPCF = (attendanceData?.hierarchy ?? []).find((p: any) => p.id === leadsPcfId);
      if (myPCF) {
        const names = new Set<string>();
        for (const sc of myPCF.seniorCells ?? []) for (const cell of sc.cells ?? []) names.add(cell.name);
        return names;
      }
    }
    return new Set(); // leader with no identifiable scope sees nothing
  }, [isLeaderUser, user, attendanceData]);

  const myFellowshipStats = useMemo(() => {
    if (!myCellName) return null;
    const all: any[] = attendanceData?.attendeeList ?? [];
    const mine = all.filter((r: any) => r.fellowship === myCellName);
    const members = mine.filter((r: any) => r.type === "member").length;
    const ft = mine.filter((r: any) => r.type === "first_timer").length;
    const allCellData = [
      ...(attendanceData?.hierarchy ?? []).flatMap((p: any) => p.seniorCells?.flatMap((s: any) => s.cells ?? []) ?? []),
      ...(attendanceData?.standaloneSeniorCells ?? []).flatMap((s: any) => s.cells ?? []),
      ...(attendanceData?.standaloneGroups ?? []),
    ];
    const cellData = allCellData.find((c: any) => c.name === myCellName);
    return { members, ft, total: members + ft, totalMembers: cellData?.total ?? 0 };
  }, [attendanceData, myCellName]);

  const isChildrenAdmin = (user as any)?.roleSubtype === "children";
  const [tab, setTab] = useState<RegTab>(() => isChildrenAdmin ? "child" : "search");
  const [lastResult, setLastResult] = useState<RegResult>(null);
  const [submitting, setSubmitting] = useState(false);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Name search
  const [searchQuery, setSearchQuery] = useState("");
  const [memberResults, setMemberResults] = useState<any[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);

  // ID + QR
  const [idInput, setIdInput] = useState("");
  const [qrInput, setQrInput] = useState("");

  // Children/Teens
  const [childSearch, setChildSearch] = useState("");
  const [childResults, setChildResults] = useState<any[]>([]);
  const [teenSearch, setTeenSearch] = useState("");
  const [teenResults, setTeenResults] = useState<any[]>([]);

  // First Timer form
  const [inviterType, setInviterType] = useState<"member" | "child" | "teen" | "first_timer">("member");
  const [invitedBy, setInvitedBy] = useState<{ id: number; name: string; fellowship?: string; type?: "member" | "child" | "teen" | "first_timer"; effectiveInvitedById?: number | null; effectiveInvitedByChildId?: number | null; effectiveInvitedByTeenId?: number | null } | null>(null);
  const [inviterChildSearch, setInviterChildSearch] = useState("");
  const [inviterChildResults, setInviterChildResults] = useState<any[]>([]);
  const [inviterTeenSearch, setInviterTeenSearch] = useState("");
  const [inviterTeenResults, setInviterTeenResults] = useState<any[]>([]);
  const [inviterFtSearch, setInviterFtSearch] = useState("");
  const [inviterFtResults, setInviterFtResults] = useState<any[]>([]);
  const [ftForm, setFtForm] = useState({ firstName: "", lastName: "", gender: "", contact: "" });
  // Duplicate warning when registering a first timer
  const [ftDuplicateWarning, setFtDuplicateWarning] = useState<{ matches: any[]; pendingBody: any; prefilledInviterType?: "child" | "teen"; prefilledInviterId?: number; prefilledInviterName?: string } | null>(null);
  // Child/Teen FT invite prompt
  const [ftInviteFor, setFtInviteFor] = useState<{ name: string; id: number; type: "child" | "teen" } | null>(null);

  // Returning First Timer
  const [returningSearch, setReturningSearch] = useState("");
  const [returningResults, setReturningResults] = useState<any[]>([]);

  // Children/Teens modal (header badges)
  const [ctModal, setCtModal] = useState<{ type: "children" | "teens"; list: any[] } | null>(null);
  const [ctModalPage, setCtModalPage] = useState(1);
  const [deletingCtId, setDeletingCtId] = useState<number | null>(null);
  const [confirmCtModalKey, setConfirmCtModalKey] = useState<string | null>(null); // "child-{id}" | "teen-{id}"
  const canDeleteCT = isChildrenAdmin || (user as any)?.roleSubtype === "registration" || (user as any)?.roleLevel === 1;

  const showResult = useCallback((r: RegResult) => {
    setLastResult(r);
    if (resultTimer.current) clearTimeout(resultTimer.current);
    resultTimer.current = setTimeout(() => setLastResult(null), 7000);
  }, []);

  // Member search
  useEffect(() => {
    if (searchQuery.length < 2) { setMemberResults([]); return; }
    const t = setTimeout(async () => {
      setMemberSearching(true);
      try {
        const d = await apiFetch(`/api/members?search=${encodeURIComponent(searchQuery)}&limit=8${leaderFellowshipSuffix}`);
        setMemberResults(d.data ?? []);
      } catch { setMemberResults([]); } finally { setMemberSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Inviter child search (for FT form)
  useEffect(() => {
    if (inviterChildSearch.length < 2) { setInviterChildResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const d = await apiFetch(`/api/children?search=${encodeURIComponent(inviterChildSearch)}&limit=8`);
        setInviterChildResults(d.data ?? []);
      } catch { setInviterChildResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [inviterChildSearch]);

  // Inviter teen search (for FT form)
  useEffect(() => {
    if (inviterTeenSearch.length < 2) { setInviterTeenResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const d = await apiFetch(`/api/teens?search=${encodeURIComponent(inviterTeenSearch)}&limit=8`);
        setInviterTeenResults(d.data ?? []);
      } catch { setInviterTeenResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [inviterTeenSearch]);

  // Inviter first-timer search (for FT form)
  useEffect(() => {
    if (inviterFtSearch.length < 2) { setInviterFtResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const d = await apiFetch(`/api/first-timers?search=${encodeURIComponent(inviterFtSearch)}&limit=8`);
        setInviterFtResults(d.data ?? []);
      } catch { setInviterFtResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [inviterFtSearch]);

  // Child search
  useEffect(() => {
    if (childSearch.length < 2) { setChildResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const d = await apiFetch(`/api/children?search=${encodeURIComponent(childSearch)}&limit=8`);
        setChildResults(d.data ?? []);
      } catch { setChildResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [childSearch]);

  // Teen search
  useEffect(() => {
    if (teenSearch.length < 2) { setTeenResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const d = await apiFetch(`/api/teens?search=${encodeURIComponent(teenSearch)}&limit=8`);
        setTeenResults(d.data ?? []);
      } catch { setTeenResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [teenSearch]);

  // Returning FT search
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const q = returningSearch.length >= 2 ? `&search=${encodeURIComponent(returningSearch)}` : "";
        const d = await apiFetch(`/api/first-timers?limit=20${q}`);
        setReturningResults(d.data ?? []);
      } catch { setReturningResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [returningSearch, tab]);

  async function checkinMember(params: { memberId?: number; membershipId?: string }, method = "manual") {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/services/${serviceId}/checkin`, {
        method: "POST",
        body: JSON.stringify({ ...params, method }),
      });
      queryClient.invalidateQueries({ queryKey: getGetActiveServiceQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetServiceAttendanceQueryKey(serviceId) });
      const m = res.member;
      const name = m ? `${m.title ? m.title + " " : ""}${m.firstName} ${m.lastName}`.trim() : "Member";
      if (res.alreadyCheckedIn) {
        showResult({ type: "error", name, detail: `${name} has already been registered for this service` });
      } else {
        showResult({ type: "success", name, detail: m?.cellName ? `Cell: ${m.cellName}` : "Registered successfully" });
      }
      setIdInput(""); setQrInput(""); setSearchQuery("");
    } catch (e: any) {
      showResult({ type: "error", name: "Not found", detail: e.message });
    } finally { setSubmitting(false); }
  }

  async function registerChild(child: any) {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/services/${serviceId}/register-child`, {
        method: "POST",
        body: JSON.stringify({ childId: child.id }),
      });
      queryClient.invalidateQueries({ queryKey: getGetActiveServiceQueryKey() });
      const name = `${child.firstName} ${child.lastName}`;
      if (res.alreadyRegistered) {
        showResult({ type: "error", name, detail: `${name} has already been registered` });
      } else {
        showResult({ type: "success", name, detail: `Children's Church — ${(child.class ?? "").replace(/_/g, " ")}` });
        setFtInviteFor({ name, id: child.id, type: "child" });
      }
      setChildSearch("");
    } catch (e: any) {
      showResult({ type: "error", name: "Error", detail: e.message });
    } finally { setSubmitting(false); }
  }

  async function registerTeen(teen: any) {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/services/${serviceId}/register-teen`, {
        method: "POST",
        body: JSON.stringify({ teenId: teen.id }),
      });
      queryClient.invalidateQueries({ queryKey: getGetActiveServiceQueryKey() });
      const name = `${teen.firstName} ${teen.lastName}`;
      if (res.alreadyRegistered) {
        showResult({ type: "error", name, detail: `${name} has already been registered` });
      } else {
        showResult({ type: "success", name, detail: "Teens Church" });
        setFtInviteFor({ name, id: teen.id, type: "teen" });
      }
      setTeenSearch("");
    } catch (e: any) {
      showResult({ type: "error", name: "Error", detail: e.message });
    } finally { setSubmitting(false); }
  }

  async function submitFirstTimer(e: React.FormEvent, prefilledInviterType?: "child" | "teen", prefilledInviterId?: number, prefilledInviterName?: string) {
    e.preventDefault();
    setSubmitting(true);
    const effectiveInviterType = prefilledInviterType ?? inviterType;
    const effectiveInvitedBy = prefilledInviterId
      ? { id: prefilledInviterId, name: prefilledInviterName ?? "", type: prefilledInviterType }
      : invitedBy;
    try {
      const body: any = { ...ftForm, serviceId };
      if (effectiveInviterType === "member" && effectiveInvitedBy) body.invitedById = effectiveInvitedBy.id;
      if (effectiveInviterType === "child" && effectiveInvitedBy) body.invitedByChildId = effectiveInvitedBy.id;
      if (effectiveInviterType === "teen" && effectiveInvitedBy) body.invitedByTeenId = effectiveInvitedBy.id;
      if (effectiveInviterType === "first_timer" && effectiveInvitedBy) {
        if (effectiveInvitedBy.effectiveInvitedById) body.invitedById = effectiveInvitedBy.effectiveInvitedById;
        else if (effectiveInvitedBy.effectiveInvitedByChildId) body.invitedByChildId = effectiveInvitedBy.effectiveInvitedByChildId;
        else if (effectiveInvitedBy.effectiveInvitedByTeenId) body.invitedByTeenId = effectiveInvitedBy.effectiveInvitedByTeenId;
      }

      // Check for existing first timers with the same name before registering
      const checkResult = await apiFetch(
        `/api/first-timers/check-name?firstName=${encodeURIComponent(ftForm.firstName.trim())}&lastName=${encodeURIComponent(ftForm.lastName.trim())}`
      );
      if (checkResult.matches && checkResult.matches.length > 0) {
        // Pause and warn the admin
        setFtDuplicateWarning({ matches: checkResult.matches, pendingBody: body, prefilledInviterType, prefilledInviterId, prefilledInviterName });
        setSubmitting(false);
        return;
      }

      await doRegisterFT(body, effectiveInvitedBy);
    } catch (e: any) {
      showResult({ type: "error", name: "Error", detail: e.message });
    } finally { setSubmitting(false); }
  }

  async function doRegisterFT(body: any, effectiveInvitedBy?: any) {
    await apiFetch("/api/first-timers", { method: "POST", body: JSON.stringify(body) });
    queryClient.invalidateQueries({ queryKey: getGetActiveServiceQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetServiceAttendanceQueryKey(serviceId) });
    const name = `${body.firstName} ${body.lastName}`;
    const detail = effectiveInvitedBy ? `Invited by ${effectiveInvitedBy.name}` : "First timer registered";
    showResult({ type: "success", name, detail });
    setFtForm({ firstName: "", lastName: "", gender: "", contact: "" });
    setInvitedBy(null);
    setFtInviteFor(null);
  }

  async function removeChildFromService(childId: number) {
    setDeletingCtId(childId);
    try {
      await apiFetch(`/api/services/${serviceId}/register-child/${childId}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: getGetActiveServiceQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetServiceAttendanceQueryKey(serviceId) });
      setCtModal(prev => prev ? { ...prev, list: prev.list.filter((item: any) => item.childId !== childId) } : null);
    } catch (e: any) {
      showResult({ type: "error", name: "Error", detail: e.message });
    } finally { setDeletingCtId(null); }
  }

  async function removeTeenFromService(teenId: number) {
    setDeletingCtId(teenId);
    try {
      await apiFetch(`/api/services/${serviceId}/register-teen/${teenId}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: getGetActiveServiceQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetServiceAttendanceQueryKey(serviceId) });
      setCtModal(prev => prev ? { ...prev, list: prev.list.filter((item: any) => item.teenId !== teenId) } : null);
    } catch (e: any) {
      showResult({ type: "error", name: "Error", detail: e.message });
    } finally { setDeletingCtId(null); }
  }

  async function registerReturning(ft: any) {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/first-timers/${ft.id}/returning`, {
        method: "POST",
        body: JSON.stringify({ serviceId }),
      });
      queryClient.invalidateQueries({ queryKey: getGetActiveServiceQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetServiceAttendanceQueryKey(serviceId) });
      const name = `${ft.firstName} ${ft.lastName}`;
      if (res.alreadyRegistered) {
        showResult({ type: "error", name, detail: `${name} has already been registered for this service` });
      } else {
        const fellowship = ft.invitedByFellowship ? ` · ${ft.invitedByFellowship}` : "";
        showResult({ type: "success", name, detail: `Returning First Timer${fellowship}` });
      }
    } catch (e: any) {
      showResult({ type: "error", name: "Error", detail: e.message });
    } finally { setSubmitting(false); }
  }

  const allTabs: { key: RegTab; label: string }[] = [
    { key: "search", label: "🔍 Name" },
    { key: "id", label: "🪪 ID" },
    { key: "qr", label: "📷 QR" },
    { key: "firsttimer", label: "👋 First Timer" },
    { key: "returning", label: "🔄 Returning" },
    { key: "child", label: "👶 Child" },
    { key: "teen", label: "😊 Teen" },
  ];
  const tabs = isChildrenAdmin
    ? allTabs.filter(t => t.key === "child" || t.key === "teen")
    : allTabs;

  return (
    <>
    <div className="-m-4 md:-m-6 min-h-screen bg-gray-50">
      <div className="bg-purple-700 text-white px-5 py-4 shadow-md">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-lg leading-tight">Registration</h2>
            <p className="text-xs text-purple-200 truncate">{serviceName}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-2xl font-bold leading-none">{totalCount}</p>
            <p className="text-[10px] text-purple-200 uppercase tracking-wide mt-0.5">checked in</p>
          </div>
        </div>
        {totalCount > 0 && (
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-white/20">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-purple-300" />
              <span className="text-xs text-purple-100">{memberCount} member{memberCount !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-yellow-300" />
              <span className="text-xs text-purple-100">{ftCount} first timer{ftCount !== 1 ? "s" : ""}</span>
            </div>
            {(attendanceData?.childrenList ?? []).length > 0 && (
              <button className="flex items-center gap-1.5 hover:opacity-80" onClick={() => { setCtModal({ type: "children", list: attendanceData?.childrenList ?? [] }); setCtModalPage(1); }}>
                <div className="w-2 h-2 rounded-full bg-blue-300" />
                <span className="text-xs text-purple-100 underline underline-offset-2">{(attendanceData?.childrenList ?? []).length} child{(attendanceData?.childrenList ?? []).length !== 1 ? "ren" : ""}</span>
              </button>
            )}
            {(attendanceData?.teensList ?? []).length > 0 && (
              <button className="flex items-center gap-1.5 hover:opacity-80" onClick={() => { setCtModal({ type: "teens", list: attendanceData?.teensList ?? [] }); setCtModalPage(1); }}>
                <div className="w-2 h-2 rounded-full bg-teal-300" />
                <span className="text-xs text-purple-100 underline underline-offset-2">{(attendanceData?.teensList ?? []).length} teen{(attendanceData?.teensList ?? []).length !== 1 ? "s" : ""}</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-4">
        {/* Result feedback */}
        {lastResult && (
          <div className={`flex items-center gap-3 p-4 rounded-xl border-2 shadow-sm ${lastResult.type === "success" ? "bg-green-50 border-green-400" : "bg-red-50 border-red-400"}`}>
            {lastResult.type === "success"
              ? <CheckCircle2 className="w-9 h-9 text-green-500 flex-shrink-0" />
              : <XCircle className="w-9 h-9 text-red-500 flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className={`font-bold text-sm ${lastResult.type === "success" ? "text-green-800" : "text-red-800"}`}>{lastResult.name}</p>
              <p className={`text-xs mt-0.5 ${lastResult.type === "success" ? "text-green-600" : "text-red-600"}`}>{lastResult.detail}</p>
            </div>
            <button onClick={() => setLastResult(null)} className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all ${tab === t.key ? "bg-purple-700 text-white shadow" : "bg-white text-gray-500 border hover:bg-purple-50"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Name Search ─────────────────────────────────────── */}
        {tab === "search" && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input className="pl-9 bg-white" placeholder="Type member's name to search..."
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)} autoFocus />
            </div>
            {memberSearching && <p className="text-center text-xs text-gray-400 animate-pulse">Searching...</p>}
            {memberResults.length > 0 && (
              <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                {memberResults.map(m => (
                  <button key={m.id} type="button" disabled={submitting}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-purple-50 border-b last:border-0 text-left disabled:opacity-60"
                    onClick={() => checkinMember({ memberId: m.id }, "search")}>
                    <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-700 font-bold text-sm flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {m.profilePhoto ? <img src={m.profilePhoto} alt="" className="w-full h-full object-cover" /> : <span>{m.firstName?.[0]}{m.lastName?.[0]}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-800">{m.title ? `${m.title} ` : ""}{m.firstName} {m.lastName}</p>
                      <p className="text-xs text-gray-400 truncate">{m.membershipId}{m.cellName ? ` · ${m.cellName}` : ""}</p>
                    </div>
                    <span className="text-xs text-purple-600 font-semibold flex-shrink-0">Register →</span>
                  </button>
                ))}
              </div>
            )}
            {searchQuery.length >= 2 && !memberSearching && memberResults.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-6">No members found for "{searchQuery}"</p>
            )}
          </div>
        )}

        {/* ── Membership ID ──────────────────────────────────── */}
        {tab === "id" && (
          <form onSubmit={e => { e.preventDefault(); if (idInput.trim()) checkinMember({ membershipId: idInput.trim() }, "id"); }}
            className="space-y-4 bg-white border rounded-xl p-5 shadow-sm">
            <div className="space-y-1.5">
              <Label className="font-semibold">Enter Membership ID</Label>
              <Input value={idInput} onChange={e => setIdInput(e.target.value)} placeholder="e.g. CEK1-AB12C3..." autoFocus className="text-base" />
            </div>
            <Button type="submit" className="w-full bg-purple-700 hover:bg-purple-800 text-white h-11" disabled={!idInput.trim() || submitting}>
              {submitting ? "Registering..." : "Register Member"}
            </Button>
          </form>
        )}

        {/* ── QR Code ─────────────────────────────────────────── */}
        {tab === "qr" && (
          <div className="space-y-4 bg-white border rounded-xl p-5 shadow-sm">
            <div className="flex flex-col items-center gap-1 text-center">
              <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mb-1">
                <Scan className="w-7 h-7 text-purple-600" />
              </div>
              <p className="text-sm text-gray-700 font-semibold">Scan Member QR Code</p>
              <p className="text-xs text-gray-400">Point the camera at a member's QR code to register them instantly</p>
            </div>

            <CameraQRScanner
              active={tab === "qr"}
              onScan={async (val) => {
                try {
                  const res = await apiFetch(`/api/services/${serviceId}/checkin`, {
                    method: "POST",
                    body: JSON.stringify({ membershipId: val, method: "qr" }),
                  });
                  queryClient.invalidateQueries({ queryKey: getGetActiveServiceQueryKey() });
                  queryClient.invalidateQueries({ queryKey: getGetServiceAttendanceQueryKey(serviceId) });
                  const m = res.member;
                  const name = m ? `${m.title ? m.title + " " : ""}${m.firstName} ${m.lastName}`.trim() : "Member";
                  if (res.alreadyCheckedIn) {
                    showResult({ type: "error", name, detail: `${name} has already been registered for this service` });
                    return "duplicate";
                  } else {
                    showResult({ type: "success", name, detail: m?.cellName ? `Cell: ${m.cellName}` : "Registered successfully" });
                    return "success";
                  }
                } catch (err: any) {
                  showResult({ type: "error", name: "Not found", detail: err.message });
                  return "error";
                }
              }}
            />

          </div>
        )}

        {/* ── First Timer ──────────────────────────────────────── */}
        {tab === "firsttimer" && (
          <form onSubmit={submitFirstTimer} className="space-y-4 bg-white border rounded-xl p-5 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First Name <span className="text-red-400">*</span></Label>
                <Input value={ftForm.firstName} onChange={e => setFtForm(f => ({ ...f, firstName: e.target.value }))} required autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name <span className="text-red-400">*</span></Label>
                <Input value={ftForm.lastName} onChange={e => setFtForm(f => ({ ...f, lastName: e.target.value }))} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Gender <span className="text-red-400">*</span></Label>
                <Select value={ftForm.gender} onValueChange={v => setFtForm(f => ({ ...f, gender: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Contact</Label>
                <Input value={ftForm.contact} onChange={e => setFtForm(f => ({ ...f, contact: e.target.value }))} placeholder="Phone number" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Invited By</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {(["member", "child", "teen", "first_timer"] as const).map(t => (
                  <button key={t} type="button"
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${inviterType === t ? "bg-purple-700 text-white border-purple-700" : "bg-white text-gray-500 border-gray-200 hover:bg-purple-50"}`}
                    onClick={() => { setInviterType(t); setInvitedBy(null); setInviterChildSearch(""); setInviterTeenSearch(""); setInviterFtSearch(""); setInviterFtResults([]); }}>
                    {t === "member" ? "👤 Member" : t === "child" ? "👶 Child" : t === "teen" ? "😊 Teen" : "🙋 First Timer"}
                  </button>
                ))}
              </div>
              {inviterType === "member" && (
                <>
                  <InvitedBySearch value={invitedBy} label="Search member who invited them..." onChange={setInvitedBy} />
                  {invitedBy?.fellowship && (
                    <p className="text-xs text-purple-600 mt-1">Counted for <strong>{invitedBy.fellowship}</strong> fellowship.</p>
                  )}
                </>
              )}
              {inviterType === "child" && (
                <div className="space-y-1">
                  {invitedBy ? (
                    <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
                      <span className="text-sm font-medium text-blue-800 flex-1">{invitedBy.name}</span>
                      <button type="button" className="text-xs text-gray-400 hover:text-red-500" onClick={() => setInvitedBy(null)}>✕</button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                        <Input className="pl-9" placeholder="Search child by name..." value={inviterChildSearch} onChange={e => setInviterChildSearch(e.target.value)} />
                      </div>
                      {inviterChildResults.length > 0 && (
                        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
                          {inviterChildResults.map((c: any) => (
                            <button key={c.id} type="button"
                              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 border-b last:border-0 text-left text-sm"
                              onClick={() => { setInvitedBy({ id: c.id, name: `${c.firstName} ${c.lastName}`, type: "child" }); setInviterChildSearch(""); setInviterChildResults([]); }}>
                              <span className="font-medium">{c.firstName} {c.lastName}</span>
                              <span className="text-xs text-gray-400 capitalize">{(c.class ?? "").replace(/_/g, " ")}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {inviterType === "teen" && (
                <div className="space-y-1">
                  {invitedBy ? (
                    <div className="flex items-center gap-2 p-2 bg-teal-50 rounded-lg">
                      <span className="text-sm font-medium text-teal-800 flex-1">{invitedBy.name}</span>
                      <button type="button" className="text-xs text-gray-400 hover:text-red-500" onClick={() => setInvitedBy(null)}>✕</button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                        <Input className="pl-9" placeholder="Search teen by name..." value={inviterTeenSearch} onChange={e => setInviterTeenSearch(e.target.value)} />
                      </div>
                      {inviterTeenResults.length > 0 && (
                        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
                          {inviterTeenResults.map((t: any) => (
                            <button key={t.id} type="button"
                              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-teal-50 border-b last:border-0 text-left text-sm"
                              onClick={() => { setInvitedBy({ id: t.id, name: `${t.firstName} ${t.lastName}`, type: "teen" }); setInviterTeenSearch(""); setInviterTeenResults([]); }}>
                              <span className="font-medium">{t.firstName} {t.lastName}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {inviterType === "first_timer" && (
                <div className="space-y-1">
                  {invitedBy ? (
                    <div className="flex items-center gap-2 p-2 bg-yellow-50 rounded-lg border border-yellow-200">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-yellow-800">{invitedBy.name}</p>
                        {invitedBy.fellowship
                          ? <p className="text-xs text-yellow-600 mt-0.5">Counted for <strong>{invitedBy.fellowship}</strong> fellowship</p>
                          : <p className="text-xs text-gray-400 mt-0.5">No fellowship — will be registered under no fellowship</p>
                        }
                      </div>
                      <button type="button" className="text-xs text-gray-400 hover:text-red-500 flex-shrink-0" onClick={() => { setInvitedBy(null); setInviterFtSearch(""); setInviterFtResults([]); }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                        <Input className="pl-9" placeholder="Search first-timer by name..." value={inviterFtSearch} onChange={e => setInviterFtSearch(e.target.value)} autoFocus />
                      </div>
                      {inviterFtResults.length > 0 && (
                        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
                          {inviterFtResults.map((ft: any) => (
                            <button key={ft.id} type="button"
                              className="w-full flex items-start gap-2 px-3 py-2 hover:bg-yellow-50 border-b last:border-0 text-left text-sm"
                              onClick={() => {
                                setInvitedBy({
                                  id: ft.id,
                                  name: `${ft.firstName} ${ft.lastName}`,
                                  fellowship: ft.invitedByFellowship ?? undefined,
                                  type: "first_timer",
                                  effectiveInvitedById: ft.invitedById ?? null,
                                  effectiveInvitedByChildId: ft.invitedByChildId ?? null,
                                  effectiveInvitedByTeenId: ft.invitedByTeenId ?? null,
                                });
                                setInviterFtSearch("");
                                setInviterFtResults([]);
                              }}>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-800">{ft.firstName} {ft.lastName}</p>
                                <p className="text-xs text-gray-400">
                                  {ft.invitedByFellowship
                                    ? <>Fellowship: <span className="text-purple-600 font-medium">{ft.invitedByFellowship}</span></>
                                    : ft.invitedByName
                                    ? <>Invited by {ft.invitedByName}</>
                                    : <span className="italic">No fellowship</span>
                                  }
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {inviterFtSearch.length >= 2 && inviterFtResults.length === 0 && (
                        <p className="text-center text-xs text-gray-400 py-3">No first-timers found</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            <Button type="submit" className="w-full bg-purple-700 hover:bg-purple-800 text-white h-11"
              disabled={submitting || !ftForm.firstName || !ftForm.lastName || !ftForm.gender}>
              {submitting ? "Registering..." : "Register First Timer"}
            </Button>
          </form>
        )}

        {/* ── Returning First Timer ─────────────────────────────── */}
        {tab === "returning" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">Search existing first-timers to register for this service.</p>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input className="pl-9 bg-white" placeholder="Search by name..."
                value={returningSearch} onChange={e => setReturningSearch(e.target.value)} autoFocus />
            </div>
            {(() => {
              // Build set of FT ids already registered for this service
              const alreadyThisService = new Set(
                (attendanceData?.attendeeList ?? [])
                  .filter((r: any) => r.type === "first_timer" || r.type === "returning_first_timer")
                  .map((r: any) => r.ftId)
              );
              const eligible = returningResults.filter((ft: any) => !alreadyThisService.has(ft.id));
              return eligible.length > 0 ? (
                <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                  {eligible.map((ft: any) => (
                    <button key={ft.id} type="button" disabled={submitting}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-yellow-50 border-b last:border-0 text-left disabled:opacity-60"
                      onClick={() => registerReturning(ft)}>
                      <div className="w-9 h-9 rounded-full bg-yellow-100 text-yellow-700 font-bold text-sm flex items-center justify-center flex-shrink-0">
                        {ft.firstName?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-800">{ft.firstName} {ft.lastName}</p>
                        <p className="text-xs text-gray-400">
                          {ft.serviceDate} {ft.invitedByName ? `· Inv. by ${ft.invitedByName}` : ""}
                          {ft.invitedByFellowship ? ` (${ft.invitedByFellowship})` : ""}
                        </p>
                      </div>
                      <span className="text-xs text-yellow-600 font-semibold flex-shrink-0">Register →</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-gray-400 py-6">
                  {returningResults.length > 0 ? "All matching first-timers are already registered for this service" : "No first-timers found"}
                </p>
              );
            })()}
          </div>
        )}

        {/* ── Children ────────────────────────────────────────── */}
        {tab === "child" && (
          <div className="space-y-3">
            {ftInviteFor?.type === "child" ? (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-blue-900">Did <span className="text-blue-700">{ftInviteFor.name}</span> bring a guest today?</p>
                <p className="text-xs text-blue-600">Register their first-timer guest and it will be attributed to {ftInviteFor.name}.</p>
                <form onSubmit={e => {
                  e.preventDefault();
                  submitFirstTimer(e, "child", ftInviteFor.id, ftInviteFor.name);
                }} className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Guest First Name <span className="text-red-400">*</span></Label>
                      <Input className="h-9 text-sm" value={ftForm.firstName} onChange={e => setFtForm(f => ({ ...f, firstName: e.target.value }))} required />
                    </div>
                    <div>
                      <Label className="text-xs">Guest Last Name <span className="text-red-400">*</span></Label>
                      <Input className="h-9 text-sm" value={ftForm.lastName} onChange={e => setFtForm(f => ({ ...f, lastName: e.target.value }))} required />
                    </div>
                  </div>
                  <Select value={ftForm.gender} onValueChange={v => setFtForm(f => ({ ...f, gender: v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Gender *" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input className="h-9 text-sm" value={ftForm.contact} onChange={e => setFtForm(f => ({ ...f, contact: e.target.value }))} placeholder="Phone (optional)" />
                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1 bg-blue-700 hover:bg-blue-800 text-white h-9 text-sm" disabled={submitting || !ftForm.firstName || !ftForm.lastName || !ftForm.gender}>
                      {submitting ? "Registering..." : "Register Guest as FT"}
                    </Button>
                    <Button type="button" variant="outline" className="h-9 text-sm" onClick={() => { setFtInviteFor(null); setFtForm({ firstName: "", lastName: "", gender: "", contact: "" }); }}>
                      Skip
                    </Button>
                  </div>
                </form>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  <Input className="pl-9 bg-white" placeholder="Search child by name..."
                    value={childSearch} onChange={e => setChildSearch(e.target.value)} autoFocus />
                </div>
                {childResults.length > 0 && (
                  <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                    {childResults.map((c: any) => (
                      <button key={c.id} type="button" disabled={submitting}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-pink-50 border-b last:border-0 text-left disabled:opacity-60"
                        onClick={() => registerChild(c)}>
                        <div className="w-9 h-9 rounded-full bg-pink-100 text-pink-700 font-bold text-sm flex items-center justify-center flex-shrink-0">
                          {c.firstName?.[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-800">{c.firstName} {c.lastName}</p>
                          <p className="text-xs text-gray-400 capitalize">{(c.class ?? "").replace(/_/g, " ")}</p>
                        </div>
                        <span className="text-xs text-purple-600 font-semibold flex-shrink-0">Register →</span>
                      </button>
                    ))}
                  </div>
                )}
                {childSearch.length >= 2 && childResults.length === 0 && <p className="text-center text-sm text-gray-400 py-6">No children found</p>}
              </>
            )}
          </div>
        )}

        {/* ── Teens ───────────────────────────────────────────── */}
        {tab === "teen" && (
          <div className="space-y-3">
            {ftInviteFor?.type === "teen" ? (
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-teal-900">Did <span className="text-teal-700">{ftInviteFor.name}</span> bring a guest today?</p>
                <p className="text-xs text-teal-600">Register their first-timer guest and it will be attributed to {ftInviteFor.name}.</p>
                <form onSubmit={e => {
                  e.preventDefault();
                  submitFirstTimer(e, "teen", ftInviteFor.id, ftInviteFor.name);
                }} className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Guest First Name <span className="text-red-400">*</span></Label>
                      <Input className="h-9 text-sm" value={ftForm.firstName} onChange={e => setFtForm(f => ({ ...f, firstName: e.target.value }))} required />
                    </div>
                    <div>
                      <Label className="text-xs">Guest Last Name <span className="text-red-400">*</span></Label>
                      <Input className="h-9 text-sm" value={ftForm.lastName} onChange={e => setFtForm(f => ({ ...f, lastName: e.target.value }))} required />
                    </div>
                  </div>
                  <Select value={ftForm.gender} onValueChange={v => setFtForm(f => ({ ...f, gender: v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Gender *" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input className="h-9 text-sm" value={ftForm.contact} onChange={e => setFtForm(f => ({ ...f, contact: e.target.value }))} placeholder="Phone (optional)" />
                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1 bg-teal-700 hover:bg-teal-800 text-white h-9 text-sm" disabled={submitting || !ftForm.firstName || !ftForm.lastName || !ftForm.gender}>
                      {submitting ? "Registering..." : "Register Guest as FT"}
                    </Button>
                    <Button type="button" variant="outline" className="h-9 text-sm" onClick={() => { setFtInviteFor(null); setFtForm({ firstName: "", lastName: "", gender: "", contact: "" }); }}>
                      Skip
                    </Button>
                  </div>
                </form>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  <Input className="pl-9 bg-white" placeholder="Search teen by name..."
                    value={teenSearch} onChange={e => setTeenSearch(e.target.value)} autoFocus />
                </div>
                {teenResults.length > 0 && (
                  <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                    {teenResults.map((t: any) => (
                      <button key={t.id} type="button" disabled={submitting}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-teal-50 border-b last:border-0 text-left disabled:opacity-60"
                        onClick={() => registerTeen(t)}>
                        <div className="w-9 h-9 rounded-full bg-teal-100 text-teal-700 font-bold text-sm flex items-center justify-center flex-shrink-0">
                          {t.firstName?.[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-800">{t.firstName} {t.lastName}</p>
                          <p className="text-xs text-gray-400">Teens Church</p>
                        </div>
                        <span className="text-xs text-purple-600 font-semibold flex-shrink-0">Register →</span>
                      </button>
                    ))}
                  </div>
                )}
                {teenSearch.length >= 2 && teenResults.length === 0 && <p className="text-center text-sm text-gray-400 py-6">No teens found</p>}
              </>
            )}
          </div>
        )}

        {/* ── My Fellowship card (cell leaders only) ───────────── */}
        {myCellName && myFellowshipStats && (
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
            <p className="text-xs text-purple-500 font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> My Fellowship — {myCellName}
            </p>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="text-center">
                <p className="text-2xl font-extrabold text-purple-800">{myFellowshipStats.members}<span className="text-sm font-normal text-purple-500">/{myFellowshipStats.totalMembers}</span></p>
                <p className="text-[11px] text-purple-500 uppercase font-semibold mt-0.5">Members</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-extrabold text-yellow-600">{myFellowshipStats.ft}</p>
                <p className="text-[11px] text-purple-500 uppercase font-semibold mt-0.5">First Timers</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-extrabold text-gray-800">{myFellowshipStats.total}</p>
                <p className="text-[11px] text-purple-500 uppercase font-semibold mt-0.5">Total</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Live Attendee List ────────────────────────────────── */}
        <SimpleAttendeeList
          attendanceData={attendanceData}
          filterCellName={isLeaderUser ? null : myCellName}
          filterCellNames={leaderCellNames}
          serviceId={serviceId}
          canUnregister={((user as any)?.roleLevel ?? 5) <= 3 && !isLeaderUser}
          canDeleteCT={canDeleteCT}
          canDeleteFT={((user as any)?.roleLevel ?? 5) <= 3 && !isLeaderUser}
          onDeleteChild={removeChildFromService}
          onDeleteTeen={removeTeenFromService}
          deletingCtId={deletingCtId}
        />

      </div>
    </div>

    <Dialog open={!!ctModal} onOpenChange={() => { setCtModal(null); setConfirmCtModalKey(null); }}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        {ctModal && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {ctModal.type === "children" ? "👶" : "😊"} {ctModal.type === "children" ? "Children's Church" : "Teens Church"}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500 pb-2 border-b">{ctModal.list.length} registered for this service</p>
            <div className="overflow-y-auto flex-1 space-y-1 pr-1">
              {ctModal.list.slice((ctModalPage - 1) * 10, ctModalPage * 10).map((item: any, i: number) => {
                const itemId = item.childId ?? item.teenId;
                const itemKey = `${ctModal.type === "children" ? "child" : "teen"}-${itemId}`;
                const isConfirmingThis = confirmCtModalKey === itemKey;
                const isDeletingThis = deletingCtId === itemId;
                return (
                  <div key={itemId ?? i} className={`flex items-center gap-2 px-2 py-1.5 rounded ${isConfirmingThis ? "bg-red-50" : "hover:bg-gray-50"}`}>
                    {isConfirmingThis ? (
                      <div className="flex-1 flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-red-700 font-medium">Unregister <span className="font-bold">{item.name}</span>?</span>
                        <div className="flex items-center gap-1">
                          <button
                            disabled={isDeletingThis}
                            onClick={() => {
                              ctModal.type === "children" ? removeChildFromService(itemId) : removeTeenFromService(itemId);
                              setConfirmCtModalKey(null);
                            }}
                            className="text-[10px] bg-red-500 hover:bg-red-600 text-white rounded px-2 py-0.5 font-semibold disabled:opacity-50"
                          >{isDeletingThis ? "…" : "Yes, remove"}</button>
                          <button
                            onClick={() => setConfirmCtModalKey(null)}
                            className="text-[10px] bg-gray-200 hover:bg-gray-300 text-gray-700 rounded px-2 py-0.5 font-semibold"
                          >Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="text-xs text-gray-400 w-5 flex-shrink-0">{(ctModalPage - 1) * 10 + i + 1}</span>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${ctModal.type === "children" ? "bg-blue-100 text-blue-700" : "bg-teal-100 text-teal-700"}`}>
                          {item.name?.[0] ?? "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{item.name}</p>
                          {item.class && <p className="text-[10px] text-gray-400 capitalize">{item.class.replace(/_/g, " ")}</p>}
                        </div>
                        {item.checkInTime && <span className="text-xs text-gray-400 flex-shrink-0">{fmtTime(item.checkInTime)}</span>}
                        <Badge className={`border-0 text-[10px] flex-shrink-0 ${ctModal.type === "children" ? "bg-blue-100 text-blue-700" : "bg-teal-100 text-teal-700"}`}>
                          {ctModal.type === "children" ? "Child" : "Teen"}
                        </Badge>
                        {canDeleteCT && (
                          <button
                            title="Remove from this service"
                            disabled={isDeletingThis}
                            onClick={() => setConfirmCtModalKey(itemKey)}
                            className="p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 flex-shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
              {ctModal.list.length === 0 && <p className="text-center text-sm text-gray-400 py-6">No registrations yet</p>}
            </div>
            {Math.ceil(ctModal.list.length / 10) > 1 && (
              <div className="flex items-center justify-between pt-3 border-t">
                <button disabled={ctModalPage <= 1} onClick={() => setCtModalPage(p => p - 1)} className="px-3 py-1.5 text-xs font-semibold rounded-lg border hover:bg-gray-50 disabled:opacity-40">← Prev</button>
                <span className="text-xs text-gray-500">Page {ctModalPage} of {Math.ceil(ctModal.list.length / 10)}</span>
                <button disabled={ctModalPage >= Math.ceil(ctModal.list.length / 10)} onClick={() => setCtModalPage(p => p + 1)} className="px-3 py-1.5 text-xs font-semibold rounded-lg border hover:bg-gray-50 disabled:opacity-40">Next →</button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
      {/* ── First-timer duplicate warning dialog ──────────────────────────── */}
      {ftDuplicateWarning && (
        <Dialog open onOpenChange={() => setFtDuplicateWarning(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-amber-700">Possible Duplicate</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-1 text-sm">
              <p className="text-gray-700">
                The name <strong>{ftDuplicateWarning.pendingBody.firstName} {ftDuplicateWarning.pendingBody.lastName}</strong> already exists as a first timer:
              </p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 divide-y divide-amber-100">
                {ftDuplicateWarning.matches.map((m: any) => (
                  <div key={m.id} className="px-3 py-2 flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-800">{m.firstName} {m.lastName}</span>
                    {m.contact && <span className="text-xs text-gray-500">{m.contact}</span>}
                  </div>
                ))}
              </div>
              <p className="text-gray-500 text-xs">
                If this person is returning, use the <strong>Returning</strong> tab instead so their record is not duplicated.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  onClick={() => { setFtDuplicateWarning(null); setTab("returning"); }}>
                  Use Returning Tab
                </button>
                <button
                  className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                  onClick={async () => {
                    const w = ftDuplicateWarning;
                    setFtDuplicateWarning(null);
                    setSubmitting(true);
                    try {
                      const effectiveInvitedBy = w.prefilledInviterId
                        ? { id: w.prefilledInviterId, name: w.prefilledInviterName ?? "", type: w.prefilledInviterType }
                        : invitedBy;
                      await doRegisterFT(w.pendingBody, effectiveInvitedBy);
                    } catch (err: any) {
                      showResult({ type: "error", name: "Error", detail: err.message });
                    } finally { setSubmitting(false); }
                  }}>
                  Register Anyway
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Attendance() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isAdmin = user && (user as any).roleLevel <= 3;
  const isSuperAdmin = user && (user as any).roleLevel === 1;
  const isLeader = user && (user as any).roleLevel === 4;
  const isFirstTimersAdmin = user && (user as any).roleSubtype === "first_timers";
  const isRegistrationAdmin = user && (user as any).roleSubtype === "registration";
  const isPCDAdmin = user && (user as any).roleSubtype === "pcd";
  const isMediaAdmin = user && (user as any).roleSubtype === "media";
  const isChildrenAdmin = user && (user as any).roleSubtype === "children";
  // Register-only roles see limited attendance UI (no service creation/close/export)
  const isRegisterOnly = isFirstTimersAdmin || isRegistrationAdmin || isPCDAdmin || isMediaAdmin;
  // Leaders are view-only: no create/close/register
  const isViewOnly = !!isLeader;

  const [view, setView] = useState<View>("services");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [serviceForm, setServiceForm] = useState({ name: "Sunday Service", date: today, time: "09:00" });
  const [creating, setCreating] = useState(false);
  const [forceConfirm, setForceConfirm] = useState<{ name: string; date: string } | null>(null);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", date: "", time: "" });
  const [editing, setEditing] = useState(false);

  // Close confirmation
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [closing, setClosing] = useState(false);

  // QR code dialog
  const [showQrDialog, setShowQrDialog] = useState(false);

  // Cell detail modal
  const [cellDetail, setCellDetail] = useState<any>(null);

  // Quick member view from table
  const [memberQuickView, setMemberQuickView] = useState<any>(null);

  // Live canClose state (re-evaluated each minute)
  const [canClose, setCanClose] = useState(false);

  // Data queries
  const { data: activeData, isLoading: activeLoading } = useGetActiveService({
    query: { queryKey: getGetActiveServiceQueryKey(), refetchInterval: 30000 },
  });
  const activeService = (activeData as any)?.service ?? null;

  useEffect(() => {
    setCanClose(canCloseService(activeService));
    const iv = setInterval(() => setCanClose(canCloseService(activeService)), 60000);
    return () => clearInterval(iv);
  }, [activeService?.id, activeService?.time, activeService?.date]);

  const { data: attendanceData, isLoading: attLoading } = useGetServiceAttendance(
    activeService?.id,
    { query: { queryKey: getGetServiceAttendanceQueryKey(activeService?.id), enabled: !!activeService?.id, refetchInterval: 20000 } }
  ) as any;

  useListServices(
    { page: 1, limit: 50 },
    { query: { queryKey: getListServicesQueryKey({ page: 1, limit: 50 }) } }
  );

  // ── Create service ─────────────────────────────────────────────────────────

  async function handleCreateService(e: React.FormEvent | null, force = false) {
    e?.preventDefault();
    setCreating(true);
    try {
      await apiFetch("/api/services", {
        method: "POST",
        body: JSON.stringify({ ...serviceForm, force }),
      });
      queryClient.invalidateQueries({ queryKey: getGetActiveServiceQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
      setCreateOpen(false);
      setForceConfirm(null);
      setServiceForm({ name: "Sunday Service", date: today, time: "09:00" });
      toast({ title: "Service opened" });
    } catch (e: any) {
      if (e.status === 409 && e.data?.existingService) {
        setForceConfirm(e.data.existingService);
      } else {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    } finally { setCreating(false); }
  }

  // ── Edit service ───────────────────────────────────────────────────────────

  function openEditDialog() {
    if (!activeService) return;
    setEditForm({ name: activeService.name, date: activeService.date, time: activeService.time ?? "" });
    setEditOpen(true);
  }

  async function handleEditService(e: React.FormEvent) {
    e.preventDefault();
    if (!activeService) return;
    setEditing(true);
    try {
      await apiFetch(`/api/services/${activeService.id}`, {
        method: "PATCH",
        body: JSON.stringify(editForm),
      });
      queryClient.invalidateQueries({ queryKey: getGetActiveServiceQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
      setEditOpen(false);
      toast({ title: "Service updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setEditing(false); }
  }

  // ── Close service ──────────────────────────────────────────────────────────

  async function handleCloseService() {
    if (!activeService) return;
    setClosing(true);
    try {
      await apiFetch(`/api/services/${activeService.id}/close`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: getGetActiveServiceQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
      setCloseConfirm(false);
      toast({ title: "Service closed" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setClosing(false); }
  }

  // ── Register view ──────────────────────────────────────────────────────────

  if (view === "register" && activeService && !isViewOnly) {
    return (
      <RegisterPage
        serviceId={activeService.id}
        serviceName={activeService.name}
        onBack={() => setView("services")}
        queryClient={queryClient}
      />
    );
  }

  // ── Services view ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance & Services</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage services and member registration</p>
        </div>
        {!isRegisterOnly && !isViewOnly && (
          <Button className="bg-purple-700 hover:bg-purple-800 text-white" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> {activeService ? "New Service" : "Open Service"}
          </Button>
        )}
      </div>

      {activeLoading && <Skeleton className="h-64 w-full rounded-2xl" />}

      {/* ── ACTIVE SERVICE ─────────────────────────────────────────────────── */}
      {!activeLoading && activeService && (
        <div className="rounded-2xl overflow-hidden shadow-lg border border-purple-200">
          {/* Purple header */}
          <div className="bg-purple-700 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                <h2 className="text-white font-bold text-xl">{activeService.name}</h2>
              </div>
              <span className="text-sm">
                <span className="text-purple-300">Date: </span>
                <span className="text-yellow-300 font-semibold">{activeService.date}</span>
              </span>
              {activeService.time && (
                <span className="text-sm">
                  <span className="text-purple-300">Time started: </span>
                  <span className="text-yellow-300 font-semibold">{activeService.time}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* QR code button — always visible when service is active */}
              <button
                onClick={() => setShowQrDialog(true)}
                className="p-1.5 hover:bg-white/20 rounded-lg text-white/80 hover:text-white flex items-center gap-1.5"
                title="Show QR code for member self-registration"
              >
                <QrCode className="w-5 h-5" />
              </button>
              {isAdmin && !isRegisterOnly && (
                <button onClick={openEditDialog} className="p-1.5 hover:bg-white/20 rounded-lg text-white/80 hover:text-white" title="Edit service">
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
              {!isRegisterOnly && !isViewOnly && canClose ? (
                <button onClick={() => setCloseConfirm(true)}
                  className="bg-red-500 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors">
                  Close Service
                </button>
              ) : !isRegisterOnly && !isViewOnly ? (
                <div className="flex items-center gap-1 text-purple-300 text-xs">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Close available 4 hrs after start</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Stats row */}
          <div className="bg-white border-b px-5 py-4 flex items-center gap-6 flex-wrap justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium tracking-wide">Total attendance</p>
              <p className="text-4xl font-extrabold text-gray-900 mt-0.5">{activeService.totalCount ?? 0}</p>
            </div>
            <div className="flex items-center gap-8 flex-wrap">
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-700">{activeService.memberCount ?? 0}</p>
                <p className="text-xs text-gray-500 font-semibold uppercase mt-0.5">Members</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-pink-600">{activeService.childrenCount ?? 0}</p>
                <p className="text-xs text-gray-500 font-semibold uppercase mt-0.5">Children</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{activeService.teensCount ?? 0}</p>
                <p className="text-xs text-gray-500 font-semibold uppercase mt-0.5">Teens</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{activeService.firstTimerCount ?? 0}</p>
                <p className="text-xs text-gray-500 font-semibold uppercase mt-0.5">First Timers</p>
              </div>
            </div>
            {!isViewOnly && (
              <button onClick={() => setView("register")}
                className="w-20 h-20 rounded-full bg-green-500 hover:bg-green-600 active:scale-95 text-white font-bold shadow-xl flex flex-col items-center justify-center transition-all">
                <UserPlus className="w-6 h-6 mb-1" />
                <span className="text-xs font-bold tracking-wide">REGISTER</span>
              </button>
            )}
          </div>

          {/* Fellowship summary table */}
          <div className="bg-gray-50 px-5 py-5">
            <FellowshipSummaryTable
              attendanceData={attendanceData}
              loading={attLoading}
              onExport={!isViewOnly ? () => exportToExcel(activeService, attendanceData) : undefined}
              myCellName={null}
              isChildrenAdmin={isChildrenAdmin}
              leaderScope={isLeader ? (
                (user as any)?.leadsPcfName ? { type: "pcf" as const, name: (user as any).leadsPcfName } :
                (user as any)?.leadsSeniorCellName ? { type: "sc" as const, name: (user as any).leadsSeniorCellName } :
                (user as any)?.leadsCellName ? { type: "cell" as const, name: (user as any).leadsCellName } :
                undefined
              ) : undefined}
            />
          </div>
        </div>
      )}

      {/* No active service */}
      {!activeLoading && !activeService && (
        <div className="text-center py-14 border-2 border-dashed rounded-2xl bg-gray-50 text-gray-400">
          <CalendarCheck className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-semibold text-base">No active service</p>
          <p className="text-sm mt-1">Open a service to start taking attendance</p>
        </div>
      )}

      {/* ── Create service dialog ─────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={v => { setCreateOpen(v); if (!v) setForceConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{forceConfirm ? "Replace Active Service?" : "Open New Service"}</DialogTitle>
          </DialogHeader>
          {forceConfirm ? (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                <p className="font-semibold mb-1">⚠️ There is already an active service:</p>
                <p className="font-bold">{forceConfirm.name}</p>
                <p className="text-amber-600">{forceConfirm.date}</p>
                <p className="mt-2">Creating this will automatically close it. Are you sure?</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setForceConfirm(null)}>Cancel</Button>
                <Button className="flex-1 bg-purple-700 hover:bg-purple-800 text-white" disabled={creating}
                  onClick={() => handleCreateService(null, true)}>
                  {creating ? "Opening..." : "Yes, Continue"}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={e => handleCreateService(e)} className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label>Service Name</Label>
                <Input value={serviceForm.name} onChange={e => setServiceForm(f => ({ ...f, name: e.target.value }))} required autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={serviceForm.date} onChange={e => setServiceForm(f => ({ ...f, date: e.target.value }))} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Time</Label>
                  <Input type="time" value={serviceForm.time} onChange={e => setServiceForm(f => ({ ...f, time: e.target.value }))} />
                </div>
              </div>
              <Button type="submit" className="w-full bg-purple-700 hover:bg-purple-800 text-white" disabled={creating}>
                {creating ? "Opening..." : "Open Service"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit service dialog ───────────────────────────────────────────── */}
      {isAdmin && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Edit Service</DialogTitle></DialogHeader>
            <form onSubmit={handleEditService} className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label>Service Name</Label>
                <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} required autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Time</Label>
                  <Input type="time" value={editForm.time} onChange={e => setEditForm(f => ({ ...f, time: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button type="submit" className="flex-1 bg-purple-700 hover:bg-purple-800 text-white" disabled={editing}>
                  {editing ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Service QR Code Dialog ────────────────────────────────────────── */}
      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-purple-600" />
              Service QR Code
            </DialogTitle>
          </DialogHeader>
          {activeService && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="font-semibold text-gray-800">{activeService.name}</p>
                <p className="text-sm text-gray-500">{activeService.date}{activeService.time ? ` · ${activeService.time}` : ""}</p>
              </div>
              <div className="flex justify-center p-4 bg-white border-2 border-purple-100 rounded-2xl">
                <QRCodeSVG
                  value={`CEKSI-SVC-${activeService.id}`}
                  size={220}
                  level="H"
                  includeMargin
                />
              </div>
              {/* Hidden canvas for PNG download */}
              <QRCodeCanvas
                id="service-qr-dl-canvas"
                value={`CEKSI-SVC-${activeService.id}`}
                size={512}
                level="H"
                includeMargin
                style={{ display: "none" }}
              />
              <p className="text-xs text-center text-gray-500">
                Members can scan this with their church portal app to register themselves
              </p>
              <Button
                className="w-full bg-purple-700 hover:bg-purple-800 text-white"
                onClick={() => {
                  const canvas = document.getElementById("service-qr-dl-canvas") as HTMLCanvasElement;
                  if (!canvas) return;
                  const link = document.createElement("a");
                  link.href = canvas.toDataURL("image/png");
                  link.download = `${activeService.name}-${activeService.date}-QR.png`;
                  link.click();
                }}
              >
                <Download className="w-4 h-4 mr-2" /> Download QR Code (PNG)
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Close confirmation ────────────────────────────────────────────── */}
      <Dialog open={closeConfirm} onOpenChange={setCloseConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Close Registration?</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to close registration for <strong>{activeService?.name}</strong>? Once closed, no more registrations will be accepted.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setCloseConfirm(false)}>Cancel</Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" disabled={closing} onClick={handleCloseService}>
                {closing ? "Closing..." : "Yes, Close"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Cell detail modal ─────────────────────────────────────────────── */}
      {cellDetail && (
        <Dialog open onOpenChange={() => setCellDetail(null)}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-600" />
                {cellDetail.name}
              </DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
              <span><span className="font-bold text-purple-700 text-lg">{cellDetail.checkedIn}</span> present</span>
              <span className="text-gray-300">|</span>
              <span>{cellDetail.total} total</span>
            </div>
            <div className="overflow-y-auto flex-1 space-y-1 pr-1">
              {(cellDetail.members ?? []).filter((m: any) => m.checkedIn).map((m: any) => (
                <div key={m.memberId} className="flex items-center gap-3 px-3 py-2 bg-green-50 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-green-200 text-green-800 text-xs font-bold flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {m.profilePhoto ? <img src={m.profilePhoto} alt="" className="w-full h-full object-cover" /> : m.memberName?.[0]}
                  </div>
                  <span className="font-medium text-green-800 text-sm flex-1">{m.memberName}</span>
                  <div className="flex items-center gap-2">
                    {m.checkInTime && <span className="text-xs text-gray-400 font-mono">{fmtTime(m.checkInTime)}</span>}
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  </div>
                </div>
              ))}
              {(cellDetail.members ?? []).filter((m: any) => !m.checkedIn).map((m: any) => (
                <div key={m.memberId} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg opacity-60">
                  <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-500 text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {m.memberName?.[0]}
                  </div>
                  <span className="text-gray-500 text-sm flex-1">{m.memberName}</span>
                  <span className="text-xs text-red-400">Absent</span>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Member quick view ─────────────────────────────────────────────── */}
      {memberQuickView && (
        <Dialog open onOpenChange={() => setMemberQuickView(null)}>
          <DialogContent className="max-w-xs">
            <DialogHeader><DialogTitle>{memberQuickView.name}</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              {memberQuickView.fellowship && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-20 flex-shrink-0">Cell</span>
                  <span className="font-medium text-gray-800">{memberQuickView.fellowship}</span>
                </div>
              )}
              {memberQuickView.pcfName && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-20 flex-shrink-0">PCF</span>
                  <span className="font-medium text-gray-800">{memberQuickView.pcfName}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-gray-500 w-20 flex-shrink-0">Arrived</span>
                <span className="font-medium text-gray-800">{fmtTime(memberQuickView.checkInTime)}</span>
              </div>
              <Button variant="outline" className="w-full mt-2 text-purple-700 border-purple-300"
                onClick={() => { navigate("/members"); setMemberQuickView(null); }}>
                Go to Members Page
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}