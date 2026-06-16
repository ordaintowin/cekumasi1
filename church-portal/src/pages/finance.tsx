import { useState, useEffect, useRef } from "react";
import { downloadJsonAsExcel } from "@/utils/excel";
import {
  useListGivings, getListGivingsQueryKey,
  useCreateGiving, useUpdateGiving, useDeleteGiving,
  useListGivingTypes, getListGivingTypesQueryKey,
  useCreateGivingType, useUpdateGivingType,
  useListMinistryYears, getListMinistryYearsQueryKey,
  useCreateMinistryYear, useUpdateMinistryYear,
  useGivingSearch,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, ChevronLeft, ChevronRight, Search, Download, Edit2, Trash2, X, Lock, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

async function exportGivingsToExcel(filters: any, toast: any) {
  try {
    const token = localStorage.getItem("token");
    const params = new URLSearchParams({ page: "1", limit: "1000", ...filters });
    const res = await fetch(`/api/givings?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    const rows = (json.data ?? []).map((g: any, i: number) => ({
      "#": i + 1,
      Member: g.memberName ?? "",
      "Giving Type": g.givingTypeName ?? "",
      "Amount (GHS)": Number(g.amount),
      Date: g.date ? new Date(g.date).toLocaleDateString("en-GH") : "",
      "Ministry Year": g.ministryYearName ?? "",
      Notes: g.notes ?? "",
    }));
    await downloadJsonAsExcel(rows, "Givings", `Finance_Records_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: `Exported ${rows.length} records to Excel` });
  } catch {
    toast({ title: "Export failed", variant: "destructive" });
  }
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const PERSON_TYPES = [
  { value: "member", label: "Member", color: "bg-purple-600" },
  { value: "teen", label: "Teen", color: "bg-blue-500" },
  { value: "child", label: "Child", color: "bg-green-500" },
  { value: "first_timer", label: "Visitor", color: "bg-yellow-500" },
];

function PersonSearch({ onSelect, selectedPerson, onClear }: {
  onSelect: (p: any) => void;
  selectedPerson: any;
  onClear: () => void;
}) {
  const [personType, setPersonType] = useState("member");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const debouncedQ = useDebounce(q, 300);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: results, isFetching } = useGivingSearch(
    { q: debouncedQ, type: personType },
    { query: { enabled: debouncedQ.length >= 2 } }
  );

  useEffect(() => {
    setOpen(debouncedQ.length >= 2);
  }, [debouncedQ]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (selectedPerson) {
    const typeInfo = PERSON_TYPES.find(t => t.value === selectedPerson.personType);
    return (
      <div className="flex items-center gap-2 border rounded px-3 py-2 bg-purple-50">
        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${typeInfo?.color ?? "bg-gray-500"}`}>
          {selectedPerson.firstName?.[0]}
        </div>
        <span className="text-sm text-purple-800 flex-1 font-medium">
          {selectedPerson.firstName} {selectedPerson.lastName}
          <span className="text-xs text-gray-400 ml-1">({typeInfo?.label ?? selectedPerson.personType})</span>
        </span>
        <button type="button" onClick={() => { onClear(); setQ(""); }} className="text-gray-400 hover:text-red-500">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const currentType = PERSON_TYPES.find(t => t.value === personType);

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 flex-wrap">
        {PERSON_TYPES.map(t => (
          <button
            key={t.value}
            type="button"
            onClick={() => { setPersonType(t.value); setQ(""); setOpen(false); }}
            className={`px-3 py-1 text-xs rounded-full font-medium border transition-colors ${personType === t.value ? `${t.color} text-white border-transparent` : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="relative" ref={containerRef}>
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        {isFetching && debouncedQ.length >= 2 && (
          <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 text-purple-500 animate-spin" />
        )}
        <Input
          className="pl-9 pr-8"
          placeholder={`Search ${currentType?.label ?? "person"} by name...`}
          value={q}
          onChange={e => { setQ(e.target.value); if (e.target.value.length >= 2) setOpen(true); }}
          onFocus={() => { if (debouncedQ.length >= 2) setOpen(true); }}
          autoComplete="off"
        />
        {open && debouncedQ.length >= 2 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {isFetching ? (
              <div className="px-3 py-3 text-sm text-gray-400 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching...
              </div>
            ) : (results ?? []).length === 0 ? (
              <div className="px-3 py-3 text-sm text-gray-400">No {currentType?.label ?? "person"} found for "{debouncedQ}"</div>
            ) : (
              (results ?? []).map((p: any) => (
                <button key={`${p.personType}-${p.id}`} type="button"
                  className="w-full text-left px-3 py-2 hover:bg-purple-50 text-sm flex items-center gap-2 border-b last:border-0"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { onSelect(p); setQ(""); setOpen(false); }}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${currentType?.color ?? "bg-gray-500"}`}>
                    {p.firstName?.[0]}
                  </div>
                  <span>{p.firstName} {p.lastName}</span>
                  {p.membershipId && <span className="text-gray-400 text-xs font-mono">{p.membershipId}</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EditGivingDialog({ giving, givingTypes, ministryYears, onClose, onSave }: any) {
  const [form, setForm] = useState({
    givingTypeId: String(giving.givingTypeId),
    amount: String(giving.amount),
    date: giving.date,
    ministryYearId: String(giving.ministryYearId),
    notes: giving.notes ?? "",
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Edit Giving Record</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Person</Label>
            <p className="text-sm text-gray-700 bg-gray-50 rounded px-3 py-2">{giving.memberName}</p>
          </div>
          <div className="space-y-1">
            <Label>Giving Type</Label>
            <Select value={form.givingTypeId} onValueChange={v => setForm(f => ({ ...f, givingTypeId: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(givingTypes ?? []).map((gt: any) => <SelectItem key={gt.id} value={String(gt.id)}>{gt.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Amount (GHS)</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Ministry Year</Label>
            <Select value={form.ministryYearId} onValueChange={v => setForm(f => ({ ...f, ministryYearId: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(ministryYears ?? []).map((y: any) => <SelectItem key={y.id} value={String(y.id)}>{y.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 bg-purple-700 text-white" onClick={() => onSave({ givingTypeId: parseInt(form.givingTypeId), amount: parseFloat(form.amount), date: form.date, ministryYearId: parseInt(form.ministryYearId), notes: form.notes || undefined })}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditMinistryYearDialog({ year, onClose, onSave }: any) {
  const [form, setForm] = useState({ name: year.name, startDate: year.startDate, endDate: year.endDate });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Edit Ministry Year</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Start Date</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
          <div className="space-y-1"><Label>End Date</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 bg-purple-700 text-white" onClick={() => onSave(form)}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditGivingTypeDialog({ givingType, onClose, onSave }: any) {
  const [form, setForm] = useState({ name: givingType.name, description: givingType.description ?? "" });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Edit Giving Type</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Description (optional)</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 bg-purple-700 text-white" onClick={() => onSave({ name: form.name, description: form.description || undefined })}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Finance() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canEdit = (user?.roleLevel ?? 5) <= 2;

  const [page, setPage] = useState(1);
  const [filterMinistryYearId, setFilterMinistryYearId] = useState("");
  const [filterGivingTypeId, setFilterGivingTypeId] = useState("");
  const [filterMemberId, setFilterMemberId] = useState("");

  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const [givingForm, setGivingForm] = useState({
    givingTypeId: "", amount: "",
    date: new Date().toISOString().split("T")[0], ministryYearId: "", notes: "",
  });
  const [newGivingType, setNewGivingType] = useState("");
  const [newMinistryYear, setNewMinistryYear] = useState({ name: "", startDate: "", endDate: "" });

  const [editingGiving, setEditingGiving] = useState<any>(null);
  const [editingYear, setEditingYear] = useState<any>(null);
  const [editingType, setEditingType] = useState<any>(null);

  const filterParams = {
    memberId: filterMemberId ? parseInt(filterMemberId) : undefined,
    ministryYearId: filterMinistryYearId ? parseInt(filterMinistryYearId) : undefined,
    givingTypeId: filterGivingTypeId ? parseInt(filterGivingTypeId) : undefined,
    page, limit: 25,
  };

  const { data: givings, isLoading: givingsLoading } = useListGivings(filterParams, {
    query: { queryKey: getListGivingsQueryKey(filterParams) },
  });
  const { data: givingTypes } = useListGivingTypes({}, { query: { queryKey: getListGivingTypesQueryKey() } });
  const { data: ministryYears } = useListMinistryYears({}, { query: { queryKey: getListMinistryYearsQueryKey() } });

  const createGiving = useCreateGiving({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGivingsQueryKey() });
        setGivingForm({ givingTypeId: "", amount: "", date: new Date().toISOString().split("T")[0], ministryYearId: "", notes: "" });
        setSelectedPerson(null);
        toast({ title: "Giving recorded successfully" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const updateGiving = useUpdateGiving({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGivingsQueryKey() });
        setEditingGiving(null);
        toast({ title: "Giving record updated" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const deleteGiving = useDeleteGiving({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGivingsQueryKey() });
        toast({ title: "Giving record deleted" });
      },
    },
  });

  const createGivingType = useCreateGivingType({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListGivingTypesQueryKey() }); setNewGivingType(""); toast({ title: "Giving type added" }); },
    },
  });

  const updateGivingType = useUpdateGivingType({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListGivingTypesQueryKey() }); setEditingType(null); toast({ title: "Giving type updated" }); },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const createMinistryYear = useCreateMinistryYear({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMinistryYearsQueryKey() }); setNewMinistryYear({ name: "", startDate: "", endDate: "" }); toast({ title: "Ministry year created" }); },
    },
  });

  const updateMinistryYear = useUpdateMinistryYear({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMinistryYearsQueryKey() }); setEditingYear(null); toast({ title: "Ministry year updated" }); },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const handleGivingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPerson || !givingForm.givingTypeId || !givingForm.amount || !givingForm.ministryYearId) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    const data: any = {
      givingTypeId: parseInt(givingForm.givingTypeId),
      amount: parseFloat(givingForm.amount),
      date: givingForm.date,
      ministryYearId: parseInt(givingForm.ministryYearId),
      notes: givingForm.notes || undefined,
    };
    if (selectedPerson.personType === "member") data.memberId = selectedPerson.id;
    else if (selectedPerson.personType === "teen") { data.teenId = selectedPerson.id; data.personName = `${selectedPerson.firstName} ${selectedPerson.lastName}`; }
    else if (selectedPerson.personType === "child") { data.childId = selectedPerson.id; data.personName = `${selectedPerson.firstName} ${selectedPerson.lastName}`; }
    else if (selectedPerson.personType === "first_timer") { data.firstTimerId = selectedPerson.id; data.personName = `${selectedPerson.firstName} ${selectedPerson.lastName} (First Timer)`; }
    createGiving.mutate({ data });
  };

  const closedYearIds = new Set((ministryYears ?? []).filter((y: any) => y.isClosed).map((y: any) => y.id));
  const visibleGivings = (givings?.data ?? []).filter((g: any) => !closedYearIds.has(g.ministryYearId));
  const totalGivings = visibleGivings.reduce((a: number, g: any) => a + (Number(g.amount) || 0), 0);
  const totalPages = Math.ceil((givings?.total ?? 0) / 25);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
        <p className="text-sm text-gray-500 mt-1">Record and manage church givings</p>
      </div>

      <Tabs defaultValue="record">
        <div className="overflow-x-auto w-full pb-px">
          <TabsList className="bg-purple-50 w-max">
            <TabsTrigger value="record" className="data-[state=active]:bg-purple-700 data-[state=active]:text-white">Record Giving</TabsTrigger>
            <TabsTrigger value="records" className="data-[state=active]:bg-purple-700 data-[state=active]:text-white">View Records</TabsTrigger>
            <TabsTrigger value="ministry-years" className="data-[state=active]:bg-purple-700 data-[state=active]:text-white">Ministry Years</TabsTrigger>
            <TabsTrigger value="types" className="data-[state=active]:bg-purple-700 data-[state=active]:text-white">Giving Types</TabsTrigger>
          </TabsList>
        </div>

        {/* ── Record Giving ── */}
        <TabsContent value="record" className="pt-4">
          <Card className="max-w-lg">
            <CardHeader><CardTitle className="text-base">Record a Giving</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleGivingSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Person (Member / Teen / Child)</Label>
                  <PersonSearch
                    onSelect={setSelectedPerson}
                    selectedPerson={selectedPerson}
                    onClear={() => setSelectedPerson(null)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Giving Type</Label>
                  <Select value={givingForm.givingTypeId} onValueChange={(v) => setGivingForm(f => ({ ...f, givingTypeId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                    <SelectContent>
                      {(givingTypes ?? []).map((gt: any) => (
                        <SelectItem key={gt.id} value={String(gt.id)}>{gt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Amount (GHS)</Label>
                    <Input type="number" step="0.01" min="0" placeholder="0.00"
                      value={givingForm.amount} onChange={(e) => setGivingForm(f => ({ ...f, amount: e.target.value }))} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date</Label>
                    <Input type="date" value={givingForm.date}
                      onChange={(e) => setGivingForm(f => ({ ...f, date: e.target.value }))} required />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Ministry Year</Label>
                  <Select value={givingForm.ministryYearId} onValueChange={(v) => setGivingForm(f => ({ ...f, ministryYearId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select year..." /></SelectTrigger>
                    <SelectContent>
                      {(ministryYears ?? []).filter((y: any) => !y.isClosed).map((y: any) => (
                        <SelectItem key={y.id} value={String(y.id)}>{y.name} {(!y.isClosed && new Date().toISOString().split("T")[0] >= y.startDate && new Date().toISOString().split("T")[0] <= y.endDate) ? "(Active)" : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Notes (optional)</Label>
                  <Input placeholder="Any notes..."
                    value={givingForm.notes} onChange={(e) => setGivingForm(f => ({ ...f, notes: e.target.value }))} />
                </div>

                <Button type="submit" className="w-full bg-purple-700 text-white" disabled={createGiving.isPending}>
                  {createGiving.isPending ? "Recording..." : "Record Giving"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── View Records ── */}
        <TabsContent value="records" className="pt-4 space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={filterMinistryYearId || "all"} onValueChange={(v) => { setFilterMinistryYearId(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-48"><SelectValue placeholder="All ministry years" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {(ministryYears ?? []).filter((y: any) => !y.isClosed).map((y: any) => <SelectItem key={y.id} value={String(y.id)}>{y.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterGivingTypeId || "all"} onValueChange={(v) => { setFilterGivingTypeId(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {(givingTypes ?? []).map((gt: any) => <SelectItem key={gt.id} value={String(gt.id)}>{gt.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="border-green-300 text-green-700 hover:bg-green-50 ml-auto"
              onClick={() => {
                const filters: any = {};
                if (filterMemberId) filters.memberId = filterMemberId;
                if (filterMinistryYearId) filters.ministryYearId = filterMinistryYearId;
                if (filterGivingTypeId) filters.givingTypeId = filterGivingTypeId;
                exportGivingsToExcel(filters, toast);
              }}>
              <Download className="w-4 h-4 mr-1.5" /> Export Excel
            </Button>
          </div>

          {visibleGivings.length > 0 && (
            <div className="flex items-center gap-4 text-sm">
              <span className="font-semibold text-purple-700">
                Page Total: GHS {totalGivings.toLocaleString("en-GH", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-gray-400">{visibleGivings.length} records matching filters</span>
            </div>
          )}

          <div className="border rounded-lg overflow-hidden bg-white">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead>Person</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount (GHS)</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Ministry Year</TableHead>
                  {canEdit && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {givingsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                  ))
                ) : (givings?.data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-gray-400">No givings recorded yet</TableCell></TableRow>
                ) : (
                  (() => {
                    if (visibleGivings.length === 0) return (
                      <TableRow><TableCell colSpan={7} className="text-center py-10 text-gray-400">No givings recorded yet</TableCell></TableRow>
                    );
                    return visibleGivings.map((g: any, idx: number) => (
                      <TableRow key={g.id} className="hover:bg-gray-50">
                        <TableCell className="text-center text-xs text-gray-400 font-mono">{(page - 1) * 25 + idx + 1}</TableCell>
                        <TableCell className="font-medium">{g.memberName}</TableCell>
                        <TableCell className="text-gray-600">{g.givingTypeName}</TableCell>
                        <TableCell className="font-semibold text-green-700">
                          {Number(g.amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-gray-500 text-sm">
                          {g.date ? new Date(g.date).toLocaleDateString("en-GH") : "—"}
                        </TableCell>
                        <TableCell className="text-gray-500 text-sm">{g.ministryYearName}</TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex gap-1">
                              <button onClick={() => setEditingGiving(g)} className="p-1 text-gray-400 hover:text-blue-600" title="Edit">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => { if (confirm("Delete this record?")) deleteGiving.mutate({ id: g.id }); }} className="p-1 text-gray-400 hover:text-red-500" title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ));
                  })()
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Page {page} of {totalPages} &bull; {givings?.total ?? 0} records</span>
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
        </TabsContent>

        {/* ── Ministry Years ── */}
        <TabsContent value="ministry-years" className="pt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3 max-w-2xl">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input placeholder="e.g. 2026/2027" value={newMinistryYear.name} onChange={(e) => setNewMinistryYear(f => ({ ...f, name: e.target.value }))} className="w-36" />
            </div>
            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input type="date" value={newMinistryYear.startDate} onChange={(e) => setNewMinistryYear(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>End Date</Label>
              <Input type="date" value={newMinistryYear.endDate} onChange={(e) => setNewMinistryYear(f => ({ ...f, endDate: e.target.value }))} />
            </div>
            <Button className="bg-purple-700 text-white"
              onClick={() => createMinistryYear.mutate({ data: newMinistryYear })}
              disabled={!newMinistryYear.name || !newMinistryYear.startDate}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
          <div className="space-y-2 max-w-2xl">
            {(() => {
              const allYears = ministryYears ?? [];
              const openYears = allYears.filter((y: any) => !y.isClosed);
              const today = new Date().toISOString().split("T")[0];
              return openYears.map((y: any) => {
                const canClose = canEdit && !y.isClosed && y.endDate <= today;
                return (
                  <div key={y.id} className="flex items-center gap-3 border rounded-lg px-4 py-3 bg-white">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{y.name}</span>
                      <span className="text-sm text-gray-500 ml-3">{y.startDate} → {y.endDate}</span>
                    </div>
                    {(() => {
                      const withinRange = today >= y.startDate && today <= y.endDate;
                      return withinRange
                        ? <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">Active</span>
                        : <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full font-medium">Inactive</span>;
                    })()}
                    {canEdit && (
                      <button onClick={() => setEditingYear(y)} className="p-1 text-gray-400 hover:text-blue-600" title="Edit">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canClose || updateMinistryYear.isPending}
                        onClick={() => {
                          if (!canClose) return;
                          updateMinistryYear.mutate(
                            { id: y.id, data: { isClosed: true } },
                            { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMinistryYearsQueryKey() }); toast({ title: `"${y.name}" has been closed` }); } }
                          );
                        }}
                        title={!canClose ? `Close button activates when end date (${y.endDate}) has passed` : "Close this ministry year"}
                        className={canClose ? "border-red-300 text-red-600 hover:bg-red-50" : "opacity-40 cursor-not-allowed"}
                      >
                        <Lock className="w-3.5 h-3.5 mr-1" /> Close
                      </Button>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </TabsContent>

        {/* ── Giving Types ── */}
        <TabsContent value="types" className="pt-4 space-y-4">
          <div className="flex items-center gap-3 max-w-sm">
            <Input placeholder="New giving type name..." value={newGivingType} onChange={(e) => setNewGivingType(e.target.value)} />
            <Button className="bg-purple-700 text-white shrink-0"
              onClick={() => createGivingType.mutate({ data: { name: newGivingType } })}
              disabled={!newGivingType || createGivingType.isPending}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
          <div className="space-y-2 max-w-sm">
            {(givingTypes ?? []).map((gt: any) => (
              <div key={gt.id} className="flex items-center justify-between border rounded-lg px-4 py-3 bg-white">
                <div>
                  <span className="font-medium">{gt.name}</span>
                  {gt.description && <span className="text-xs text-gray-400 ml-2">{gt.description}</span>}
                </div>
                {canEdit && (
                  <button onClick={() => setEditingType(gt)} className="p-1 text-gray-400 hover:text-blue-600" title="Edit">
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {editingGiving && (
        <EditGivingDialog
          giving={editingGiving}
          givingTypes={givingTypes}
          ministryYears={ministryYears}
          onClose={() => setEditingGiving(null)}
          onSave={(data: any) => updateGiving.mutate({ id: editingGiving.id, data })}
        />
      )}
      {editingYear && (
        <EditMinistryYearDialog
          year={editingYear}
          onClose={() => setEditingYear(null)}
          onSave={(data: any) => updateMinistryYear.mutate({ id: editingYear.id, data })}
        />
      )}
      {editingType && (
        <EditGivingTypeDialog
          givingType={editingType}
          onClose={() => setEditingType(null)}
          onSave={(data: any) => updateGivingType.mutate({ id: editingType.id, data })}
        />
      )}
    </div>
  );
}
