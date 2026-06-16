import { useState, useCallback, useRef, useEffect } from "react";
import { downloadJsonAsExcel } from "@/utils/excel";
import QRCode from "react-qr-code";
import {
  useListMembers, getListMembersQueryKey,
  useGetMember, getGetMemberQueryKey,
  useCreateMember,
  useUpdateMember,
  useDeleteMember,
  useConvertVisitorToMember,
  useListCells, getListCellsQueryKey,
  useListSeniorCells, getListSeniorCellsQueryKey,
  useGetMemberCredentials, getGetMemberCredentialsQueryKey,
  useResetMemberPassword,
  useGetMemberGivings, getGetMemberGivingsQueryKey,
  useGetMemberAttendance, getGetMemberAttendanceQueryKey,
  useListFamilies, getListFamiliesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, ChevronLeft, ChevronRight, UserCheck, Trash2, Phone, Mail, MapPin, Briefcase, Calendar, Users, ArrowRight, Download, QrCode, X, Camera, Edit2, Eye, EyeOff, KeyRound, RefreshCw, Gift, Home, Crown, Baby, Smile } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

const TITLES = ["Mr.", "Mrs.", "Brother", "Sister", "Pastor", "Deacon", "Deaconess"];

function dn(m: { title?: string | null; firstName?: string; lastName?: string }): string {
  const name = `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim();
  return m.title ? `${m.title} ${name}` : name;
}

const EMPTY_FORM = {
  title: "",
  firstName: "", lastName: "", gender: "male" as "male" | "female",
  phone1: "", phone2: "", email: "", occupation: "", residentialAddress: "",
  emergencyContact: "", dateOfBirth: "", maritalStatus: "", dateJoined: "",
  foundationSchoolDate: "", weddingDate: "",
  isBaptized: false, memberType: "member" as "member" | "visitor",
  cellId: "", spouseId: "", profilePhoto: "",
};

function SpouseSearch({ value, onChange, initialName }: { value: string; onChange: (id: string, name: string) => void; initialName?: string }) {
  const [query, setQuery] = useState("");
  const [spouseName, setSpouseName] = useState(initialName ?? "");
  const { data } = useListMembers(
    { search: query, page: 1, limit: 8, type: "member" },
    { query: { queryKey: [...getListMembersQueryKey({ search: query }), "spouse"], enabled: query.length > 1 } }
  );

  if (value && spouseName) {
    return (
      <div className="flex items-center gap-2 border rounded px-3 py-2 bg-purple-50">
        <span className="text-sm text-purple-800 flex-1 font-medium">{spouseName}</span>
        <button type="button" onClick={() => { onChange("", ""); setSpouseName(""); setQuery(""); }} className="text-gray-400 hover:text-red-500">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input className="pl-9" placeholder="Search spouse by name..." value={query} onChange={e => setQuery(e.target.value)} />
      {query.length > 1 && (data?.data ?? []).length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {(data?.data ?? []).map((m: any) => (
            <button key={m.id} type="button"
              className="w-full text-left px-3 py-2 hover:bg-purple-50 text-sm flex items-center gap-2"
              onClick={() => { const n = dn(m); onChange(String(m.id), n); setSpouseName(n); setQuery(""); }}>
              <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-xs font-bold flex-shrink-0">
                {m.firstName?.[0]}{m.lastName?.[0]}
              </div>
              <span>{dn(m)}</span>
              <span className="text-gray-400 text-xs ml-auto font-mono">{m.membershipId}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function buildCellLabel(cell: any, seniorCellMap: Map<number, any>): string {
  if (!cell.seniorCellId) return cell.name;
  const sc = seniorCellMap.get(cell.seniorCellId);
  if (!sc) return cell.name;
  if (!sc.pcfName) return `${cell.name}  ›  ${sc.name}`;
  return `${cell.name}  ›  ${sc.name}  ›  ${sc.pcfName}`;
}

function MemberForm({ onSubmit, loading, cells, seniorCells, initialValues, isEdit }: {
  onSubmit: (d: any) => void;
  loading: boolean;
  cells: any[];
  seniorCells: any[];
  initialValues?: any;
  isEdit?: boolean;
}) {
  const toForm = (v?: any) => !v ? { ...EMPTY_FORM } : {
    title: v.title ?? "",
    firstName: v.firstName ?? "", lastName: v.lastName ?? "",
    gender: (v.gender ?? "male") as "male" | "female",
    phone1: v.phone1 ?? "", phone2: v.phone2 ?? "", email: v.email ?? "",
    occupation: v.occupation ?? "", residentialAddress: v.residentialAddress ?? "",
    emergencyContact: v.emergencyContact ?? "", dateOfBirth: v.dateOfBirth ?? "",
    maritalStatus: v.maritalStatus ?? "", dateJoined: v.dateJoined ?? "",
    foundationSchoolDate: v.foundationSchoolDate ?? "", weddingDate: v.weddingDate ?? "",
    isBaptized: v.isBaptized ?? false,
    memberType: (v.memberType ?? "member") as "member" | "visitor",
    cellId: v.cellId ? String(v.cellId) : "",
    spouseId: v.spouseId ? String(v.spouseId) : "",
    profilePhoto: v.profilePhoto ?? "",
  };
  const [form, setForm] = useState(() => toForm(initialValues));
  const [cellError, setCellError] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const [dupeQuery, setDupeQuery] = useState("");
  const { data: dupeMemberData } = useListMembers(
    { search: dupeQuery, page: 1, limit: 10 },
    { query: { queryKey: [...getListMembersQueryKey({ search: dupeQuery }), "dupecheck"], enabled: dupeQuery.length >= 2 && !isEdit, staleTime: 30000 } }
  );
  const nameDuplicates = (dupeMemberData?.data ?? []) as any[];

  useEffect(() => {
    if (!form.firstName || form.firstName.length < 2) { setDupeQuery(""); return; }
    const t = setTimeout(() => setDupeQuery(form.firstName), 700);
    return () => clearTimeout(t);
  }, [form.firstName]);

  const seniorCellMap = new Map(seniorCells.map(sc => [sc.id, sc]));

  const resizeImage = (file: File, maxPx = 800, quality = 0.75): Promise<string> =>
    new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = url;
    });

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert("Image must be under 10MB"); return; }
    const compressed = await resizeImage(file);
    set("profilePhoto", compressed);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.memberType === "member" && !form.cellId) {
      setCellError(true);
      return;
    }
    setCellError(false);
    const payload: any = {
      title: (form.title && form.title !== "none") ? form.title : null,
      firstName: form.firstName, lastName: form.lastName, gender: form.gender,
      phone1: form.phone1, phone2: form.phone2 || null, email: form.email || null,
      occupation: form.occupation, residentialAddress: form.residentialAddress,
      emergencyContact: form.emergencyContact, memberType: form.memberType,
      isBaptized: form.isBaptized,
      dateOfBirth: form.dateOfBirth || null, maritalStatus: form.maritalStatus || null,
      dateJoined: form.dateJoined || null,
      foundationSchoolDate: form.foundationSchoolDate || null,
      weddingDate: form.weddingDate || null,
      cellId: form.cellId ? parseInt(form.cellId) : null,
      spouseId: form.spouseId ? parseInt(form.spouseId) : null,
      profilePhoto: form.profilePhoto || null,
    };
    onSubmit(payload);
  };

  const isVisitor = form.memberType === "visitor";

  return (
    <>
      {/* File input lives OUTSIDE the form so it never interferes with form validation */}
      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />

      <form onSubmit={handleSubmit} className="space-y-3 overflow-y-auto max-h-[70vh] pr-1">

        {/* Profile Photo */}
        <div className="flex flex-col items-center gap-2 py-2">
          <div
            className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-100 to-purple-200 border-2 border-purple-200 flex items-center justify-center overflow-hidden cursor-pointer relative group"
            onClick={() => photoInputRef.current?.click()}
          >
            {form.profilePhoto ? (
              <img src={form.profilePhoto} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-1 text-purple-400">
                <Camera className="w-6 h-6" />
                <span className="text-[10px] font-medium">Photo</span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => photoInputRef.current?.click()}
              className="text-xs text-purple-600 hover:text-purple-800 underline underline-offset-2">
              {form.profilePhoto ? "Change photo" : "Upload photo (optional)"}
            </button>
            {form.profilePhoto && (
              <button type="button" onClick={() => set("profilePhoto", "")}
                className="text-xs text-gray-400 hover:text-red-500">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Select value={form.title} onValueChange={v => set("title", v)}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {TITLES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>First Name *</Label>
            <Input value={form.firstName} onChange={e => set("firstName", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Last Name *</Label>
            <Input value={form.lastName} onChange={e => set("lastName", e.target.value)} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Gender *</Label>
            <Select value={form.gender} onValueChange={v => set("gender", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Type *</Label>
            <Select value={form.memberType} onValueChange={v => { set("memberType", v); if (v === "visitor") setCellError(false); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="visitor">Visitor</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {nameDuplicates.length > 0 && !isEdit && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
              <span>⚠</span> Possible duplicate — {nameDuplicates.length} similar name{nameDuplicates.length !== 1 ? "s" : ""} already exist. Verify before adding.
            </p>
            <div className="space-y-1">
              {nameDuplicates.map((m: any) => (
                <div key={m.id} className="flex items-center gap-2 bg-white rounded-md px-2 py-1.5 border border-amber-200">
                  <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-[10px] font-bold flex-shrink-0">
                    {m.firstName?.[0]}{m.lastName?.[0]}
                  </div>
                  <span className="text-xs font-medium text-gray-800 flex-1">{dn(m)}</span>
                  <span className="text-xs text-gray-400 font-mono">{m.membershipId}</span>
                  {m.cellName && <span className="text-xs text-gray-400 hidden sm:block truncate max-w-24">{m.cellName}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Phone 1 *</Label>
          <Input value={form.phone1} onChange={e => set("phone1", e.target.value)} required />
        </div>

        <div className="space-y-1.5">
          <Label>Residential Address *</Label>
          <Input value={form.residentialAddress} onChange={e => set("residentialAddress", e.target.value)} required />
        </div>

        {!isVisitor && (
          <>
            <div className="space-y-1.5">
              <Label>Marital Status</Label>
              <Select value={form.maritalStatus} onValueChange={v => set("maritalStatus", v)}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="married">Married</SelectItem>
                  <SelectItem value="widowed">Widowed</SelectItem>
                  <SelectItem value="divorced">Divorced</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.maritalStatus === "married" && (
              <>
                <div className="space-y-1.5">
                  <Label>Spouse (search member)</Label>
                  <SpouseSearch value={form.spouseId} onChange={(id) => set("spouseId", id)} initialName={initialValues?.spouseName} />
                </div>
                <div className="space-y-1.5">
                  <Label>Wedding Date</Label>
                  <Input type="date" value={form.weddingDate} onChange={e => set("weddingDate", e.target.value)} />
                </div>
              </>
            )}
          </>
        )}

        {/* Member-only fields */}
        {!isVisitor && (
          <>
            {/* Cell — mandatory for members */}
            <div className="space-y-1.5">
              <Label>Cell <span className="text-red-500">*</span></Label>
              <Select value={form.cellId} onValueChange={v => { set("cellId", v); setCellError(false); }}>
                <SelectTrigger className={cellError ? "border-red-400 focus:ring-red-400" : ""}>
                  <SelectValue placeholder="Select a cell..." />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {cells.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      <span className="font-medium">{c.name}</span>
                      {c.seniorCellId && seniorCellMap.get(c.seniorCellId) && (
                        <span className="text-gray-400 text-xs ml-1">
                          › {seniorCellMap.get(c.seniorCellId)?.name}
                          {seniorCellMap.get(c.seniorCellId)?.pcfName && (
                            <> › {seniorCellMap.get(c.seniorCellId)?.pcfName}</>
                          )}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                  {cells.length === 0 && (
                    <div className="px-3 py-4 text-center text-gray-400 text-sm">No cells available. Create a cell first.</div>
                  )}
                </SelectContent>
              </Select>
              {cellError && <p className="text-xs text-red-500 mt-1">Cell is required for members</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone 2</Label>
                <Input value={form.phone2} onChange={e => set("phone2", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Occupation</Label>
              <Input value={form.occupation} onChange={e => set("occupation", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Emergency Contact</Label>
              <Input value={form.emergencyContact} onChange={e => set("emergencyContact", e.target.value)} placeholder="Name & phone" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date of Birth</Label>
                <Input type="date" value={form.dateOfBirth} onChange={e => set("dateOfBirth", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Date Joined</Label>
                <Input type="date" value={form.dateJoined} onChange={e => set("dateJoined", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Foundation School Completion Date</Label>
              <Input type="date" value={form.foundationSchoolDate} onChange={e => set("foundationSchoolDate", e.target.value)} />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input type="checkbox" id="baptized" checked={form.isBaptized} onChange={e => set("isBaptized", e.target.checked)} className="w-4 h-4 accent-purple-700" />
              <Label htmlFor="baptized" className="cursor-pointer">Baptized</Label>
            </div>
          </>
        )}

        <Button type="submit" className="w-full bg-purple-700 hover:bg-purple-800 text-white mt-2" disabled={loading}>
          {loading ? "Saving..." : isEdit ? "Update Member" : isVisitor ? "Save Visitor" : "Save Member"}
        </Button>
      </form>
    </>
  );
}

function AttendanceYearTab({ memberId, m }: { memberId: number; m: any }) {
  const [page, setPage] = useState(1);
  const LIMIT = 15;
  const activeYearId = m.activeMinistryYear?.id;

  const { data, isLoading } = useGetMemberAttendance(memberId, { ministryYearId: activeYearId, page, limit: LIMIT }, {
    query: { queryKey: getGetMemberAttendanceQueryKey(memberId, { ministryYearId: activeYearId, page, limit: LIMIT }), enabled: !!activeYearId },
  });

  const records: any[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  if (!m.activeMinistryYear) {
    return (
      <div className="py-8 text-center text-gray-400 text-sm">
        No active ministry year. Records are shown when a ministry year is active.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-purple-600 font-medium bg-purple-50 rounded px-2.5 py-1">
          {m.activeMinistryYear.name}
        </span>
        <span className="text-xs text-gray-500">
          <span className="font-bold text-purple-700 text-base">{m.attendanceThisYear ?? total}</span> services attended
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs py-2 w-8">#</TableHead>
                <TableHead className="text-xs py-2">Service</TableHead>
                <TableHead className="text-xs py-2">Date</TableHead>
                <TableHead className="text-xs py-2">Check-in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-xs text-gray-400 py-8">
                    No attendance records for this year
                  </TableCell>
                </TableRow>
              ) : (
                records.map((a: any, i: number) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs py-2 text-gray-400">{(page - 1) * LIMIT + i + 1}</TableCell>
                    <TableCell className="text-xs py-2 font-medium">{a.serviceName}</TableCell>
                    <TableCell className="text-xs py-2 text-gray-500">
                      {a.serviceDate ? new Date(a.serviceDate).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </TableCell>
                    <TableCell className="text-xs py-2 text-gray-400">
                      {a.checkInTime ? new Date(a.checkInTime).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex justify-between items-center px-3 py-2 bg-gray-50 text-xs text-gray-500 border-t">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-6 px-2" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-3 h-3" />
                </Button>
                <Button size="sm" variant="outline" className="h-6 px-2" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GivingsYearTab({ memberId, m }: { memberId: number; m: any }) {
  const [page, setPage] = useState(1);
  const LIMIT = 15;
  const activeYearId = m.activeMinistryYear?.id;

  const givingsParams = { ministryYearId: activeYearId, page, limit: LIMIT };
  const { data, isLoading } = useGetMemberGivings(memberId, givingsParams, {
    query: { queryKey: getGetMemberGivingsQueryKey(memberId, givingsParams), enabled: !!activeYearId },
  });

  const records: any[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);
  const pageTotal = records.reduce((s, g) => s + Number(g.amount), 0);

  if (!m.activeMinistryYear) {
    return (
      <div className="py-8 text-center text-gray-400 text-sm">
        No active ministry year. Records are shown when a ministry year is active.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-purple-600 font-medium bg-purple-50 rounded px-2.5 py-1">
          {m.activeMinistryYear.name}
        </span>
        <span className="text-xs text-gray-500">
          Total: <span className="font-bold text-green-700 text-sm">
            GHS {Number(m.givingTotalThisYear ?? pageTotal).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
          </span>
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs py-2 w-8">#</TableHead>
                <TableHead className="text-xs py-2">Type</TableHead>
                <TableHead className="text-xs py-2">Amount</TableHead>
                <TableHead className="text-xs py-2">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-xs text-gray-400 py-8">
                    No giving records for this year
                  </TableCell>
                </TableRow>
              ) : (
                records.map((g: any, i: number) => (
                  <TableRow key={g.id}>
                    <TableCell className="text-xs py-2 text-gray-400">{(page - 1) * LIMIT + i + 1}</TableCell>
                    <TableCell className="text-xs py-2 font-medium">{g.givingTypeName}</TableCell>
                    <TableCell className="text-xs py-2 font-semibold text-green-700">
                      GHS {Number(g.amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs py-2 text-gray-500">
                      {g.date ? new Date(g.date).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex justify-between items-center px-3 py-2 bg-gray-50 text-xs text-gray-500 border-t">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-6 px-2" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-3 h-3" />
                </Button>
                <Button size="sm" variant="outline" className="h-6 px-2" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CredentialsTab({ memberId }: { memberId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showPin, setShowPin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { data: creds, isLoading } = useGetMemberCredentials(memberId, {
    query: { queryKey: getGetMemberCredentialsQueryKey(memberId) },
  });

  const resetPassword = useResetMemberPassword({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMemberCredentialsQueryKey(memberId) });
        toast({ title: "Password reset successfully" });
      },
      onError: (e: any) => toast({ title: "Reset failed", description: e?.message, variant: "destructive" }),
    },
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!creds) return <p className="text-sm text-gray-400 py-4">This member has no user account.</p>;

  return (
    <div className="space-y-3">
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Login Credentials</div>
        <div className="divide-y">
          <div className="flex items-center gap-3 px-4 py-3">
            <KeyRound className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-gray-400">Username</p>
              <p className="text-sm font-mono font-medium text-gray-800">{creds.username}</p>
            </div>
          </div>
          {creds.pin !== undefined && (
            <div className="flex items-center gap-3 px-4 py-3">
              <KeyRound className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-gray-400">PIN</p>
                <p className="text-sm font-mono font-medium text-gray-800">
                  {showPin ? creds.pin : "••••"}
                </p>
              </div>
              <button onClick={() => setShowPin(v => !v)} className="text-gray-400 hover:text-gray-600">
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          )}
          {creds.password !== undefined && (
            <div className="flex items-center gap-3 px-4 py-3">
              <KeyRound className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-gray-400">Password</p>
                <p className="text-sm font-mono font-medium text-gray-800">
                  {showPassword ? creds.password : "••••••••"}
                </p>
              </div>
              <button onClick={() => setShowPassword(v => !v)} className="text-gray-400 hover:text-gray-600">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          )}
          <div className="px-4 py-3 flex items-center gap-2">
            <p className="text-xs text-gray-400 flex-1">Role Level: <span className="text-gray-700 font-medium">{creds.roleLevel}</span></p>
            <Badge className={`text-xs border-0 ${creds.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-500"}`}>
              {creds.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="border-orange-300 text-orange-600 hover:bg-orange-50"
        onClick={() => { if (confirm("Reset this member's password to default?")) resetPassword.mutate({ id: memberId }); }}
        disabled={resetPassword.isPending}
      >
        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
        {resetPassword.isPending ? "Resetting..." : "Reset Password to Default"}
      </Button>
    </div>
  );
}

function MemberDetail({ memberId, onBack, canDelete, canManage, cells, seniorCells }: {
  memberId: number; onBack: () => void; canDelete: boolean;
  canManage: boolean; cells: any[]; seniorCells: any[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isPFCC = (user as any)?.roleSubtype === "pfcc";
  const [showQR, setShowQR] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [photoEnlarged, setPhotoEnlarged] = useState(false);
  const photoUpdateRef = useRef<HTMLInputElement>(null);
  const [greetingOpen, setGreetingOpen] = useState(false);
  const [greetingForm, setGreetingForm] = useState({ title: "", message: "", emoji: "🎂" });
  const [isSendingGreeting, setIsSendingGreeting] = useState(false);

  const { data: member, isLoading } = useGetMember(memberId, {
    query: { queryKey: getGetMemberQueryKey(memberId) },
  });

  const { data: memberFamilyData } = useListFamilies(
    { memberId },
    { query: { queryKey: getListFamiliesQueryKey({ memberId }) } }
  );
  const memberFamily: any = Array.isArray(memberFamilyData) ? memberFamilyData[0] : null;

  const updateMember = useUpdateMember({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMemberQueryKey(memberId) });
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        setEditOpen(false);
        toast({ title: "Member updated" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const convertToMember = useConvertVisitorToMember({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMemberQueryKey(memberId) });
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        toast({ title: "Converted to member" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const deleteMember = useDeleteMember({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        // Also clear all family queries so profiles don't show stale family data
        queryClient.invalidateQueries({ queryKey: ["/api/families"] });
        onBack();
        toast({ title: "Member deleted" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const resizeImageForUpdate = (file: File, maxPx = 800, quality = 0.75): Promise<string> =>
    new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = url;
    });

  const handlePhotoUpdate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast({ title: "Image must be under 10MB", variant: "destructive" }); return; }
    const compressed = await resizeImageForUpdate(file);
    updateMember.mutate({ id: memberId, data: { profilePhoto: compressed } });
  };

  const handleSendGreeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!greetingForm.title || !greetingForm.message) return;
    setIsSendingGreeting(true);
    try {
      const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: greetingForm.title,
          message: greetingForm.message,
          emoji: greetingForm.emoji,
          targetMemberId: memberId,
          expiresInHours: 48,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Greeting sent!", description: "The member will see it on their home page." });
      setGreetingOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to send", variant: "destructive" });
    } finally {
      setIsSendingGreeting(false);
    }
  };

  const m = member as any;

  if (isLoading) return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="text-gray-500">← Back</Button>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );

  if (!m) return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
      <p className="text-gray-400">Member not found.</p>
    </div>
  );

  const printQR = () => {
    const svg = document.getElementById("member-qr-svg");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><body style="display:flex;flex-direction:column;align-items:center;padding:32px;font-family:sans-serif;">
      <h2 style="margin-bottom:4px">${m.firstName} ${m.lastName}</h2>
      <p style="color:#6b7280;margin-bottom:24px;font-family:monospace">${m.membershipId}</p>
      ${svgData}
      <p style="margin-top:16px;color:#6b7280;font-size:14px">Christ Embassy Kumasi 1</p>
    </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  return (
    <div className="space-y-5">
      {/* ── Action bar — wraps gracefully on mobile ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-gray-500 shrink-0">← Back</Button>

        {m.memberType === "visitor" && (
          <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50 shrink-0"
            onClick={() => convertToMember.mutate({ id: memberId, data: { cellId: 0 } })}>
            <UserCheck className="w-3.5 h-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Convert to Member</span>
            <span className="sm:hidden">Convert</span>
          </Button>
        )}

        {canManage && (
          <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50 shrink-0"
            onClick={() => setEditOpen(true)}>
            <Edit2 className="w-3.5 h-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Edit</span>
          </Button>
        )}

        <Button size="sm" variant="outline" className="text-purple-600 border-purple-200 hover:bg-purple-50 shrink-0"
          onClick={() => setShowQR(true)}>
          <QrCode className="w-3.5 h-3.5 sm:mr-1" />
          <span className="hidden sm:inline">QR Code</span>
        </Button>

        {(user?.roleLevel ?? 5) <= 1 && (
          <Button size="sm" variant="outline" className="text-yellow-600 border-yellow-200 hover:bg-yellow-50 shrink-0"
            onClick={() => {
              const firstName = m?.firstName ?? "";
              const today = new Date();
              const dob = m?.dateOfBirth ? new Date(m.dateOfBirth) : null;
              const wedding = m?.weddingDate ? new Date(m.weddingDate) : null;
              const isBirthday = dob && dob.getMonth() === today.getMonth() && dob.getDate() === today.getDate();
              const isAnniversary = wedding && wedding.getMonth() === today.getMonth() && wedding.getDate() === today.getDate();
              if (isAnniversary) {
                setGreetingForm({ emoji: "💍", title: `Happy Anniversary, ${firstName}! 💕`, message: `May God continue to bless your marriage with love, joy, and peace. 🙏` });
              } else {
                setGreetingForm({ emoji: "🎂", title: `Happy Birthday, ${firstName}! 🎉`, message: `Wishing you a wonderful birthday filled with God's blessings. You are loved! 🙏` });
              }
              setGreetingOpen(true);
            }}>
            <Gift className="w-3.5 h-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Send Greeting</span>
            <span className="sm:hidden">Greet</span>
          </Button>
        )}

        {canDelete && (
          <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-500 shrink-0 sm:ml-auto"
            onClick={() => { if (confirm(`Delete ${dn(m)}?`)) deleteMember.mutate({ id: memberId, data: { reason: "Deleted by admin" } }); }}>
            <Trash2 className="w-3.5 h-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Delete</span>
          </Button>
        )}
      </div>

      {photoEnlarged && m.profilePhoto && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setPhotoEnlarged(false)}>
          <div className="relative" onClick={e => e.stopPropagation()}>
            <img src={m.profilePhoto} alt={`${m.firstName} ${m.lastName}`} className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain shadow-2xl" />
            <button
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
              onClick={() => setPhotoEnlarged(false)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <input ref={photoUpdateRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpdate} />

      {/* Greeting Dialog */}
      <Dialog open={greetingOpen} onOpenChange={setGreetingOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Gift className="w-4 h-4 text-yellow-500" /> Send Personal Greeting</DialogTitle></DialogHeader>
          <form onSubmit={handleSendGreeting} className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label>Emoji</Label>
              <div className="flex gap-2 flex-wrap">
                {["🎂","🎉","💍","❤️","🙏","🌟","🎁"].map(e => (
                  <button key={e} type="button"
                    onClick={() => setGreetingForm(f => ({ ...f, emoji: e }))}
                    className={`text-xl w-9 h-9 rounded-lg flex items-center justify-center transition-all ${greetingForm.emoji === e ? "bg-yellow-100 ring-2 ring-yellow-400" : "hover:bg-gray-100"}`}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={greetingForm.title} onChange={e => setGreetingForm(f => ({ ...f, title: e.target.value }))} required maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea value={greetingForm.message} onChange={e => setGreetingForm(f => ({ ...f, message: e.target.value }))} required className="h-24 resize-none text-sm" />
            </div>
            <p className="text-xs text-gray-400">This greeting will appear privately on {m?.firstName}'s home page for 48 hours.</p>
            <Button type="submit" className="w-full bg-yellow-500 hover:bg-yellow-600 text-white" disabled={isSendingGreeting}>
              {isSendingGreeting ? "Sending…" : "Send Greeting"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <div className="flex items-start gap-4">
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <div
            className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white font-bold text-xl overflow-hidden relative group cursor-pointer"
            onClick={() => m.profilePhoto ? setPhotoEnlarged(true) : canManage && photoUpdateRef.current?.click()}
            title={m.profilePhoto ? "Click to enlarge" : canManage ? "Click to upload photo" : undefined}
          >
            {m.profilePhoto
              ? <img src={m.profilePhoto} alt="" className="w-full h-full object-cover" />
              : <>{m.firstName?.[0]}{m.lastName?.[0]}</>}
            <div className="absolute inset-0 bg-black/30 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {m.profilePhoto ? <Search className="w-4 h-4 text-white" /> : <Camera className="w-5 h-5 text-white" />}
            </div>
          </div>
          {canManage && (
            <button type="button" onClick={() => photoUpdateRef.current?.click()}
              className="text-[10px] text-purple-500 hover:text-purple-700 underline underline-offset-1">
              Change
            </button>
          )}
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">{dn(m)}</h2>
          <p className="text-sm text-gray-400 font-mono">{m.membershipId}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(() => {
              const lp = (m as any).leadershipPositions ?? {};
              if (lp.pcfLeader)
                return <Badge className="border-0 text-xs bg-amber-100 text-amber-700">PCF Leader</Badge>;
              if (lp.seniorCellLeader)
                return <Badge className="border-0 text-xs bg-orange-100 text-orange-700">Senior Cell Leader</Badge>;
              if (lp.cellLeader)
                return <Badge className="border-0 text-xs bg-green-100 text-green-700">Cell Leader</Badge>;
              return <Badge className={`border-0 text-xs capitalize ${m.memberType === "visitor" ? "bg-orange-100 text-orange-700" : "bg-purple-100 text-purple-700"}`}>{m.memberType}</Badge>;
            })()}
            <Badge variant="outline" className="capitalize text-xs">{m.gender}</Badge>
            {m.isBaptized && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">Baptized</Badge>}
            {m.cellName && <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">{m.cellName}</Badge>}
            {((m as any).departmentMemberships ?? []).map((dept: any) => (
              <Badge key={dept.name} variant="outline" className={`text-xs ${dept.isHead ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-teal-50 text-teal-700 border-teal-200"}`}>
                {dept.isHead ? `Leader of ${dept.name}` : dept.name}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <Tabs defaultValue="info">
        <TabsList className="bg-gray-100 h-auto flex-wrap gap-y-1 p-1">
          <TabsTrigger value="info" className="text-xs data-[state=active]:bg-purple-700 data-[state=active]:text-white">Info</TabsTrigger>
          <TabsTrigger value="fellowship" className="text-xs data-[state=active]:bg-purple-700 data-[state=active]:text-white">Fellowship</TabsTrigger>
          {((user?.roleLevel ?? 5) <= 1 || isPFCC) && (
            <TabsTrigger value="attendance-year" className="text-xs data-[state=active]:bg-purple-700 data-[state=active]:text-white">Attendance</TabsTrigger>
          )}
          {(user?.roleLevel ?? 5) <= 2 && (
            <TabsTrigger value="givings-year" className="text-xs data-[state=active]:bg-purple-700 data-[state=active]:text-white">Givings</TabsTrigger>
          )}
          {(user?.roleLevel ?? 5) <= 1 && (
            <TabsTrigger value="credentials" className="text-xs data-[state=active]:bg-purple-700 data-[state=active]:text-white">Credentials</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="info" className="pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: <Phone className="w-3.5 h-3.5" />, label: "Phone 1", value: m.phone1 },
              { icon: <Phone className="w-3.5 h-3.5" />, label: "Phone 2", value: m.phone2 },
              { icon: <Mail className="w-3.5 h-3.5" />, label: "Email", value: m.email },
              { icon: <Briefcase className="w-3.5 h-3.5" />, label: "Occupation", value: m.occupation },
              { icon: <MapPin className="w-3.5 h-3.5" />, label: "Address", value: m.residentialAddress },
              { icon: <Calendar className="w-3.5 h-3.5" />, label: "Date of Birth", value: m.dateOfBirth ? new Date(m.dateOfBirth).toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" }) : null },
              { icon: <Calendar className="w-3.5 h-3.5" />, label: "Joined", value: m.dateJoined ? new Date(m.dateJoined).toLocaleDateString("en-GH", { month: "long", year: "numeric" }) : null },
              { icon: <Calendar className="w-3.5 h-3.5" />, label: "Foundation School", value: m.foundationSchoolDate ? new Date(m.foundationSchoolDate).toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" }) : null },
              { icon: <Users className="w-3.5 h-3.5" />, label: "Marital Status", value: m.maritalStatus },
              { icon: <Users className="w-3.5 h-3.5" />, label: "Spouse", value: m.spouseName },
              { icon: <Calendar className="w-3.5 h-3.5" />, label: "Wedding Date", value: m.weddingDate ? new Date(m.weddingDate).toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" }) : null },
            ].filter(f => f.value).map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-gray-400 mt-0.5 flex-shrink-0">{f.icon}</span>
                <div>
                  <span className="text-gray-400 text-xs block">{f.label}</span>
                  <span className="text-gray-800 capitalize">{f.value}</span>
                </div>
              </div>
            ))}
          </div>
          {m.emergencyContact && (
            <div className="mt-3 p-3 bg-orange-50 border border-orange-100 rounded-lg text-sm">
              <span className="text-orange-600 font-medium text-xs block mb-1">Emergency Contact</span>
              <span className="text-gray-700">{m.emergencyContact}</span>
            </div>
          )}

          {/* Family (shown in Info tab) */}
          {memberFamily && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Family</p>
              <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Home className="w-3.5 h-3.5 text-purple-500" />
                  <span className="text-xs font-semibold text-purple-700">{memberFamily.name}</span>
                </div>
                {memberFamily.fatherName && (
                  <div className="flex items-center gap-2 text-sm">
                    <Crown className="w-3 h-3 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-400 text-xs w-12">Father</span>
                    <span className="text-gray-800 text-sm font-medium">{memberFamily.fatherName}</span>
                  </div>
                )}
                {memberFamily.motherName && (
                  <div className="flex items-center gap-2 text-sm">
                    <Crown className="w-3 h-3 text-pink-400 flex-shrink-0" />
                    <span className="text-gray-400 text-xs w-12">Mother</span>
                    <span className="text-gray-800 text-sm font-medium">{memberFamily.motherName}</span>
                  </div>
                )}
                {(memberFamily.children ?? []).length > 0 && (
                  <div className="flex items-start gap-2 text-sm">
                    <Baby className="w-3 h-3 text-green-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-400 text-xs w-12 mt-0.5">Children</span>
                    <div className="flex flex-wrap gap-1">
                      {(memberFamily.children ?? []).map((c: any) => (
                        <span key={`${c.source}-${c.id}`} className="inline-flex items-center gap-1 bg-white border border-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                          {c.source === "teen" ? <Smile className="w-2.5 h-2.5" /> : <Baby className="w-2.5 h-2.5" />}
                          {c.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="fellowship" className="pt-3 space-y-4">
          {/* Fellowship membership */}
          {(m.cellName || m.seniorCellName || m.pcfName) && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Fellowship</p>
              {[
                { label: "Cell", value: m.cellName },
                { label: "Senior Cell", value: m.seniorCellName },
                { label: "PCF", value: m.pcfName },
              ].filter(f => f.value).map((f, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                  <span className="text-gray-500 text-sm w-28 flex-shrink-0">{f.label}</span>
                  <span className="text-gray-800 font-medium text-sm">{f.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Leadership positions — live from fellowship tables */}
          {(() => {
            const lp = m.leadershipPositions;
            if (!lp) return null;
            const { pcfLeader, seniorCellLeader, cellLeader } = lp;
            if (!pcfLeader && !seniorCellLeader && !cellLeader) return null;
            const highest = pcfLeader
              ? { label: "PCF Leader", name: pcfLeader.name, color: "bg-purple-100 text-purple-800 border-purple-200" }
              : seniorCellLeader
              ? { label: "Senior Cell Leader", name: seniorCellLeader.name, color: "bg-blue-100 text-blue-800 border-blue-200" }
              : { label: "Cell Leader", name: cellLeader!.name, color: "bg-green-100 text-green-800 border-green-200" };
            return (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Leadership</p>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${highest.color}`}>
                  <Users className="w-3.5 h-3.5" />
                  {highest.label} — {highest.name}
                </div>
              </div>
            );
          })()}

          {/* Department memberships */}
          {(m.departmentMemberships ?? []).length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Departments</p>
              {(m.departmentMemberships as any[]).map((d: any, i: number) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                  <div className="flex-1">
                    <span className="text-gray-800 font-medium text-sm">{d.name}</span>
                    {d.subUnit && <span className="text-gray-400 text-xs ml-2">· {d.subUnit}</span>}
                  </div>
                  {d.isHead && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-200 rounded-full px-2 py-0.5 font-medium">Head</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {!m.cellName && !m.pcfName && !(m.leadershipPositions?.cellLeader) && !(m.departmentMemberships?.length) && (
            <p className="text-sm text-gray-400 py-2">Not yet assigned to a cell or department.</p>
          )}
        </TabsContent>

        {((user?.roleLevel ?? 5) <= 1 || isPFCC) && (
          <TabsContent value="attendance-year" className="pt-3">
            <AttendanceYearTab memberId={memberId} m={m} />
          </TabsContent>
        )}

        {(user?.roleLevel ?? 5) <= 2 && (
          <TabsContent value="givings-year" className="pt-3">
            <GivingsYearTab memberId={memberId} m={m} />
          </TabsContent>
        )}

        {(user?.roleLevel ?? 5) <= 1 && (
          <TabsContent value="credentials" className="pt-3">
            <CredentialsTab memberId={memberId} />
          </TabsContent>
        )}
      </Tabs>

      {showQR && (
        <Dialog open onOpenChange={() => setShowQR(false)}>
          <DialogContent className="max-w-xs text-center">
            <DialogHeader><DialogTitle>Member QR Code</DialogTitle></DialogHeader>
            <div className="flex flex-col items-center gap-4 pt-2">
              <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-sm">
                {m.firstName?.[0]}{m.lastName?.[0]}
              </div>
              <p className="font-semibold text-gray-800">{dn(m)}</p>
              <p className="text-xs text-gray-400 font-mono">{m.membershipId}</p>
              <div className="p-4 bg-white border rounded-xl">
                <QRCode id="member-qr-svg" value={m.membershipId} size={180} />
              </div>
              <p className="text-xs text-gray-400">Scan to check in at service</p>
              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1" onClick={printQR}>Print QR</Button>
                <Button className="flex-1 bg-purple-700 text-white" onClick={() => setShowQR(false)}>Close</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {editOpen && (
        <Dialog open onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Member — {dn(m)}</DialogTitle>
            </DialogHeader>
            <MemberForm
              onSubmit={(d) => updateMember.mutate({ id: memberId, data: d })}
              loading={updateMember.isPending}
              cells={cells}
              seniorCells={seniorCells}
              initialValues={m}
              isEdit
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

async function exportMembersToExcel(filters: any, toast: any) {
  try {
    const token = localStorage.getItem("token");
    const params = new URLSearchParams({ page: "1", limit: "1000", ...filters });
    const res = await fetch(`/api/members?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    const rows = (json.data ?? []).map((m: any) => ({
      "Membership ID": m.membershipId,
      "First Name": m.firstName,
      "Last Name": m.lastName,
      Gender: m.gender,
      Type: m.memberType,
      Phone1: m.phone1,
      Phone2: m.phone2 ?? "",
      Email: m.email ?? "",
      Occupation: m.occupation ?? "",
      Address: m.residentialAddress ?? "",
      "Emergency Contact": m.emergencyContact ?? "",
      "Date of Birth": m.dateOfBirth ?? "",
      "Date Joined": m.dateJoined ?? "",
      "Foundation School Date": m.foundationSchoolDate ?? "",
      "Marital Status": m.maritalStatus ?? "",
      Baptized: m.isBaptized ? "Yes" : "No",
      Cell: m.cellName ?? "",
      "Senior Cell": m.seniorCellName ?? "",
      PCF: m.pcfName ?? "",
    }));
    await downloadJsonAsExcel(rows, "Members", `Members_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: `Exported ${rows.length} members to Excel` });
  } catch {
    toast({ title: "Export failed", variant: "destructive" });
  }
}

export default function Members() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isPFCCList = (user as any)?.roleSubtype === "pfcc";
  const isLeader = (user as any)?.roleLevel === 4;
  const leaderCellId = (user as any)?.leadsCellId as number | undefined;
  const leaderCellName = (user as any)?.leadsCellName as string | undefined;
  const leaderSeniorCellId = (user as any)?.leadsSeniorCellId as number | undefined;
  const leaderSeniorCellName = (user as any)?.leadsSeniorCellName as string | undefined;
  const leaderPcfId = (user as any)?.leadsPcfId as number | undefined;
  const leaderPcfName = (user as any)?.leadsPcfName as string | undefined;
  const leaderScopeName = leaderPcfName ?? leaderSeniorCellName ?? leaderCellName;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const limit = 25;
  const params: any = { search, page, limit };
  if (typeFilter !== "all") params.type = typeFilter;
  if (isLeader) {
    if (leaderPcfId) params.pcfId = leaderPcfId;
    else if (leaderSeniorCellId) params.seniorCellId = leaderSeniorCellId;
    else if (leaderCellId) params.cellId = leaderCellId;
  }

  const { data, isLoading } = useListMembers(params, {
    query: { queryKey: getListMembersQueryKey(params) },
  });
  const { data: cells } = useListCells({}, {
    query: { queryKey: getListCellsQueryKey() },
  });
  const { data: seniorCells } = useListSeniorCells({}, {
    query: { queryKey: getListSeniorCellsQueryKey() },
  });

  const createMember = useCreateMember({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        setCreateOpen(false);
        toast({ title: "Member added successfully" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const handleExport = useCallback(async () => {
    setExporting(true);
    const filters: any = {};
    if (search) filters.search = search;
    if (typeFilter !== "all") filters.type = typeFilter;
    await exportMembersToExcel(filters, toast);
    setExporting(false);
  }, [search, typeFilter, toast]);

  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);
  const canManage = (user?.roleLevel ?? 5) <= 3;

  if (selectedId) {
    return (
      <div className="max-w-2xl">
        <MemberDetail
          memberId={selectedId}
          onBack={() => setSelectedId(null)}
          canDelete={(user?.roleLevel ?? 5) <= 1 || isPFCCList}
          canManage={(user?.roleLevel ?? 5) <= 3}
          cells={cells ?? []}
          seniorCells={seniorCells ?? []}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {isLeader && leaderScopeName && (
        <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800 font-medium">
          <span className="text-purple-500">⛪</span> Showing members of: <span className="font-bold">{leaderScopeName}</span>
        </div>
      )}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Members</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} record{total !== 1 ? "s" : ""} found</p>
        </div>
        <div className="flex gap-2">
          {!isLeader && (
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting} className="border-green-300 text-green-700 hover:bg-green-50">
              <Download className="w-4 h-4 mr-1.5" /> {exporting ? "Exporting..." : "Export Excel"}
            </Button>
          )}
          {canManage && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-purple-700 hover:bg-purple-800 text-white">
                  <Plus className="w-4 h-4 mr-2" /> Add Member
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Add New Member</DialogTitle></DialogHeader>
                <MemberForm
                  onSubmit={(d) => createMember.mutate({ data: d })}
                  loading={createMember.isPending}
                  cells={cells ?? []}
                  seniorCells={seniorCells ?? []}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, phone, ID..." className="pl-9"
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        {!isLeader && (
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="member">Members</SelectItem>
              <SelectItem value="visitor">Visitors</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="border rounded-lg overflow-hidden bg-white">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="w-10 text-center">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden sm:table-cell">Cell</TableHead>
              <TableHead className="hidden md:table-cell">Phone</TableHead>
              <TableHead className="hidden lg:table-cell">Joined</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : (data?.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-14 text-gray-400">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>No members found</p>
                </TableCell>
              </TableRow>
            ) : (
              (data?.data ?? []).map((m, idx) => (
                <TableRow key={m.id} className="cursor-pointer hover:bg-purple-50/40" onClick={() => setSelectedId(m.id)}>
                  <TableCell className="text-center text-xs text-gray-400 font-mono">{(page - 1) * limit + idx + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-xs font-bold flex-shrink-0 overflow-hidden">
                        {(m as any).profilePhoto
                          ? <img src={(m as any).profilePhoto} alt="" className="w-full h-full object-cover" />
                          : <>{m.firstName?.[0]}{m.lastName?.[0]}</>}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{dn(m as any)}</p>
                        <p className="text-xs text-gray-400 font-mono">{m.membershipId}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs border-0 capitalize ${m.memberType === "visitor" ? "bg-orange-100 text-orange-700" : "bg-purple-100 text-purple-700"}`}>
                      {m.memberType}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {(m as any).cellName
                      ? <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">{(m as any).cellName}</Badge>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-gray-500 text-sm">{m.phone1}</TableCell>
                  <TableCell className="hidden lg:table-cell text-gray-400 text-xs">
                    {m.dateJoined ? new Date(m.dateJoined).toLocaleDateString("en-GH", { month: "short", year: "numeric" }) : "—"}
                  </TableCell>
                  <TableCell>
                    <ArrowRight className="w-4 h-4 text-gray-300" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Page {page} of {totalPages} &bull; {total} total</span>
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
    </div>
  );
}
