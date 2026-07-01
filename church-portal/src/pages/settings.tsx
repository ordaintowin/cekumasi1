import { useState, useEffect, useCallback } from "react";
import {
  useListAdminUsers, getListAdminUsersQueryKey,
  useCreateAdminUser,
  useUpdateAdminUser,
  useDeleteAdminUser,
  useListMembers, getListMembersQueryKey,
  useListMinistryYears, getListMinistryYearsQueryKey,
  useCreateMinistryYear, useUpdateMinistryYear, useDeleteMinistryYear,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Trash2, KeyRound, Megaphone, Send, Clock, CalendarRange, Edit2, Lock, AlertTriangle, Info } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

const getToken = () => typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;

const ROLE_LABELS: Record<number, string> = {
  1: "Super Admin", 2: "Finance Admin", 3: "Staff", 4: "Leader", 5: "Member",
};

const roleBadgeColors: Record<number, string> = {
  1: "bg-red-100 text-red-700 border-red-200",
  2: "bg-orange-100 text-orange-700 border-orange-200",
  3: "bg-blue-100 text-blue-700 border-blue-200",
  4: "bg-green-100 text-green-700 border-green-200",
  5: "bg-gray-100 text-gray-600 border-gray-200",
};

const LEVEL3_SUBTYPES = [
  { value: "pfcc",         label: "3a — PFCC Staff Admin",               desc: "Members, fellowships, attendance, first-timers. No finance." },
  { value: "first_timers", label: "3b — First Timers Staff Admin",        desc: "Add/edit/delete first-timers and register returning visitors." },
  { value: "pcd",          label: "3c — PCD (Pastoral Care Dept)",        desc: "Service departments, attendance, birthdays, wedding anniversaries, families." },
  { value: "media",        label: "3d — Media Admin",                     desc: "Online portal, live streaming, meeting links." },
  { value: "children",     label: "Children's Church Teacher / Admin",    desc: "Add/edit children's records and mark children's attendance." },
  { value: "registration", label: "Registration Personnel",                desc: "Service registration only — QR scan, name, ID, thumbprint check-in." },
];

function getRoleLabel(roleLevel: number, roleSubtype?: string | null) {
  if (roleLevel === 3 && roleSubtype) {
    const sub = LEVEL3_SUBTYPES.find(s => s.value === roleSubtype);
    return sub ? sub.label : `Staff (${roleSubtype})`;
  }
  return ROLE_LABELS[roleLevel] ?? `Level ${roleLevel}`;
}

const EMOJIS = ["📢", "🎉", "🙏", "✝️", "❤️", "🔔", "📌", "🌟", "🎂", "💍"];

