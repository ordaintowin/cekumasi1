import { useState } from "react";
import {
  useListChildren, getListChildrenQueryKey,
  useCreateChild, useUpdateChild,
  useDeleteChild,
  useListMembers, getListMembersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Search, Baby, ChevronLeft, ChevronRight, X, Edit2, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CLASSES = [
  { value: "preschool", label: "Preschool" },
  { value: "lower_elementary", label: "Lower Elementary" },
  { value: "upper_elementary", label: "Upper Elementary" },
  { value: "pre_teens", label: "Pre-Teens" },
];

const classColors: Record<string, string> = {
  preschool: "bg-pink-100 text-pink-700 border-pink-200",
  lower_elementary: "bg-blue-100 text-blue-700 border-blue-200",
  upper_elementary: "bg-green-100 text-green-700 border-green-200",
  pre_teens: "bg-purple-100 text-purple-700 border-purple-200",
};

function getAge(dob: string | null | undefined) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

type ChildForm = {
  firstName: string; lastName: string; dateOfBirth: string;
  gender: "male" | "female" | "";
  class: "preschool" | "lower_elementary" | "upper_elementary" | "pre_teens";
};

function ChildDialog({
  open, onOpenChange, initial, onSave, saving, title,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  initial?: any; onSave: (data: any) => void; saving: boolean; title: string;
}) {
  const [form, setForm] = useState<ChildForm>({
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? "",
    dateOfBirth: initial?.dateOfBirth ?? "",
    gender: (initial?.gender ?? "") as ChildForm["gender"],
    class: (initial?.class ?? "preschool") as ChildForm["class"],
  });
  const [parentSearch, setParentSearch] = useState("");
  const [selectedParent, setSelectedParent] = useState<any>(
    initial?.parentId ? { id: initial.parentId, firstName: "", lastName: initial.parentName ?? "" } : null
  );
  const [useExternalParent, setUseExternalParent] = useState(false);
  const [parentExternal, setParentExternal] = useState(initial?.parentExternal ?? "");

  const { data: parentsData } = useListMembers(
    { search: parentSearch, page: 1, limit: 10 },
    { query: { queryKey: [...getListMembersQueryKey({ search: parentSearch }), "child-parent"], enabled: parentSearch.length > 1 && !useExternalParent } }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      firstName: form.firstName,
      lastName: form.lastName,
      class: form.class,
      gender: form.gender || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      parentId: useExternalParent ? null : (selectedParent ? selectedParent.id : null),
      parentExternal: useExternalParent ? parentExternal || undefined : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name *</Label>
              <Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name *</Label>
              <Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Class *</Label>
              <Select value={form.class} onValueChange={(v: any) => setForm(f => ({ ...f, class: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLASSES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v: any) => setForm(f => ({ ...f, gender: v }))}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Date of Birth</Label>
            <Input type="date" value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} />
          </div>

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
              <Input placeholder="Parent name & contact..." value={parentExternal} onChange={e => setParentExternal(e.target.value)} />
            ) : selectedParent ? (
              <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-purple-50">
                <span className="text-sm font-medium flex-1">
                  {selectedParent.firstName && selectedParent.lastName
                    ? `${selectedParent.firstName} ${selectedParent.lastName}`
                    : selectedParent.lastName}
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
                  <div className="border rounded-md bg-white shadow-sm max-h-32 overflow-y-auto">
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

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-purple-700 text-white" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

async function apicall(path: string, method: string, body?: any) {
  const token = localStorage.getItem("token");
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

export default function Children() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [sendToTeensTarget, setSendToTeensTarget] = useState<any>(null);
  const [sendToTeensSaving, setSendToTeensSaving] = useState(false);

  const queryParams: any = { page, limit: 25, search };
  if (classFilter !== "all") queryParams.class = classFilter;

  const { data, isLoading } = useListChildren(queryParams, {
    query: { queryKey: getListChildrenQueryKey(queryParams) },
  });

  const createChild = useCreateChild({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChildrenQueryKey() });
        setAddOpen(false);
        toast({ title: "Child registered" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const updateChild = useUpdateChild({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChildrenQueryKey() });
        setEditTarget(null);
        toast({ title: "Child updated" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const deleteChild = useDeleteChild({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChildrenQueryKey() });
        toast({ title: "Child record removed" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 25);

  async function handleSendToTeens() {
    if (!sendToTeensTarget) return;
    setSendToTeensSaving(true);
    try {
      await apicall("/api/teens", "POST", {
        firstName: sendToTeensTarget.firstName,
        lastName: sendToTeensTarget.lastName,
        gender: sendToTeensTarget.gender,
        dateOfBirth: sendToTeensTarget.dateOfBirth ?? sendToTeensTarget.dob,
        parentId: sendToTeensTarget.parentId ?? undefined,
        parentExternal: sendToTeensTarget.parentExternal ?? undefined,
        transferFromChildId: sendToTeensTarget.id,
      });
      queryClient.invalidateQueries({ queryKey: getListChildrenQueryKey() });
      toast({ title: `${sendToTeensTarget.firstName} ${sendToTeensTarget.lastName} moved to Teens Church` });
      setSendToTeensTarget(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSendToTeensSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Children's Church</h1>
          <p className="text-sm text-gray-500 mt-1">{total} children registered</p>
        </div>
        <Button className="bg-purple-700 hover:bg-purple-800 text-white" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Register Child
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search children..." className="pl-9" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={classFilter} onValueChange={v => { setClassFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {CLASSES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2">
        {CLASSES.map(c => {
          const count = (data?.data ?? []).filter((x: any) => x.class === c.value).length;
          return (
            <button key={c.value} onClick={() => setClassFilter(classFilter === c.value ? "all" : c.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${classFilter === c.value ? classColors[c.value] : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"}`}>
              {c.label} {classFilter === "all" ? "" : `(${count})`}
            </button>
          );
        })}
      </div>

      <div className="border rounded-lg overflow-hidden bg-white">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="w-10 text-center">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Parent/Guardian</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : (data?.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-16 text-gray-400">
                  <Baby className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>No children {classFilter !== "all" ? `in ${CLASSES.find(c => c.value === classFilter)?.label}` : "registered"}</p>
                </TableCell>
              </TableRow>
            ) : (
              (data?.data ?? []).map((c: any, idx: number) => {
                const age = getAge(c.dateOfBirth ?? c.dob);
                const cls = CLASSES.find(x => x.value === c.class);
                return (
                  <TableRow key={c.id} className="hover:bg-gray-50">
                    <TableCell className="text-center text-gray-400 text-sm font-medium w-10">{idx + 1}</TableCell>
                    <TableCell className="font-medium text-gray-800">{c.firstName} {c.lastName}</TableCell>
                    <TableCell>
                      {cls ? (
                        <Badge variant="outline" className={`text-xs ${classColors[c.class] ?? ""}`}>{cls.label}</Badge>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-gray-600">{age != null ? `${age} yrs` : "—"}</TableCell>
                    <TableCell className="text-gray-500 text-sm">{c.parentName ?? c.parentExternal ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-purple-600"
                          onClick={() => setEditTarget(c)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-green-600 hover:bg-green-50 h-7 px-2 text-xs"
                          onClick={() => setSendToTeensTarget(c)}>
                          <ArrowRight className="w-3 h-3 mr-1" /> Teens
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-500 h-7 w-7 p-0"
                          onClick={() => {
                            if (confirm(`Remove ${c.firstName} ${c.lastName}?`))
                              deleteChild.mutate({ id: c.id, data: { reason: "Removed by admin" } });
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
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      )}

      <ChildDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Register a Child"
        saving={createChild.isPending}
        onSave={(data) => createChild.mutate({ data })} />

      {editTarget && (
        <ChildDialog
          key={editTarget.id}
          open={!!editTarget}
          onOpenChange={(v) => { if (!v) setEditTarget(null); }}
          initial={editTarget}
          title={`Edit — ${editTarget.firstName} ${editTarget.lastName}`}
          saving={updateChild.isPending}
          onSave={(data) => updateChild.mutate({ id: editTarget.id, data })} />
      )}

      {/* Send to Teens confirmation dialog */}
      <Dialog open={!!sendToTeensTarget} onOpenChange={v => { if (!v) setSendToTeensTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-green-600" />
              Send to Teens Church
            </DialogTitle>
          </DialogHeader>
          {sendToTeensTarget && (
            <div className="space-y-4 pt-1">
              <p className="text-sm text-gray-600">
                You are about to move{" "}
                <span className="font-semibold text-gray-900">
                  {sendToTeensTarget.firstName} {sendToTeensTarget.lastName}
                </span>{" "}
                from Children's Church to Teens Church.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-700">
                This child will be archived from Children's Church and added to Teens Church. This action cannot be undone.
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setSendToTeensTarget(null)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  disabled={sendToTeensSaving}
                  onClick={handleSendToTeens}>
                  {sendToTeensSaving ? "Moving..." : "Yes, Move to Teens"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}