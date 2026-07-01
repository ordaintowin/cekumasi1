import { useState, useEffect, useRef } from "react";
import {
  useListFamilies, getListFamiliesQueryKey,
  useCreateFamilyConnection, useUpdateFamilyConnection, useDeleteFamilyConnection,
  useListMembers, useListChildren, useListTeens,
  useGetChildParentSummary, getChildParentSummaryQueryKey,
  useGetTeenParentSummary, getTeenParentSummaryQueryKey,
  useUpdateChildBasicInfo, useUpdateTeenBasicInfo,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Home, Plus, Search, Users, Crown, Baby, Smile, UserCheck,
  Pencil, Trash2, X, Loader2, CalendarDays, Gift, ChevronDown, ChevronUp,
  UserCog, Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function MemberSearch({
  label, gender, selected, onSelect, onClear, placeholder,
}: {
  label: string; gender?: string; selected: any; onSelect: (m: any) => void;
  onClear: () => void; placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const debouncedQ = useDebounce(q, 300);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useListMembers(
    { search: debouncedQ, limit: 10 },
    { query: { enabled: debouncedQ.length >= 2 } }
  );

  const results = ((data as any)?.data ?? []).filter((m: any) =>
    !gender || m.gender === gender
  );

  useEffect(() => {
    if (debouncedQ.length >= 2) setOpen(true);
    else setOpen(false);
  }, [debouncedQ]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (selected) {
    return (
      <div className="space-y-1">
        <Label>{label}</Label>
        <div className="flex items-center gap-2 border rounded px-3 py-2 bg-purple-50">
          <Crown className="w-4 h-4 text-yellow-500 flex-shrink-0" />
          <span className="text-sm text-purple-800 flex-1 font-medium">
            {selected.title ? `${selected.title} ` : ""}{selected.firstName} {selected.lastName}
          </span>
          <button type="button" onClick={() => { onClear(); setQ(""); }} className="text-gray-400 hover:text-red-500">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="relative" ref={containerRef}>
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        {isFetching && debouncedQ.length >= 2 && (
          <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 text-purple-500 animate-spin" />
        )}
        <Input
          className="pl-9"
          placeholder={placeholder ?? `Search ${label.toLowerCase()}...`}
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => { if (debouncedQ.length >= 2) setOpen(true); }}
          autoComplete="off"
        />
        {open && debouncedQ.length >= 2 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {isFetching ? (
              <div className="px-3 py-3 text-sm text-gray-400 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching...
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-3 text-sm text-gray-400">
                {gender ? `No ${gender} member found for "${debouncedQ}"` : `No member found for "${debouncedQ}"`}
              </div>
            ) : (
              results.map((m: any) => (
                <button key={m.id} type="button"
                  className="w-full text-left px-3 py-2 hover:bg-purple-50 text-sm flex items-center gap-2 border-b last:border-0"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { onSelect(m); setQ(""); setOpen(false); }}>
                  <div className="w-6 h-6 rounded-full bg-purple-200 flex items-center justify-center text-purple-700 text-xs font-bold flex-shrink-0">
                    {m.firstName?.[0]}
                  </div>
                  <span>{m.title ? `${m.title} ` : ""}{m.firstName} {m.lastName}</span>
                  {m.membershipId && <span className="text-gray-400 text-xs font-mono ml-auto">{m.membershipId}</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChildSearchMulti({
  label, selected, onAdd, onRemove, type,
}: {
  label: string; type: "child" | "teen" | "member"; selected: any[]; onAdd: (m: any) => void; onRemove: (id: number) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const debouncedQ = useDebounce(q, 300);
  const containerRef = useRef<HTMLDivElement>(null);

  const childResult = useListChildren(
    { search: debouncedQ, limit: 10 },
    { query: { enabled: type === "child" && debouncedQ.length >= 2 } }
  );
  const teenResult = useListTeens(
    { search: debouncedQ, limit: 10 },
    { query: { enabled: type === "teen" && debouncedQ.length >= 2 } }
  );
  const memberResult = useListMembers(
    { search: debouncedQ, limit: 10 },
    { query: { enabled: type === "member" && debouncedQ.length >= 2 } }
  );

  const raw = type === "child" ? childResult : type === "teen" ? teenResult : memberResult;
  const isFetching = raw.isFetching;
  const rawData = (raw.data as any)?.data ?? (Array.isArray(raw.data) ? raw.data : []);
  const results: any[] = rawData.filter(
    (r: any) => !selected.find(s => s.id === r.id)
  );

  useEffect(() => {
    if (debouncedQ.length >= 2) setOpen(true);
    else setOpen(false);
  }, [debouncedQ]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const Icon = type === "child" ? Baby : type === "teen" ? Smile : UserCheck;

  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {selected.map(s => (
            <div key={s.id} className="flex items-center gap-1 bg-purple-50 border border-purple-200 rounded px-2 py-0.5 text-xs text-purple-700">
              <Icon className="w-3 h-3" />
              {s.firstName} {s.lastName}
              <button type="button" onClick={() => onRemove(s.id)} className="ml-0.5 text-gray-400 hover:text-red-500">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="relative" ref={containerRef}>
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        {isFetching && debouncedQ.length >= 2 && (
          <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 text-purple-500 animate-spin" />
        )}
        <Input
          className="pl-9"
          placeholder={`Search ${label.toLowerCase()} to add...`}
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => { if (debouncedQ.length >= 2) setOpen(true); }}
          autoComplete="off"
        />
        {open && debouncedQ.length >= 2 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
            {isFetching ? (
              <div className="px-3 py-3 text-sm text-gray-400 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching...
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-3 text-sm text-gray-400">No {label.toLowerCase()} found for "{debouncedQ}"</div>
            ) : (
              results.map((r: any) => (
                <button key={r.id} type="button"
                  className="w-full text-left px-3 py-2 hover:bg-purple-50 text-sm flex items-center gap-2 border-b last:border-0"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { onAdd(r); setQ(""); setOpen(false); }}>
                  <Icon className="w-4 h-4 text-purple-500 flex-shrink-0" />
                  <span>{r.firstName} {r.lastName}</span>
                  {r.class && <span className="text-gray-400 text-xs">{r.class}</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FamilyForm({
  initial, onSubmit, isPending, onClose,
}: {
  initial?: any; onSubmit: (data: any) => void; isPending: boolean; onClose: () => void;
}) {
  const [father, setFather] = useState<any>(
    initial?.fatherId ? { id: initial.fatherId, firstName: (initial.fatherName ?? "").split(" ")[0], lastName: (initial.fatherName ?? "").split(" ").slice(1).join(" "), gender: "male" } : null
  );
  const [mother, setMother] = useState<any>(
    initial?.motherId ? { id: initial.motherId, firstName: (initial.motherName ?? "").split(" ")[0], lastName: (initial.motherName ?? "").split(" ").slice(1).join(" "), gender: "female" } : null
  );
  const [children, setChildren] = useState<any[]>(
    initial ? (initial.children ?? []).filter((c: any) => c.source === "child") : []
  );
  const [teens, setTeens] = useState<any[]>(
    initial ? (initial.children ?? []).filter((c: any) => c.source === "teen") : []
  );
  const [memberChildren, setMemberChildren] = useState<any[]>(
    initial ? (initial.children ?? []).filter((c: any) => c.source === "member").map((c: any) => ({
      id: c.id,
      firstName: c.name.split(" ")[0],
      lastName: c.name.split(" ").slice(1).join(" "),
    })) : []
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!father || !mother) return;
    onSubmit({
      fatherId: father.id,
      motherId: mother.id,
      childIds: children.map(c => c.id),
      teenIds: teens.map(t => t.id),
      memberChildIds: memberChildren.map(m => m.id),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      <MemberSearch
        label="Father (Male Member)"
        gender="male"
        selected={father}
        onSelect={setFather}
        onClear={() => setFather(null)}
        placeholder="Search male member..."
      />
      <MemberSearch
        label="Mother (Female Member)"
        gender="female"
        selected={mother}
        onSelect={setMother}
        onClear={() => setMother(null)}
        placeholder="Search female member..."
      />
      <ChildSearchMulti
        label="Children's Church Members"
        type="child"
        selected={children}
        onAdd={c => setChildren(prev => [...prev, c])}
        onRemove={id => setChildren(prev => prev.filter(c => c.id !== id))}
      />
      <ChildSearchMulti
        label="Teens Church Members"
        type="teen"
        selected={teens}
        onAdd={t => setTeens(prev => [...prev, t])}
        onRemove={id => setTeens(prev => prev.filter(t => t.id !== id))}
      />
      <ChildSearchMulti
        label="Adult Children (Members)"
        type="member"
        selected={memberChildren}
        onAdd={m => setMemberChildren(prev => [...prev, m])}
        onRemove={id => setMemberChildren(prev => prev.filter(m => m.id !== id))}
      />
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="flex-1 bg-purple-700 text-white" disabled={isPending || !father || !mother}>
          {isPending ? "Saving..." : "Save Family"}
        </Button>
      </div>
    </form>
  );
}

function fmt(date: string | null | undefined) {
  if (!date) return "—";
  try { return new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return date; }
}

function ChildParentCard({ child }: { child: any }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isChild = child.source === "child";
  const isTeen = child.source === "teen";

  const childQuery = useGetChildParentSummary(child.id, { query: { enabled: isChild } });
  const teenQuery = useGetTeenParentSummary(child.id, { query: { enabled: isTeen } });
  const summary: any = isChild ? childQuery.data : teenQuery.data;
  const loading = isChild ? childQuery.isLoading : teenQuery.isLoading;

  const [editOpen, setEditOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");

  const updateChild = useUpdateChildBasicInfo({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getChildParentSummaryQueryKey(child.id) });
        setEditOpen(false);
        toast({ title: "Updated successfully" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });
  const updateTeen = useUpdateTeenBasicInfo({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getTeenParentSummaryQueryKey(child.id) });
        setEditOpen(false);
        toast({ title: "Updated successfully" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const openEdit = () => {
    setFirstName(summary?.firstName ?? child.name.split(" ")[0] ?? "");
    setLastName(summary?.lastName ?? child.name.split(" ").slice(1).join(" ") ?? "");
    setDob(summary?.dateOfBirth ?? "");
    setEditOpen(true);
  };

  const handleSave = () => {
    if (!firstName.trim() || !lastName.trim()) return;
    if (isChild) updateChild.mutate({ id: child.id, data: { firstName, lastName, dateOfBirth: dob || undefined } });
    else updateTeen.mutate({ id: child.id, data: { firstName, lastName, dateOfBirth: dob || undefined } });
  };

  const saving = updateChild.isPending || updateTeen.isPending;

  const attendance: any[] = summary?.attendance ?? [];
  const givings: any[] = summary?.givings ?? [];
  const totalGiven = givings.reduce((a: number, g: any) => a + parseFloat(g.amount || "0"), 0);

  return (
    <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isTeen ? "bg-blue-100" : "bg-green-100"}`}>
            {isTeen ? <Smile className="w-4 h-4 text-blue-600" /> : <Baby className="w-4 h-4 text-green-600" />}
          </div>
          <div className="min-w-0">
            {loading ? (
              <Skeleton className="h-4 w-32 mb-1" />
            ) : (
              <p className="font-semibold text-gray-900 truncate">
                {summary ? `${summary.firstName} ${summary.lastName}` : child.name}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={`text-xs ${isTeen ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-green-50 text-green-700 border-green-200"}`}>
                {isTeen ? "Teens Church" : "Children's Church"}
              </Badge>
              {summary?.dateOfBirth && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" /> {fmt(summary.dateOfBirth)}
                </span>
              )}
            </div>
          </div>
        </div>
        <Button size="sm" variant="outline" className="flex-shrink-0 h-7 text-xs gap-1" onClick={openEdit}>
          <Pencil className="w-3 h-3" /> Edit
        </Button>
      </div>

      {loading ? (
        <div className="border-t px-4 py-3 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ) : (
        <div className="border-t">
          <Tabs defaultValue="attendance" className="w-full">
            <TabsList className="w-full rounded-none border-b bg-gray-50 h-8 px-2 gap-1">
              <TabsTrigger value="attendance" className="flex-1 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm h-6">
                <CalendarDays className="w-3 h-3 mr-1" /> Attendance ({attendance.length})
              </TabsTrigger>
              <TabsTrigger value="givings" className="flex-1 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm h-6">
                <Gift className="w-3 h-3 mr-1" /> Givings ({givings.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="attendance" className="m-0">
              {attendance.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-4">No attendance records yet</p>
              ) : (
                <div className="divide-y max-h-48 overflow-y-auto">
                  {attendance.map((a: any, i: number) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                        <span className="text-gray-700 font-medium">{a.serviceName ?? "Service"}</span>
                        {a.serviceType && <span className="text-gray-400 capitalize">· {a.serviceType}</span>}
                      </div>
                      <span className="text-gray-400 flex-shrink-0">{a.serviceDate ?? fmt(a.registeredAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="givings" className="m-0">
              {givings.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-4">No giving records yet</p>
              ) : (
                <div className="divide-y max-h-48 overflow-y-auto">
                  <div className="px-4 py-2 bg-purple-50 flex items-center justify-between text-xs font-medium text-purple-700">
                    <span>Total given</span>
                    <span>GH₵ {totalGiven.toFixed(2)}</span>
                  </div>
                  {givings.map((g: any) => (
                    <div key={g.id} className="flex items-center justify-between px-4 py-2 text-xs">
                      <div>
                        <span className="text-gray-700 font-medium">{g.givingType}</span>
                        {g.notes && <span className="text-gray-400 ml-1">· {g.notes}</span>}
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <span className="text-gray-800 font-semibold">GH₵ {parseFloat(g.amount).toFixed(2)}</span>
                        <span className="text-gray-400 ml-1.5">{g.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={open => { if (!open) setEditOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit {isTeen ? "Teen" : "Child"} Info</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-xs text-gray-400">You can update the name and birthday for your {isTeen ? "teen" : "child"}.</p>
            <div className="space-y-1.5">
              <Label>First Name</Label>
              <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name</Label>
              <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
            </div>
            <div className="space-y-1.5">
              <Label>Date of Birth</Label>
              <Input type="date" value={dob} onChange={e => setDob(e.target.value)} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button className="flex-1 bg-purple-700 text-white"
                disabled={saving || !firstName.trim() || !lastName.trim()}
                onClick={handleSave}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MemberChildCard({ child }: { child: any }) {
  return (
    <div className="bg-white border rounded-xl shadow-sm px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
        <UserCog className="w-4 h-4 text-purple-600" />
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-gray-900 truncate">{child.name}</p>
        <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200 mt-0.5">
          Adult Member
        </Badge>
      </div>
    </div>
  );
}

export default function Families() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [createOpen, setCreateOpen] = useState(false);
  const [editFamily, setEditFamily] = useState<any>(null);
  const [deleteFamily, setDeleteFamily] = useState<any>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  // Determine if we should auto-filter to this user's family
  const isAdmin = user && user.roleLevel <= 3;
  const isLeader = user && user.roleLevel === 4;
  const isTeen = user?.roleSubtype === "teen";
  const canManage = isAdmin; // only admins can create/edit/delete families

  // Build query params based on role
  const familyQueryParams = (() => {
    if (isAdmin || isLeader) return { search: debouncedSearch || undefined };
    if (isTeen && user?.teenId) return { teenId: user.teenId };
    if (user?.memberId) return { memberId: user.memberId };
    return { search: debouncedSearch || undefined };
  })();

  const { data: families, isLoading } = useListFamilies(
    familyQueryParams,
    { query: { queryKey: getListFamiliesQueryKey(familyQueryParams) } }
  );

  // Invalidate by prefix so ALL family queries across the app are cleared
  // (includes profile-page queries keyed with memberId, members-page queries, etc.)
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/families"] });

  const createFamily = useCreateFamilyConnection({
    mutation: {
      onSuccess: () => { invalidate(); setCreateOpen(false); toast({ title: "Family created" }); },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const updateFamily = useUpdateFamilyConnection({
    mutation: {
      onSuccess: (data: any) => {
        invalidate();
        setEditFamily(null);
        toast({ title: data?.deleted ? "Family dissolved" : "Family updated",
                description: data?.deleted ? "The family was removed because an adult member was unlinked." : undefined });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const deleteConn = useDeleteFamilyConnection({
    mutation: {
      onSuccess: () => { invalidate(); setDeleteFamily(null); toast({ title: "Family record deleted" }); },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const familyList: any[] = Array.isArray(families) ? families : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Families</h1>
          <p className="text-sm text-gray-500 mt-1">
            {canManage ? "Manage church family connections" : "Your family record"}
          </p>
        </div>
        {canManage && (
          <Button className="bg-purple-700 hover:bg-purple-800 text-white" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Family
          </Button>
        )}
      </div>

      {canManage && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search families by parent name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : familyList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Home className="w-12 h-12 mb-3 opacity-30" />
          <p className="font-medium">
            {canManage && search ? "No families found matching your search" : canManage ? "No families recorded yet" : "You are not linked to any family yet"}
          </p>
          {canManage && !search && (
            <Button className="mt-4 bg-purple-700 text-white" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add First Family
            </Button>
          )}
        </div>
      ) : canManage ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {familyList.map((fam: any) => {
            const isOpen = expanded === fam.id;
            return (
              <div key={fam.id} className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-purple-50 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : fam.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <Home className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{fam.name}</p>
                      <p className="text-xs text-gray-400">{fam.memberCount} member{fam.memberCount !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <Button size="sm" variant="ghost" className="text-blue-400 hover:text-blue-600 hover:bg-blue-50 h-7 w-7 p-0"
                      onClick={e => { e.stopPropagation(); setEditFamily(fam); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-500 hover:bg-red-50 h-7 w-7 p-0"
                      onClick={e => { e.stopPropagation(); setDeleteFamily(fam); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t px-4 py-3 space-y-2 bg-gray-50 text-sm">
                    {fam.fatherName && (
                      <div className="flex items-center gap-2 text-gray-700">
                        <UserCheck className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                        <span className="font-medium">Father:</span>
                        <span>{fam.fatherName}</span>
                      </div>
                    )}
                    {fam.motherName && (
                      <div className="flex items-center gap-2 text-gray-700">
                        <UserCheck className="w-3.5 h-3.5 text-pink-500 flex-shrink-0" />
                        <span className="font-medium">Mother:</span>
                        <span>{fam.motherName}</span>
                      </div>
                    )}
                    {(fam.children ?? []).length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Children / Teens</p>
                        <div className="flex flex-wrap gap-1">
                          {(fam.children ?? []).map((c: any) => (
                            <Badge key={`${c.source}-${c.id}`} variant="outline"
                              className={`text-xs ${c.source === "teen" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-green-50 text-green-700 border-green-200"}`}>
                              {c.source === "teen" ? <Smile className="w-3 h-3 mr-1" /> : <Baby className="w-3 h-3 mr-1" />}
                              {c.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {(fam.children ?? []).length === 0 && !fam.fatherName && !fam.motherName && (
                      <p className="text-gray-400 text-xs">No details available</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Parent / Teen view — full family detail with child attendance & givings */
        <div className="space-y-8">
          {familyList.map((fam: any) => (
            <div key={fam.id} className="space-y-4">
              {/* Family header */}
              <div className="flex items-center gap-3 pb-1 border-b">
                <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <Home className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">{fam.name}</h2>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-0.5">
                    {fam.fatherName && (
                      <span className="flex items-center gap-1">
                        <UserCheck className="w-3 h-3 text-blue-400" /> {fam.fatherName}
                      </span>
                    )}
                    {fam.motherName && (
                      <span className="flex items-center gap-1">
                        <UserCheck className="w-3 h-3 text-pink-400" /> {fam.motherName}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Children/Teens cards */}
              {(fam.children ?? []).length === 0 ? (
                <p className="text-sm text-gray-400">No children or teens linked to this family.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(fam.children ?? []).map((c: any) =>
                    c.source === "member" ? (
                      <MemberChildCard key={`member-${c.id}`} child={c} />
                    ) : (
                      <ChildParentCard key={`${c.source}-${c.id}`} child={c} />
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add New Family</DialogTitle></DialogHeader>
          <FamilyForm
            onSubmit={data => createFamily.mutate({ data })}
            isPending={createFamily.isPending}
            onClose={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editFamily} onOpenChange={open => { if (!open) setEditFamily(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit {editFamily?.name}</DialogTitle></DialogHeader>
          {editFamily && (
            <FamilyForm
              initial={editFamily}
              onSubmit={data => updateFamily.mutate({ id: editFamily.id, data })}
              isPending={updateFamily.isPending}
              onClose={() => setEditFamily(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteFamily} onOpenChange={open => { if (!open) setDeleteFamily(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Family Record</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            Are you sure you want to delete the <strong>{deleteFamily?.name}</strong> record? This will not delete any members, children, or teens — it only removes the family link.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteFamily(null)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" disabled={deleteConn.isPending}
              onClick={() => deleteConn.mutate({ id: deleteFamily.id })}>
              {deleteConn.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
