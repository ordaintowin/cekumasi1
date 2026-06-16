import React, { useState, useRef, useMemo, Fragment } from "react";
import {
  useGetFellowshipHierarchy, getGetFellowshipHierarchyQueryKey,
  useGetMembersAttendanceReport, getGetMembersAttendanceReportQueryKey,
  useGetFellowshipAttendanceReport, getGetFellowshipAttendanceReportQueryKey,
  useGetAttendanceTrend, getGetAttendanceTrendQueryKey,
  useGetFinanceReport, getGetFinanceReportQueryKey,
  useGetFirstTimersStatusReport, getGetFirstTimersStatusReportQueryKey,
  useListMinistryYears, getListMinistryYearsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CalendarCheck, Users, Banknote, UserPlus, ChevronLeft, ChevronRight,
  Search, ChevronDown, ChevronRight as ChevronRightIcon, Download, BarChart2,
  Globe, Loader2, FileSpreadsheet,
} from "lucide-react";
import { downloadJsonAsExcel, downloadAoaAsExcel } from "@/utils/excel";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

function fmt(n: string | number | null | undefined, decimals = 2) {
  if (n === null || n === undefined) return "—";
  return `GHS ${Number(n).toLocaleString("en-GH", { minimumFractionDigits: decimals })}`;
}

// ─── CHILDREN / TEENS ATTENDANCE TABLE ───────────────────────────────────────

