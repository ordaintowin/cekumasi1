import { useState, useEffect } from "react";
import { downloadJsonAsExcel } from "@/utils/excel";
import {
  useListFirstTimers, getListFirstTimersQueryKey,
  useDeleteFirstTimer,
  useConvertFirstTimerToMember,
  useListCells, getListCellsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Trash2, ArrowRight, ChevronLeft, ChevronRight, X, Download, Pencil, Users, Baby, Smile } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CHILD_CLASSES = [
  { value: "preschool", label: "Preschool" },
  { value: "lower_elementary", label: "Lower Elementary" },
  { value: "upper_elementary", label: "Upper Elementary" },
  { value: "pre_teens", label: "Pre-Teens" },
];

const MARITAL_STATUSES = ["Single", "Married", "Divorced", "Widowed", "Separated"];

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

async function exportFirstTimersToExcel(search: string, toast: any) {
  try {
    const token = localStorage.getItem("token");
    const params = new URLSearchParams({ page: "1", limit: "1000" });
    if (search) params.set("search", search);
    const res = await fetch(`/api/first-timers?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    const rows = (json.data ?? []).map((ft: any) => ({
      "First Name": ft.firstName,
      "Last Name": ft.lastName,
      Gender: ft.gender,
      Contact: ft.contact ?? "",
      Residence: ft.residence ?? "",
      "Born Again": ft.bornAgain === true ? "Yes" : ft.bornAgain === false ? "No" : "",
      "Marital Status": ft.maritalStatus ?? "",
      "Prayer Request": ft.prayerRequest ?? "",
      "Invited By": ft.invitedByName ?? "",
      Service: ft.serviceName ?? "",
      "Service Date": ft.serviceDate ? new Date(ft.serviceDate).toLocaleDateString("en-GH") : "",
      "Visits Count": ft.visitsCount ?? 1,
    }));
    await downloadJsonAsExcel(rows, "First Timers", `FirstTimers_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: `Exported ${rows.length} first timers to Excel` });
  } catch {
    toast({ title: "Export failed", variant: "destructive" });
  }
}

