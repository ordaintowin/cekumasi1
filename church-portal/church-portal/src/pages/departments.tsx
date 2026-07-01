import { useState, useEffect } from "react";
import {
  useListDepartments, getListDepartmentsQueryKey,
  useGetDepartment, getGetDepartmentQueryKey,
  useCreateDepartment, useUpdateDepartment, useDeleteDepartment,
  useAddDepartmentMember, useRemoveDepartmentMember, useUpdateDepartmentMember,
  useListMembers, getListMembersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Users, Search, X, ChevronRight, Building2, Pencil, Trash2, Star, Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function DeptCard({ dept, onSelect }: { dept: any; onSelect: () => void }) {
  return (
    <Card className="cursor-pointer hover:border-purple-300 hover:shadow-sm transition-all" onClick={onSelect}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{dept.name}</h3>
              <p className="text-xs text-gray-500">{dept.memberCount ?? 0} member{dept.memberCount !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400 mt-2" />
        </div>
        {dept.headName && (
          <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
            <Crown className="w-3 h-3 text-yellow-500" />
            Leader: <span className="font-medium text-gray-700">{dept.headName}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Departments() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");

  const [editDeptOpen, setEditDeptOpen] = useState(false);
  const [editDeptName, setEditDeptName] = useState("");

  const [deleteDeptOpen, setDeleteDeptOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [memberRole, setMemberRole] = useState("");

  const [editMemberOpen, setEditMemberOpen] = useState(false);
  const [editMemberTarget, setEditMemberTarget] = useState<any>(null);
  const [editMemberRole, setEditMemberRole] = useState("");

  const [leaderOpen, setLeaderOpen] = useState(false);
  const [leaderSearch, setLeaderSearch] = useState("");
  const [selectedLeader, setSelectedLeader] = useState<any>(null);

  const { data: depts, isLoading } = useListDepartments({
    query: { queryKey: getListDepartmentsQueryKey() },
  });
  const { data: deptDetail } = useGetDepartment(
    selectedId!,
    { query: { queryKey: getGetDepartmentQueryKey(selectedId!), enabled: !!selectedId } }
  );
  const { data: memberSearchData } = useListMembers(
    { search: memberSearch, page: 1, limit: 10 },
    { query: { queryKey: getListMembersQueryKey({ search: memberSearch }), enabled: memberSearch.length > 1 } }
  );
  const { data: leaderSearchData } = useListMembers(
    { search: leaderSearch, page: 1, limit: 10 },
    { query: { queryKey: getListMembersQueryKey({ search: leaderSearch, type: "leader" }), enabled: leaderSearch.length > 1 } }
  );

  // Determine if this user is a dept leader (restricted view)
  const isFullAdmin = !!(user && user.roleLevel <= 3);
  const myMemberId = (user as any)?.memberId;
  const myDept = !isFullAdmin && myMemberId
    ? (depts ?? []).find((d: any) => d.headId === myMemberId) ?? null
    : null;
  const isDeptLeaderRestricted = !!myDept;

  // Plain member (not admin, not dept head) who belongs to a department — view only
  const myDeptAsMember = !isFullAdmin && !isDeptLeaderRestricted && myMemberId
    ? (depts ?? []).find((d: any) => d.currentUserIsMember) ?? null
    : null;
  const isViewOnlyMember = !!myDeptAsMember;

  // Auto-select the dept head's own department
  useEffect(() => {
    if (isDeptLeaderRestricted && myDept && !selectedId) {
      setSelectedId((myDept as any).id);
    }
  }, [isDeptLeaderRestricted, myDept?.id, selectedId]);

  // Auto-select a plain member's department (view-only)
  useEffect(() => {
    if (isViewOnlyMember && myDeptAsMember && !selectedId) {
      setSelectedId((myDeptAsMember as any).id);
    }
  }, [isViewOnlyMember, (myDeptAsMember as any)?.id, selectedId]);

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: getGetDepartmentQueryKey(selectedId!) });
    queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() });
  };

  const createDept = useCreateDepartment({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() }); setCreateOpen(false); setNewDeptName(""); toast({ title: "Department created" }); },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const updateDept = useUpdateDepartment({
    mutation: {
      onSuccess: () => { refetch(); setEditDeptOpen(false); toast({ title: "Department updated" }); },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const deleteDept = useDeleteDepartment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() });
        setDeleteDeptOpen(false); setDeleteReason(""); setSelectedId(null);
        toast({ title: "Department deleted" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const addMember = useAddDepartmentMember({
    mutation: {
      onSuccess: () => { refetch(); setAddMemberOpen(false); setSelectedMember(null); setMemberSearch(""); setMemberRole(""); toast({ title: "Member added to department" }); },
      onError: (e: any) => toast({ title: "Error", description: e?.response?.data?.error ?? e?.message, variant: "destructive" }),
    },
  });

  const removeMember = useRemoveDepartmentMember({
    mutation: {
      onSuccess: () => { refetch(); toast({ title: "Member removed" }); },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const updateMemberRole = useUpdateDepartmentMember({
    mutation: {
      onSuccess: () => { refetch(); setEditMemberOpen(false); setEditMemberTarget(null); toast({ title: "Role updated" }); },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const dept = deptDetail as any;

  const handleSetLeader = () => {
    if (!selectedLeader || !selectedId) return;
    updateDept.mutate({ id: selectedId, data: { headId: selectedLeader.id } });
    setLeaderOpen(false);
    setLeaderSearch("");
    setSelectedLeader(null);
  };

  const handleRemoveLeader = () => {
    if (!selectedId) return;
    updateDept.mutate({ id: selectedId, data: { headId: null } });
  };

  // Restricted view: dept leader or plain member loading their dept
  if ((isDeptLeaderRestricted || isViewOnlyMember) && !isLoading && !selectedId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Department</h1>
          <p className="text-sm text-gray-500 mt-1">{isViewOnlyMember ? "View your service department" : "View and manage your department members"}</p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Building2 className="w-10 h-10 mb-3 opacity-30" />
          <p className="font-medium">Loading your department…</p>
        </div>
      </div>
    );
  }

  if (!isFullAdmin && !isDeptLeaderRestricted && !isViewOnlyMember && !isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Building2 className="w-10 h-10 mb-3 opacity-30" />
          <p className="font-medium">You are not assigned to any department</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isDeptLeaderRestricted || isViewOnlyMember ? "My Department" : "Service Departments"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isViewOnlyMember
              ? "View your service department"
              : isDeptLeaderRestricted
              ? "View and manage your department members"
              : "Manage church service departments and their members"}
          </p>
        </div>
        {isFullAdmin && !isDeptLeaderRestricted && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <Button className="bg-purple-700 hover:bg-purple-800 text-white" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add Department
            </Button>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Department</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Department Name</Label>
                  <Input placeholder="e.g. Ushering" value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)} />
                </div>
                <Button className="w-full bg-purple-700 text-white"
                  onClick={() => createDept.mutate({ data: { name: newDeptName } })}
                  disabled={!newDeptName || createDept.isPending}>
                  {createDept.isPending ? "Creating..." : "Create Department"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {selectedId && dept ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {!isDeptLeaderRestricted && !isViewOnlyMember && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)} className="text-gray-500 pl-0">
                ← Back
              </Button>
            )}
            <h2 className="text-xl font-bold text-gray-900 flex-1">{dept.name}</h2>
            <Badge variant="outline" className="bg-purple-50 text-purple-700">
              <Users className="w-3 h-3 mr-1" />{(dept.members ?? []).length} members
            </Badge>
            {isFullAdmin && (
              <>
                <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50 h-8 px-2"
                  onClick={() => { setEditDeptName(dept.name); setEditDeptOpen(true); }}>
                  <Pencil className="w-3.5 h-3.5 mr-1" /> Rename
                </Button>
                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-500 hover:bg-red-50 h-8 px-2"
                  onClick={() => setDeleteDeptOpen(true)}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                </Button>
              </>
            )}
          </div>

          <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-yellow-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-yellow-700 font-medium">Department Leader</p>
                <p className="text-sm font-semibold text-gray-800">{dept.headName ?? <span className="text-gray-400 font-normal">Not assigned</span>}</p>
              </div>
            </div>
            {isFullAdmin && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs border-yellow-300 text-yellow-700 hover:bg-yellow-100"
                  onClick={() => { setLeaderSearch(""); setSelectedLeader(null); setLeaderOpen(true); }}>
                  <Star className="w-3 h-3 mr-1" /> {dept.headId ? "Change" : "Set Leader"}
                </Button>
                {dept.headId && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-red-400 hover:text-red-500"
                    onClick={handleRemoveLeader} disabled={updateDept.isPending}>
                    Remove
                  </Button>
                )}
              </div>
            )}
          </div>

          {!isViewOnlyMember && (
            <div className="flex justify-end">
              <Button size="sm" className="bg-purple-700 text-white" onClick={() => setAddMemberOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add Member
              </Button>
            </div>
          )}

          <div className="border rounded-lg overflow-hidden bg-white divide-y">
            {(dept.members ?? []).length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No members yet</p>
              </div>
            ) : (
              (dept.members ?? []).map((m: any) => {
                const isHeadRow = m.memberId === dept.headId;
                return (
                  <div key={m.memberId} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-center gap-2 min-w-0">
                      {isHeadRow && <Crown className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />}
                      <span className="font-medium text-gray-900 truncate">{m.memberName}</span>
                      {m.subUnit && (
                        <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200 flex-shrink-0">{m.subUnit}</Badge>
                      )}
                    </div>
                    {!isHeadRow && !isViewOnlyMember && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button size="sm" variant="ghost" className="text-blue-400 hover:text-blue-600 hover:bg-blue-50 h-7 w-7 p-0"
                          onClick={() => { setEditMemberTarget(m); setEditMemberRole(m.subUnit ?? ""); setEditMemberOpen(true); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-500 hover:bg-red-50 h-7 w-7 p-0"
                          onClick={() => { if (confirm(`Remove ${m.memberName} from ${dept.name}?`)) removeMember.mutate({ id: selectedId!, memberId: m.memberId }); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div>
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : (depts ?? []).length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No departments yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(depts ?? []).map((d: any) => (
                <DeptCard key={d.id} dept={d} onSelect={() => setSelectedId(d.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {isFullAdmin && (
        <>
          <Dialog open={editDeptOpen} onOpenChange={setEditDeptOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Rename Department</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Department Name</Label>
                  <Input value={editDeptName} onChange={(e) => setEditDeptName(e.target.value)} />
                </div>
                <Button className="w-full bg-purple-700 text-white"
                  onClick={() => updateDept.mutate({ id: selectedId!, data: { name: editDeptName } })}
                  disabled={!editDeptName || updateDept.isPending}>
                  {updateDept.isPending ? "Saving..." : "Save Name"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={deleteDeptOpen} onOpenChange={setDeleteDeptOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Delete Department</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <p className="text-sm text-gray-600">Are you sure you want to delete <strong>{dept?.name}</strong>? This action cannot be undone.</p>
                <div className="space-y-1.5">
                  <Label>Reason for deletion</Label>
                  <Input placeholder="e.g. Department merged" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setDeleteDeptOpen(false)}>Cancel</Button>
                  <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => deleteDept.mutate({ id: selectedId!, data: { reason: deleteReason } })}
                    disabled={!deleteReason || deleteDept.isPending}>
                    {deleteDept.isPending ? "Deleting..." : "Delete Department"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={leaderOpen} onOpenChange={setLeaderOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Set Department Leader</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <p className="text-sm text-gray-500">Select a member as the leader of <strong>{dept?.name}</strong>.</p>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Search member..."
                    value={selectedLeader ? `${selectedLeader.firstName} ${selectedLeader.lastName}` : leaderSearch}
                    onChange={(e) => { setLeaderSearch(e.target.value); setSelectedLeader(null); }} />
                </div>
                {leaderSearch.length > 1 && !selectedLeader && (leaderSearchData?.data ?? []).length > 0 && (
                  <div className="border rounded-md bg-white shadow-sm max-h-48 overflow-y-auto">
                    {(leaderSearchData?.data ?? []).map((m: any) => (
                      <button type="button" key={m.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 border-b last:border-0"
                        onClick={() => { setSelectedLeader(m); setLeaderSearch(""); }}>
                        {m.firstName} {m.lastName}
                      </button>
                    ))}
                  </div>
                )}
                {selectedLeader && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-md">
                    <Crown className="w-4 h-4 text-yellow-500" />
                    <span className="font-medium text-sm">{selectedLeader.firstName} {selectedLeader.lastName}</span>
                    <button className="ml-auto" onClick={() => setSelectedLeader(null)}><X className="w-4 h-4 text-gray-400" /></button>
                  </div>
                )}
                <Button className="w-full bg-purple-700 text-white"
                  disabled={!selectedLeader || updateDept.isPending}
                  onClick={handleSetLeader}>
                  {updateDept.isPending ? "Setting..." : "Set as Leader"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}

      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Member to {dept?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search member..."
                value={selectedMember ? `${selectedMember.firstName} ${selectedMember.lastName}` : memberSearch}
                onChange={(e) => { setMemberSearch(e.target.value); setSelectedMember(null); }} />
            </div>
            {memberSearch.length > 1 && !selectedMember && (memberSearchData?.data ?? []).length > 0 && (
              <div className="border rounded-md bg-white shadow-sm max-h-48 overflow-y-auto">
                {(memberSearchData?.data ?? []).map((m: any) => (
                  <button type="button" key={m.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 border-b last:border-0"
                    onClick={() => { setSelectedMember(m); setMemberSearch(""); }}>
                    {m.firstName} {m.lastName}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Role / Sub-unit <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input placeholder="e.g. Usher, Choir Alto, Sound Tech" value={memberRole} onChange={(e) => setMemberRole(e.target.value)} />
            </div>
            <Button className="w-full bg-purple-700 text-white"
              disabled={!selectedMember || addMember.isPending}
              onClick={() => {
                if (selectedMember) addMember.mutate({ id: selectedId!, data: { memberId: selectedMember.id, subUnit: memberRole || undefined } });
              }}>
              {addMember.isPending ? "Adding..." : "Add to Department"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editMemberOpen} onOpenChange={setEditMemberOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Member Role</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm font-medium text-gray-700">{editMemberTarget?.memberName}</p>
            <div className="space-y-1.5">
              <Label>Role / Sub-unit</Label>
              <Input placeholder="e.g. Team Lead, Section Head" value={editMemberRole} onChange={(e) => setEditMemberRole(e.target.value)} />
            </div>
            <Button className="w-full bg-purple-700 text-white"
              onClick={() => updateMemberRole.mutate({ id: selectedId!, memberId: editMemberTarget?.memberId, data: { subUnit: editMemberRole || undefined } })}
              disabled={updateMemberRole.isPending}>
              {updateMemberRole.isPending ? "Saving..." : "Save Role"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