function ChildrenTeensAttendanceTable({ month, group }: { month: string; group: string }) {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setLoading(true);
    const headers: any = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`/api/reports/ct-attendance?month=${month}&group=${group}`, { headers })
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [month, group, token]);

  const services = data?.services ?? [];
  const members = data?.members ?? [];

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (!data || services.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 border rounded-lg bg-gray-50">
        <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p>No {group} attendance data for {month}.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-500">
        {members.length} {group === "children" ? "children" : "teens"} &bull; {services.length} service{services.length !== 1 ? "s" : ""} in {month}
      </div>
      <div className="overflow-x-auto border rounded-lg bg-white">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="w-8 text-center">#</TableHead>
              <TableHead className="min-w-28">Name</TableHead>
              <TableHead className="min-w-16 text-xs">Gender</TableHead>
              {services.map((svc: any) => (
                <TableHead key={svc.id} className="text-center min-w-20 text-xs">
                  <div className="font-medium">{svc.name}</div>
                  <div className="text-gray-400 font-normal">
                    {svc.date ? new Date(svc.date).toLocaleDateString("en-GH", { day: "numeric", month: "short" }) : ""}
                  </div>
                </TableHead>
              ))}
              <TableHead className="text-center min-w-16 text-xs">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3 + services.length} className="text-center py-8 text-gray-400">
                  No data found
                </TableCell>
              </TableRow>
            ) : (
              members.map((m: any, idx: number) => (
                <TableRow key={idx} className="hover:bg-gray-50">
                  <TableCell className="text-center text-xs text-gray-400 font-mono">{idx + 1}</TableCell>
                  <TableCell className="font-medium text-sm">{m.name}</TableCell>
                  <TableCell className="text-xs text-gray-500 capitalize">{m.gender ?? "—"}</TableCell>
                  {services.map((svc: any) => {
                    const present = m.attendance?.[svc.id];
                    return (
                      <TableCell key={svc.id} className="text-center py-2">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${present ? "bg-green-100 text-green-700" : "bg-red-100 text-red-500"}`}>
                          {present ? "P" : "A"}
                        </span>
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center text-sm font-semibold text-purple-700">
                    {m.attended}/{m.total}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── VISIT TIMELINE DIALOG ────────────────────────────────────────────────────

function VisitTimelineDialog({ ft, open, onClose }: { ft: any; open: boolean; onClose: () => void }) {
  if (!ft) return null;
  const visits: any[] = ft.visitDates ?? [];
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">
            {ft.firstName} {ft.lastName} — Visit History
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-xs text-gray-500">{ft.visitCount} visit{ft.visitCount !== 1 ? "s" : ""} total</p>
          {visits.length > 0 ? (
            <div className="space-y-1.5">
              {visits.map((v: any, i: number) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  <div>
                    <p className="font-medium text-gray-800">{v.serviceName ?? v.service ?? "Service"}</p>
                    <p className="text-xs text-gray-400">{v.date ? new Date(v.date).toLocaleDateString("en-GH") : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-3 text-sm">
                <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                <div>
                  <p className="font-medium text-gray-800">{ft.firstVisitService ?? "First Visit"}</p>
                  <p className="text-xs text-gray-400">{ft.firstVisitDate ? new Date(ft.firstVisitDate).toLocaleDateString("en-GH") : ""}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── MEMBER ATTENDANCE REPORT ─────────────────────────────────────────────────

function MemberAttendanceReport({
  lockedCellId,
  lockedCellLabel,
  lockedSeniorCellId,
  lockedSeniorCellLabel,
  lockedPcfId,
  lockedPcfLabel,
  isChildrenAdmin,
}: {
  lockedCellId?: number;
  lockedCellLabel?: string;
  lockedSeniorCellId?: number;
  lockedSeniorCellLabel?: string;
  lockedPcfId?: number;
  lockedPcfLabel?: string;
  isChildrenAdmin?: boolean;
} = {}) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [fellowship, setFellowship] = useState(() => {
    if (isChildrenAdmin) return "children";
    if (lockedCellId) return `cell-${lockedCellId}`;
    if (lockedSeniorCellId) return `sc-${lockedSeniorCellId}`;
    if (lockedPcfId) return `pcf-${lockedPcfId}`;
    return "all";
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: hierarchyData } = useGetFellowshipHierarchy({ query: { queryKey: getGetFellowshipHierarchyQueryKey() } });

  const cellId = fellowship.startsWith("cell-") ? parseInt(fellowship.slice(5)) : undefined;
  const scId   = fellowship.startsWith("sc-")   ? parseInt(fellowship.slice(3)) : undefined;
  const pcfId  = fellowship.startsWith("pcf-")  ? parseInt(fellowship.slice(4)) : undefined;

  const params = {
    month,
    cellId:        lockedCellId        ?? cellId,
    seniorCellId:  lockedSeniorCellId  ?? scId,
    pcfId:         lockedPcfId         ?? pcfId,
    search:        search || undefined,
    page,
    limit: 20,
  };

  const { data, isLoading } = useGetMembersAttendanceReport(params, {
    query: { queryKey: getGetMembersAttendanceReportQueryKey(params) },
  });

  const services  = data?.services  ?? [];
  const members   = data?.members   ?? [];
  const total     = data?.total     ?? 0;
  const totalPages = Math.ceil(total / 20);

  const pcfs          = hierarchyData?.pcfs               ?? [];
  const standaloneSCs = hierarchyData?.standaloneSeniorCells ?? [];
  const standaloneCells = hierarchyData?.standaloneCells  ?? [];

  const isLocked      = !!(lockedCellId || lockedSeniorCellId || lockedPcfId);
  const isChildrenOrTeens = fellowship === "children" || fellowship === "teens";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Month</label>
          <Input
            type="month"
            value={month}
            onChange={e => { setMonth(e.target.value); setPage(1); }}
            className="w-40"
          />
        </div>

        {isLocked ? (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Fellowship</label>
            <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-md text-sm text-purple-800 font-medium">
              {lockedPcfLabel ?? lockedSeniorCellLabel ?? lockedCellLabel ?? "My Fellowship"}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Fellowship</label>
            <Select value={fellowship} onValueChange={v => { setFellowship(v); setPage(1); }}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="All fellowships" />
              </SelectTrigger>
              <SelectContent className="max-h-80 overflow-y-auto">
                {!isChildrenAdmin && <SelectItem value="all">All fellowships</SelectItem>}
                <SelectItem value="children">👶 Children&apos;s Church</SelectItem>
                <SelectItem value="teens">😊 Teens Church</SelectItem>
                {!isChildrenAdmin && pcfs.map((pcf: any) => (
                  <SelectItem key={pcf.id} value={`pcf-${pcf.id}`} className="font-semibold text-purple-700">
                    {pcf.name}
                  </SelectItem>
                ))}
                {!isChildrenAdmin && standaloneSCs.map((sc: any) => (
                  <SelectItem key={sc.id} value={`sc-${sc.id}`} className="font-semibold text-gray-700">
                    {sc.name}
                  </SelectItem>
                ))}
                {!isChildrenAdmin && standaloneCells.map((cell: any) => (
                  <SelectItem key={cell.id} value={`cell-${cell.id}`}>
                    {cell.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!isLocked && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Search member</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 w-52"
                placeholder="Name..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
          </div>
        )}
      </div>

      {isChildrenOrTeens && (
        <ChildrenTeensAttendanceTable month={month} group={fellowship} />
      )}

      {!isChildrenOrTeens && services.length === 0 && !isLoading && (
        <div className="text-center py-12 text-gray-400 border rounded-lg bg-gray-50">
          <CalendarCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>No services found for {month}. Choose a different month.</p>
        </div>
      )}

      {!isChildrenOrTeens && (services.length > 0 || isLoading) && (
        <>
          <div className="text-sm text-gray-500">
            {total} member{total !== 1 ? "s" : ""} &bull; {services.length} service{services.length !== 1 ? "s" : ""} in {month}
          </div>
          <div className="overflow-x-auto border rounded-lg bg-white">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="w-8 text-center sticky left-0 bg-gray-50 z-10">#</TableHead>
                  <TableHead className="min-w-28 sticky left-8 bg-gray-50 z-10">First Name</TableHead>
                  <TableHead className="min-w-28">Last Name</TableHead>
                  <TableHead className="min-w-36 text-xs">Fellowship</TableHead>
                  {services.map((svc: any) => (
                    <TableHead key={svc.id} className="text-center min-w-20 text-xs">
                      <div className="font-medium">{svc.name}</div>
                      <div className="text-gray-400 font-normal">
                        {svc.date ? new Date(svc.date).toLocaleDateString("en-GH", { day: "numeric", month: "short" }) : ""}
                      </div>
                    </TableHead>
                  ))}
                  <TableHead className="text-center min-w-16 text-xs">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 + services.length }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : members.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4 + services.length} className="text-center py-8 text-gray-400">
                      No members found
                    </TableCell>
                  </TableRow>
                ) : (
                  members.map((m: any, idx: number) => (
                    <TableRow key={m.id} className="hover:bg-gray-50">
                      <TableCell className="text-center text-xs text-gray-400 font-mono sticky left-0 bg-white">
                        {(page - 1) * 20 + idx + 1}
                      </TableCell>
                      <TableCell className="font-medium text-sm sticky left-8 bg-white">{m.firstName}</TableCell>
                      <TableCell className="text-sm">{m.lastName}</TableCell>
                      <TableCell className="text-xs text-gray-500 max-w-36 truncate">{m.cellLabel || "—"}</TableCell>
                      {services.map((svc: any) => {
                        const present = m.attendance?.[svc.id];
                        return (
                          <TableCell key={svc.id} className="text-center py-2">
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${present ? "bg-green-100 text-green-700" : "bg-red-100 text-red-500"}`}>
                              {present ? "P" : "A"}
                            </span>
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center text-sm font-semibold text-purple-700">
                        {m.attended}/{m.total}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Page {page} of {totalPages} &bull; {total} members</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── FELLOWSHIP ATTENDANCE REPORT ────────────────────────────────────────────

function FellowshipAttendanceReport({
  lockedCellId,
  lockedSeniorCellId,
  lockedPcfId,
  isChildrenAdmin,
}: {
  lockedCellId?: number;
  lockedSeniorCellId?: number;
  lockedPcfId?: number;
  isChildrenAdmin?: boolean;
} = {}) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  // chart controls
  const [chartView, setChartView] = useState<"month" | "year">("month");
  const [chartYear, setChartYear] = useState(() => String(new Date().getFullYear()));
  const [chartFilter, setChartFilter] = useState(() => {
    if (isChildrenAdmin)    return "children";
    if (lockedCellId)       return `cell-${lockedCellId}`;
    if (lockedSeniorCellId) return `sc-${lockedSeniorCellId}`;
    if (lockedPcfId)        return `pcf-${lockedPcfId}`;
    return "all";
  });
  // table expand state — auto-expand the leader's locked row
  const [expandedPcfs, setExpandedPcfs] = useState<Set<number>>(() => lockedPcfId ? new Set([lockedPcfId]) : new Set());
  const [expandedScs,  setExpandedScs]  = useState<Set<number>>(() => lockedSeniorCellId ? new Set([lockedSeniorCellId]) : new Set());

  const togglePcf = (id: number) => setExpandedPcfs(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleSc  = (id: number) => setExpandedScs(prev  => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const { data: reportData, isLoading } = useGetFellowshipAttendanceReport(
    { month },
    { query: { queryKey: getGetFellowshipAttendanceReportQueryKey({ month }) } },
  );
  const { data: hierarchyData } = useGetFellowshipHierarchy({ query: { queryKey: getGetFellowshipHierarchyQueryKey() } });

  const services        = (reportData?.services            ?? []) as any[];
  const pcfs            = (reportData?.pcfs                ?? []) as any[];
  const standaloneSCs   = (reportData?.standaloneSeniorCells ?? []) as any[];
  const standaloneCells = (reportData?.standaloneCells     ?? []) as any[];
  const filterPcfs      = (hierarchyData?.pcfs             ?? []) as any[];
  const filterSCs       = (hierarchyData?.standaloneSeniorCells ?? []) as any[];
  const filterCells     = (hierarchyData?.standaloneCells  ?? []) as any[];
  const isLocked        = !!(lockedCellId || lockedSeniorCellId || lockedPcfId);

  // For locked leaders: derive the single row they are allowed to see
  const lockedSCRow = useMemo(() => {
    if (!lockedSeniorCellId) return null;
    const allSCs = [
      ...standaloneSCs,
      ...pcfs.flatMap((p: any) => p.seniorCells ?? []),
    ];
    return allSCs.find((sc: any) => sc.id === lockedSeniorCellId) ?? null;
  }, [lockedSeniorCellId, standaloneSCs, pcfs]);

  const lockedCellRow = useMemo(() => {
    if (!lockedCellId) return null;
    const allCells = [
      ...standaloneCells,
      ...standaloneSCs.flatMap((sc: any) => sc.cells ?? []),
      ...pcfs.flatMap((p: any) => (p.seniorCells ?? []).flatMap((sc: any) => sc.cells ?? [])),
    ];
    return allCells.find((c: any) => c.id === lockedCellId) ?? null;
  }, [lockedCellId, standaloneCells, standaloneSCs, pcfs]);

  // Visible rows for the table (filtered by locked scope)
  const visiblePcfs          = isLocked ? (lockedPcfId ? pcfs.filter((p: any) => p.id === lockedPcfId) : []) : pcfs;
  const visibleStandaloneSCs = isLocked ? (lockedSeniorCellId && !lockedPcfId ? [lockedSCRow].filter(Boolean) : []) : standaloneSCs;
  const visibleStandaloneCells = isLocked ? (lockedCellId && !lockedSeniorCellId && !lockedPcfId ? [lockedCellRow].filter(Boolean) : []) : standaloneCells;

  // Chart trend params
  const trendParams: any = { view: chartView };
  if (chartView === "month") trendParams.month = month;
  else trendParams.year = chartYear;
  if (chartFilter.startsWith("pcf-"))  trendParams.pcfId        = parseInt(chartFilter.slice(4));
  if (chartFilter.startsWith("sc-"))   trendParams.seniorCellId = parseInt(chartFilter.slice(3));
  if (chartFilter.startsWith("cell-")) trendParams.cellId       = parseInt(chartFilter.slice(5));
  if (chartFilter === "teens")         trendParams.group        = "teens";
  if (chartFilter === "children")      trendParams.group        = "children";

  const { data: trendData, isLoading: trendLoading } = useGetAttendanceTrend(trendParams, {
    query: { queryKey: getGetAttendanceTrendQueryKey(trendParams) },
  });
  const dataPoints = (trendData?.dataPoints ?? []) as any[];

  // Helper: display value — "—" for 0
  function D(n: number, cls: string) {
    return n === 0
      ? <span className="text-gray-300">—</span>
      : <span className={cls}>{n}</span>;
  }

  function svcMbrs(att: any, svcId: number) { return att?.[svcId] ?? 0; }
  function svcFt(ftAtt: any, svcId: number)  { return ftAtt?.[svcId] ?? 0; }

  function rowTotals(mbrsAtt: any, ftAtt: any) {
    let mbrs = 0, ft = 0;
    for (const s of services) { mbrs += svcMbrs(mbrsAtt, s.id); ft += svcFt(ftAtt, s.id); }
    return { mbrs, ft, total: mbrs + ft };
  }

  async function exportToExcel() {
    const header1 = ["#", "Fellowship", ...services.flatMap((s: any) => [s.name, "", ""]), "Total MBRS", "Total FT", "Grand Total"];
    const header2 = ["", "", ...services.flatMap(() => ["MBRS", "FT", "TOTAL"]), "", "", ""];
    const rows: any[][] = [header1, header2];
    let sn = 1;
    for (const pcf of pcfs) {
      const { mbrs, ft, total } = rowTotals(pcf.serviceAttendance, pcf.ftServiceAttendance);
      rows.push([sn++, pcf.name, ...services.flatMap((s: any) => [svcMbrs(pcf.serviceAttendance, s.id), svcFt(pcf.ftServiceAttendance, s.id), svcMbrs(pcf.serviceAttendance, s.id) + svcFt(pcf.ftServiceAttendance, s.id)]), mbrs, ft, total]);
      for (const sc of pcf.seniorCells ?? []) {
        const r = rowTotals(sc.serviceAttendance, sc.ftServiceAttendance);
        rows.push(["", `  ${sc.name}`, ...services.flatMap((s: any) => [svcMbrs(sc.serviceAttendance, s.id), svcFt(sc.ftServiceAttendance, s.id), svcMbrs(sc.serviceAttendance, s.id) + svcFt(sc.ftServiceAttendance, s.id)]), r.mbrs, r.ft, r.total]);
        for (const cell of sc.cells ?? []) {
          const mbrsCnt = services.reduce((a: number, s: any) => a + svcMbrs(cell.serviceAttendance, s.id), 0);
          rows.push(["", `    ${cell.name}`, ...services.flatMap((s: any) => [svcMbrs(cell.serviceAttendance, s.id), 0, svcMbrs(cell.serviceAttendance, s.id)]), mbrsCnt, 0, mbrsCnt]);
        }
      }
    }
    for (const sc of standaloneSCs) {
      const r = rowTotals(sc.serviceAttendance, sc.ftServiceAttendance);
      rows.push([sn++, sc.name, ...services.flatMap((s: any) => [svcMbrs(sc.serviceAttendance, s.id), svcFt(sc.ftServiceAttendance, s.id), svcMbrs(sc.serviceAttendance, s.id) + svcFt(sc.ftServiceAttendance, s.id)]), r.mbrs, r.ft, r.total]);
      for (const cell of sc.cells ?? []) {
        const mbrsCnt = services.reduce((a: number, s: any) => a + svcMbrs(cell.serviceAttendance, s.id), 0);
        rows.push(["", `  ${cell.name}`, ...services.flatMap((s: any) => [svcMbrs(cell.serviceAttendance, s.id), 0, svcMbrs(cell.serviceAttendance, s.id)]), mbrsCnt, 0, mbrsCnt]);
      }
    }
    for (const cell of standaloneCells) {
      const r = rowTotals(cell.serviceAttendance, cell.ftServiceAttendance);
      rows.push([sn++, cell.name, ...services.flatMap((s: any) => [svcMbrs(cell.serviceAttendance, s.id), svcFt(cell.ftServiceAttendance, s.id), svcMbrs(cell.serviceAttendance, s.id) + svcFt(cell.ftServiceAttendance, s.id)]), r.mbrs, r.ft, r.total]);
    }
    await downloadAoaAsExcel(rows, "Fellowship Attendance", `fellowship-attendance-${month}.xlsx`);
  }

  // Grand totals per service (mirroring the attendance page's Grand Total formula exactly)
  const grandMbrs: Record<number, number> = {};
  const grandFt: Record<number, number> = {};
  for (const s of services) {
    // MBRS = fellowship members + returningFtNoFellowship + visitors + teensCount + childrenCount
    grandMbrs[s.id] = [...pcfs, ...standaloneSCs, ...standaloneCells].reduce((a: number, g: any) => a + svcMbrs(g.serviceAttendance, s.id), 0)
                    + (s.returningFtNoFellowshipCount ?? 0)
                    + (s.visitorCount ?? 0)
                    + (s.teensCount ?? 0)
                    + (s.childrenCount ?? 0);
    // FT = fellowship FTs + ftNotInFellowship + teensFt + childrenFt (= totalFT in attendance page)
    grandFt[s.id]   = [...pcfs, ...standaloneSCs, ...standaloneCells].reduce((a: number, g: any) => a + svcFt(g.ftServiceAttendance, s.id), 0)
                    + (s.ftNotInFellowshipCount ?? 0)
                    + (s.teensFtCount ?? 0)
                    + (s.childrenFtCount ?? 0);
  }

  const totalMbrs  = services.reduce((a: number, s: any) => a + (grandMbrs[s.id] ?? 0), 0);
  const totalFt    = services.reduce((a: number, s: any) => a + (grandFt[s.id] ?? 0), 0);
  const totalTeens = services.reduce((a: number, s: any) => a + (s.teensCount ?? 0), 0);
  const totalChldren = services.reduce((a: number, s: any) => a + (s.childrenCount ?? 0), 0);

  return (
    <div className="space-y-5">
      {/* Controls row */}
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Month</label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-40" />
        </div>
        <Button size="sm" variant="outline" onClick={exportToExcel} className="gap-1.5">
          <Download className="w-3.5 h-3.5" /> Export Excel
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      )}

      {/* Empty */}
      {!isLoading && services.length === 0 && (
        <div className="text-center py-12 text-gray-400 border rounded-lg bg-gray-50">
          <CalendarCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>No services found for {month}.</p>
        </div>
      )}

      {/* ── Main attendance table ── */}
      {!isLoading && services.length > 0 && (
        <div className="rounded-xl border overflow-hidden bg-white shadow-sm">
          <div className="px-4 py-2.5 border-b bg-gray-50 flex items-center justify-between">
            <span className="font-semibold text-sm text-gray-700 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-gray-500" /> Fellowship Attendance Summary
            </span>
            <span className="text-xs text-gray-400">{month}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                {/* Row 1 — service names spanning 3 cols each */}
                <tr className="border-b bg-gray-50">
                  <th rowSpan={2} className="text-left px-3 py-2 w-7 border-r text-gray-500 text-[11px] font-semibold uppercase">#</th>
                  <th rowSpan={2} className="text-left px-3 py-2 min-w-44 border-r text-gray-500 text-[11px] font-semibold uppercase">Fellowship</th>
                  {services.map((svc: any) => (
                    <th key={svc.id} colSpan={3} className="text-center px-2 py-2 border-r border-l border-gray-200">
                      <div className="text-purple-700 font-semibold text-xs">{svc.name}</div>
                      <div className="text-gray-400 font-normal text-[10px]">
                        {svc.date
                          ? new Date(svc.date + "T00:00:00").toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "2-digit" })
                          : ""}
                      </div>
                    </th>
                  ))}
                </tr>
                {/* Row 2 — MBRS / FT / TOTAL sub-headers */}
                <tr className="border-b bg-gray-50 text-[10px] uppercase tracking-wide">
                  {services.map((svc: any) => (
                    <Fragment key={svc.id}>
                      <th className="text-center px-2 py-1.5 text-violet-600 font-semibold w-14">MBRS</th>
                      <th className="text-center px-2 py-1.5 text-orange-500 font-semibold w-10">FT</th>
                      <th className="text-center px-2 py-1.5 text-green-600 font-semibold w-14 border-r border-gray-200">TOTAL</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* ── PCF rows ── */}
                {!isChildrenAdmin && visiblePcfs.map((pcf: any, gi: number) => {
                  const isExpanded = expandedPcfs.has(pcf.id);
                  const { mbrs: pcfMbrs, ft: pcfFt, total: pcfTotal } = rowTotals(pcf.serviceAttendance, pcf.ftServiceAttendance);
                  return (
                    <Fragment key={`pcf-${pcf.id}`}>
                      <tr className="border-b bg-white hover:bg-gray-50 cursor-pointer font-bold select-none" onClick={() => togglePcf(pcf.id)}>
                        <td className="px-3 py-2.5 text-center text-xs text-gray-500 border-r">{gi + 1}</td>
                        <td className="px-3 py-2.5 border-r">
                          <span className="flex items-center gap-1.5 text-gray-900 text-sm">
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-gray-600" /> : <ChevronRightIcon className="w-3.5 h-3.5 flex-shrink-0 text-gray-600" />}
                            {pcf.name}
                          </span>
                        </td>
                        {services.map((svc: any) => {
                          const m = svcMbrs(pcf.serviceAttendance, svc.id);
                          const f = svcFt(pcf.ftServiceAttendance, svc.id);
                          return (
                            <Fragment key={svc.id}>
                              <td className="text-center px-2 py-2.5 bg-violet-50">{D(m, "text-violet-700 font-bold")}</td>
                              <td className="text-center px-2 py-2.5 bg-yellow-50">{D(f, "text-orange-500 font-bold")}</td>
                              <td className="text-center px-2 py-2.5 bg-green-50 border-r border-gray-200">{D(m + f, "text-green-700 font-bold")}</td>
                            </Fragment>
                          );
                        })}
                      </tr>
                      {/* SC rows when expanded */}
                      {isExpanded && (pcf.seniorCells ?? []).map((sc: any) => {
                        const scExpanded = expandedScs.has(sc.id);
                        return (
                          <Fragment key={`sc-${sc.id}`}>
                            <tr className="border-b bg-gray-50 hover:bg-gray-100 cursor-pointer select-none" onClick={e => { e.stopPropagation(); toggleSc(sc.id); }}>
                              <td className="px-3 py-2 border-r" />
                              <td className="px-3 py-2 pl-7 border-r">
                                <span className="flex items-center gap-1 text-gray-700 text-xs font-semibold">
                                  {scExpanded ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRightIcon className="w-3 h-3 flex-shrink-0" />}
                                  {sc.name}
                                </span>
                              </td>
                              {services.map((svc: any) => {
                                const m = svcMbrs(sc.serviceAttendance, svc.id);
                                const f = svcFt(sc.ftServiceAttendance, svc.id);
                                return (
                                  <Fragment key={svc.id}>
                                    <td className="text-center px-2 py-2 bg-violet-50 text-xs">{D(m, "text-violet-700 font-bold")}</td>
                                    <td className="text-center px-2 py-2 bg-yellow-50 text-xs">{D(f, "text-orange-500 font-bold")}</td>
                                    <td className="text-center px-2 py-2 bg-green-50 border-r border-gray-200 text-xs">{D(m + f, "text-green-700 font-bold")}</td>
                                  </Fragment>
                                );
                              })}
                            </tr>
                            {/* Cell rows when SC expanded */}
                            {scExpanded && (sc.cells ?? []).map((cell: any) => (
                              <tr key={`cell-${cell.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="px-3 py-1.5 border-r" />
                                <td className="px-3 py-1.5 pl-12 border-r text-xs text-gray-600">{cell.name}</td>
                                {services.map((svc: any) => {
                                  const m = svcMbrs(cell.serviceAttendance, svc.id);
                                  return (
                                    <Fragment key={svc.id}>
                                      <td className="text-center px-2 py-1.5 bg-violet-50 text-xs">{D(m, "text-violet-600")}</td>
                                      <td className="text-center px-2 py-1.5 bg-yellow-50 text-xs"><span className="text-gray-300">—</span></td>
                                      <td className="text-center px-2 py-1.5 bg-green-50 border-r border-gray-200 text-xs">{D(m, "text-green-600")}</td>
                                    </Fragment>
                                  );
                                })}
                              </tr>
                            ))}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })}

                {/* ── Standalone SC rows ── */}
                {!isChildrenAdmin && visibleStandaloneSCs.map((sc: any, gi: number) => {
                  const scExpanded = expandedScs.has(sc.id);
                  return (
                    <Fragment key={`ssc-${sc.id}`}>
                      <tr className="border-b bg-white hover:bg-gray-50 cursor-pointer font-bold select-none" onClick={() => toggleSc(sc.id)}>
                        <td className="px-3 py-2.5 text-center text-xs text-gray-500 border-r">{visiblePcfs.length + gi + 1}</td>
                        <td className="px-3 py-2.5 border-r">
                          <span className="flex items-center gap-1.5 text-gray-900 text-sm">
                            {scExpanded ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-gray-600" /> : <ChevronRightIcon className="w-3.5 h-3.5 flex-shrink-0 text-gray-600" />}
                            {sc.name}
                          </span>
                        </td>
                        {services.map((svc: any) => {
                          const m = svcMbrs(sc.serviceAttendance, svc.id);
                          const f = svcFt(sc.ftServiceAttendance, svc.id);
                          return (
                            <Fragment key={svc.id}>
                              <td className="text-center px-2 py-2.5 bg-violet-50">{D(m, "text-violet-700 font-bold")}</td>
                              <td className="text-center px-2 py-2.5 bg-yellow-50">{D(f, "text-orange-500 font-bold")}</td>
                              <td className="text-center px-2 py-2.5 bg-green-50 border-r border-gray-200">{D(m + f, "text-green-700 font-bold")}</td>
                            </Fragment>
                          );
                        })}
                      </tr>
                      {scExpanded && (sc.cells ?? []).map((cell: any) => (
                        <tr key={`scell-${cell.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-1.5 border-r" />
                          <td className="px-3 py-1.5 pl-8 border-r text-xs text-gray-600">{cell.name}</td>
                          {services.map((svc: any) => {
                            const m = svcMbrs(cell.serviceAttendance, svc.id);
                            return (
                              <Fragment key={svc.id}>
                                <td className="text-center px-2 py-1.5 bg-violet-50 text-xs">{D(m, "text-violet-600")}</td>
                                <td className="text-center px-2 py-1.5 bg-yellow-50 text-xs"><span className="text-gray-300">—</span></td>
                                <td className="text-center px-2 py-1.5 bg-green-50 border-r border-gray-200 text-xs">{D(m, "text-green-600")}</td>
                              </Fragment>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}

                {/* ── Standalone Cell rows ── */}
                {!isChildrenAdmin && visibleStandaloneCells.map((cell: any, gi: number) => (
                  <tr key={`standalone-${cell.id}`} className="border-b bg-white hover:bg-gray-50 font-bold">
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500 border-r">{visiblePcfs.length + visibleStandaloneSCs.length + gi + 1}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-900 border-r">{cell.name}</td>
                    {services.map((svc: any) => {
                      const m = svcMbrs(cell.serviceAttendance, svc.id);
                      const f = svcFt(cell.ftServiceAttendance, svc.id);
                      return (
                        <Fragment key={svc.id}>
                          <td className="text-center px-2 py-2.5 bg-violet-50">{D(m, "text-violet-700 font-bold")}</td>
                          <td className="text-center px-2 py-2.5 bg-yellow-50">{D(f, "text-orange-500 font-bold")}</td>
                          <td className="text-center px-2 py-2.5 bg-green-50 border-r border-gray-200">{D(m + f, "text-green-700 font-bold")}</td>
                        </Fragment>
                      );
                    })}
                  </tr>
                ))}

                {/* ── Teens / Children / No-Fellowship / Grand Total rows — hidden for locked leaders ── */}
                {(!isLocked || isChildrenAdmin) && (
                  <tr className="border-b border-teal-100 bg-teal-50">
                    <td className="px-3 py-2 text-center text-teal-400 text-xs font-bold border-r">—</td>
                    <td className="px-3 py-2 text-teal-800 text-xs font-semibold border-r">😊 Teens Church</td>
                    {services.map((svc: any) => {
                      const mbrs = svc.teensCount ?? 0;
                      const ft   = svc.teensFtCount ?? 0;
                      return (
                        <Fragment key={svc.id}>
                          <td className="text-center px-2 py-2 bg-violet-50 text-xs">{D(mbrs, "text-violet-700 font-bold")}</td>
                          <td className="text-center px-2 py-2 bg-yellow-50 text-xs">{D(ft, "text-orange-500 font-bold")}</td>
                          <td className="text-center px-2 py-2 bg-green-50 border-r border-gray-200 text-xs">{D(mbrs + ft, "text-green-700 font-bold")}</td>
                        </Fragment>
                      );
                    })}
                  </tr>
                )}

                {/* ── Children row ── */}
                {(!isLocked || isChildrenAdmin) && (
                  <tr className="border-b border-blue-100 bg-blue-50">
                    <td className="px-3 py-2 text-center text-blue-400 text-xs font-bold border-r">—</td>
                    <td className="px-3 py-2 text-blue-800 text-xs font-semibold border-r">👶 Children&apos;s Church</td>
                    {services.map((svc: any) => {
                      const mbrs = svc.childrenCount ?? 0;
                      const ft   = svc.childrenFtCount ?? 0;
                      return (
                        <Fragment key={svc.id}>
                          <td className="text-center px-2 py-2 bg-violet-50 text-xs">{D(mbrs, "text-violet-700 font-bold")}</td>
                          <td className="text-center px-2 py-2 bg-yellow-50 text-xs">{D(ft, "text-orange-500 font-bold")}</td>
                          <td className="text-center px-2 py-2 bg-green-50 border-r border-gray-200 text-xs">{D(mbrs + ft, "text-green-700 font-bold")}</td>
                        </Fragment>
                      );
                    })}
                  </tr>
                )}

                {/* ── No Fellowship row ── */}
                {!isLocked && !isChildrenAdmin && (
                  <tr className="border-b border-orange-100 bg-orange-50/40">
                    <td className="px-3 py-2 text-center text-orange-300 text-xs border-r">—</td>
                    <td className="px-3 py-2 text-xs text-gray-500 italic border-r">No Fellowship</td>
                    {services.map((svc: any) => {
                      const mbrs = (svc.returningFtNoFellowshipCount ?? 0) + (svc.visitorCount ?? 0);
                      const ft   = svc.ftNotInFellowshipCount ?? 0;
                      return (
                        <Fragment key={svc.id}>
                          <td className="text-center px-2 py-2 bg-violet-50 text-xs">{D(mbrs, "text-violet-600 font-semibold")}</td>
                          <td className="text-center px-2 py-2 bg-yellow-50 text-xs">{D(ft, "text-orange-500 font-semibold")}</td>
                          <td className="text-center px-2 py-2 bg-green-50 border-r border-gray-200 text-xs">{D(mbrs + ft, "text-orange-600 font-semibold")}</td>
                        </Fragment>
                      );
                    })}
                  </tr>
                )}

                {/* ── Grand Total row — matches attendance page formula exactly; hidden for locked leaders ── */}
                {!isLocked && !isChildrenAdmin && (
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                    <td className="px-3 py-2.5 border-r" />
                    <td className="px-3 py-2.5 text-xs text-gray-800 uppercase tracking-wide border-r">Grand Total</td>
                    {services.map((svc: any) => {
                      const m = grandMbrs[svc.id] ?? 0;
                      const f = grandFt[svc.id] ?? 0;
                      return (
                        <Fragment key={svc.id}>
                          <td className="text-center px-2 py-2.5 bg-violet-100 text-violet-800 font-bold">{m}</td>
                          <td className="text-center px-2 py-2.5 bg-yellow-100 text-orange-600 font-bold">{f}</td>
                          <td className="text-center px-2 py-2.5 bg-green-100 text-green-800 font-bold border-r border-gray-200">{m + f}</td>
                        </Fragment>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Attendance Progress Chart ── */}
      {!isLoading && services.length > 0 && (
        <div className="rounded-xl border bg-white shadow-sm p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-gray-800 text-sm">Attendance Progress</h3>
            <div className="flex items-center gap-2">
              <div className="flex rounded-md border overflow-hidden text-xs">
                <button
                  className={`px-3 py-1.5 font-medium transition-colors ${chartView === "month" ? "bg-gray-800 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                  onClick={() => setChartView("month")}
                >Month</button>
                <button
                  className={`px-3 py-1.5 font-medium transition-colors border-l ${chartView === "year" ? "bg-gray-800 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                  onClick={() => setChartView("year")}
                >Year</button>
              </div>
              {chartView === "year" && (
                <Input
                  type="number"
                  value={chartYear}
                  onChange={e => setChartYear(e.target.value)}
                  className="w-20 h-8 text-xs"
                  min="2020"
                  max={String(new Date().getFullYear())}
                />
              )}
              {!isLocked && (
                <Select value={chartFilter} onValueChange={setChartFilter}>
                  <SelectTrigger className="h-8 text-xs w-44">
                    <SelectValue placeholder="All Fellowships" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 overflow-y-auto text-xs">
                    {!isChildrenAdmin && <SelectItem value="all">All Fellowships</SelectItem>}
                    <SelectItem value="teens">😊 Teens Church</SelectItem>
                    <SelectItem value="children">👶 Children&apos;s Church</SelectItem>
                    {!isChildrenAdmin && filterPcfs.map((p: any) => (
                      <SelectItem key={p.id} value={`pcf-${p.id}`} className="font-semibold text-purple-700">{p.name}</SelectItem>
                    ))}
                    {!isChildrenAdmin && filterSCs.map((s: any) => (
                      <SelectItem key={s.id} value={`sc-${s.id}`} className="text-gray-700">{s.name}</SelectItem>
                    ))}
                    {!isChildrenAdmin && filterCells.map((c: any) => (
                      <SelectItem key={c.id} value={`cell-${c.id}`}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {trendLoading && <Skeleton className="h-44 w-full" />}
          {!trendLoading && dataPoints.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">No data for this period.</p>
          )}
          {!trendLoading && dataPoints.length > 0 && (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dataPoints} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} />
                <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value: any) => [value, "Attendance"]}
                />
                <Bar dataKey="total" fill="#6d28d9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FINANCE REPORT ───────────────────────────────────────────────────────────

function FinanceReport() {
  const [ministryYearId, setMinistryYearId] = useState("");
  const [detailRow, setDetailRow] = useState<any>(null);

  const { data: yearsData } = useListMinistryYears({}, { query: { queryKey: getListMinistryYearsQueryKey({}) } });
  const years = yearsData ?? [];

  const params = { ministryYearId: ministryYearId ? parseInt(ministryYearId) : undefined };
  const { data: report, isLoading } = useGetFinanceReport(params, {
    query: { queryKey: getGetFinanceReportQueryKey(params), enabled: !!ministryYearId },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={ministryYearId || "none"} onValueChange={v => setMinistryYearId(v === "none" ? "" : v)}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Select a ministry year..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select a year...</SelectItem>
            {years.filter((y: any) => !y.isClosed).map((y: any) => (
              <SelectItem key={y.id} value={String(y.id)}>
                {y.name} {y.isActive ? "(Active)" : ""}
              </SelectItem>
            ))}
            {years.some((y: any) => y.isClosed) && (
              <>
                <div className="px-2 py-1.5 text-xs font-semibold text-gray-400 border-t mt-1 pt-2">Closed Years (Read-only)</div>
                {years.filter((y: any) => y.isClosed).map((y: any) => (
                  <SelectItem key={y.id} value={String(y.id)}>
                    🔒 {y.name}
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      {!ministryYearId && (
        <div className="text-center py-12 text-gray-400 border rounded-lg bg-gray-50">
          <Banknote className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>Select a ministry year to view the finance report.</p>
        </div>
      )}

      {ministryYearId && isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      )}

      {report && !isLoading && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-purple-100">
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold text-purple-700">{fmt(report.total ?? 0)}</p>
                <p className="text-xs text-gray-500 mt-1">Total Givings</p>
              </CardContent>
            </Card>
            <Card className="border-yellow-100">
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold text-yellow-600">{fmt(report.thisMonth ?? 0)}</p>
                <p className="text-xs text-gray-500 mt-1">This Month</p>
              </CardContent>
            </Card>
            <Card className="border-green-100">
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold text-green-700">{report.contributorCount ?? 0}</p>
                <p className="text-xs text-gray-500 mt-1">Contributors</p>
              </CardContent>
            </Card>
          </div>

          <div className="border rounded-lg overflow-hidden bg-white">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="w-8 text-center">#</TableHead>
                  <TableHead>Giving Type</TableHead>
                  <TableHead className="text-right">Amount (GHS)</TableHead>
                  <TableHead className="text-center">Givers</TableHead>
                  <TableHead className="text-center w-24">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report.byType ?? []).filter((r: any) => r.total > 0).map((row: any, i: number) => (
                  <TableRow key={row.givingTypeId ?? i} className="hover:bg-gray-50">
                    <TableCell className="text-center text-xs text-gray-400 font-mono">{i + 1}</TableCell>
                    <TableCell className="font-medium">{row.givingTypeName}</TableCell>
                    <TableCell className="text-right font-semibold text-green-700">
                      {Number(row.total).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-center text-gray-600">{row.count}</TableCell>
                    <TableCell className="text-center">
                      <button
                        className="text-xs text-purple-600 hover:text-purple-800 underline"
                        onClick={() => setDetailRow(row)}
                      >
                        View
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {(report.byType ?? []).filter((r: any) => r.total > 0).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-400">
                      No giving records found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={!!detailRow} onOpenChange={() => setDetailRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{detailRow?.givingTypeName} — Givers</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Total: <span className="font-semibold text-green-700">{fmt(detailRow?.total ?? 0)}</span></span>
              <span>Contributors: <span className="font-semibold">{detailRow?.count ?? 0}</span></span>
            </div>
            {(detailRow?.contributors ?? []).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No contributors found.</p>
            ) : (
              <div className="border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Name</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Amount (GHS)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(detailRow?.contributors ?? []).map((c: any) => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-800">{c.name}</td>
                        <td className="px-3 py-2 text-right font-mono text-green-700">
                          {Number(c.amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── FIRST TIMERS REPORT ──────────────────────────────────────────────────────

function FirstTimersReport() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [visitFt, setVisitFt] = useState<any>(null);

  const params = { search, page, limit: 20, startDate: startDate || undefined, endDate: endDate || undefined };
  const { data, isLoading } = useGetFirstTimersStatusReport(params, {
    query: { queryKey: getGetFirstTimersStatusReportQueryKey(params) },
  });

  const rows        = data?.data       ?? [];
  const total       = data?.total      ?? 0;
  const established = data?.established ?? 0;
  const stillActive = data?.stillActive ?? 0;
  const totalPages  = Math.ceil(total / 20);
  const convRate    = total > 0 ? Math.round((established / total) * 100) : 0;

  function statusBadge(ft: any) {
    if (ft.convertedTo === "member")  return <Badge className="text-[10px] border-0 bg-green-100 text-green-700 font-semibold">✓ Member</Badge>;
    if (ft.convertedTo === "teen")    return <Badge className="text-[10px] border-0 bg-blue-100 text-blue-700 font-semibold">✓ Teens</Badge>;
    if (ft.convertedTo === "child")   return <Badge className="text-[10px] border-0 bg-yellow-100 text-yellow-700 font-semibold">✓ Children&apos;s</Badge>;
    if (ft.convertedTo === "visitor") return <Badge className="text-[10px] border-0 bg-orange-100 text-orange-700 font-semibold">✓ Visitor</Badge>;
    if (ft.status === "Removed") {
      return (
        <div className="space-y-0.5">
          <Badge className="text-[10px] border-0 bg-red-100 text-red-500">Removed</Badge>
          {ft.archiveReason && <p className="text-[9px] text-red-400 leading-tight max-w-[150px] break-words">{ft.archiveReason}</p>}
        </div>
      );
    }
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">From date</label>
          <Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }} className="w-36 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">To date</label>
          <Input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }} className="w-36 text-sm" />
        </div>
      </div>

      {total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-purple-100">
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-xl font-bold text-purple-700">{total}</p>
              <p className="text-[10px] text-gray-500">Total First Timers</p>
            </CardContent>
          </Card>
          <Card className="border-green-100">
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-xl font-bold text-green-700">{established}</p>
              <p className="text-[10px] text-gray-500">Established ({convRate}%)</p>
            </CardContent>
          </Card>
          <Card className="border-blue-100">
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-xl font-bold text-blue-700">{stillActive}</p>
              <p className="text-[10px] text-gray-500">Still Coming</p>
            </CardContent>
          </Card>
          <Card className="border-gray-100">
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-xl font-bold text-gray-700">{total - established - stillActive}</p>
              <p className="text-[10px] text-gray-500">Lost / Removed</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="text-sm text-gray-500">{total} first-timer{total !== 1 ? "s" : ""} total</div>

      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="w-10 text-center">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Contact</TableHead>
              <TableHead className="hidden sm:table-cell">Gender</TableHead>
              <TableHead className="text-center">Visits</TableHead>
              <TableHead>Status / Destination</TableHead>
              <TableHead className="hidden md:table-cell">First Visit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-gray-400">
                  <UserPlus className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>No first-timers found</p>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((ft: any, idx: number) => {
                const isEstablished = !!ft.convertedTo && ft.status !== "Removed" && ft.convertedTo !== "visitor";
                return (
                  <TableRow key={ft.id} className={`hover:bg-gray-50 ${isEstablished ? "bg-green-50/30" : ""}`}>
                    <TableCell className="text-center text-xs text-gray-400 font-mono">{(page - 1) * 20 + idx + 1}</TableCell>
                    <TableCell>
                      <div>
                        <p className={`font-medium text-sm ${isEstablished ? "text-gray-700" : "text-gray-900"}`}>
                          {ft.firstName} {ft.lastName}
                        </p>
                        {ft.movedToDetail && (
                          <p className="text-[10px] text-green-600 font-semibold mt-0.5">
                            → {ft.movedToDetail}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm hidden sm:table-cell">{ft.contact || "—"}</TableCell>
                    <TableCell className="capitalize text-sm text-gray-500 hidden sm:table-cell">{ft.gender}</TableCell>
                    <TableCell className="text-center">
                      <button
                        onClick={() => ft.visitCount > 0 && setVisitFt(ft)}
                        title={ft.visitCount > 0 ? "Click to view visit timeline" : ""}
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all ${ft.visitCount >= 3 ? "bg-purple-200 text-purple-800 hover:bg-purple-300" : ft.visitCount > 0 ? "bg-purple-100 text-purple-700 hover:bg-purple-200" : "bg-gray-100 text-gray-400"} ${ft.visitCount > 0 ? "cursor-pointer" : ""}`}
                      >
                        {ft.visitCount || "—"}
                      </button>
                    </TableCell>
                    <TableCell>
                      {statusBadge(ft) ?? (
                        <Badge className="text-[10px] border-0 bg-purple-100 text-purple-700">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-500 text-xs hidden md:table-cell">
                      <div>{ft.firstVisitService}</div>
                      <div className="text-gray-400">{ft.firstVisitDate ? new Date(ft.firstVisitDate).toLocaleDateString("en-GH") : ""}</div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Page {page} of {totalPages} &bull; {total} records</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <VisitTimelineDialog ft={visitFt} open={!!visitFt} onClose={() => setVisitFt(null)} />
    </div>
  );
}

// ─── ONLINE SERVICES REPORT ───────────────────────────────────────────────────

interface OnlineServiceRow {
  id: number;
  title: string;
  date: string;
  liveStartedAt: string | null;
  isLive: boolean;
  liveEnded: boolean;
  watcherCount: number;
}

function OnlineServicesReport() {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
  const [data, setData] = React.useState<OnlineServiceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [downloadingId, setDownloadingId] = React.useState<number | null>(null);
  const PAGE_SIZE = 10;

  React.useEffect(() => {
    setLoading(true);
    fetch("/api/reports/online-services", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setData(Array.isArray(d) ? d : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [token]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(r =>
      r.title.toLowerCase().includes(q) ||
      (r.date && r.date.includes(q))
    );
  }, [data, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  React.useEffect(() => { setPage(1); }, [search]);

  async function downloadParticipants(row: OnlineServiceRow) {
    setDownloadingId(row.id);
    try {
      const res = await fetch(`/api/videos/${row.id}/watcher-sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const sessions: any[] = await res.json();

      const liveDate = row.liveStartedAt
        ? new Date(row.liveStartedAt).toLocaleString("en-GH")
        : (row.date ? new Date(row.date).toLocaleDateString("en-GH") : "");

      const header = [
        [`Online Service: ${row.title}`],
        [`Live Date: ${liveDate}`],
        [`Total Participants: ${sessions.length}`],
        [`Downloaded: ${new Date().toLocaleString("en-GH")}`],
        [],
        ["#", "Full Name", "Title", "Fellowship", "Time Joined", "Total Duration"],
      ];

      const body = sessions.map((s: any, i: number) => {
        const name = `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim();
        const joined = s.firstJoinedAt ? new Date(s.firstJoinedAt).toLocaleString("en-GH") : "";
        const durMs = s.totalDurationMs ?? 0;
        const mins = Math.floor(durMs / 60000);
        const secs = Math.floor((durMs % 60000) / 1000);
        const dur = durMs > 0 ? `${mins}m ${secs}s` : "—";
        return [i + 1, name, s.title ?? "", s.cellName ?? "", joined, dur];
      });

      const safe = row.title.replace(/[^a-zA-Z0-9 _-]/g, "").trim().slice(0, 40);
      await downloadAoaAsExcel([...header, ...body], "Participants", `${safe}_participants.xlsx`);
    } catch {
      alert("Failed to download participants. Please try again.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Live Online Training Videos Reports</h2>
          <p className="text-xs text-gray-500 mt-0.5">All past and current live broadcast sessions</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name or date…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 text-sm h-9"
          />
        </div>
      </div>

      {/* Table card */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gradient-to-r from-purple-700 to-purple-900">
                <TableHead className="text-white font-semibold text-xs w-12 text-center">SN</TableHead>
                <TableHead className="text-white font-semibold text-xs">Name of Live Meeting</TableHead>
                <TableHead className="text-white font-semibold text-xs hidden sm:table-cell">Date</TableHead>
                <TableHead className="text-white font-semibold text-xs text-center">Participants</TableHead>
                <TableHead className="text-white font-semibold text-xs text-center">Download</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-6 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-24 mx-auto rounded-lg" /></TableCell>
                  </TableRow>
                ))
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-16 text-gray-400">
                    <Globe className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">
                      {search ? "No services match your search." : "No online services found yet."}
                    </p>
                    <p className="text-xs mt-1">Live services will appear here once they've started.</p>
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row, idx) => {
                  const sn = (page - 1) * PAGE_SIZE + idx + 1;
                  const displayDate = row.liveStartedAt
                    ? new Date(row.liveStartedAt).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })
                    : row.date
                    ? new Date(row.date).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })
                    : "—";
                  const isDownloading = downloadingId === row.id;
                  return (
                    <TableRow
                      key={row.id}
                      className={`transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-purple-50/30"} hover:bg-purple-50`}
                    >
                      <TableCell className="text-center text-xs text-gray-500 font-medium">{sn}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-gray-900 truncate">{row.title}</p>
                            {row.isLive && !row.liveEnded && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 mt-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                LIVE NOW
                              </span>
                            )}
                            {row.liveEnded && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 mt-0.5">
                                Ended
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 hidden sm:table-cell whitespace-nowrap">{displayDate}</TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center justify-center gap-1 bg-purple-100 text-purple-800 font-semibold text-sm rounded-full px-3 py-0.5 min-w-[40px]">
                          <Users className="w-3 h-3" />
                          {row.watcherCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isDownloading}
                          onClick={() => downloadParticipants(row)}
                          className="h-8 text-xs border-green-300 text-green-700 hover:bg-green-50 hover:border-green-400 gap-1.5"
                        >
                          {isDownloading
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Exporting…</>
                            : <><FileSpreadsheet className="w-3.5 h-3.5" /> Excel</>
                          }
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination — always visible */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Page {page} of {totalPages} &bull; {filtered.length} service{filtered.length !== 1 ? "s" : ""}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── MEETING CONFERENCES REPORT ───────────────────────────────────────────────

interface MeetingRow {
  id: number;
  title: string;
  description: string | null;
  meeting_type: string;
  created_at: string;
  ended_at: string | null;
  is_active: boolean;
  member_count: number;
  total_count: number;
}

function MeetingConferencesReport() {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
  const [data, setData] = React.useState<MeetingRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [downloadingId, setDownloadingId] = React.useState<number | null>(null);
  const PAGE_SIZE = 10;

  React.useEffect(() => {
    setLoading(true);
    fetch("/api/reports/meeting-services", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setData(Array.isArray(d) ? d : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [token]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(r =>
      r.title.toLowerCase().includes(q) ||
      (r.ended_at && r.ended_at.includes(q))
    );
  }, [data, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  React.useEffect(() => { setPage(1); }, [search]);

  async function downloadParticipants(row: MeetingRow) {
    setDownloadingId(row.id);
    try {
      const res = await fetch(`/api/meetings/${row.id}/participants-report`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const sessions: any[] = await res.json();

      // Deduplicate: merge multiple sessions for the same person into one row.
      // Key: member_id for logged-in members (stays the same across rejoins),
      //      display_name for guests (peer_id changes on every rejoin).
      const merged = new Map<string, any>();
      for (const s of sessions) {
        const key = s.member_id
          ? `m:${s.member_id}`
          : `g:${(s.display_name ?? "").trim().toLowerCase()}`;
        if (!merged.has(key)) {
          merged.set(key, { ...s, totalDurMs: 0, firstJoined: s.joined_at });
        }
        const entry = merged.get(key)!;
        // Accumulate duration across all sessions
        if (s.left_at && s.joined_at) {
          entry.totalDurMs += new Date(s.left_at).getTime() - new Date(s.joined_at).getTime();
        }
        // Keep earliest join time
        if (s.joined_at && (!entry.firstJoined || s.joined_at < entry.firstJoined)) {
          entry.firstJoined = s.joined_at;
        }
        // Keep the highest role seen (admin > co-host > member > guest)
        const roleRank: Record<string, number> = { admin: 4, "co-host": 3, member: 2, guest: 1 };
        if ((roleRank[s.role] ?? 0) > (roleRank[entry.role] ?? 0)) {
          entry.role = s.role;
        }
      }
      const deduped = Array.from(merged.values());

      const endDate = row.ended_at
        ? new Date(row.ended_at).toLocaleString("en-GH")
        : new Date(row.created_at).toLocaleDateString("en-GH");

      const typeLabel = row.meeting_type === "restricted" ? "Restricted Group"
        : row.meeting_type === "members_only" ? "Members Only" : "Open For All";

      const header = [
        [`Video Conferencing: ${row.title}`],
        [`Date: ${endDate}`],
        [`Type: ${typeLabel}`],
        [`Total Participants: ${deduped.length}`],
        [`Downloaded: ${new Date().toLocaleString("en-GH")}`],
        [],
        ["#", "Full Name", "Title", "Cell/Fellowship", "Role", "Time Joined", "Total Duration"],
      ];

      const body = deduped.map((s: any, i: number) => {
        const name = s.first_name
          ? `${s.first_name} ${s.last_name}`.trim()
          : s.display_name;
        const joined = s.firstJoined ? new Date(s.firstJoined).toLocaleString("en-GH") : "";
        const durMs = s.totalDurMs ?? 0;
        const mins = Math.floor(durMs / 60000);
        const secs = Math.floor((durMs % 60000) / 1000);
        const dur = durMs > 0 ? `${mins}m ${secs}s` : "—";
        const roleLabel = s.role === "admin" ? "Host" : s.role === "co-host" ? "Co-host" : s.role === "guest" ? "Guest" : "Member";
        return [i + 1, name, s.member_title ?? "", s.cell_name ?? "", roleLabel, joined, dur];
      });

      const safe = row.title.replace(/[^a-zA-Z0-9 _-]/g, "").trim().slice(0, 40);
      await downloadAoaAsExcel([...header, ...body], "Participants", `${safe}_conference.xlsx`);
    } catch {
      alert("Failed to download participants. Please try again.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Video Conferencing Meetings</h2>
          <p className="text-xs text-gray-500 mt-0.5">Reports for all ended video conference sessions</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 text-sm h-9"
          />
        </div>
      </div>

      {/* Table card */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gradient-to-r from-purple-700 to-purple-900">
                <TableHead className="text-white font-semibold text-xs w-12 text-center">SN</TableHead>
                <TableHead className="text-white font-semibold text-xs">Name of Meeting</TableHead>
                <TableHead className="text-white font-semibold text-xs hidden sm:table-cell">Date</TableHead>
                <TableHead className="text-white font-semibold text-xs text-center">Total</TableHead>
                <TableHead className="text-white font-semibold text-xs text-center">Export</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-6 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-24 mx-auto rounded-lg" /></TableCell>
                  </TableRow>
                ))
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-16 text-gray-400">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">
                      {search ? "No meetings match your search." : "No ended meetings yet."}
                    </p>
                    <p className="text-xs mt-1">Reports appear here after the host ends a meeting.</p>
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row, idx) => {
                  const sn = (page - 1) * PAGE_SIZE + idx + 1;
                  const displayDate = row.ended_at
                    ? new Date(row.ended_at).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })
                    : row.created_at
                    ? new Date(row.created_at).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })
                    : "—";
                  const isDownloading = downloadingId === row.id;
                  const typeLabel = row.meeting_type === "restricted" ? "Restricted"
                    : row.meeting_type === "members_only" ? "Members Only" : "Open";
                  return (
                    <TableRow
                      key={row.id}
                      className={`transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-purple-50/30"} hover:bg-purple-50`}
                    >
                      <TableCell className="text-center text-xs text-gray-500 font-medium">{sn}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm text-gray-900 truncate">{row.title}</p>
                          <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 mt-0.5">
                            {typeLabel}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 hidden sm:table-cell whitespace-nowrap">{displayDate}</TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center justify-center gap-1 bg-purple-100 text-purple-800 font-semibold text-sm rounded-full px-3 py-0.5 min-w-[36px]">
                          <Users className="w-3 h-3" />
                          {row.total_count}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isDownloading}
                          onClick={() => downloadParticipants(row)}
                          className="h-8 text-xs border-green-300 text-green-700 hover:bg-green-50 hover:border-green-400 gap-1.5"
                        >
                          {isDownloading
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Exporting…</>
                            : <><FileSpreadsheet className="w-3.5 h-3.5" /> Excel</>
                          }
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination — always visible */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Page {page} of {totalPages} &bull; {filtered.length} meeting{filtered.length !== 1 ? "s" : ""}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN REPORTS PAGE ────────────────────────────────────────────────────────

export default function Reports() {
  const { user } = useAuth();
  const level = (user as any)?.roleLevel ?? 1;
  const sub = (user as any)?.roleSubtype ?? "";

  const isSuper   = level === 1;
  const isFinance = level === 2;
  const isPFCC    = level === 3 && sub === "pfcc";
  const isFTStaff = level === 3 && sub === "first_timers";
  const isPCD     = level === 3 && sub === "pcd";
  const isChildren = level === 3 && sub === "children";
  const isLeader  = level === 4;

  const showAttendanceTab      = isSuper || isPFCC || isPCD || isChildren || isLeader;
  const showFinanceTab         = isSuper || isFinance;
  const showFTTab              = isSuper || isPFCC || isFTStaff;
  const isMedia = level === 3 && sub === "media";
  const showOnlineServicesTab  = isSuper || isPFCC || isMedia;

  const defaultTab = showAttendanceTab ? "attendance" : showFinanceTab ? "finance" : showFTTab ? "firsttimers" : "onlineservices";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Church-wide data reports and analytics</p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <div className="overflow-x-auto w-full pb-px">
          <TabsList className="bg-purple-50 w-max">
            {showAttendanceTab && (
              <TabsTrigger value="attendance" className="data-[state=active]:bg-purple-700 data-[state=active]:text-white">
                <CalendarCheck className="w-4 h-4 mr-1.5" /> Attendance
              </TabsTrigger>
            )}
            {showFinanceTab && (
              <TabsTrigger value="finance" className="data-[state=active]:bg-purple-700 data-[state=active]:text-white">
                <Banknote className="w-4 h-4 mr-1.5" /> Finance
              </TabsTrigger>
            )}
            {showFTTab && (
              <TabsTrigger value="firsttimers" className="data-[state=active]:bg-purple-700 data-[state=active]:text-white">
                <UserPlus className="w-4 h-4 mr-1.5" /> First Timers
              </TabsTrigger>
            )}
            {showOnlineServicesTab && (
              <TabsTrigger value="onlineservices" className="data-[state=active]:bg-purple-700 data-[state=active]:text-white">
                <Globe className="w-4 h-4 mr-1.5" /> Online Services
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {showAttendanceTab && (
          <TabsContent value="attendance" className="pt-4">
            <Tabs defaultValue="member-based">
              <div className="overflow-x-auto w-full pb-px">
                <TabsList className="bg-gray-100 mb-4 w-max">
                  <TabsTrigger value="member-based" className="data-[state=active]:bg-white data-[state=active]:text-purple-700 data-[state=active]:shadow-sm text-sm">
                    <Users className="w-3.5 h-3.5 mr-1.5" /> Member Based
                  </TabsTrigger>
                  <TabsTrigger value="fellowship-based" className="data-[state=active]:bg-white data-[state=active]:text-purple-700 data-[state=active]:shadow-sm text-sm">
                    <CalendarCheck className="w-3.5 h-3.5 mr-1.5" /> Fellowship Based
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="member-based">
                {(() => {
                  const _pcfId  = isLeader ? ((user as any)?.leadsPcfId  ?? undefined) : undefined;
                  const _scId   = isLeader && !_pcfId ? ((user as any)?.leadsSeniorCellId  ?? undefined) : undefined;
                  const _cellId = isLeader && !_pcfId && !_scId ? ((user as any)?.leadsCellId ?? undefined) : undefined;
                  return (
                    <MemberAttendanceReport
                      lockedCellId={_cellId}
                      lockedCellLabel={_cellId ? ((user as any)?.leadsCellName ?? undefined) : undefined}
                      lockedSeniorCellId={_scId}
                      lockedSeniorCellLabel={_scId ? ((user as any)?.leadsSeniorCellName ?? undefined) : undefined}
                      lockedPcfId={_pcfId}
                      lockedPcfLabel={_pcfId ? ((user as any)?.leadsPcfName ?? undefined) : undefined}
                      isChildrenAdmin={isChildren}
                    />
                  );
                })()}
              </TabsContent>
              <TabsContent value="fellowship-based">
                {(() => {
                  const _pcfId  = isLeader ? ((user as any)?.leadsPcfId  ?? undefined) : undefined;
                  const _scId   = isLeader && !_pcfId ? ((user as any)?.leadsSeniorCellId  ?? undefined) : undefined;
                  const _cellId = isLeader && !_pcfId && !_scId ? ((user as any)?.leadsCellId ?? undefined) : undefined;
                  return (
                    <FellowshipAttendanceReport
                      lockedCellId={_cellId}
                      lockedSeniorCellId={_scId}
                      lockedPcfId={_pcfId}
                      isChildrenAdmin={isChildren}
                    />
                  );
                })()}
              </TabsContent>
            </Tabs>
          </TabsContent>
        )}

        {showFinanceTab && (
          <TabsContent value="finance" className="pt-4">
            <FinanceReport />
          </TabsContent>
        )}

        {showFTTab && (
          <TabsContent value="firsttimers" className="pt-4">
            <FirstTimersReport />
          </TabsContent>
        )}

        {showOnlineServicesTab && (
          <TabsContent value="onlineservices" className="pt-4">
            <div className="space-y-10">
              <OnlineServicesReport />
              <div className="border-t border-gray-200 pt-8">
                <MeetingConferencesReport />
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}