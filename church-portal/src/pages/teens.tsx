import { useState } from "react";
import {
  useListTeens, getListTeensQueryKey,
  useCreateTeen,
  useUpdateTeen,
  useDeleteTeen,
  usePromoteTeenToMember,
  useListMembers, getListMembersQueryKey,
  useListChildren, getListChildrenQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Search, Smile, ChevronLeft, ChevronRight, X, ArrowUpRight, Edit2, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function getAge(dob: string | null | undefined) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

type TeenFormData = {
  firstName: string; lastName: string; gender: string; phone1: string; phone2: string;
  placeOfResidence: string; dateJoined: string; dateOfBirth: string;
  foundationSchoolCompleted: boolean; foundationSchoolDate: string;
};

function TeenFormFields({
  form, setForm, selectedParent, setSelectedParent,
  parentSearch, setParentSearch, useExternalParent, setUseExternalParent,
  parentExternal, setParentExternal,
}: any) {
  const { data: parentsData } = useListMembers(
    { search: parentSearch, page: 1, limit: 10 },
    { query: { queryKey: [...getListMembersQueryKey({ search: parentSearch }), "tpf"], enabled: parentSearch.length > 1 && !useExternalParent } }
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>First Name *</Label>
          <Input value={form.firstName} onChange={e => setForm((f: any) => ({ ...f, firstName: e.target.value }))} required />
        </div>
        <div className="space-y-1.5">
          <Label>Last Name *</Label>
          <Input value={form.lastName} onChange={e => setForm((f: any) => ({ ...f, lastName: e.target.value }))} required />
        </div>
      </div>
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
          <Input value={form.phone1} onChange={e => setForm((f: any) => ({ ...f, phone1: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Phone 2</Label>
          <Input value={form.phone2} onChange={e => setForm((f: any) => ({ ...f, phone2: e.target.value }))} />
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
    onSave({
      firstName: form.firstName,
      lastName: form.lastName,
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
            parentExternal={parentExternal} setParentExternal={setParentExternal} />
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

  const [promoteTarget, setPromoteTarget] = useState<any>(null);
  const [promoteGender, setPromoteGender] = useState("male");

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

  const promoteTeen = usePromoteTeenToMember({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTeensQueryKey() });
        setPromoteTarget(null);
        toast({ title: "Teen promoted to Adult Members ✓", description: `${promoteTarget?.firstName} ${promoteTarget?.lastName} has been moved to the Members list.` });
      },
      onError: (e: any) => toast({ title: "Promotion failed", description: e?.message, variant: "destructive" }),
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
    createTeen.mutate({
      data: {
        firstName: form.firstName, lastName: form.lastName,
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
          <Button className="bg-purple-700 hover:bg-purple-800 text-white" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Teen
          </Button>
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
                  {Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : (data?.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-16 text-gray-400">
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
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-500 hover:text-green-700 hover:bg-green-50"
                          title="Promote to Adult Members"
                          onClick={() => { setPromoteGender("male"); setPromoteTarget(t); }}>
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

      {promoteTarget && (
        <Dialog open onOpenChange={() => setPromoteTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-green-600" /> Promote to Adult Members
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-1">
              <p className="text-sm text-gray-600">
                You are about to move <strong>{promoteTarget.firstName} {promoteTarget.lastName}</strong> from Teens Church to the Adult Members list. Their details will be carried over.
              </p>
              <div className="space-y-1.5">
                <Label>Gender <span className="text-red-500">*</span></Label>
                <div className="flex gap-2">
                  {["male", "female"].map(g => (
                    <button key={g} type="button"
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium capitalize transition-colors ${promoteGender === g ? "bg-purple-700 text-white border-purple-700" : "bg-white text-gray-700 border-gray-200 hover:border-purple-300"}`}
                      onClick={() => setPromoteGender(g)}>
                      {g}
                    </button>
                  ))}
                </div>
                {promoteTarget.gender && (
                  <p className="text-xs text-gray-400">Saved on file: <span className="capitalize font-medium">{promoteTarget.gender}</span></p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setPromoteTarget(null)}>Cancel</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  disabled={promoteTeen.isPending}
                  onClick={() => promoteTeen.mutate({ id: promoteTarget.id, data: { gender: promoteTarget.gender || promoteGender } })}>
                  {promoteTeen.isPending ? "Moving..." : "Yes, Promote"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
