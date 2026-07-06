import { useState, useRef, useEffect, useCallback } from "react";
import QRCode from "react-qr-code";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMember, getGetMemberQueryKey,
  useGetMemberAttendanceHistory, getGetMemberAttendanceHistoryQueryKey,
  useGetMemberGivingsHistory, getGetMemberGivingsHistoryQueryKey,
  useListMinistryYears,
  useListFamilies, getListFamiliesQueryKey,
  useGetTeenParentSummary,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  User, Phone, Calendar, Briefcase, CheckCircle2,
  Banknote, ChevronLeft, ChevronRight, Church, Clock,
  Mail, Edit2, Camera, Users, Home, Crown, Baby, Smile, Info, Download, QrCode,
} from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";

const getToken = () => typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;

const PAGE_SIZE = 10;

function fmt(date: string, opts?: Intl.DateTimeFormatOptions) {
  return new Date(date).toLocaleDateString("en-GH", opts ?? { day: "numeric", month: "short", year: "numeric" });
}

function ServiceTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    sunday:  { label: "Sunday",  cls: "bg-purple-100 text-purple-700" },
    midweek: { label: "Midweek", cls: "bg-blue-100 text-blue-700" },
    onsite:  { label: "Onsite",  cls: "bg-gray-100 text-gray-600" },
  };
  const s = map[type] ?? { label: type, cls: "bg-gray-100 text-gray-600" };
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