function EditMinistryYearDialog({ year, allYears, started, onClose, onSave }: { year: any; allYears: any[]; started: boolean; onClose: () => void; onSave: (data: any) => void }) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({ name: year.name, startDate: year.startDate, endDate: year.endDate });
  const [errors, setErrors] = useState<{ name?: string; endDate?: string }>({});

  const validate = () => {
    const errs: { name?: string; endDate?: string } = {};
    if (!started) {
      const trimmed = form.name.trim();
      const duplicate = allYears.some(y => y.id !== year.id && y.name.trim().toLowerCase() === trimmed.toLowerCase());
      if (duplicate) errs.name = "A ministry year with this name already exists.";
    }
    if (form.endDate && form.endDate < today) errs.endDate = "End date cannot be in the past.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Edit Ministry Year</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          {started && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
              <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">This ministry year has already started. Only the dates can be edited.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={form.name}
              disabled={started}
              onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setErrors(er => ({ ...er, name: undefined })); }}
              placeholder="e.g. 2026/2027"
              className={started ? "bg-gray-50 text-gray-500 cursor-not-allowed" : ""}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Start Date</Label>
            <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>End Date</Label>
            <Input type="date" value={form.endDate} min={today} onChange={e => { setForm(f => ({ ...f, endDate: e.target.value })); setErrors(er => ({ ...er, endDate: undefined })); }} />
            {errors.endDate && <p className="text-xs text-red-500">{errors.endDate}</p>}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 bg-purple-700 text-white" onClick={() => { if (validate()) onSave(started ? { startDate: form.startDate, endDate: form.endDate } : form); }}>Save Changes</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Settings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  const canEditFinance = (authUser?.roleLevel ?? 5) <= 2;

  const [createOpen, setCreateOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [resetUser, setResetUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const [announceOpen, setAnnounceOpen] = useState(false);
  const [announceForm, setAnnounceForm] = useState({ title: "", message: "", emoji: "📢", expiresInHours: "24" });
  const [isSending, setIsSending] = useState(false);
  const [activeAnnouncements, setActiveAnnouncements] = useState<any[]>([]);

  const [newYearOpen, setNewYearOpen] = useState(false);
  const [newMinistryYear, setNewMinistryYear] = useState({ name: "", startDate: "", endDate: "" });
  const [editingYear, setEditingYear] = useState<any>(null);

  const fetchAnnouncements = useCallback(async () => {
    const token = getToken();
    try {
      const res = await fetch("/api/announcements", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setActiveAnnouncements(await res.json());
    } catch (_) {}
  }, []);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  const handleSendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announceForm.title || !announceForm.message) return;
    setIsSending(true);
    try {
      const token = getToken();
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: announceForm.title,
          message: announceForm.message,
          emoji: announceForm.emoji,
          expiresInHours: Number(announceForm.expiresInHours) || 24,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Announcement sent!", description: "All members will see it on their home page." });
      setAnnounceForm({ title: "", message: "", emoji: "📢", expiresInHours: "24" });
      setAnnounceOpen(false);
      fetchAnnouncements();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to send", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteAnnouncement = async (id: number) => {
    const token = getToken();
    await fetch(`/api/announcements/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    fetchAnnouncements();
    toast({ title: "Announcement removed" });
  };

  const [form, setForm] = useState({
    username: "", password: "", roleLevel: "3", roleSubtype: "pfcc", memberId: "",
  });

  const { data: users, isLoading } = useListAdminUsers({
    query: { queryKey: getListAdminUsersQueryKey() },
  });
  const { data: memberSearchData } = useListMembers(
    { search: memberSearch, page: 1, limit: 10 },
    { query: { queryKey: getListMembersQueryKey({ search: memberSearch }), enabled: memberSearch.length > 1 } }
  );

  const createUser = useCreateAdminUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        setCreateOpen(false);
        setForm({ username: "", password: "", roleLevel: "3", roleSubtype: "pfcc", memberId: "" });
        setSelectedMember(null);
        toast({ title: "User account created" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const updateUser = useUpdateAdminUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        toast({ title: "User updated" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const deleteUser = useDeleteAdminUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        toast({ title: "User deleted" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const { data: ministryYears, isLoading: yearsLoading } = useListMinistryYears(
    {},
    { query: { queryKey: getListMinistryYearsQueryKey() } }
  );

  const createMinistryYear = useCreateMinistryYear({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMinistryYearsQueryKey() });
        setNewMinistryYear({ name: "", startDate: "", endDate: "" });
        setNewYearOpen(false);
        toast({ title: "Ministry year created" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const updateMinistryYear = useUpdateMinistryYear({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMinistryYearsQueryKey() });
        setEditingYear(null);
        toast({ title: "Ministry year updated" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const deleteMinistryYear = useDeleteMinistryYear({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMinistryYearsQueryKey() });
        toast({ title: "Ministry year deleted" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const handleCreateMinistryYear = () => {
    const today = new Date().toISOString().split("T")[0];
    if (!newMinistryYear.name || !newMinistryYear.startDate || !newMinistryYear.endDate) {
      toast({ title: "Please fill all fields", variant: "destructive" });
      return;
    }
    if (newMinistryYear.endDate < today) {
      toast({ title: "Invalid end date", description: "End date cannot be in the past.", variant: "destructive" });
      return;
    }
    const allYears = (ministryYears ?? []) as any[];
    const duplicate = allYears.some(y => y.name.trim().toLowerCase() === newMinistryYear.name.trim().toLowerCase());
    if (duplicate) {
      toast({ title: "Duplicate name", description: "A ministry year with this name already exists.", variant: "destructive" });
      return;
    }
    const openYears = allYears.filter(y => !y.isClosed);
    if (openYears.length > 0) {
      toast({
        title: "Cannot create a new ministry year",
        description: `"${openYears[0].name}" is still open. Please close it before creating a new one.`,
        variant: "destructive",
      });
      return;
    }
    createMinistryYear.mutate({ data: newMinistryYear });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const roleLevel = parseInt(form.roleLevel);
    createUser.mutate({
      data: {
        username: form.username,
        password: form.password,
        roleLevel,
        roleSubtype: roleLevel === 3 ? form.roleSubtype : undefined,
        memberId: form.memberId ? parseInt(form.memberId) : 0,
      },
    });
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser || !newPassword) return;
    setIsResetting(true);
    try {
      const res = await fetch(`/api/admin/users/${resetUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast({ title: "Password reset", description: `Password for "${resetUser.username}" has been updated.` });
      setResetUser(null);
      setNewPassword("");
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to reset password", variant: "destructive" });
    } finally {
      setIsResetting(false);
    }
  };

  const showSubtype = form.roleLevel === "3";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage user accounts and access levels</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">User Accounts</CardTitle>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-purple-700 hover:bg-purple-800 text-white">
                <Plus className="w-4 h-4 mr-1" /> Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create User Account</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Username</Label>
                    <Input value={form.username} onChange={(e) => setForm(f => ({ ...f, username: e.target.value }))} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Password</Label>
                    <PasswordInput value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} required />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Role Level</Label>
                  <Select value={form.roleLevel} onValueChange={(v) => {
                    setForm(f => ({ ...f, roleLevel: v, roleSubtype: v === "3" ? "pfcc" : "" }));
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Level 1 — Super Admin (Full access)</SelectItem>
                      <SelectItem value="2">Level 2 — Finance Admin</SelectItem>
                      <SelectItem value="3">Level 3 — Staff (select sub-role below)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {showSubtype && (
                  <div className="space-y-1.5">
                    <Label>Level 3 Sub-Role</Label>
                    <Select value={form.roleSubtype} onValueChange={(v) => setForm(f => ({ ...f, roleSubtype: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LEVEL3_SUBTYPES.map(s => (
                          <SelectItem key={s.value} value={s.value}>
                            <div>
                              <div className="font-medium">{s.label}</div>
                              <div className="text-xs text-gray-500">{s.desc}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Link to Member <span className="text-gray-400 font-normal">(required — must be an existing member)</span></Label>
                  <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                    The member's personal PIN login is kept separate and is not affected by this staff account.
                  </p>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Search member by name..."
                      value={selectedMember ? `${selectedMember.firstName} ${selectedMember.lastName}` : memberSearch}
                      onChange={(e) => { setMemberSearch(e.target.value); setSelectedMember(null); setForm(f => ({ ...f, memberId: "" })); }} />
                  </div>
                  {memberSearch.length > 1 && !selectedMember && (memberSearchData?.data ?? []).length > 0 && (
                    <div className="border rounded-md bg-white shadow-sm max-h-36 overflow-y-auto">
                      {(memberSearchData?.data ?? []).map((m: any) => (
                        <button type="button" key={m.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 border-b last:border-0"
                          onClick={() => { setSelectedMember(m); setMemberSearch(""); setForm(f => ({ ...f, memberId: String(m.id) })); }}>
                          {m.firstName} {m.lastName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <Button type="submit" className="w-full bg-purple-700 text-white" disabled={createUser.isPending}>
                  {createUser.isPending ? "Creating..." : "Create Account"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(users ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-gray-400">No users found</TableCell></TableRow>
                )}
                {(users ?? []).map((u: any) => (
                  <TableRow key={u.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${roleBadgeColors[u.roleLevel] ?? roleBadgeColors[5]}`}>
                        {getRoleLabel(u.roleLevel, u.roleSubtype)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">{u.memberName ?? "—"}</TableCell>
                    <TableCell>
                      <Switch
                        checked={u.isActive}
                        onCheckedChange={(val) => updateUser.mutate({ id: u.id, data: { roleLevel: u.roleLevel, isActive: val } as any })}
                        disabled={u.id === authUser?.id}
                      />
                    </TableCell>
                    <TableCell className="text-right flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" className="text-blue-400 hover:text-blue-600 h-7 w-7 p-0"
                        title="Reset password"
                        disabled={u.id === authUser?.id}
                        onClick={() => { setResetUser(u); setNewPassword(""); }}>
                        <KeyRound className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-500 h-7 w-7 p-0"
                        disabled={u.id === authUser?.id}
                        onClick={() => { if (confirm(`Delete user "${u.username}"?`)) deleteUser.mutate({ id: u.id }); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!resetUser} onOpenChange={(open) => { if (!open) { setResetUser(null); setNewPassword(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reset Password — {resetUser?.username}</DialogTitle></DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <PasswordInput value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Enter new password" required minLength={6} />
            </div>
            <Button type="submit" className="w-full bg-purple-700 text-white" disabled={isResetting}>
              {isResetting ? "Resetting..." : "Reset Password"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader><CardTitle className="text-base">Role Access Guide</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm">
            <div className="flex items-start gap-3 py-2 border-b">
              <Badge variant="outline" className="text-xs flex-shrink-0 bg-red-100 text-red-700 border-red-200">Level 1</Badge>
              <div><span className="font-medium text-gray-800">Super Admin</span><span className="text-gray-500 ml-2">&mdash; Full access to all features, users, and data</span></div>
            </div>
            <div className="flex items-start gap-3 py-2 border-b">
              <Badge variant="outline" className="text-xs flex-shrink-0 bg-orange-100 text-orange-700 border-orange-200">Level 2</Badge>
              <div><span className="font-medium text-gray-800">Finance Admin</span><span className="text-gray-500 ml-2">&mdash; Finance module (record givings) only</span></div>
            </div>
            <div className="py-2 border-b">
              <div className="flex items-start gap-3 mb-2">
                <Badge variant="outline" className="text-xs flex-shrink-0 bg-blue-100 text-blue-700 border-blue-200">Level 3</Badge>
                <div><span className="font-medium text-gray-800">Staff</span><span className="text-gray-500 ml-2">&mdash; 6 sub-roles:</span></div>
              </div>
              <div className="ml-16 space-y-1.5">
                {LEVEL3_SUBTYPES.map(s => (
                  <div key={s.value} className="text-xs text-gray-600">
                    <span className="font-semibold text-blue-700">{s.label}</span>
                    <span className="text-gray-400 ml-1">— {s.desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-start gap-3 py-2 border-b">
              <Badge variant="outline" className="text-xs flex-shrink-0 bg-green-100 text-green-700 border-green-200">Level 4</Badge>
              <div><span className="font-medium text-gray-800">Leader</span><span className="text-gray-500 ml-2">&mdash; View own fellowship member list and attendance (read-only)</span></div>
            </div>
            <div className="flex items-start gap-3 py-2">
              <Badge variant="outline" className="text-xs flex-shrink-0 bg-gray-100 text-gray-600 border-gray-200">Level 5</Badge>
              <div><span className="font-medium text-gray-800">Member</span><span className="text-gray-500 ml-2">&mdash; Personal profile, attendance, and giving records only. Login via 4-digit PIN</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Announcements ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-blue-600" /> Announcements
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">Send church-wide announcements — members see them on their Home page with a sound alert</p>
          </div>
          <Dialog open={announceOpen} onOpenChange={setAnnounceOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0">
                <Send className="w-3.5 h-3.5 mr-1" /> Send
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Send Announcement</DialogTitle></DialogHeader>
              <form onSubmit={handleSendAnnouncement} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Emoji</Label>
                  <div className="flex flex-wrap gap-2">
                    {EMOJIS.map(e => (
                      <button key={e} type="button"
                        onClick={() => setAnnounceForm(f => ({ ...f, emoji: e }))}
                        className={`text-xl w-9 h-9 rounded-lg flex items-center justify-center transition-all ${announceForm.emoji === e ? "bg-blue-100 ring-2 ring-blue-400" : "hover:bg-gray-100"}`}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input
                    value={announceForm.title}
                    onChange={e => setAnnounceForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Sunday Service Reminder"
                    required maxLength={100}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Message</Label>
                  <Textarea
                    value={announceForm.message}
                    onChange={e => setAnnounceForm(f => ({ ...f, message: e.target.value }))}
                    placeholder="Type your announcement here…"
                    required className="h-24 resize-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Expires after</Label>
                  <Select value={announceForm.expiresInHours} onValueChange={v => setAnnounceForm(f => ({ ...f, expiresInHours: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 hours</SelectItem>
                      <SelectItem value="6">6 hours</SelectItem>
                      <SelectItem value="12">12 hours</SelectItem>
                      <SelectItem value="24">24 hours</SelectItem>
                      <SelectItem value="48">2 days</SelectItem>
                      <SelectItem value="168">1 week</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={isSending}>
                  {isSending ? "Sending…" : "Send to All Members"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="pt-0">
          {activeAnnouncements.filter(a => !a.targetMemberId).length === 0 ? (
            <p className="text-sm text-gray-400 py-2 text-center">No active announcements</p>
          ) : (
            <div className="space-y-2">
              {activeAnnouncements.filter(a => !a.targetMemberId).map((a: any) => (
                <div key={a.id} className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
                  <span className="text-xl flex-shrink-0">{a.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm">{a.title}</p>
                    <p className="text-xs text-gray-500 truncate">{a.message}</p>
                    {a.expiresAt && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Expires: {new Date(a.expiresAt).toLocaleString("en-GH", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteAnnouncement(a.id)}
                    className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                    title="Remove announcement"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Ministry Years ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarRange className="w-4 h-4 text-purple-600" /> Ministry Years
            </CardTitle>
            <CardDescription className="mt-1">
              Manage financial ministry year periods. Only one ministry year can be open at a time.
            </CardDescription>
          </div>
          {canEditFinance && (
            <Dialog open={newYearOpen} onOpenChange={setNewYearOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-purple-700 hover:bg-purple-800 text-white flex-shrink-0">
                  <Plus className="w-4 h-4 mr-1" /> New Year
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Create Ministry Year</DialogTitle>
                </DialogHeader>
                {(() => {
                  const openYears = (ministryYears ?? []).filter((y: any) => !y.isClosed);
                  if (openYears.length > 0) {
                    return (
                      <div className="py-4 space-y-3">
                        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-amber-800 text-sm">Active ministry year exists</p>
                            <p className="text-xs text-amber-700 mt-1">
                              <span className="font-medium">"{openYears[0].name}"</span> is currently open.
                              You must close it before creating a new ministry year.
                            </p>
                          </div>
                        </div>
                        <Button variant="outline" className="w-full" onClick={() => setNewYearOpen(false)}>OK, Got It</Button>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-4 pt-2">
                      <div className="space-y-1.5">
                        <Label>Name</Label>
                        <Input
                          placeholder="e.g. 2026/2027"
                          value={newMinistryYear.name}
                          onChange={e => setNewMinistryYear(f => ({ ...f, name: e.target.value }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Start Date</Label>
                          <Input type="date" value={newMinistryYear.startDate} onChange={e => setNewMinistryYear(f => ({ ...f, startDate: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>End Date</Label>
                          <Input type="date" value={newMinistryYear.endDate} min={new Date().toISOString().split("T")[0]} onChange={e => setNewMinistryYear(f => ({ ...f, endDate: e.target.value }))} />
                        </div>
                      </div>
                      <Button
                        className="w-full bg-purple-700 hover:bg-purple-800 text-white"
                        onClick={handleCreateMinistryYear}
                        disabled={!newMinistryYear.name || !newMinistryYear.startDate || !newMinistryYear.endDate || createMinistryYear.isPending}
                      >
                        {createMinistryYear.isPending ? "Creating…" : "Create Ministry Year"}
                      </Button>
                    </div>
                  );
                })()}
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {yearsLoading ? (
            <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : ((ministryYears ?? []) as any[]).filter(y => !y.isClosed).length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <CalendarRange className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No open ministry years</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(() => {
                const today = new Date().toISOString().split("T")[0];
                const open = ((ministryYears ?? []) as any[]).filter(y => !y.isClosed);
                return open.map((y: any) => {
                  const started = y.startDate <= today;
                  const isActive = started && today <= y.endDate;
                  const canClose = canEditFinance && y.endDate <= today;
                  const canDelete = canEditFinance && !started;
                  return (
                    <div key={y.id} className="flex items-center gap-3 rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-white px-4 py-3 shadow-sm">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-800">{y.name}</span>
                          {isActive
                            ? <span className="bg-green-100 text-green-700 text-[11px] px-2 py-0.5 rounded-full font-medium">Active</span>
                            : started
                              ? <span className="bg-gray-100 text-gray-500 text-[11px] px-2 py-0.5 rounded-full font-medium">Inactive</span>
                              : <span className="bg-amber-100 text-amber-700 text-[11px] px-2 py-0.5 rounded-full font-medium">Upcoming</span>}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{y.startDate} → {y.endDate}</p>
                      </div>
                      {canEditFinance && (
                        <button
                          onClick={() => setEditingYear(y)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title={started ? "Edit dates only" : "Edit"}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => {
                            if (confirm(`Delete "${y.name}"? This cannot be undone.`))
                              deleteMinistryYear.mutate({ id: y.id });
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete (not yet started)"
                          disabled={deleteMinistryYear.isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canEditFinance && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canClose || updateMinistryYear.isPending}
                          onClick={() => {
                            if (!canClose) return;
                            updateMinistryYear.mutate(
                              { id: y.id, data: { isClosed: true } },
                              { onSuccess: () => toast({ title: `"${y.name}" has been closed` }) }
                            );
                          }}
                          title={!canClose ? `Close activates after end date (${y.endDate})` : "Close this ministry year"}
                          className={canClose ? "border-red-300 text-red-600 hover:bg-red-50 text-xs" : "opacity-40 cursor-not-allowed text-xs"}
                        >
                          <Lock className="w-3 h-3 mr-1" /> Close
                        </Button>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {editingYear && (
        <EditMinistryYearDialog
          year={editingYear}
          allYears={(ministryYears ?? []) as any[]}
          started={editingYear.startDate <= new Date().toISOString().split("T")[0]}
          onClose={() => setEditingYear(null)}
          onSave={(data: any) => updateMinistryYear.mutate({ id: editingYear.id, data })}
        />
      )}

    </div>
  );
}
