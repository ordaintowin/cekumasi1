import { useState, useEffect } from "react";
import {
  useListTeens, getListTeensQueryKey,
  useCreateTeen,
  useUpdateTeen,
  useDeleteTeen,
  useTransferRegister,
  useListMembers, getListMembersQueryKey,
  useListChildren, getListChildrenQueryKey,
  useResetTeenPin,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Search, Smile, ChevronLeft, ChevronRight, X, ArrowUpRight, Edit2, UserCheck, KeyRound, Eye, EyeOff, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function getAge(dob: string | null | undefined) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

async function downloadTeensExcel() {
  const token = localStorage.getItem("token");
  const res = await fetch("/api/teens?page=1&limit=9999", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  const teens: any[] = result.data ?? [];

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Christ Embassy Kumasi 1";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Teens Church");

  sheet.columns = [
    { header: "No.", key: "no", width: 6 },
    { header: "First Name", key: "firstName", width: 18 },
    { header: "Last Name", key: "lastName", width: 18 },
    { header: "Member ID", key: "membershipId", width: 16 },
    { header: "Gender", key: "gender", width: 10 },
    { header: "Date of Birth", key: "dateOfBirth", width: 14 },
    { header: "Age", key: "age", width: 8 },
    { header: "Phone 1", key: "phone1", width: 16 },
    { header: "Phone 2", key: "phone2", width: 16 },
    { header: "Residence", key: "residence", width: 24 },
    { header: "Parent/Guardian", key: "parent", width: 24 },
    { header: "Foundation School", key: "foundationSchool", width: 18 },
    { header: "Foundation School Date", key: "foundationSchoolDate", width: 22 },
    { header: "Date Joined", key: "dateJoined", width: 14 },
  ] as any;

  teens.forEach((t, i) => {
    const dob = t.dateOfBirth ?? t.dob;
    const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : "";
    sheet.addRow({
      no: i + 1,
      firstName: t.firstName ?? "",
      lastName: t.lastName ?? "",
      membershipId: t.membershipId ?? "",
      gender: t.gender ? (t.gender.charAt(0).toUpperCase() + t.gender.slice(1)) : "",
      dateOfBirth: dob ?? "",
      age,
      phone1: t.phone1 ?? "",
      phone2: t.phone2 ?? "",
      residence: t.residentialAddress ?? t.placeOfResidence ?? "",
      parent: t.parentName ?? t.parentExternal ?? "",
      foundationSchool: t.foundationSchoolCompleted ? "Yes" : "No",
      foundationSchoolDate: t.foundationSchoolDate ?? "",
      dateJoined: t.dateJoined ?? "",
    });
  });

  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D28D9" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  sheet.eachRow((row: any, rowNum: number) => {
    if (rowNum > 1) {
      row.eachCell((cell: any) => {
        cell.alignment = { vertical: "middle" };
        cell.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
      });
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `teens-church-${new Date().toISOString().split("T")[0]}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type TeenFormData = {
  firstName: string; lastName: string; gender: string; phone1: string; phone2: string;
  placeOfResidence: string; dateJoined: string; dateOfBirth: string;
  foundationSchoolCompleted: boolean; foundationSchoolDate: string;
};

function TeenFormFields({
  form, setForm, selectedParent, setSelectedParent,
  parentSearch, setParentSearch, useExternalParent, setUseExternalParent,
  parentExternal, setParentExternal, isEdit = false,
}: any) {
  const { data: parentsData } = useListMembers(
    { search: parentSearch, page: 1, limit: 10 },
    { query: { queryKey: [...getListMembersQueryKey({ search: parentSearch }), "tpf"], enabled: parentSearch.length > 1 && !useExternalParent } }
  );

  // Duplicate teen detection
  const [dupeQuery, setDupeQuery] = useState("");
  const { data: dupeData } = useListTeens(
    { search: dupeQuery, page: 1, limit: 20 },
    { query: { queryKey: [...getListTeensQueryKey({ search: dupeQuery }), "teen-dupecheck"], enabled: dupeQuery.length >= 2 && !isEdit } }
  );
  const teenDuplicates = isEdit ? [] : (dupeData?.data ?? []).filter((t: any) =>
    form.lastName.trim().length >= 2 &&
    t.firstName.toLowerCase().trim() === form.firstName.toLowerCase().trim() &&
    t.lastName.toLowerCase().trim() === form.lastName.toLowerCase().trim()
  );
  useEffect(() => {
    if (isEdit || !form.firstName || form.firstName.length < 2) { setDupeQuery(""); return; }
    const t = setTimeout(() => setDupeQuery(form.firstName), 700);
    return () => clearTimeout(t);
  }, [form.firstName, isEdit]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>First Name *</Label>
          <Input value={form.firstName} onChange={e => setForm((f: any) => ({ ...f, firstName: e.target.value.replace(/[^a-zA-Z\s'-]/g, "") }))} required />
        </div>
        <div className="space-y-1.5">
          <Label>Last Name *</Label>
          <Input value={form.lastName} onChange={e => setForm((f: any) => ({ ...f, lastName: e.target.value.replace(/[^a-zA-Z\s'-]/g, "") }))} required />
        </div>
      </div>

      {teenDuplicates.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-2">
            <span>⚠</span> A teen with this name is already registered
          </p>
          <div className="space-y-1">
            {teenDuplicates.map((t: any) => {
              const parentLabel = t.parentName ?? t.parentExternal ?? null;
              return (
                <div key={t.id} className="flex items-center gap-2 bg-white rounded-md px-2 py-1.5 border border-amber-200">
                  <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-[10px] font-bold flex-shrink-0">
                    {t.firstName?.[0]}{t.lastName?.[0]}
                  </div>
                  <span className="text-xs font-medium text-gray-800 flex-1">
                    {t.firstName} {t.lastName}
                    {parentLabel
                      ? <span className="text-gray-500 font-normal"> · Parent: {parentLabel}</span>
                      : <span className="text-gray-400 font-normal"> · No parent linked</span>}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-amber-700 mt-2">Continue only if this is a different person.</p>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Gender</Label>
        <div className="flex gap-2">
          {["male", "female"].map(g => (
            <button key={g} type="button"
              className={`flex-1 py-1.5 rounded-lg border text-sm font-medium capitalize transition-colors ${form.gender === g ? "bg-purple-700 text-white border-purple-700" : "bg-white text-gray-700 border-gray-200 hover:border-purple-300"}`}
              onClick={() => setForm((f: any) => ({ ...f, gender: g }))}>
              {g}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Phone 1</Label>
          <Input inputMode="numeric" value={form.phone1} onChange={e => setForm((f: any) => ({ ...f, phone1: e.target.value.replace(/\D/g, "") }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Phone 2</Label>
          <Input inputMode="numeric" value={form.phone2} onChange={e => setForm((f: any) => ({ ...f, phone2: e.target.value.replace(/\D/g, "") }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Date of Birth</Label>
          <Input type="date" value={form.dateOfBirth} onChange={e => setForm((f: any) => ({ ...f, dateOfBirth: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Date Joined</Label>
          <Input type="date" value={form.dateJoined} onChange={e => setForm((f: any) => ({ ...f, dateJoined: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Place of Residence</Label>
        <Input value={form.placeOfResidence} onChange={e => setForm((f: any) => ({ ...f, placeOfResidence: e.target.value }))} />
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.foundationSchoolCompleted}
            onChange={e => setForm((f: any) => ({ ...f, foundationSchoolCompleted: e.target.checked }))} className="accent-purple-700" />
          Foundation School
        </label>
      </div>
      {form.foundationSchoolCompleted && (
        <div className="space-y-1.5">
          <Label>Foundation School Date</Label>
          <Input type="date" value={form.foundationSchoolDate}
            onChange={e => setForm((f: any) => ({ ...f, foundationSchoolDate: e.target.value }))} />
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Parent / Guardian</Label>
          <button type="button" className="text-xs text-purple-600 hover:underline"
            onClick={() => {
              setUseExternalParent(!useExternalParent);
              setSelectedParent(null); setParentSearch(""); setParentExternal("");
            }}>
            {useExternalParent ? "Search in members" : "Not in church?"}
          </button>
        </div>
        {useExternalParent ? (
          <Input placeholder="Parent name & contact..." value={parentExternal}
            onChange={e => setParentExternal(e.target.value)} />
        ) : selectedParent ? (
          <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-purple-50">
            <span className="text-sm flex-1">
              {selectedParent.firstName && selectedParent.lastName
                ? `${selectedParent.firstName} ${selectedParent.lastName}`
                : selectedParent.lastName ?? selectedParent.displayName}
            </span>
            <button type="button" onClick={() => { setSelectedParent(null); setParentSearch(""); }}>
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search parent in members..."
                value={parentSearch} onChange={e => setParentSearch(e.target.value)} />
            </div>
            {parentSearch.length > 1 && (parentsData?.data ?? []).length > 0 && (
              <div className="border rounded-md bg-white shadow-sm max-h-28 overflow-y-auto">
                {(parentsData?.data ?? []).map((m: any) => (
                  <button type="button" key={m.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 border-b last:border-0"
                    onClick={() => { setSelectedParent(m); setParentSearch(""); }}>
                    {m.firstName} {m.lastName}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EditTeenDialog({ teen, onClose, saving, onSave }: {
  teen: any; onClose: () => void; saving: boolean; onSave: (data: any) => void;
}) {
  const [form, setForm] = useState<TeenFormData>({
    firstName: teen.firstName ?? "",
    lastName: teen.lastName ?? "",
    gender: teen.gender ?? "",
    phone1: teen.phone1 ?? "",
    phone2: teen.phone2 ?? "",
    placeOfResidence: teen.placeOfResidence ?? teen.residentialAddress ?? "",
    dateJoined: teen.dateJoined ?? "",
    dateOfBirth: teen.dateOfBirth ?? "",
    foundationSchoolCompleted: teen.foundationSchoolCompleted ?? false,
    foundationSchoolDate: teen.foundationSchoolDate ?? "",
  });
  const [selectedParent, setSelectedParent] = useState<any>(
    teen.parentId ? { id: teen.parentId, lastName: teen.parentName ?? "Assigned Parent" } : null
  );
  const [parentSearch, setParentSearch] = useState("");
  const [useExternalParent, setUseExternalParent] = useState(!teen.parentId && !!teen.parentExternal);
  const [parentExternal, setParentExternal] = useState(teen.parentExternal ?? "");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const normName = (s: string) => s.trim().replace(/\s+/g, " ");
    onSave({
      firstName: normName(form.firstName),
      lastName: normName(form.lastName),
      phone1: form.phone1 || undefined,
      phone2: form.phone2 || undefined,
      residentialAddress: form.placeOfResidence || undefined,
      placeOfResidence: form.placeOfResidence || undefined,
      dateJoined: form.dateJoined || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      foundationSchoolCompleted: form.foundationSchoolCompleted,
      foundationSchoolDate: form.foundationSchoolDate || undefined,
      parentId: useExternalParent ? null : (selectedParent ? selectedParent.id : null),
      parentExternal: useExternalParent ? parentExternal || undefined : null,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit — {teen.firstName} {teen.lastName}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="pt-1">
          <TeenFormFields
            form={form} setForm={setForm}
            selectedParent={selectedParent} setSelectedParent={setSelectedParent}
            parentSearch={parentSearch} setParentSearch={setParentSearch}
            useExternalParent={useExternalParent} setUseExternalParent={setUseExternalParent}
            parentExternal={parentExternal} setParentExternal={setParentExternal}
            isEdit={true} />
          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-purple-700 text-white" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Teens() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.roleLevel === 1;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addMethod, setAddMethod] = useState<"manual" | "transfer">("manual");
  const [editTarget, setEditTarget] = useState<any>(null);

  const [form, setForm] = useState<TeenFormData>({
    firstName: "", lastName: "", gender: "", phone1: "", phone2: "",
    placeOfResidence: "", dateJoined: "", dateOfBirth: "",
    foundationSchoolCompleted: false, foundationSchoolDate: "",
  });
  const [parentSearch, setParentSearch] = useState("");
  const [selectedParent, setSelectedParent] = useState<any>(null);
  const [useExternalParent, setUseExternalParent] = useState(false);
  const [parentExternal, setParentExternal] = useState("");

  const [childSearch, setChildSearch] = useState("");
  const [selectedChild, setSelectedChild] = useState<any>(null);

  const [moveDestination, setMoveDestination] = useState<"member" | "children">("member");
  const [moveTarget, setMoveTarget] = useState<any>(null);

  const [pinTarget, setPinTarget] = useState<any>(null);
  const [revealPin, setRevealPin] = useState(false);
  const [newPin, setNewPin] = useState("");

  const { data, isLoading } = useListTeens(
    { page, limit: 25, search },
    { query: { queryKey: getListTeensQueryKey({ page, limit: 25, search }) } }
  );
  const { data: childrenData } = useListChildren(
    { search: childSearch, page: 1, limit: 20 },
    { query: { queryKey: [...getListChildrenQueryKey({ search: childSearch }), "tx"], enabled: addMethod === "transfer" } }
  );

  const createTeen = useCreateTeen({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTeensQueryKey() });
        setAddOpen(false);
        resetForm();
        toast({ title: "Teen registered" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const updateTeen = useUpdateTeen({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTeensQueryKey() });
        setEditTarget(null);
        toast({ title: "Teen updated" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const deleteTeen = useDeleteTeen({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTeensQueryKey() });
        toast({ title: "Teen record removed" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const transferTeen = useTransferRegister({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTeensQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListChildrenQueryKey() });
        setMoveTarget(null);
        toast({ title: `Moved to ${moveDestination === "member" ? "Adult Members" : "Children's Church"}`, description: "Membership ID, attendance, giving, and family links were preserved." });
      },
      onError: (e: any) => toast({ title: "Could not move person", description: e?.message, variant: "destructive" }),
    },
  });

  const resetPin = useResetTeenPin({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTeensQueryKey() });
        setPinTarget(null);
        setNewPin("");
        toast({ title: "PIN reset successfully" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const resetForm = () => {
    setForm({
      firstName: "", lastName: "", gender: "", phone1: "", phone2: "", placeOfResidence: "",
      dateJoined: "", dateOfBirth: "", foundationSchoolCompleted: false, foundationSchoolDate: "",
    });
    setSelectedParent(null); setParentSearch(""); setUseExternalParent(false); setParentExternal("");
    setSelectedChild(null); setChildSearch(""); setAddMethod("manual");
  };

  const handleAddManual = (e: React.FormEvent) => {
    e.preventDefault();
    const normName = (s: string) => s.trim().replace(/\s+/g, " ");
    createTeen.mutate({
      data: {
        firstName: normName(form.firstName), lastName: normName(form.lastName),
        gender: form.gender || undefined,
        phone1: form.phone1 || undefined, phone2: form.phone2 || undefined,
        residentialAddress: form.placeOfResidence || undefined,
        dateJoined: form.dateJoined || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        foundationSchoolCompleted: form.foundationSchoolCompleted,
        foundationSchoolDate: form.foundationSchoolDate || undefined,
        parentId: !useExternalParent && selectedParent ? selectedParent.id : undefined,
        parentExternal: useExternalParent ? parentExternal || undefined : undefined,
      },
    });
  };

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChild) { toast({ title: "Please select a child to transfer", variant: "destructive" }); return; }
    createTeen.mutate({
      data: {
        firstName: selectedChild.firstName,
        lastName: selectedChild.lastName,
        dateOfBirth: selectedChild.dateOfBirth ?? selectedChild.dob ?? undefined,
        transferFromChildId: selectedChild.id,
        parentId: selectedChild.parentId ?? undefined,
      },
    });
  };

  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 25);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teens Church</h1>
          <p className="text-sm text-gray-500 mt-1">{total} teens registered</p>
        </div>
        <Dialog open={addOpen} onOpenChange={(v) => { if (!v) resetForm(); setAddOpen(v); }}>
          <div className="flex gap-2">
            <Button variant="outline" className="border-green-600 text-green-700 hover:bg-green-50" onClick={downloadTeensExcel}>
              <Download className="w-4 h-4 mr-2" /> Download Excel
            </Button>
            <Button className="bg-purple-700 hover:bg-purple-800 text-white" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add Teen
            </Button>
          </div>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add Teen</DialogTitle></DialogHeader>
            <Tabs value={addMethod} onValueChange={(v: any) => setAddMethod(v)} className="pt-1">
              <TabsList className="w-full bg-gray-100">
                <TabsTrigger value="manual" className="flex-1 data-[state=active]:bg-purple-700 data-[state=active]:text-white">Manual Entry</TabsTrigger>
                <TabsTrigger value="transfer" className="flex-1 data-[state=active]:bg-purple-700 data-[state=active]:text-white">
                  <ArrowUpRight className="w-3.5 h-3.5 mr-1" /> From Children
                </TabsTrigger>
              </TabsList>

              <TabsContent value="manual" className="mt-3">
                <form onSubmit={handleAddManual}>
                  <TeenFormFields
                    form={form} setForm={setForm}
                    selectedParent={selectedParent} setSelectedParent={setSelectedParent}
                    parentSearch={parentSearch} setParentSearch={setParentSearch}
                    useExternalParent={useExternalParent} setUseExternalParent={setUseExternalParent}
                    parentExternal={parentExternal} setParentExternal={setParentExternal} />
                  <Button type="submit" className="w-full bg-purple-700 text-white mt-4" disabled={createTeen.isPending}>
                    {createTeen.isPending ? "Registering..." : "Register Teen"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="transfer" className="mt-3">
                <form onSubmit={handleTransfer} className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Select a child from Children's Church to transfer into Teens. Their details will be copied automatically.
                  </p>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Search children's records..."
                      value={childSearch} onChange={e => { setChildSearch(e.target.value); setSelectedChild(null); }} />
                  </div>
                  {!selectedChild && (childrenData?.data ?? []).length > 0 && (
                    <div className="border rounded-md bg-white max-h-48 overflow-y-auto">
                      {(childrenData?.data ?? []).map((c: any) => (
                        <button type="button" key={c.id}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-purple-50 border-b last:border-0 flex items-center justify-between"
                          onClick={() => { setSelectedChild(c); setChildSearch(c.firstName + " " + c.lastName); }}>
                          <span className="font-medium">{c.firstName} {c.lastName}</span>
                          <span className="text-xs text-gray-400 capitalize">{(c.class ?? "").replace(/_/g, " ")}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedChild && (
                    <div className="flex items-center gap-3 px-3 py-3 border rounded-md bg-green-50 border-green-200">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800 text-sm">{selectedChild.firstName} {selectedChild.lastName}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          DOB: {selectedChild.dateOfBirth ?? "—"} · Parent: {selectedChild.parentName ?? "—"}
                        </p>
                      </div>
                      <button type="button" onClick={() => { setSelectedChild(null); setChildSearch(""); }}>
                        <X className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                  )}
                  <Button type="submit" className="w-full bg-purple-700 text-white"
                    disabled={!selectedChild || createTeen.isPending}>
                    {createTeen.isPending ? "Transferring..." : "Transfer to Teens Church"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search teens..." className="pl-9" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      <div className="border rounded-lg overflow-hidden bg-white">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="w-10 text-center">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Member ID</TableHead>
              <TableHead>Age</TableHead>
              <TableHead className="hidden sm:table-cell">Phone</TableHead>
              <TableHead className="hidden md:table-cell">Parent</TableHead>
              <TableHead className="hidden lg:table-cell">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : (data?.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-16 text-gray-400">
                  <Smile className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>No teens registered yet</p>
                </TableCell>
              </TableRow>
            ) : (
              (data?.data ?? []).map((t: any, idx: number) => {
                const age = getAge(t.dateOfBirth ?? t.dob);
                return (
                  <TableRow key={t.id} className="hover:bg-gray-50">
                    <TableCell className="text-center text-gray-400 text-sm font-medium w-10">{idx + 1}</TableCell>
                    <TableCell className="font-medium text-gray-800">{t.firstName} {t.lastName}</TableCell>
                    <TableCell className="text-xs font-mono text-purple-700">{t.membershipId ?? "—"}</TableCell>
                    <TableCell className="text-gray-600">{age != null ? `${age} yrs` : "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell text-gray-500 text-sm">{t.phone1 || "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-gray-500 text-sm">
                      {t.parentName ?? t.parentExternal ?? "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {t.foundationSchoolCompleted && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">Foundation ✓</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-purple-600"
                          onClick={() => setEditTarget(t)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        {isSuperAdmin && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-500 hover:text-amber-700 hover:bg-amber-50"
                            title="View / Reset PIN"
                            onClick={() => { setPinTarget(t); setRevealPin(false); setNewPin(""); }}>
                            <KeyRound className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-500 hover:text-green-700 hover:bg-green-50"
                          title="Move to Adult Members"
                          onClick={() => { setMoveDestination("member"); setMoveTarget(t); }}>
                          <UserCheck className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-500 h-7 w-7 p-0"
                          onClick={() => {
                            if (confirm(`Remove ${t.firstName} ${t.lastName}?`))
                              deleteTeen.mutate({ id: t.id, data: { reason: "Removed by admin" } });
                          }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
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

      {editTarget && (
        <EditTeenDialog
          key={editTarget.id}
          teen={editTarget}
          onClose={() => setEditTarget(null)}
          saving={updateTeen.isPending}
          onSave={(data) => updateTeen.mutate({ id: editTarget.id, data })} />
      )}

      {moveTarget && (
        <Dialog open onOpenChange={() => setMoveTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Move to another register</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-1">
              <p className="text-sm text-gray-600">
                Move <strong>{moveTarget.firstName} {moveTarget.lastName}</strong> from Teens Church.
              </p>
              <div className="space-y-1.5">
                <Label>Destination</Label>
                <select
                  value={moveDestination}
                  onChange={e => setMoveDestination(e.target.value as "member" | "children")}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="member">Adult Members</option>
                  <option value="children">Children&apos;s Church</option>
                </select>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-md px-3 py-2 text-xs text-indigo-700">
                The same membership ID will be kept. Attendance, giving, and family links will move with this person.
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setMoveTarget(null)}>Cancel</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  disabled={transferTeen.isPending}
                  onClick={() => transferTeen.mutate({ sourceType: "teens", sourceId: moveTarget.id, destinationType: moveDestination })}>
                  {transferTeen.isPending ? "Moving..." : "Move"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* PIN view / reset dialog — simple inline, no separate page */}
      <Dialog open={!!pinTarget} onOpenChange={open => { if (!open) { setPinTarget(null); setNewPin(""); setRevealPin(false); } }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-500" />
              PIN — {pinTarget?.firstName} {pinTarget?.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between bg-gray-50 border rounded-lg px-4 py-3">
              <span className="text-sm text-gray-500">Current PIN</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-semibold tracking-widest">
                  {revealPin ? (pinTarget?.pin ?? "0000") : "••••"}
                </span>
                <button type="button" className="text-gray-400 hover:text-gray-600"
                  onClick={() => setRevealPin(v => !v)}>
                  {revealPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>New PIN</Label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="Enter 4-digit PIN"
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="text-center tracking-widest text-lg font-mono"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setPinTarget(null); setNewPin(""); setRevealPin(false); }}>Cancel</Button>
              <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                disabled={newPin.length !== 4 || resetPin.isPending}
                onClick={() => resetPin.mutate({ id: pinTarget.id, pin: newPin })}>
                {resetPin.isPending ? "Saving..." : "Set PIN"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