function GivingTypePill({ name }: { name: string }) {
  const colors: Record<string, string> = {
    Tithe:            "bg-emerald-100 text-emerald-700",
    Offering:         "bg-sky-100 text-sky-700",
    "Special Offering": "bg-amber-100 text-amber-700",
    "Building Fund":  "bg-orange-100 text-orange-700",
    Missions:         "bg-indigo-100 text-indigo-700",
    Welfare:          "bg-pink-100 text-pink-700",
  };
  const cls = colors[name] ?? "bg-gray-100 text-gray-600";
  return <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${cls}`}>{name}</span>;
}

function Pagination({
  page, totalPages, onPrev, onNext,
}: { page: number; totalPages: number; onPrev: () => void; onNext: () => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-4 border-t mt-2">
      <Button variant="outline" size="sm" onClick={onPrev} disabled={page <= 1} className="gap-1.5">
        <ChevronLeft className="w-4 h-4" /> Previous
      </Button>
      <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
      <Button variant="outline" size="sm" onClick={onNext} disabled={page >= totalPages} className="gap-1.5">
        Next <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

function AttendanceTab({ memberId }: { memberId: number }) {
  const [page, setPage] = useState(1);

  const { data: yearsData } = useListMinistryYears();
  const years = (yearsData as any[]) ?? [];
  const today = new Date().toISOString().split("T")[0];
  const activeYear = years.find((y: any) => !y.isClosed && today >= y.startDate && today <= y.endDate);

  const { data, isLoading } = useGetMemberAttendanceHistory(
    memberId,
    { ministryYearId: activeYear?.id, page, limit: PAGE_SIZE },
    { query: { queryKey: getGetMemberAttendanceHistoryQueryKey(memberId, { ministryYearId: activeYear?.id, page, limit: PAGE_SIZE }), enabled: !!memberId && !!activeYear } }
  );

  const records = (data as any)?.data ?? [];
  const total: number = (data as any)?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (!activeYear && !isLoading) {
    return (
      <div className="text-center py-14 text-gray-400">
        <Church className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No active ministry year found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activeYear && (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Ministry Year</p>
            <p className="font-semibold text-gray-800">{activeYear.name}</p>
          </div>
          {total > 0 && (
            <div className="text-right">
              <p className="text-2xl font-bold text-purple-700">{total}</p>
              <p className="text-xs text-gray-500">services attended</p>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-14 border rounded-xl bg-gray-50 text-gray-400">
          <Church className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-gray-500">No attendance recorded yet</p>
          <p className="text-sm mt-1">for {activeYear?.name}</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {records.map((rec: any, idx: number) => (
              <div
                key={rec.id}
                className="flex items-center gap-4 p-3.5 rounded-xl border border-gray-100 bg-white hover:border-purple-100 hover:bg-purple-50/30 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{rec.serviceName}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Calendar className="w-3 h-3" />
                      {fmt(rec.serviceDate)}
                    </span>
                    {rec.serviceDate && (
                      <ServiceTypeBadge type={
                        new Date(rec.serviceDate).getDay() === 0 ? "sunday" : "midweek"
                      } />
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    {rec.checkInTime
                      ? new Date(rec.checkInTime).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </div>
                  <p className="text-[11px] text-gray-400 capitalize mt-0.5">{rec.method ?? "manual"}</p>
                </div>
              </div>
            ))}
          </div>

          <Pagination page={page} totalPages={totalPages} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
        </>
      )}
    </div>
  );
}

function GivingsTab({ memberId }: { memberId: number }) {
  const [page, setPage] = useState(1);

  const { data: yearsData } = useListMinistryYears();
  const years = (yearsData as any[]) ?? [];
  const today = new Date().toISOString().split("T")[0];
  const activeYear = years.find((y: any) => !y.isClosed && today >= y.startDate && today <= y.endDate);

  const { data, isLoading } = useGetMemberGivingsHistory(
    memberId,
    { ministryYearId: activeYear?.id, page, limit: PAGE_SIZE },
    { query: { queryKey: getGetMemberGivingsHistoryQueryKey(memberId, { ministryYearId: activeYear?.id, page, limit: PAGE_SIZE }), enabled: !!memberId && !!activeYear } }
  );

  const records = (data as any)?.data ?? [];
  const total: number = (data as any)?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const grandTotal = records.reduce((s: number, g: any) => s + Number(g.amount), 0);

  const byType: Record<string, number> = {};
  for (const g of records) {
    byType[g.givingTypeName] = (byType[g.givingTypeName] ?? 0) + Number(g.amount);
  }

  if (!activeYear && !isLoading) {
    return (
      <div className="text-center py-14 text-gray-400">
        <Banknote className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No active ministry year found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activeYear && (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Ministry Year</p>
            <p className="font-semibold text-gray-800">{activeYear.name}</p>
          </div>
          {total > 0 && (
            <div className="text-right">
              <p className="text-2xl font-bold text-emerald-700">
                GHS {grandTotal.toLocaleString("en-GH", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-500">{total} giving{total !== 1 ? "s" : ""} this page</p>
            </div>
          )}
        </div>
      )}

      {!isLoading && Object.keys(byType).length > 1 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(byType).map(([type, amount]) => (
            <div key={type} className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5">
              <GivingTypePill name={type} />
              <span className="text-xs font-semibold text-gray-700">
                GHS {amount.toLocaleString("en-GH", { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-14 border rounded-xl bg-gray-50 text-gray-400">
          <Banknote className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-gray-500">No giving records yet</p>
          <p className="text-sm mt-1">for {activeYear?.name}</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {records.map((g: any) => (
              <div
                key={g.id}
                className="flex items-center gap-4 p-3.5 rounded-xl border border-gray-100 bg-white hover:border-emerald-100 hover:bg-emerald-50/20 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Banknote className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <GivingTypePill name={g.givingTypeName} />
                    {g.stage === "teen" && (
                      <span className="text-[10px] bg-violet-100 text-violet-700 rounded px-1.5 py-0.5 font-medium">Teen era</span>
                    )}
                    {g.stage === "child" && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 font-medium">Child era</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                    <Calendar className="w-3 h-3" />
                    {fmt(g.date)}
                    {g.notes && (
                      <span className="ml-2 text-gray-400 italic truncate max-w-[140px]">· {g.notes}</span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-emerald-700 text-sm">
                    GHS {Number(g.amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <Pagination page={page} totalPages={totalPages} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
        </>
      )}
    </div>
  );
}

// ─── Teen Portal ────────────────────────────────────────────────────────────

function TeenProfile({ user }: { user: any }) {
  const { toast } = useToast();
  const [showQR, setShowQR] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinForm, setPinForm] = useState({ currentPin: "", newPin: "", confirmPin: "" });
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", phone1: "", phone2: "" });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const { data, isLoading, refetch } = useGetTeenParentSummary(user.teenId ?? 0, {
    query: { enabled: !!user.teenId },
  });
  const teen = data as any;

  const downloadQR = useCallback(() => {
    const svg = document.getElementById("teen-qr-svg");
    if (!svg || !teen) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx!.fillStyle = "#ffffff";
      ctx!.fillRect(0, 0, size, size);
      ctx!.drawImage(img, 0, 0, size, size);
      const a = document.createElement("a");
      a.download = `${teen.membershipId}-qr.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  }, [teen]);

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinForm.newPin.length < 3 || pinForm.newPin.length > 6) {
      toast({ title: "Invalid PIN", description: "PIN must be 3–6 digits.", variant: "destructive" });
      return;
    }
    if (pinForm.newPin !== pinForm.confirmPin) {
      toast({ title: "PINs don't match", description: "New PIN and confirmation don't match.", variant: "destructive" });
      return;
    }
    setIsSavingPin(true);
    try {
      const res = await fetch("/api/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ currentPin: pinForm.currentPin, newPin: pinForm.newPin }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast({ title: "PIN changed", description: "Your PIN has been updated successfully." });
      setPinOpen(false);
      setPinForm({ currentPin: "", newPin: "", confirmPin: "" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to change PIN", variant: "destructive" });
    }
    setIsSavingPin(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-8 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!teen) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <Card>
          <CardContent className="pt-8 pb-8 text-center text-gray-400">
            <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Could not load profile. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const initials = `${teen.firstName?.[0] ?? ""}${teen.lastName?.[0] ?? ""}`.toUpperCase();
  const attendance: any[] = teen.attendance ?? [];
  const givings: any[] = teen.givings ?? [];
  const totalGiving = givings.reduce((s: number, g: any) => s + Number(g.amount), 0);

  const byType: Record<string, number> = {};
  for (const g of givings) {
    byType[g.givingType] = (byType[g.givingType] ?? 0) + Number(g.amount);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>

      {/* Header card */}
      <Card className="border-purple-100">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white font-bold text-xl flex-shrink-0 select-none">
              {initials || <User className="w-7 h-7" />}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900 leading-snug">
                {teen.firstName} {teen.lastName}
              </h2>
              <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{teen.membershipId}</p>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {teen.membershipId && (
                  <Button size="sm" variant="outline" className="h-7 text-xs border-purple-200 text-purple-700 hover:bg-purple-50 px-2 gap-1" onClick={() => setShowQR(true)}>
                    <QrCode className="w-3 h-3" /> QR
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs border-purple-200 text-purple-700 hover:bg-purple-50 px-2 gap-1" onClick={() => {
                  setEditForm({ firstName: teen.firstName ?? "", lastName: teen.lastName ?? "", phone1: teen.phone1 ?? "", phone2: teen.phone2 ?? "" });
                  setEditOpen(true);
                }}>
                  <Edit2 className="w-3 h-3" /> Edit
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs border-gray-200 text-gray-600 hover:bg-gray-50 px-2" onClick={() => setPinOpen(true)}>
                  Change PIN
                </Button>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge className="bg-violet-100 text-violet-700 border-0 text-xs">Teen</Badge>
                {teen.foundationSchoolCompleted && (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">Foundation School ✓</Badge>
                )}
                {teen.gender && (
                  <Badge variant="outline" className="text-xs text-gray-600 border-gray-200">{teen.gender}</Badge>
                )}
              </div>

              {/* Detail fields */}
              <div className="mt-3 space-y-1.5 text-sm">
                {teen.phone1 && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span>{teen.phone1}{teen.phone2 ? <span className="text-gray-400"> / {teen.phone2}</span> : null}</span>
                  </div>
                )}
                {teen.dateOfBirth && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span>{fmt(teen.dateOfBirth, { day: "numeric", month: "long", year: "numeric" })}</span>
                  </div>
                )}
                {teen.dateJoined && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="text-gray-400 text-xs flex-shrink-0">Joined:</span>
                    <span>{fmt(teen.dateJoined, { month: "long", year: "numeric" })}</span>
                  </div>
                )}
                {teen.residentialAddress && (
                  <div className="flex items-start gap-2 text-gray-600">
                    <Home className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <span>{teen.residentialAddress}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* QR Dialog */}
      {showQR && teen.membershipId && (
        <Dialog open onOpenChange={() => setShowQR(false)}>
          <DialogContent className="max-w-xs text-center">
            <DialogHeader><DialogTitle>My Attendance QR Code</DialogTitle></DialogHeader>
            <div className="flex flex-col items-center gap-4 pt-2">
              <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-sm">
                {initials}
              </div>
              <p className="font-semibold text-gray-800">{teen.firstName} {teen.lastName}</p>
              <p className="text-xs text-gray-400 font-mono">{teen.membershipId}</p>
              <div className="p-4 bg-white border rounded-xl">
                <QRCode
                  id="teen-qr-svg"
                  value={teen.membershipId}
                  size={180}
                  fgColor="#6d28d9"
                  bgColor="#ffffff"
                />
              </div>
              <p className="text-xs text-gray-400">Show this QR code to register your attendance</p>
              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1 gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50" onClick={downloadQR}>
                  <Download className="w-3.5 h-3.5" /> Save
                </Button>
                <Button className="flex-1 bg-purple-700 text-white hover:bg-purple-800" onClick={() => setShowQR(false)}>Close</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Tabs */}
      <Tabs defaultValue="attendance">
        <TabsList className="bg-purple-50 w-full">
          <TabsTrigger value="attendance" className="flex-1 gap-1.5 data-[state=active]:bg-purple-700 data-[state=active]:text-white">
            <CheckCircle2 className="w-4 h-4" /> Attendance
          </TabsTrigger>
          <TabsTrigger value="givings" className="flex-1 gap-1.5 data-[state=active]:bg-purple-700 data-[state=active]:text-white">
            <Banknote className="w-4 h-4" /> Givings
          </TabsTrigger>
        </TabsList>

        {/* Attendance tab */}
        <TabsContent value="attendance" className="pt-4">
          {attendance.length === 0 ? (
            <div className="text-center py-14 border rounded-xl bg-gray-50 text-gray-400">
              <Church className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-gray-500">No attendance recorded yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Recent Services</p>
                <p className="text-2xl font-bold text-purple-700">{attendance.length}</p>
              </div>
              <div className="space-y-2">
                {attendance.map((rec: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-4 p-3.5 rounded-xl border border-gray-100 bg-white hover:border-purple-100 hover:bg-purple-50/30 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{rec.serviceName ?? "Service"}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {rec.serviceDate && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Calendar className="w-3 h-3" />
                            {fmt(rec.serviceDate)}
                          </span>
                        )}
                        {rec.serviceType && <ServiceTypeBadge type={rec.serviceType} />}
                      </div>
                    </div>
                    {rec.registeredAt && (
                      <div className="text-right flex-shrink-0 text-xs text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(rec.registeredAt).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Givings tab */}
        <TabsContent value="givings" className="pt-4">
          {givings.length === 0 ? (
            <div className="text-center py-14 border rounded-xl bg-gray-50 text-gray-400">
              <Banknote className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-gray-500">No giving records yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Recent Givings</p>
                <p className="text-2xl font-bold text-emerald-700">
                  GHS {totalGiving.toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                </p>
              </div>

              {Object.keys(byType).length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(byType).map(([type, amount]) => (
                    <div key={type} className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5">
                      <GivingTypePill name={type} />
                      <span className="text-xs font-semibold text-gray-700">
                        GHS {amount.toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                {givings.map((g: any) => (
                  <div key={`${g.stage ?? "t"}-${g.id}`} className="flex items-center gap-4 p-3.5 rounded-xl border border-gray-100 bg-white hover:border-emerald-100 hover:bg-emerald-50/20 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Banknote className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <GivingTypePill name={g.givingType} />
                        {g.stage === "child" && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 font-medium">Child era</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                        <Calendar className="w-3 h-3" />
                        {fmt(g.date)}
                        {g.notes && (
                          <span className="ml-2 text-gray-400 italic truncate max-w-[140px]">· {g.notes}</span>
                        )}
                      </div>
                    </div>
                    <p className="font-bold text-emerald-700 text-sm flex-shrink-0">
                      GHS {Number(g.amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit profile dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit My Profile</DialogTitle></DialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
              toast({ title: "Name required", description: "First and last name cannot be empty.", variant: "destructive" });
              return;
            }
            setIsSavingEdit(true);
            try {
              const res = await fetch(`/api/teens/${user.teenId}/basic-info`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify(editForm),
              });
              const d = await res.json();
              if (!res.ok) throw new Error(d.error);
              toast({ title: "Profile updated", description: "Your changes have been saved." });
              setEditOpen(false);
              refetch();
            } catch (err: any) {
              toast({ title: "Error", description: err?.message || "Failed to save changes", variant: "destructive" });
            }
            setIsSavingEdit(false);
          }} className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First Name</Label>
                <Input value={editForm.firstName} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value.replace(/[^a-zA-Z\s'-]/g, "") }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value.replace(/[^a-zA-Z\s'-]/g, "") }))} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Primary Phone</Label>
              <Input inputMode="numeric" value={editForm.phone1} onChange={e => setEditForm(f => ({ ...f, phone1: e.target.value.replace(/\D/g, "") }))} placeholder="0XX XXX XXXX" />
            </div>
            <div className="space-y-1.5">
              <Label>Secondary Phone</Label>
              <Input inputMode="numeric" value={editForm.phone2} onChange={e => setEditForm(f => ({ ...f, phone2: e.target.value.replace(/\D/g, "") }))} placeholder="Optional" />
            </div>
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-purple-700 hover:bg-purple-800 text-white" disabled={isSavingEdit}>
                {isSavingEdit ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change PIN dialog */}
      <Dialog open={pinOpen} onOpenChange={(o) => { setPinOpen(o); if (!o) setPinForm({ currentPin: "", newPin: "", confirmPin: "" }); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Change Login PIN</DialogTitle></DialogHeader>
          <form onSubmit={handleChangePin} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Current PIN</Label>
              <PasswordInput inputMode="numeric" maxLength={6} placeholder="Enter current PIN"
                value={pinForm.currentPin} onChange={e => setPinForm(f => ({ ...f, currentPin: e.target.value.replace(/\D/g, "") }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>New PIN</Label>
              <PasswordInput inputMode="numeric" maxLength={6} placeholder="3–6 digits"
                value={pinForm.newPin} onChange={e => setPinForm(f => ({ ...f, newPin: e.target.value.replace(/\D/g, "") }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm New PIN</Label>
              <PasswordInput inputMode="numeric" maxLength={6} placeholder="Repeat new PIN"
                value={pinForm.confirmPin} onChange={e => setPinForm(f => ({ ...f, confirmPin: e.target.value.replace(/\D/g, "") }))} required />
            </div>
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setPinOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-purple-700 hover:bg-purple-800 text-white" disabled={isSavingPin}>
                {isSavingPin ? "Saving..." : "Change PIN"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LeaderFellowshipWidget({ user }: { user: any }) {
  const leadsPcfId   = user?.leadsPcfId;
  const leadsSCId    = user?.leadsSeniorCellId;
  const leadsCellId  = user?.leadsCellId;

  const scopeName = user?.leadsPcfName ?? user?.leadsSeniorCellName ?? user?.leadsCellName;
  const scopeType: "pcf" | "sc" | "cell" = leadsPcfId ? "pcf" : leadsSCId ? "sc" : "cell";
  const filterParam = leadsPcfId
    ? `pcfId=${leadsPcfId}`
    : leadsSCId
    ? `seniorCellId=${leadsSCId}`
    : leadsCellId
    ? `cellId=${leadsCellId}`
    : null;

  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(true);

  useEffect(() => {
    if (!filterParam) { setLoadingCount(false); return; }
    const token = getToken();
    fetch(`/api/members?${filterParam}&limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { setMemberCount(d.total ?? 0); })
      .catch(() => {})
      .finally(() => setLoadingCount(false));
  }, [filterParam]);

  if (!scopeName) return null;

  const scopeLabel = scopeType === "pcf" ? "PCF" : scopeType === "sc" ? "Senior Cell" : "Cell";
  const badgeCls   = scopeType === "pcf"
    ? "bg-amber-100 text-amber-700"
    : scopeType === "sc"
    ? "bg-orange-100 text-orange-700"
    : "bg-green-100 text-green-700";

  return (
    <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-purple-500" />
          <span className="text-xs font-bold uppercase tracking-wide text-purple-500">My Fellowship</span>
        </div>
        <Badge className={`border-0 text-xs ${badgeCls}`}>{scopeLabel}</Badge>
      </div>
      <p className="text-base font-bold text-gray-800 mb-4">{scopeName}</p>
      <div className="flex items-center gap-6">
        <div>
          <p className="text-3xl font-extrabold text-purple-700">
            {loadingCount ? <span className="text-gray-400 text-xl animate-pulse">—</span> : (memberCount ?? 0)}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 uppercase font-semibold tracking-wide">Total Members</p>
        </div>
      </div>
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();

  // All hooks must be declared unconditionally (rules of hooks)
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    email: "",
    phone1: "",
    phone2: "",
    occupation: "",
    residentialAddress: "",
    isBaptized: false,
    dateOfBirth: "",
    emergencyContact: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoEnlarged, setPhotoEnlarged] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [pinOpen, setPinOpen] = useState(false);
  const [pinForm, setPinForm] = useState({ currentPin: "", newPin: "", confirmPin: "" });
  const [isSavingPin, setIsSavingPin] = useState(false);

  const [childGivingsOpen, setChildGivingsOpen] = useState(false);
  const [childGivingsData, setChildGivingsData] = useState<{ dependents: any[]; grouped: Record<string, any> } | null>(null);
  const [childGivingsLoading, setChildGivingsLoading] = useState(false);

  const openChildGivings = async () => {
    setChildGivingsOpen(true);
    setChildGivingsLoading(true);
    try {
      const res = await fetch(`/api/members/${user?.memberId}/dependents-givings`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setChildGivingsData(await res.json());
    } finally {
      setChildGivingsLoading(false);
    }
  };

  const [childrenTabLoaded, setChildrenTabLoaded] = useState(false);
  const [childrenTabLoading, setChildrenTabLoading] = useState(false);
  const [childrenTabList, setChildrenTabList] = useState<any[]>([]);
  const [childDetailOpen, setChildDetailOpen] = useState(false);
  const [childDetailData, setChildDetailData] = useState<any | null>(null);
  const [childDetailLoading, setChildDetailLoading] = useState(false);
  const [childDetailError, setChildDetailError] = useState<string | null>(null);
  const [childEditOpen, setChildEditOpen] = useState(false);
  const [childEditSaving, setChildEditSaving] = useState(false);
  const [childEditForm, setChildEditForm] = useState({ firstName: "", lastName: "", dateOfBirth: "", phone1: "", phone2: "" });

  const loadChildrenTab = async () => {
    if (!user?.memberId) return;
    setChildrenTabLoading(true);
    try {
      const res = await fetch(`/api/members/${user.memberId}/dependents-givings`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const d = await res.json();
        setChildrenTabList(d.dependents ?? []);
      }
    } finally {
      setChildrenTabLoading(false);
      setChildrenTabLoaded(true);
    }
  };

  const openChildDetail = async (dep: any) => {
    setChildDetailOpen(true);
    setChildDetailData(null);
    setChildDetailError(null);
    setChildDetailLoading(true);
    setChildEditOpen(false);
    try {
      const url = dep.stage === "teen"
        ? `/api/teens/${dep.id}/parent-summary`
        : `/api/children/${dep.id}/parent-summary`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
      const d = await res.json();
      if (res.ok) {
        setChildDetailData({ ...d, _stage: dep.stage });
      } else {
        setChildDetailError(d?.error ?? "Failed to load details");
      }
    } catch {
      setChildDetailError("Could not connect. Please try again.");
    } finally {
      setChildDetailLoading(false);
    }
  };

  const openChildEdit = () => {
    if (!childDetailData) return;
    setChildEditForm({
      firstName: childDetailData.firstName ?? "",
      lastName: childDetailData.lastName ?? "",
      dateOfBirth: childDetailData.dateOfBirth ?? "",
      phone1: childDetailData.phone1 ?? "",
      phone2: childDetailData.phone2 ?? "",
    });
    setChildEditOpen(true);
  };

  const handleSaveChildEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!childDetailData) return;
    setChildEditSaving(true);
    try {
      const isTeen = childDetailData._stage === "teen";
      const url = isTeen
        ? `/api/teens/${childDetailData.id}/basic-info`
        : `/api/children/${childDetailData.id}/basic-info`;
      const body: any = {
        firstName: childEditForm.firstName.trim(),
        lastName: childEditForm.lastName.trim(),
        dateOfBirth: childEditForm.dateOfBirth || null,
      };
      if (isTeen) {
        body.phone1 = childEditForm.phone1.trim();
        body.phone2 = childEditForm.phone2.trim() || null;
      }
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast({ title: "Updated", description: "Changes saved successfully." });
      setChildEditOpen(false);
      setChildDetailData((prev: any) => ({ ...prev, ...d }));
      setChildrenTabLoaded(false);
      loadChildrenTab();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to save", variant: "destructive" });
    } finally {
      setChildEditSaving(false);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinForm.newPin.length < 3 || pinForm.newPin.length > 6) {
      toast({ title: "Invalid PIN", description: "PIN must be 3–6 digits.", variant: "destructive" });
      return;
    }
    if (pinForm.newPin !== pinForm.confirmPin) {
      toast({ title: "PINs don't match", description: "New PIN and confirmation don't match.", variant: "destructive" });
      return;
    }
    setIsSavingPin(true);
    try {
      const res = await fetch("/api/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ currentPin: pinForm.currentPin, newPin: pinForm.newPin }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast({ title: "PIN changed", description: "Your PIN has been updated successfully." });
      setPinOpen(false);
      setPinForm({ currentPin: "", newPin: "", confirmPin: "" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to change PIN", variant: "destructive" });
    }
    setIsSavingPin(false);
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.memberId) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Photo too large", description: "Please choose an image under 2MB.", variant: "destructive" });
      return;
    }
    setIsUploadingPhoto(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        const res = await fetch(`/api/members/${user.memberId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ profilePhoto: dataUrl }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
        queryClient.invalidateQueries({ queryKey: getGetMemberQueryKey(user.memberId!) });
        toast({ title: "Photo updated" });
        setIsUploadingPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to upload photo", variant: "destructive" });
      setIsUploadingPhoto(false);
    }
  };

  const { data: member, isLoading: memberLoading } = useGetMember(
    user?.memberId ?? 0,
    { query: { queryKey: getGetMemberQueryKey(user?.memberId ?? 0), enabled: !!user?.memberId } }
  );

  const { data: familyData } = useListFamilies(
    { memberId: user?.memberId },
    { query: { queryKey: getListFamiliesQueryKey({ memberId: user?.memberId }), enabled: !!user?.memberId } }
  );
  const myFamily: any = Array.isArray(familyData) ? familyData[0] : null;

  const m = member as any;

  const downloadQR = useCallback(() => {
    const svg = document.getElementById("profile-qr-svg");
    if (!svg || !m) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx!.fillStyle = "#ffffff";
      ctx!.fillRect(0, 0, size, size);
      ctx!.drawImage(img, 0, 0, size, size);
      const a = document.createElement("a");
      a.download = `${m.membershipId}-qr.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  }, [m]);

  // Teens get their own dedicated view — guard placed after all hooks
  if ((user as any)?.roleSubtype === "teen") {
    return <TeenProfile user={user} />;
  }

  const roleLabel = {
    1: "Super Admin", 2: "Finance Admin", 3: "Staff", 4: "Leader", 5: "Member",
  }[user?.roleLevel ?? 5] ?? "User";

  const openEdit = () => {
    setEditForm({
      email: m?.email ?? "",
      phone1: m?.phone1 ?? "",
      phone2: m?.phone2 ?? "",
      occupation: m?.occupation ?? "",
      residentialAddress: m?.residentialAddress ?? "",
      isBaptized: m?.isBaptized ?? false,
      dateOfBirth: m?.dateOfBirth ?? "",
      emergencyContact: m?.emergencyContact ?? "",
    });
    setEditOpen(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.memberId) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/members/${user.memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          email: editForm.email || null,
          phone1: editForm.phone1,
          phone2: editForm.phone2 || null,
          occupation: editForm.occupation || "",
          residentialAddress: editForm.residentialAddress || "",
          isBaptized: editForm.isBaptized,
          dateOfBirth: editForm.dateOfBirth || null,
          emergencyContact: editForm.emergencyContact || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      queryClient.invalidateQueries({ queryKey: getGetMemberQueryKey(user.memberId) });
      toast({ title: "Profile updated successfully" });
      setEditOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to save", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (!user?.memberId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <Card>
          <CardContent className="pt-8 pb-8 text-center text-gray-500">
            <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-3">
              <User className="w-8 h-8 text-purple-600" />
            </div>
            <p className="font-semibold text-gray-800 text-lg">{user?.username}</p>
            <Badge className="mt-2 bg-purple-100 text-purple-700 border-0">{roleLabel}</Badge>
            <p className="text-sm mt-4 text-gray-400">This account is not linked to a member profile.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>

      {memberLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : m ? (
        <Card className="border-purple-100">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-4">

              {/* Avatar — compact like admin view */}
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <div
                  className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white font-bold text-xl relative group cursor-pointer"
                  onClick={() => m.profilePhoto && setPhotoEnlarged(true)}
                  title={m.profilePhoto ? "Click to enlarge" : undefined}
                >
                  {m.profilePhoto
                    ? <img src={m.profilePhoto} alt="Profile" className="w-full h-full object-cover" />
                    : <>{m.firstName?.[0]}{m.lastName?.[0]}</>
                  }
                  {m.profilePhoto && (
                    <div className="absolute inset-0 bg-black/30 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isUploadingPhoto}
                  className="text-[10px] text-purple-500 hover:text-purple-700 underline underline-offset-1 disabled:opacity-50"
                >
                  {isUploadingPhoto ? "Uploading…" : "Change"}
                </button>
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                {/* Name + ID — full width so they never wrap awkwardly */}
                <h2 className="text-base font-bold text-gray-900 leading-snug">
                  {m.title ? `${m.title} ` : ""}{m.firstName} {m.lastName}
                </h2>
                <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{m.membershipId}</p>

                {/* Action buttons — own row, compact */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {(user?.roleLevel === 5 || user?.roleLevel === 4) && (
                    <Button size="sm" variant="outline" className="h-7 text-xs border-purple-200 text-purple-700 hover:bg-purple-50 px-2 gap-1" onClick={() => setShowQR(true)}>
                      <QrCode className="w-3 h-3" /> QR
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-7 text-xs border-purple-200 text-purple-700 hover:bg-purple-50 px-2 gap-1" onClick={openEdit}>
                    <Edit2 className="w-3 h-3" /> Edit
                  </Button>
                  {(user?.roleLevel === 5 || user?.roleLevel === 4) && (
                    <Button size="sm" variant="outline" className="h-7 text-xs border-gray-200 text-gray-600 hover:bg-gray-50 px-2" onClick={() => setPinOpen(true)}>
                      PIN
                    </Button>
                  )}
                </div>

                {/* Badges — no duplicate role badge */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(() => {
                    const lp = m.leadershipPositions ?? {};
                    if (lp.pcfLeader) {
                      return <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">PCF Leader</Badge>;
                    } else if (lp.seniorCellLeader) {
                      return <Badge className="bg-orange-100 text-orange-700 border-0 text-xs">Senior Cell Leader</Badge>;
                    } else if (lp.cellLeader) {
                      return <Badge className="bg-green-100 text-green-700 border-0 text-xs">Cell Leader</Badge>;
                    } else {
                      return <Badge className="bg-purple-100 text-purple-700 border-0 capitalize text-xs">{m.memberType}</Badge>;
                    }
                  })()}
                  {m.cellName && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">{m.cellName}</Badge>
                  )}
                  {m.isBaptized && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">Baptized</Badge>
                  )}
                  {(m.departmentMemberships ?? []).map((dept: any) => (
                    <Badge
                      key={dept.name}
                      variant="outline"
                      className={`text-xs ${dept.isHead ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-teal-50 text-teal-700 border-teal-200"}`}
                    >
                      {dept.isHead ? `Leader of ${dept.name}` : dept.name}
                    </Badge>
                  ))}
                </div>

                {/* Detail fields */}
                <div className="mt-3 space-y-1.5 text-sm">
                  {m.email && (
                    <div className="flex items-start gap-2 text-gray-600">
                      <Mail className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                      <span className="break-all">{m.email}</span>
                    </div>
                  )}
                  {m.phone1 && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span>{m.phone1}{m.phone2 ? <span className="text-gray-400"> / {m.phone2}</span> : null}</span>
                    </div>
                  )}
                  {m.dateOfBirth && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span>{fmt(m.dateOfBirth, { day: "numeric", month: "long", year: "numeric" })}</span>
                    </div>
                  )}
                  {m.occupation && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Briefcase className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span>{m.occupation}</span>
                    </div>
                  )}
                  {m.dateJoined && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <span className="text-gray-400 text-xs flex-shrink-0">Member since:</span>
                      <span>{fmt(m.dateJoined, { month: "long", year: "numeric" })}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* QR Dialog — same style as admin view */}
      {showQR && m && (
        <Dialog open onOpenChange={() => setShowQR(false)}>
          <DialogContent className="max-w-xs text-center">
            <DialogHeader><DialogTitle>My Attendance QR Code</DialogTitle></DialogHeader>
            <div className="flex flex-col items-center gap-4 pt-2">
              <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-sm">
                {m.firstName?.[0]}{m.lastName?.[0]}
              </div>
              <p className="font-semibold text-gray-800">{m.title ? `${m.title} ` : ""}{m.firstName} {m.lastName}</p>
              <p className="text-xs text-gray-400 font-mono">{m.membershipId}</p>
              <div className="p-4 bg-white border rounded-xl">
                <QRCode
                  id="profile-qr-svg"
                  value={m.membershipId}
                  size={180}
                  fgColor="#6d28d9"
                  bgColor="#ffffff"
                />
              </div>
              <p className="text-xs text-gray-400">Show this QR code to register your attendance</p>
              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1 gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50" onClick={downloadQR}>
                  <Download className="w-3.5 h-3.5" /> Save
                </Button>
                <Button className="flex-1 bg-purple-700 text-white hover:bg-purple-800" onClick={() => setShowQR(false)}>Close</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {(user as any)?.roleLevel === 4 && <LeaderFellowshipWidget user={user} />}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit My Profile</DialogTitle></DialogHeader>
          <form onSubmit={handleSaveContact} className="space-y-5 pt-2">

            {/* ── Contact ── */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Contact</p>
              <div className="space-y-1.5">
                <Label>Email Address</Label>
                <Input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} placeholder="your@email.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Primary Phone <span className="text-red-500">*</span></Label>
                <Input inputMode="numeric" value={editForm.phone1} onChange={e => setEditForm(f => ({ ...f, phone1: e.target.value.replace(/\D/g, "") }))} placeholder="0XX XXX XXXX" required />
              </div>
              <div className="space-y-1.5">
                <Label>Secondary Phone</Label>
                <Input inputMode="numeric" value={editForm.phone2} onChange={e => setEditForm(f => ({ ...f, phone2: e.target.value.replace(/\D/g, "") }))} placeholder="Optional" />
              </div>
            </div>

            {/* ── Personal ── */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Personal</p>
              <div className="space-y-1.5">
                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  value={editForm.dateOfBirth ? editForm.dateOfBirth.split("T")[0] : ""}
                  onChange={e => setEditForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Emergency Contact</Label>
                <Input
                  inputMode="numeric"
                  value={editForm.emergencyContact}
                  onChange={e => setEditForm(f => ({ ...f, emergencyContact: e.target.value.replace(/\D/g, "") }))}
                  placeholder="Emergency phone number"
                />
              </div>
            </div>

            {/* ── Work & Residence ── */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Work &amp; Residence</p>
              <div className="space-y-1.5">
                <Label>Occupation</Label>
                <Input value={editForm.occupation} onChange={e => setEditForm(f => ({ ...f, occupation: e.target.value }))} placeholder="e.g. Teacher, Engineer, Student" />
              </div>
              <div className="space-y-1.5">
                <Label>Residential Address</Label>
                <Input value={editForm.residentialAddress} onChange={e => setEditForm(f => ({ ...f, residentialAddress: e.target.value }))} placeholder="e.g. East Legon, Accra" />
              </div>
            </div>

            {/* ── Church ── */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Church</p>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  onClick={() => setEditForm(f => ({ ...f, isBaptized: !f.isBaptized }))}
                  className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 flex-shrink-0 ${editForm.isBaptized ? "bg-purple-600" : "bg-gray-300"}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${editForm.isBaptized ? "translate-x-4" : "translate-x-0"}`} />
                </div>
                <span className="text-sm text-gray-700">I have been baptized</span>
              </label>
            </div>

            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-purple-700 hover:bg-purple-800 text-white" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="info" onValueChange={(v) => { if (v === "children" && !childrenTabLoaded) loadChildrenTab(); }}>
        <TabsList className="bg-purple-50 w-full flex overflow-x-auto no-scrollbar rounded-lg p-1 gap-0.5">
          <TabsTrigger
            value="info"
            className="flex-1 min-w-0 text-xs gap-1 px-2 py-1.5 data-[state=active]:bg-purple-700 data-[state=active]:text-white"
          >
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">Info</span>
          </TabsTrigger>
          <TabsTrigger
            value="attendance"
            className="flex-1 min-w-0 text-xs gap-1 px-2 py-1.5 data-[state=active]:bg-purple-700 data-[state=active]:text-white"
          >
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">Attend.</span>
          </TabsTrigger>
          <TabsTrigger
            value="givings"
            className="flex-1 min-w-0 text-xs gap-1 px-2 py-1.5 data-[state=active]:bg-purple-700 data-[state=active]:text-white"
          >
            <Banknote className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">Givings</span>
          </TabsTrigger>
          <TabsTrigger
            value="children"
            className="flex-1 min-w-0 text-xs gap-1 px-2 py-1.5 data-[state=active]:bg-purple-700 data-[state=active]:text-white"
          >
            <Baby className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">Children</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="pt-4">
          {myFamily ? (
            <Card className="border-purple-100">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Home className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-semibold text-gray-700">My Family</span>
                  <span className="ml-auto text-xs text-gray-400">{myFamily.name}</span>
                </div>
                <div className="space-y-2">
                  {myFamily.fatherName && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Crown className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                      <span className="text-gray-400 w-14 flex-shrink-0 text-xs">Father</span>
                      <span className="font-medium text-gray-800">{myFamily.fatherName}</span>
                    </div>
                  )}
                  {myFamily.motherName && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Crown className="w-3.5 h-3.5 text-pink-400 flex-shrink-0" />
                      <span className="text-gray-400 w-14 flex-shrink-0 text-xs">Mother</span>
                      <span className="font-medium text-gray-800">{myFamily.motherName}</span>
                    </div>
                  )}
                  {(myFamily.children ?? []).length > 0 && (
                    <div className="flex items-start gap-2 text-sm">
                      <Baby className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-400 w-14 flex-shrink-0 text-xs mt-0.5">Children</span>
                      <div className="flex flex-wrap gap-1">
                        {(myFamily.children ?? []).map((c: any) => (
                          <span key={`${c.source}-${c.id}`} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full">
                            {c.source === "teen" ? <Smile className="w-3 h-3" /> : <Baby className="w-3 h-3" />}
                            {c.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-10 text-gray-400 border rounded-lg bg-gray-50">
              <Home className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No family record linked to your profile.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="attendance" className="pt-4">
          <AttendanceTab memberId={user.memberId!} />
        </TabsContent>

        <TabsContent value="givings" className="pt-4">
          <GivingsTab memberId={user.memberId!} />
        </TabsContent>

        <TabsContent value="children" className="pt-4">
          {childrenTabLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : childrenTabList.length === 0 ? (
            <div className="text-center py-14 border rounded-xl bg-gray-50 text-gray-400">
              <Baby className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-gray-500">No children or teens linked</p>
              <p className="text-sm mt-1">Ask an admin to link your children to your profile</p>
            </div>
          ) : (
            <div className="space-y-2">
              {childrenTabList.map((dep: any) => (
                <div
                  key={`${dep.stage}-${dep.id}`}
                  className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-100 bg-white hover:border-purple-100 hover:bg-purple-50/20 transition-colors cursor-pointer"
                  onClick={() => openChildDetail(dep)}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${dep.stage === "teen" ? "bg-violet-100" : "bg-green-100"}`}>
                    {dep.stage === "teen"
                      ? <Smile className="w-5 h-5 text-violet-600" />
                      : <Baby className="w-5 h-5 text-green-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{dep.name}</p>
                    <p className="text-xs text-gray-400 capitalize">{dep.stage === "teen" ? "Teens" : "Children's Church"}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Child detail dialog */}
      <Dialog open={childDetailOpen} onOpenChange={(o) => { setChildDetailOpen(o); if (!o) { setChildDetailData(null); setChildEditOpen(false); } }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {childDetailData?._stage === "teen"
                ? <Smile className="w-4 h-4 text-violet-600" />
                : <Baby className="w-4 h-4 text-green-600" />}
              {childDetailData ? `${childDetailData.firstName} ${childDetailData.lastName}` : "Loading…"}
            </DialogTitle>
          </DialogHeader>

          {childDetailLoading ? (
            <div className="space-y-3 pt-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
            </div>
          ) : childDetailError ? (
            <div className="text-center py-10 text-gray-400">
              <Baby className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium text-gray-500">Could not load details</p>
              <p className="text-xs mt-1 text-red-400">{childDetailError}</p>
            </div>
          ) : childDetailData ? (
            <div className="space-y-4 pt-1">
              <div className="space-y-2 text-sm">
                {childDetailData.dateOfBirth && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span>{fmt(childDetailData.dateOfBirth, { day: "numeric", month: "long", year: "numeric" })}</span>
                  </div>
                )}
                {childDetailData.phone1 && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span>{childDetailData.phone1}{childDetailData.phone2 ? ` / ${childDetailData.phone2}` : ""}</span>
                  </div>
                )}
                {childDetailData.membershipId && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="font-mono text-xs">{childDetailData.membershipId}</span>
                  </div>
                )}
                {childDetailData.class && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Info className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span>Class: {childDetailData.class}</span>
                  </div>
                )}
              </div>

              {!childEditOpen && (
                <Button size="sm" variant="outline" className="gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50" onClick={openChildEdit}>
                  <Edit2 className="w-3.5 h-3.5" /> Edit Info
                </Button>
              )}

              {childEditOpen && (
                <form onSubmit={handleSaveChildEdit} className="space-y-3 border-t pt-4">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Edit Info</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">First Name</Label>
                      <Input value={childEditForm.firstName} onChange={e => setChildEditForm(f => ({ ...f, firstName: e.target.value.replace(/[^a-zA-Z\s'-]/g, "") }))} required />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Last Name</Label>
                      <Input value={childEditForm.lastName} onChange={e => setChildEditForm(f => ({ ...f, lastName: e.target.value.replace(/[^a-zA-Z\s'-]/g, "") }))} required />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Date of Birth</Label>
                    <Input type="date" value={childEditForm.dateOfBirth ? childEditForm.dateOfBirth.split("T")[0] : ""} onChange={e => setChildEditForm(f => ({ ...f, dateOfBirth: e.target.value }))} />
                  </div>
                  {childDetailData._stage === "teen" && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">Primary Phone</Label>
                        <Input inputMode="numeric" value={childEditForm.phone1} onChange={e => setChildEditForm(f => ({ ...f, phone1: e.target.value.replace(/\D/g, "") }))} placeholder="0XX XXX XXXX" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Secondary Phone</Label>
                        <Input inputMode="numeric" value={childEditForm.phone2} onChange={e => setChildEditForm(f => ({ ...f, phone2: e.target.value.replace(/\D/g, "") }))} placeholder="Optional" />
                      </div>
                    </>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button type="button" size="sm" variant="outline" className="flex-1" onClick={() => setChildEditOpen(false)}>Cancel</Button>
                    <Button type="submit" size="sm" className="flex-1 bg-purple-700 hover:bg-purple-800 text-white" disabled={childEditSaving}>
                      {childEditSaving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </form>
              )}

              {/* Recent attendance */}
              {(childDetailData.attendance ?? []).length > 0 && (
                <div className="border-t pt-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Recent Attendance</p>
                  <div className="space-y-1.5">
                    {(childDetailData.attendance ?? []).slice(0, 5).map((a: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                        <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                        <span className="flex-1">{a.serviceName ?? "Service"}</span>
                        <span className="text-gray-400">{a.serviceDate ? fmt(a.serviceDate) : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent givings */}
              {(childDetailData.givings ?? []).length > 0 && (
                <div className="border-t pt-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Recent Givings</p>
                  <div className="space-y-1.5">
                    {(childDetailData.givings ?? []).slice(0, 5).map((g: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <Banknote className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        <span className="flex-1 text-gray-700">{g.givingType}</span>
                        <span className="text-gray-400">{g.date ? fmt(g.date) : ""}</span>
                        <span className="font-semibold text-emerald-700">GHS {Number(g.amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Photo enlarged view */}
      {photoEnlarged && m?.profilePhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center"
          onClick={() => setPhotoEnlarged(false)}
        >
          <div className="relative" onClick={e => e.stopPropagation()}>
            <img
              src={m.profilePhoto}
              alt={`${m.firstName} ${m.lastName}`}
              className="max-w-[90vw] max-h-[90vh] rounded-2xl object-contain shadow-2xl"
            />
            <button
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
              onClick={() => setPhotoEnlarged(false)}
            >
              <span className="text-lg font-bold leading-none">×</span>
            </button>
          </div>
        </div>
      )}

      {/* Children's Givings dialog */}
      <Dialog open={childGivingsOpen} onOpenChange={setChildGivingsOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Baby className="w-4 h-4 text-green-600" /> Children's Giving Records
            </DialogTitle>
          </DialogHeader>
          {childGivingsLoading ? (
            <div className="space-y-3 pt-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
          ) : !childGivingsData || childGivingsData.dependents.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Baby className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium text-gray-500">No linked children or teens found</p>
              <p className="text-xs mt-1">Only non-promoted children and teens appear here</p>
            </div>
          ) : (
            <div className="space-y-5 pt-2">
              {childGivingsData.dependents.map((dep: any) => {
                const entry = childGivingsData.grouped[dep.name];
                const givings: any[] = entry?.givings ?? [];
                const total: number = entry?.total ?? 0;
                return (
                  <div key={`${dep.stage}-${dep.id}`} className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                      {dep.stage === "teen"
                        ? <Smile className="w-4 h-4 text-violet-500 flex-shrink-0" />
                        : <Baby className="w-4 h-4 text-green-500 flex-shrink-0" />}
                      <span className="font-semibold text-gray-800 text-sm">{dep.name}</span>
                      <span className="text-[10px] ml-1 bg-gray-200 text-gray-600 rounded px-1.5 py-0.5 capitalize">{dep.stage}</span>
                      {total > 0 && (
                        <span className="ml-auto text-sm font-bold text-emerald-700">
                          GHS {total.toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                    {givings.length === 0 ? (
                      <div className="px-4 py-4 text-center text-xs text-gray-400">No giving records yet</div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {givings.map((g: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-3 px-4 py-2.5">
                            <Banknote className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-700">{g.givingTypeName}</p>
                              <p className="text-[11px] text-gray-400 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {fmt(g.date)}
                                {g.notes && <span className="italic truncate max-w-[100px]">· {g.notes}</span>}
                              </p>
                            </div>
                            <p className="font-bold text-emerald-700 text-xs flex-shrink-0">
                              GHS {Number(g.amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Change PIN dialog */}
      <Dialog open={pinOpen} onOpenChange={(o) => { setPinOpen(o); if (!o) setPinForm({ currentPin: "", newPin: "", confirmPin: "" }); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Login PIN</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleChangePin} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Current PIN</Label>
              <PasswordInput
                inputMode="numeric"
                maxLength={6}
                placeholder="Enter current PIN"
                value={pinForm.currentPin}
                onChange={e => setPinForm(f => ({ ...f, currentPin: e.target.value.replace(/\D/g, "") }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>New PIN</Label>
              <PasswordInput
                inputMode="numeric"
                maxLength={6}
                placeholder="Enter new PIN (3–6 digits)"
                value={pinForm.newPin}
                onChange={e => setPinForm(f => ({ ...f, newPin: e.target.value.replace(/\D/g, "") }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm New PIN</Label>
              <PasswordInput
                inputMode="numeric"
                maxLength={6}
                placeholder="Repeat new PIN"
                value={pinForm.confirmPin}
                onChange={e => setPinForm(f => ({ ...f, confirmPin: e.target.value.replace(/\D/g, "") }))}
                required
              />
            </div>
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setPinOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-purple-700 hover:bg-purple-800 text-white" disabled={isSavingPin}>
                {isSavingPin ? "Saving..." : "Change PIN"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