export default function FirstTimers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  // Edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: "", lastName: "", gender: "male", contact: "",
    residence: "", bornAgain: "", maritalStatus: "", prayerRequest: "",
  });

  // Send-to state
  const [sendToId, setSendToId] = useState<number | null>(null);
  const [sendToFT, setSendToFT] = useState<any>(null);
  const [sendToDestination, setSendToDestination] = useState<"members" | "teens" | "children" | null>(null);
  const [sendToCellId, setSendToCellId] = useState("");
  const [sendToChildClass, setSendToChildClass] = useState("");
  const [sendToSaving, setSendToSaving] = useState(false);
  // Duplicate warning when converting a first timer to member
  const [convertDuplicateWarning, setConvertDuplicateWarning] = useState<{ message: string; pendingCellId: string } | null>(null);


  const qKey = getListFirstTimersQueryKey({ search, page, limit: 25 });
  const { data, isLoading } = useListFirstTimers({ search, page, limit: 25 }, { query: { queryKey: qKey } });
  const { data: cellsData } = useListCells({}, { query: { queryKey: getListCellsQueryKey({}) } });

  const deleteFT = useDeleteFirstTimer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFirstTimersQueryKey() });
        setDeleteId(null); setDeleteReason("");
        toast({ title: "First timer removed" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  function openEdit(ft: any) {
    setEditId(ft.id);
    setEditForm({
      firstName: ft.firstName,
      lastName: ft.lastName,
      gender: ft.gender ?? "male",
      contact: ft.contact ?? "",
      residence: ft.residence ?? "",
      bornAgain: ft.bornAgain === true ? "true" : ft.bornAgain === false ? "false" : "",
      maritalStatus: ft.maritalStatus ?? "",
      prayerRequest: ft.prayerRequest ?? "",
    });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setEditSaving(true);
    try {
      await apicall(`/api/first-timers/${editId}`, "PUT", {
        ...editForm,
        bornAgain: editForm.bornAgain === "true" ? true : editForm.bornAgain === "false" ? false : null,
      });
      queryClient.invalidateQueries({ queryKey: getListFirstTimersQueryKey() });
      setEditId(null);
      toast({ title: "First timer updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  }

  function openSendTo(ft: any) {
    setSendToId(ft.id);
    setSendToFT(ft);
    setSendToDestination(null);
    setSendToCellId("");
    setSendToChildClass("");
  }

  async function handleSendTo(force = false) {
    if (!sendToId || !sendToDestination) return;
    if (sendToDestination === "members" && !sendToCellId) {
      toast({ title: "Please select a cell", variant: "destructive" }); return;
    }
    if (sendToDestination === "children" && !sendToChildClass) {
      toast({ title: "Please select a class", variant: "destructive" }); return;
    }
    setSendToSaving(true);
    try {
      if (sendToDestination === "members") {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/first-timers/${sendToId}/convert`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ cellId: parseInt(sendToCellId), force }),
        });
        if (res.status === 409) {
          const body = await res.json().catch(() => ({}));
          if (body.warning) {
            setConvertDuplicateWarning({ message: body.message, pendingCellId: sendToCellId });
            setSendToSaving(false);
            return;
          }
          throw new Error(body.error ?? "Request failed");
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Request failed");
        }
        toast({ title: "Converted to member successfully" });
      } else if (sendToDestination === "visitor") {
        await apicall(`/api/first-timers/${sendToId}/convert-to-visitor`, "POST");
        toast({ title: "Converted to visitor successfully" });
      } else if (sendToDestination === "teens") {
        await apicall(`/api/first-timers/${sendToId}/send-to-teens`, "POST");
        toast({ title: "Added to Teens Church" });
      } else if (sendToDestination === "children") {
        await apicall(`/api/first-timers/${sendToId}/send-to-children`, "POST", { class: sendToChildClass });
        toast({ title: "Added to Children's Church" });
      }
      queryClient.invalidateQueries({ queryKey: getListFirstTimersQueryKey() });
      setSendToId(null); setSendToFT(null); setSendToDestination(null); setConvertDuplicateWarning(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSendToSaving(false);
    }
  }

  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 25);

  const filteredData = (data?.data ?? []).filter((ft: any) => {
    if (!ft.serviceDate) return true;
    const d = new Date(ft.serviceDate);
    d.setHours(0, 0, 0, 0);
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      if (d < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (d > to) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">First Timers</h1>
          <p className="text-sm text-gray-500 mt-1">{total} recorded first-timers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="border-green-300 text-green-700 hover:bg-green-50"
            onClick={() => exportFirstTimersToExcel(search, toast)}>
            <Download className="w-4 h-4 mr-1.5" /> Export Excel
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search first timers..." className="pl-9" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-gray-500">From</Label>
            <Input type="date" className="h-9 text-sm w-36" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-gray-500">To</Label>
            <Input type="date" className="h-9 text-sm w-36" value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1); }} />
          </div>
          {(dateFrom || dateTo) && (
            <button className="mt-4 text-xs text-gray-400 hover:text-gray-600 underline"
              onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden bg-white">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="w-10 text-center">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Invited By</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : filteredData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-gray-400">No first timers found</TableCell>
              </TableRow>
            ) : (
              filteredData.map((ft: any, index: number) => (
                <TableRow key={ft.id} className="hover:bg-gray-50">
                  <TableCell className="text-center text-gray-400 text-sm font-medium w-10">{(page - 1) * 25 + index + 1}</TableCell>
                  <TableCell className="font-medium">
                    <div>
                      <p>{ft.firstName} {ft.lastName}</p>
                      {(ft.residence || ft.bornAgain !== null || ft.maritalStatus) && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {ft.bornAgain === true && <span className="text-[10px] bg-green-100 text-green-700 rounded px-1.5 py-0.5 font-semibold">Born Again</span>}
                          {ft.bornAgain === false && <span className="text-[10px] bg-orange-100 text-orange-700 rounded px-1.5 py-0.5 font-semibold">Not Born Again</span>}
                          {ft.maritalStatus && <span className="text-[10px] bg-blue-50 text-blue-600 rounded px-1.5 py-0.5">{ft.maritalStatus}</span>}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={ft.gender === "female" ? "bg-pink-50 text-pink-700 border-pink-200" : "bg-blue-50 text-blue-700 border-blue-200"}>
                      {ft.gender}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">
                    <div>
                      <p>{ft.contact || "—"}</p>
                      {ft.residence && <p className="text-xs text-gray-400 truncate max-w-[120px]">{ft.residence}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">{ft.invitedByName || "—"}</TableCell>
                  <TableCell className="text-gray-600 text-sm">{ft.serviceName || "—"}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{ft.serviceDate ? new Date(ft.serviceDate).toLocaleDateString("en-GH") : "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" className="text-gray-500 hover:bg-gray-100 h-7 px-2 text-xs"
                        onClick={() => openEdit(ft)}>
                        <Pencil className="w-3 h-3 mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" className="text-green-600 hover:bg-green-50 h-7 px-2 text-xs"
                        onClick={() => openSendTo(ft)}>
                        <ArrowRight className="w-3 h-3 mr-1" /> Send To
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50 h-7 px-2"
                        onClick={() => setDeleteId(ft.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
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
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editId} onOpenChange={v => !v && setEditId(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit First Timer</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>First Name *</Label>
                <Input value={editForm.firstName} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label>Last Name *</Label>
                <Input value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Gender</Label>
                <Select value={editForm.gender} onValueChange={v => setEditForm(f => ({ ...f, gender: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Contact</Label>
                <Input value={editForm.contact} onChange={e => setEditForm(f => ({ ...f, contact: e.target.value }))} placeholder="Phone number" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Residence</Label>
              <Input value={editForm.residence} onChange={e => setEditForm(f => ({ ...f, residence: e.target.value }))} placeholder="Area / neighbourhood" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Born Again?</Label>
                <Select
                  value={editForm.bornAgain === "" ? "unset" : editForm.bornAgain}
                  onValueChange={v => setEditForm(f => ({ ...f, bornAgain: v === "unset" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Not specified</SelectItem>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Marital Status</Label>
                <Select
                  value={editForm.maritalStatus === "" ? "unset" : editForm.maritalStatus}
                  onValueChange={v => setEditForm(f => ({ ...f, maritalStatus: v === "unset" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Not specified</SelectItem>
                    {MARITAL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Prayer Request</Label>
              <Textarea
                value={editForm.prayerRequest}
                onChange={e => setEditForm(f => ({ ...f, prayerRequest: e.target.value }))}
                placeholder="Write their prayer request here..."
                className="resize-none"
                rows={3}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditId(null)}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-purple-700 text-white" disabled={editSaving}>
                {editSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Send To dialog */}
      <Dialog open={!!sendToId} onOpenChange={v => { if (!v) { setSendToId(null); setSendToFT(null); setSendToDestination(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send to Church Department</DialogTitle>
          </DialogHeader>
          {sendToFT && (
            <p className="text-sm text-gray-500 -mt-1">
              <span className="font-medium text-gray-800">{sendToFT.firstName} {sendToFT.lastName}</span>{" "}
              {sendToDestination === "children"
                ? "will be added to Children's Church and archived from First Timers."
                : sendToDestination === "teens"
                ? "will be added to Teens Church and archived from First Timers."
                : sendToDestination === "members"
                ? "will be converted to a full member and archived from First Timers."
                : sendToDestination === "visitor"
                ? "will be added as a visitor and archived from First Timers."
                : "will be moved to the selected department and archived from First Timers."}
            </p>
          )}

          {!sendToDestination ? (
            <div className="grid gap-3 pt-2">
              <button
                onClick={() => setSendToDestination("members")}
                className="flex items-center gap-4 p-4 border-2 rounded-xl hover:border-purple-400 hover:bg-purple-50 text-left transition-all">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-purple-700" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Members</p>
                  <p className="text-xs text-gray-500">Convert to full church member and assign to a cell</p>
                </div>
              </button>
              <button
                onClick={() => setSendToDestination("visitor")}
                className="flex items-center gap-4 p-4 border-2 rounded-xl hover:border-orange-400 hover:bg-orange-50 text-left transition-all">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-orange-700" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Visitor</p>
                  <p className="text-xs text-gray-500">Convert to visitor — attends services but not yet in a cell</p>
                </div>
              </button>
              <button
                onClick={() => setSendToDestination("teens")}
                className="flex items-center gap-4 p-4 border-2 rounded-xl hover:border-teal-400 hover:bg-teal-50 text-left transition-all">
                <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                  <Smile className="w-5 h-5 text-teal-700" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Teens Church</p>
                  <p className="text-xs text-gray-500">Add to the teens church roster</p>
                </div>
              </button>
              <button
                onClick={() => setSendToDestination("children")}
                className="flex items-center gap-4 p-4 border-2 rounded-xl hover:border-blue-400 hover:bg-blue-50 text-left transition-all">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Baby className="w-5 h-5 text-blue-700" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Children's Church</p>
                  <p className="text-xs text-gray-500">Add to the children's church roster</p>
                </div>
              </button>
            </div>
          ) : sendToDestination === "visitor" ? (
            <div className="space-y-4 pt-2">
              <button onClick={() => setSendToDestination(null)} className="text-xs text-orange-600 hover:underline">← Back</button>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
                <strong>{sendToFT?.firstName} {sendToFT?.lastName}</strong> will be added as a visitor. They can attend services and their giving records will be preserved.
              </div>
              <Button className="w-full bg-orange-600 text-white hover:bg-orange-700" onClick={() => handleSendTo()} disabled={sendToSaving}>
                {sendToSaving ? "Converting..." : "Convert to Visitor"}
              </Button>
            </div>
          ) : sendToDestination === "members" ? (
            <div className="space-y-4 pt-2">
              <button onClick={() => setSendToDestination(null)} className="text-xs text-purple-600 hover:underline">← Back</button>
              <p className="text-sm text-gray-600">Select a cell fellowship for this new member.</p>
              <Select value={sendToCellId} onValueChange={setSendToCellId}>
                <SelectTrigger><SelectValue placeholder="Select cell..." /></SelectTrigger>
                <SelectContent>
                  {(cellsData ?? []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button className="w-full bg-purple-700 text-white" onClick={() => handleSendTo()}
                disabled={!sendToCellId || sendToSaving}>
                {sendToSaving ? "Converting..." : "Convert to Member"}
              </Button>
            </div>
          ) : sendToDestination === "teens" ? (
            <div className="space-y-4 pt-2">
              <button onClick={() => setSendToDestination(null)} className="text-xs text-teal-600 hover:underline">← Back</button>
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-sm text-teal-800">
                <strong>{sendToFT?.firstName} {sendToFT?.lastName}</strong> will be added to Teens Church. Their contact and address will be copied across.
              </div>
              <Button className="w-full bg-teal-700 text-white" onClick={() => handleSendTo()} disabled={sendToSaving}>
                {sendToSaving ? "Adding..." : "Add to Teens Church"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <button onClick={() => setSendToDestination(null)} className="text-xs text-blue-600 hover:underline">← Back</button>
              <p className="text-sm text-gray-600">Select a class for this child.</p>
              <Select value={sendToChildClass} onValueChange={setSendToChildClass}>
                <SelectTrigger><SelectValue placeholder="Select class..." /></SelectTrigger>
                <SelectContent>
                  {CHILD_CLASSES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button className="w-full bg-blue-700 text-white" onClick={() => handleSendTo()}
                disabled={!sendToChildClass || sendToSaving}>
                {sendToSaving ? "Adding..." : "Add to Children's Church"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove First Timer</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-gray-600">Provide a reason for removing this record.</p>
            <Input placeholder="Reason..." value={deleteReason} onChange={e => setDeleteReason(e.target.value)} />
            <Button variant="destructive" className="w-full"
              onClick={() => deleteId && deleteFT.mutate({ id: deleteId, data: { reason: deleteReason } })}
              disabled={!deleteReason || deleteFT.isPending}>
              {deleteFT.isPending ? "Removing..." : "Remove Record"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Convert-to-member duplicate warning */}
      <Dialog open={!!convertDuplicateWarning} onOpenChange={v => !v && setConvertDuplicateWarning(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-amber-700">Possible Duplicate Member</DialogTitle>
          </DialogHeader>
          {convertDuplicateWarning && (
            <div className="space-y-4 pt-1 text-sm">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                {convertDuplicateWarning.message}
              </div>
              <p className="text-gray-600">
                Do you still want to add <strong>{sendToFT?.firstName} {sendToFT?.lastName}</strong> as a new member, or cancel and check the existing record first?
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConvertDuplicateWarning(null)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={sendToSaving}
                  onClick={() => handleSendTo(true)}>
                  {sendToSaving ? "Converting..." : "Convert Anyway"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
