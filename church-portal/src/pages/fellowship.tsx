import React, { useState, useEffect, useMemo } from "react";
import {
  useGetFellowshipHierarchy, getGetFellowshipHierarchyQueryKey,
  useListCells, getListCellsQueryKey,
  useListSeniorCells, getListSeniorCellsQueryKey,
  useCreateCell, useUpdateCell, useDeleteCell,
  useCreateSeniorCell, useUpdateSeniorCell, useDeleteSeniorCell,
  useCreatePcf, useUpdatePcf, useDeletePcf,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Users, Plus, AlertTriangle, Edit2, Trash2, Network, Download, Search } from "lucide-react";
import { downloadJsonAsExcel } from "@/utils/excel";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

/* ─── helpers ─── */
function LeaderBadge({ name }: { name?: string | null }) {
  if (name) return <span className="text-xs text-gray-500 italic">{name}</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium border border-yellow-200">
      <AlertTriangle className="w-3 h-3" /> No Leader
    </span>
  );
}

/* ─── create / edit dialog ─── */
type DialogMode = "cell" | "senior_cell" | "pcf" | null;
type EditTarget = { type: DialogMode; id?: number; name?: string; leaderId?: number | null; leaderName?: string | null };

const selectCls = "w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:bg-gray-50";

function FellowshipDialog({
  mode, editTarget, cells, seniorCells,
  onClose, onSave, saving,
}: {
  mode: DialogMode; editTarget?: EditTarget;
  cells: any[]; seniorCells: any[];
  onClose: () => void; onSave: (data: any) => void; saving: boolean;
}) {
  const isEdit = !!editTarget?.id;
  const [name, setName] = useState(editTarget?.name ?? "");
  const [selectedCells, setSelectedCells] = useState<number[]>(() =>
    mode === "senior_cell" && editTarget?.id
      ? cells.filter((c: any) => c.seniorCellId === editTarget.id).map((c: any) => c.id)
      : []
  );
  const [selectedSCs, setSelectedSCs] = useState<number[]>(() =>
    mode === "pcf" && editTarget?.id
      ? seniorCells.filter((sc: any) => sc.pcfId === editTarget.id).map((sc: any) => sc.id)
      : []
  );
  const [leaderId, setLeaderId] = useState<string>(editTarget?.leaderId ? String(editTarget.leaderId) : "");

  // Fetch cell members when editing a cell (rule 6: leader must be a member of the cell)
  const [cellMembers, setCellMembers] = useState<any[]>([]);
  const [loadingCellMembers, setLoadingCellMembers] = useState(false);
  useEffect(() => {
    if (mode === "cell" && isEdit && editTarget?.id) {
      setLoadingCellMembers(true);
      const token = localStorage.getItem("token");
      const h: any = token ? { Authorization: `Bearer ${token}` } : {};
      fetch(`/api/cells/${editTarget.id}`, { headers: h })
        .then(r => r.json())
        .then(d => { setCellMembers(d.members ?? []); setLoadingCellMembers(false); })
        .catch(() => setLoadingCellMembers(false));
    }
  }, [mode, isEdit, editTarget?.id]);

  // Rule 6: Cell leaders = cell members NOT already leading a different cell
  const availableCellLeaders = useMemo(() => {
    if (mode !== "cell" || !isEdit) return [];
    const otherLeaderIds = new Set(
      cells.filter((c: any) => c.id !== editTarget?.id && c.leaderId).map((c: any) => c.leaderId)
    );
    return cellMembers.filter((m: any) => !otherLeaderIds.has(m.id));
  }, [mode, isEdit, cellMembers, cells, editTarget?.id]);

  // Rule 7: Senior Cell leaders = cell leaders from the selected cells only
  const availableSCLeaders = useMemo(() => {
    if (mode !== "senior_cell") return [];
    return cells
      .filter((c: any) => selectedCells.includes(c.id) && c.leaderId)
      .map((c: any) => ({ id: c.leaderId, name: c.leaderName, from: c.name }));
  }, [mode, selectedCells, cells]);

  // Rule 8: PCF leaders = senior cell leaders from the selected senior cells only
  const availablePCFLeaders = useMemo(() => {
    if (mode !== "pcf") return [];
    return seniorCells
      .filter((sc: any) => selectedSCs.includes(sc.id) && sc.leaderId)
      .map((sc: any) => ({ id: sc.leaderId, name: sc.leaderName, from: sc.name }));
  }, [mode, selectedSCs, seniorCells]);

  // Reset leader selection if it's no longer valid after cell/SC selection changes
  useEffect(() => {
    if (mode === "senior_cell" && leaderId && !availableSCLeaders.find((l: any) => String(l.id) === leaderId)) {
      setLeaderId("");
    }
  }, [availableSCLeaders]);
  useEffect(() => {
    if (mode === "pcf" && leaderId && !availablePCFLeaders.find((l: any) => String(l.id) === leaderId)) {
      setLeaderId("");
    }
  }, [availablePCFLeaders]);

  const title = isEdit
    ? `Edit ${mode === "cell" ? "Cell" : mode === "senior_cell" ? "Senior Cell" : "PCF"}`
    : `Create ${mode === "cell" ? "Cell" : mode === "senior_cell" ? "Senior Cell" : "PCF"}`;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const data: any = { name: name.trim() };
    if (leaderId) data.leaderId = parseInt(leaderId);
    if (mode === "senior_cell") data.cellIds = selectedCells;
    if (mode === "pcf") data.seniorCellIds = selectedSCs;
    onSave(data);
  };

  const toggleCell = (id: number) => {
    if (selectedCells.includes(id)) { setSelectedCells(p => p.filter(x => x !== id)); return; }
    const cell = cells.find((c: any) => c.id === id);
    if (cell?.seniorCellId && cell.seniorCellId !== editTarget?.id) {
      alert(`"${cell.name}" is already assigned to "${cell.seniorCellName || 'another Senior Cell'}". Remove it from there first.`);
      return;
    }
    setSelectedCells(p => [...p, id]);
  };

  const toggleSC = (id: number) => {
    if (selectedSCs.includes(id)) { setSelectedSCs(p => p.filter(x => x !== id)); return; }
    const sc = seniorCells.find((s: any) => s.id === id);
    if (sc?.pcfId && sc.pcfId !== editTarget?.id) {
      alert(`"${sc.name}" is already assigned to "${sc.pcfName || 'another PCF'}". Remove it from there first.`);
      return;
    }
    setSelectedSCs(p => [...p, id]);
  };

  const renderLeaderSection = () => {
    if (mode === "cell") {
      if (!isEdit) {
        return (
          <p className="text-xs text-gray-400 italic px-1">
            Leaders can only be assigned after members are added to this cell.
          </p>
        );
      }
      if (loadingCellMembers) return <Skeleton className="h-9 w-full" />;
      if (availableCellLeaders.length === 0) {
        return (
          <p className="text-xs text-orange-500 italic px-1">
            No eligible members in this cell yet. Add members to this cell first, then assign a leader.
          </p>
        );
      }
      return (
        <select value={leaderId} onChange={e => setLeaderId(e.target.value)} className={selectCls}>
          <option value="">— Select a Cell Leader —</option>
          {availableCellLeaders.map((m: any) => (
            <option key={m.id} value={String(m.id)}>
              {m.firstName} {m.lastName}
              {editTarget?.leaderId === m.id ? " (current)" : ""}
            </option>
          ))}
        </select>
      );
    }

    if (mode === "senior_cell") {
      if (selectedCells.length < 2) {
        return (
          <p className="text-xs text-gray-400 italic px-1">
            Select at least 2 cells above to see available leaders.
          </p>
        );
      }
      if (availableSCLeaders.length === 0) {
        return (
          <p className="text-xs text-orange-500 px-1">
            None of the selected cells have a Cell Leader assigned. Assign Cell Leaders to the cells first.
          </p>
        );
      }
      return (
        <select value={leaderId} onChange={e => setLeaderId(e.target.value)} className={selectCls}>
          <option value="">— Select a Senior Cell Leader —</option>
          {availableSCLeaders.map((l: any) => (
            <option key={l.id} value={String(l.id)}>
              {l.name} — Cell Leader of "{l.from}"
            </option>
          ))}
        </select>
      );
    }

    if (mode === "pcf") {
      if (selectedSCs.length < 2) {
        return (
          <p className="text-xs text-gray-400 italic px-1">
            Select at least 2 Senior Cells above to see available leaders.
          </p>
        );
      }
      if (availablePCFLeaders.length === 0) {
        return (
          <p className="text-xs text-orange-500 px-1">
            None of the selected Senior Cells have a Senior Cell Leader assigned. Assign Senior Cell Leaders first.
          </p>
        );
      }
      return (
        <select value={leaderId} onChange={e => setLeaderId(e.target.value)} className={selectCls}>
          <option value="">— Select a PCF Leader —</option>
          {availablePCFLeaders.map((l: any) => (
            <option key={l.id} value={String(l.id)}>
              {l.name} — Senior Cell Leader of "{l.from}"
            </option>
          ))}
        </select>
      );
    }
    return null;
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label>{mode === "cell" ? "Cell" : mode === "senior_cell" ? "Senior Cell" : "PCF"} Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required
              placeholder={`e.g. ${mode === "pcf" ? "PCF Alpha" : mode === "senior_cell" ? "Senior Cell A" : "Victory Cell"}`} />
          </div>

          {mode === "senior_cell" && (
            <div className="space-y-1.5">
              <Label>{isEdit ? "Cells — checked = currently assigned" : "Select Cells (2+ required)"}</Label>
              <div className="border rounded-md max-h-40 overflow-y-auto p-1 space-y-0.5">
                {cells.length === 0 && <p className="text-sm text-gray-400 px-2 py-2">No cells available. Create cells first.</p>}
                {cells.map((c: any) => {
                  const inOtherSC = c.seniorCellId && c.seniorCellId !== editTarget?.id;
                  return (
                    <label key={c.id} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${inOtherSC ? "opacity-40 bg-gray-50 cursor-not-allowed" : "hover:bg-gray-50"}`}>
                      <input type="checkbox" checked={selectedCells.includes(c.id)} onChange={() => toggleCell(c.id)} className="accent-purple-700" disabled={!!inOtherSC} />
                      <span className="text-sm font-medium">{c.name}</span>
                      {!inOtherSC && c.leaderName && <span className="text-xs text-green-600 ml-auto flex-shrink-0">{c.leaderName}</span>}
                      {!inOtherSC && !c.leaderName && <span className="text-xs text-orange-400 ml-auto flex-shrink-0">No leader</span>}
                      {inOtherSC && <span className="text-xs text-red-400 ml-auto flex-shrink-0">⚠ {c.seniorCellName}</span>}
                    </label>
                  );
                })}
              </div>
              {selectedCells.length < 2 && (
                <p className="text-xs text-orange-500">Select at least 2 cells</p>
              )}
            </div>
          )}

          {mode === "pcf" && (
            <div className="space-y-1.5">
              <Label>{isEdit ? "Senior Cells — checked = currently assigned" : "Select Senior Cells (2+ required)"}</Label>
              <div className="border rounded-md max-h-40 overflow-y-auto p-1 space-y-0.5">
                {seniorCells.length === 0 && <p className="text-sm text-gray-400 px-2 py-2">No senior cells available. Create senior cells first.</p>}
                {seniorCells.map((sc: any) => {
                  const inOtherPCF = sc.pcfId && sc.pcfId !== editTarget?.id;
                  return (
                    <label key={sc.id} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${inOtherPCF ? "opacity-40 bg-gray-50 cursor-not-allowed" : "hover:bg-gray-50"}`}>
                      <input type="checkbox" checked={selectedSCs.includes(sc.id)} onChange={() => toggleSC(sc.id)} className="accent-purple-700" disabled={!!inOtherPCF} />
                      <span className="text-sm font-medium">{sc.name}</span>
                      {!inOtherPCF && sc.leaderName && <span className="text-xs text-green-600 ml-auto flex-shrink-0">{sc.leaderName}</span>}
                      {!inOtherPCF && !sc.leaderName && <span className="text-xs text-orange-400 ml-auto flex-shrink-0">No leader</span>}
                      {inOtherPCF && <span className="text-xs text-red-400 ml-auto flex-shrink-0">⚠ {sc.pcfName}</span>}
                    </label>
                  );
                })}
              </div>
              {selectedSCs.length < 2 && (
                <p className="text-xs text-orange-500">Select at least 2 senior cells</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Assign Leader</Label>
            {renderLeaderSection()}
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-purple-700 text-white" disabled={saving}>
              {saving ? "Saving..." : isEdit ? "Save Changes" : `Create ${mode === "cell" ? "Cell" : mode === "senior_cell" ? "Senior Cell" : "PCF"}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── delete dialog ─── */
function DeleteDialog({ label, reason, setReason, onConfirm, onClose, loading }: any) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete {label}?</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <p className="text-sm text-gray-600">This action cannot be undone. Provide a reason.</p>
          <Input placeholder="Reason for deletion..." value={reason} onChange={e => setReason(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button variant="destructive" className="flex-1" disabled={!reason || loading} onClick={onConfirm}>
              {loading ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Hierarchy tree components ─── */
type OnViewMembers = (type: "cell" | "sc" | "pcf", id: number, name: string, count: number) => void;

function CellCard({ cell, canManage, onEdit, onDelete, index, fellowshipNum, onViewMembers }: {
  cell: any; canManage: boolean; onEdit: (t: EditTarget) => void; onDelete: (t: any) => void;
  index?: number; fellowshipNum?: number; onViewMembers?: OnViewMembers;
}) {
  const isTopLevel = fellowshipNum !== undefined;
  if (isTopLevel) {
    return (
      <div className="group rounded-xl border border-yellow-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-yellow-50 to-amber-50 border-b border-yellow-100">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full tracking-wide">FELLOWSHIP {fellowshipNum}</span>
            <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">Cell</span>
          </div>
          {canManage && (
            <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-purple-600"
                onClick={() => onEdit({ type: "cell", id: cell.id, name: cell.name, leaderId: cell.leaderId, leaderName: cell.leaderName })}>
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                onClick={() => onDelete({ type: "cell", id: cell.id, name: cell.name })}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="font-semibold text-gray-900">{cell.name}</span>
            <LeaderBadge name={cell.leaderName} />
          </div>
          <button type="button"
            onClick={() => onViewMembers?.("cell", cell.id, cell.name, cell.memberCount ?? 0)}
            className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full hover:bg-green-100 transition-colors cursor-pointer">
            <Users className="w-3 h-3" />{cell.memberCount ?? 0} members
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-md bg-yellow-50 border border-yellow-100 text-sm group">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
        {index !== undefined && <span className="text-xs text-gray-400 font-mono w-5 flex-shrink-0 text-right">{index}.</span>}
        <span className="font-medium text-gray-800">{cell.name}</span>
        <LeaderBadge name={cell.leaderName} />
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button"
          onClick={() => onViewMembers?.("cell", cell.id, cell.name, cell.memberCount ?? 0)}
          className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full hover:bg-green-100 transition-colors">
          <Users className="w-3 h-3" />{cell.memberCount ?? 0}
        </button>
        {canManage && (
          <div className="hidden group-hover:flex items-center gap-0.5">
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-400 hover:text-purple-600"
              onClick={() => onEdit({ type: "cell", id: cell.id, name: cell.name, leaderId: cell.leaderId, leaderName: cell.leaderName })}>
              <Edit2 className="w-3 h-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
              onClick={() => onDelete({ type: "cell", id: cell.id, name: cell.name })}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SeniorCellCard({ sc, canManage, onEdit, onDelete, index, fellowshipNum, onViewMembers }: {
  sc: any; canManage: boolean; onEdit: (t: EditTarget) => void; onDelete: (t: any) => void;
  index?: number; fellowshipNum?: number; onViewMembers?: OnViewMembers;
}) {
  const [open, setOpen] = useState(false);
  const hasCells = (sc.cells ?? []).length > 0;
  const isTopLevel = fellowshipNum !== undefined;
  return (
    <div className={`group ${isTopLevel ? "rounded-xl border border-blue-200 bg-white shadow-sm overflow-hidden" : "border border-blue-100 rounded-lg bg-blue-50/40"}`}>
      {isTopLevel && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-blue-50 to-sky-50 border-b border-blue-100">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full tracking-wide">FELLOWSHIP {fellowshipNum}</span>
            <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">Senior Cell</span>
          </div>
          {canManage && (
            <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
              <Button size="sm" variant="outline" className="h-6 px-2 text-xs border-blue-300 text-blue-600 hover:bg-blue-50"
                onClick={() => onEdit({ type: "senior_cell", id: sc.id, name: sc.name, leaderId: sc.leaderId, leaderName: sc.leaderName })}>
                <Plus className="w-3 h-3 mr-0.5" /> Add Cells
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-purple-600"
                onClick={() => onEdit({ type: "senior_cell", id: sc.id, name: sc.name, leaderId: sc.leaderId, leaderName: sc.leaderName })}>
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                onClick={() => onDelete({ type: "senior_cell", id: sc.id, name: sc.name })}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-2.5">
        <button className="flex items-center gap-2 text-left flex-1" onClick={() => setOpen(!open)}>
          {open ? <ChevronDown className="w-4 h-4 text-blue-500" /> : <ChevronRight className="w-4 h-4 text-blue-500" />}
          {!isTopLevel && index !== undefined && <span className="text-xs text-blue-400 font-semibold font-mono">SC {index}.</span>}
          <span className="font-semibold text-blue-800 text-sm">{sc.name}</span>
          <LeaderBadge name={sc.leaderName} />
        </button>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">{sc.cellCount ?? 0} cells</Badge>
          <button type="button"
            onClick={() => onViewMembers?.("sc", sc.id, sc.name, sc.memberCount ?? 0)}
            className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full hover:bg-green-100 transition-colors">
            <Users className="w-3 h-3" />{sc.memberCount ?? 0}
          </button>
          {canManage && !isTopLevel && (
            <>
              <Button size="sm" variant="outline"
                className={`h-6 px-2 text-xs border-blue-300 text-blue-600 hover:bg-blue-50 ${hasCells ? "hidden group-hover:flex" : "flex"}`}
                onClick={() => onEdit({ type: "senior_cell", id: sc.id, name: sc.name, leaderId: sc.leaderId, leaderName: sc.leaderName })}>
                <Plus className="w-3 h-3 mr-0.5" /> Add Cells
              </Button>
              <div className="hidden group-hover:flex items-center gap-0.5">
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-400 hover:text-purple-600"
                  onClick={() => onEdit({ type: "senior_cell", id: sc.id, name: sc.name, leaderId: sc.leaderId, leaderName: sc.leaderName })}>
                  <Edit2 className="w-3 h-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
                  onClick={() => onDelete({ type: "senior_cell", id: sc.id, name: sc.name })}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
      {open && hasCells && (
        <div className="px-4 pb-3 space-y-1.5">
          {sc.cells.map((c: any, i: number) => (
            <CellCard key={c.id} cell={c} canManage={canManage} onEdit={onEdit} onDelete={onDelete} index={i + 1} onViewMembers={onViewMembers} />
          ))}
        </div>
      )}
      {open && !hasCells && canManage && (
        <div className="px-4 pb-3">
          <button className="w-full text-xs text-blue-400 border border-dashed border-blue-200 rounded-md py-2 hover:bg-blue-50 hover:text-blue-600 transition-colors"
            onClick={() => onEdit({ type: "senior_cell", id: sc.id, name: sc.name, leaderId: sc.leaderId, leaderName: sc.leaderName })}>
            + Assign cells to this Senior Cell
          </button>
        </div>
      )}
    </div>
  );
}

function PcfCard({ pcf, canManage, onEdit, onDelete, fellowshipNum, onViewMembers }: {
  pcf: any; canManage: boolean; onEdit: (t: EditTarget) => void; onDelete: (t: any) => void;
  fellowshipNum?: number; onViewMembers?: OnViewMembers;
}) {
  const [open, setOpen] = useState(false);
  const hasSCs = (pcf.seniorCells ?? []).length > 0;
  return (
    <div className="group rounded-xl border border-purple-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-purple-50 to-violet-50 border-b border-purple-100">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full tracking-wide">FELLOWSHIP {fellowshipNum}</span>
          <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">PCF</span>
        </div>
        {canManage && (
          <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs border-purple-300 text-purple-600 hover:bg-purple-50"
              onClick={() => onEdit({ type: "pcf", id: pcf.id, name: pcf.name, leaderId: pcf.leaderId, leaderName: pcf.leaderName })}>
              <Plus className="w-3 h-3 mr-0.5" /> Add Senior Cells
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-purple-600"
              onClick={() => onEdit({ type: "pcf", id: pcf.id, name: pcf.name, leaderId: pcf.leaderId, leaderName: pcf.leaderName })}>
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
              onClick={() => onDelete({ type: "pcf", id: pcf.id, name: pcf.name })}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-4 py-3">
        <button className="flex items-center gap-2 text-left flex-1" onClick={() => setOpen(!open)}>
          {open ? <ChevronDown className="w-4 h-4 text-purple-600" /> : <ChevronRight className="w-4 h-4 text-purple-600" />}
          <span className="font-bold text-purple-900">{pcf.name}</span>
          <LeaderBadge name={pcf.leaderName} />
        </button>
        <div className="flex items-center gap-1.5">
          <Badge className="bg-purple-100 text-purple-700 border-purple-200 font-normal text-xs border">{pcf.seniorCellCount ?? 0} SCs</Badge>
          <button type="button"
            onClick={() => onViewMembers?.("pcf", pcf.id, pcf.name, pcf.memberCount ?? 0)}
            className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full hover:bg-green-100 transition-colors">
            <Users className="w-3 h-3" />{pcf.memberCount ?? 0} members
          </button>
        </div>
      </div>
      {open && hasSCs && (
        <div className="px-4 pb-4 space-y-2">
          {pcf.seniorCells.map((sc: any, i: number) => (
            <SeniorCellCard key={sc.id} sc={sc} canManage={canManage} onEdit={onEdit} onDelete={onDelete} index={i + 1} onViewMembers={onViewMembers} />
          ))}
        </div>
      )}
      {open && !hasSCs && canManage && (
        <div className="px-4 pb-4">
          <button className="w-full text-xs text-purple-400 border border-dashed border-purple-200 rounded-md py-2 hover:bg-purple-50 hover:text-purple-600 transition-colors"
            onClick={() => onEdit({ type: "pcf", id: pcf.id, name: pcf.name, leaderId: pcf.leaderId, leaderName: pcf.leaderName })}>
            + Assign senior cells to this PCF
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Member view dialog ─── */
type MemberViewTarget = { type: "cell" | "sc" | "pcf"; id: number; name: string; count: number };

function MemberViewDialog({ target, onClose }: { target: MemberViewTarget; onClose: () => void }) {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const token = localStorage.getItem("token");
      const h: any = token ? { Authorization: `Bearer ${token}` } : {};
      let mems: any[] = [];
      try {
        if (target.type === "cell") {
          const res = await fetch(`/api/cells/${target.id}`, { headers: h });
          const d = await res.json();
          mems = d.members ?? [];
        } else if (target.type === "sc") {
          const res = await fetch(`/api/senior-cells/${target.id}`, { headers: h });
          const d = await res.json();
          for (const c of (d.cells ?? [])) mems.push(...(c.members ?? []));
        } else {
          const res = await fetch(`/api/pcfs/${target.id}`, { headers: h });
          const d = await res.json();
          for (const sc of (d.seniorCells ?? [])) for (const c of (sc.cells ?? [])) mems.push(...(c.members ?? []));
        }
      } catch { }
      if (!cancelled) { setMembers(mems); setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [target]);

  const filtered = search.length > 0
    ? members.filter(m =>
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
        (m.phone1 ?? "").includes(search) ||
        (m.membershipId ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : members;

  const typeLabel = target.type === "pcf" ? "PCF" : target.type === "sc" ? "Senior Cell" : "Cell";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4 text-purple-600 flex-shrink-0" />
            <span className="truncate">{target.name}</span>
            <span className="text-xs font-normal text-gray-400 flex-shrink-0">({typeLabel})</span>
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="space-y-2 pt-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">{members.length} member{members.length !== 1 ? "s" : ""}</p>
            {members.length > 5 && (
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search members..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            )}
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">{members.length === 0 ? "No members yet" : `No results for "${search}"`}</p>
              </div>
            ) : (
              <div className="max-h-[55vh] overflow-y-auto space-y-0.5 -mx-2 px-2">
                {filtered.map((m, i) => (
                  <div key={m.id} className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-gray-50">
                    <span className="text-xs text-gray-300 font-mono w-5 flex-shrink-0 text-right">{i + 1}</span>
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-xs font-bold flex-shrink-0 overflow-hidden">
                      {m.profilePhoto
                        ? <img src={m.profilePhoto} alt="" className="w-full h-full object-cover" />
                        : <>{(m.firstName ?? "?")[0]}{(m.lastName ?? "?")[0]}</>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{m.firstName} {m.lastName}</p>
                      <p className="text-xs text-gray-400 font-mono">{m.membershipId}</p>
                    </div>
                    {m.phone1 && <p className="text-xs text-gray-500 flex-shrink-0">{m.phone1}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

async function exportFellowshipToExcel(hierarchyData: any, toast: any) {
  try {
    const rows: any[] = [];
    const pcfs = hierarchyData?.pcfs ?? [];
    for (const pcf of pcfs) {
      for (const sc of (pcf.seniorCells ?? [])) {
        for (const cell of (sc.cells ?? [])) {
          rows.push({ PCF: pcf.name, "PCF Leader": pcf.leaderName ?? "", "Senior Cell": sc.name, "SC Leader": sc.leaderName ?? "", Cell: cell.name, "Cell Leader": cell.leaderName ?? "", Members: cell.memberCount ?? 0 });
        }
        if (!(sc.cells ?? []).length) {
          rows.push({ PCF: pcf.name, "PCF Leader": pcf.leaderName ?? "", "Senior Cell": sc.name, "SC Leader": sc.leaderName ?? "", Cell: "", "Cell Leader": "", Members: sc.memberCount ?? 0 });
        }
      }
    }
    for (const sc of (hierarchyData?.standaloneSeniorCells ?? [])) {
      for (const cell of (sc.cells ?? [])) {
        rows.push({ PCF: "", "PCF Leader": "", "Senior Cell": sc.name, "SC Leader": sc.leaderName ?? "", Cell: cell.name, "Cell Leader": cell.leaderName ?? "", Members: cell.memberCount ?? 0 });
      }
    }
    for (const cell of (hierarchyData?.standaloneCells ?? [])) {
      rows.push({ PCF: "", "PCF Leader": "", "Senior Cell": "", "SC Leader": "", Cell: cell.name, "Cell Leader": cell.leaderName ?? "", Members: cell.memberCount ?? 0 });
    }
    if (rows.length === 0) { toast({ title: "Nothing to export yet" }); return; }
    await downloadJsonAsExcel(rows, "Fellowship", `Fellowship_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: `Exported ${rows.length} rows to Excel` });
  } catch {
    toast({ title: "Export failed", variant: "destructive" });
  }
}

/* ─── leaders report ─── */
function LeadersReport() {
  const { data, isLoading } = useGetFellowshipHierarchy({
    query: { queryKey: getGetFellowshipHierarchyQueryKey(), staleTime: 5 * 60 * 1000 },
  });
  const [filter, setFilter] = useState<"all" | "cell" | "sc" | "pcf">("all");
  const [expandedPcfs, setExpandedPcfs] = useState<Set<number>>(new Set());
  const [expandedScs, setExpandedScs] = useState<Set<number>>(new Set());

  const togglePcf = (id: number) => setExpandedPcfs(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleSc = (id: number) => setExpandedScs(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const pcfs: any[] = data?.pcfs ?? [];
  const standaloneSCs: any[] = data?.standaloneSeniorCells ?? [];
  const standaloneCells: any[] = data?.standaloneCells ?? [];

  const filterBtns: { label: string; value: typeof filter; color: string }[] = [
    { label: "All Leaders", value: "all", color: "bg-gray-800 text-white" },
    { label: "Cell Leaders", value: "cell", color: "bg-green-700 text-white" },
    { label: "Senior Cell Leaders", value: "sc", color: "bg-blue-700 text-white" },
    { label: "PCF Leaders", value: "pcf", color: "bg-amber-600 text-white" },
  ];

  const totalLeaders = useMemo(() => {
    let n = 0;
    pcfs.forEach(p => {
      if (p.leaderName) n++;
      (p.seniorCells ?? []).forEach((sc: any) => {
        if (sc.leaderName) n++;
        (sc.cells ?? []).forEach((c: any) => { if (c.leaderName) n++; });
      });
    });
    standaloneSCs.forEach(sc => {
      if (sc.leaderName) n++;
      (sc.cells ?? []).forEach((c: any) => { if (c.leaderName) n++; });
    });
    standaloneCells.forEach(c => { if (c.leaderName) n++; });
    return n;
  }, [data]);

  /* ── flat lists for cell / sc / pcf filters ── */
  const flatCells = useMemo(() => {
    const rows: { id: number; leaderName: string; leaderPhone: string | null; cellName: string; scName: string | null; pcfName: string | null }[] = [];
    pcfs.forEach((pcf: any) => {
      (pcf.seniorCells ?? []).forEach((sc: any) => {
        (sc.cells ?? []).forEach((cell: any) => {
          if (!cell.leaderName) return;
          rows.push({ id: cell.id, leaderName: cell.leaderName, leaderPhone: cell.leaderPhone ?? null, cellName: cell.name, scName: sc.name, pcfName: pcf.name });
        });
      });
    });
    standaloneSCs.forEach((sc: any) => {
      (sc.cells ?? []).forEach((cell: any) => {
        if (!cell.leaderName) return;
        rows.push({ id: cell.id, leaderName: cell.leaderName, leaderPhone: cell.leaderPhone ?? null, cellName: cell.name, scName: sc.name, pcfName: null });
      });
    });
    standaloneCells.forEach((cell: any) => {
      if (!cell.leaderName) return;
      rows.push({ id: cell.id, leaderName: cell.leaderName, leaderPhone: cell.leaderPhone ?? null, cellName: cell.name, scName: null, pcfName: null });
    });
    return rows;
  }, [data]);

  const flatSCs = useMemo(() => {
    const rows: { id: number; leaderName: string; leaderPhone: string | null; scName: string; pcfName: string | null }[] = [];
    pcfs.forEach((pcf: any) => {
      (pcf.seniorCells ?? []).forEach((sc: any) => {
        if (!sc.leaderName) return;
        rows.push({ id: sc.id, leaderName: sc.leaderName, leaderPhone: sc.leaderPhone ?? null, scName: sc.name, pcfName: pcf.name });
      });
    });
    standaloneSCs.forEach((sc: any) => {
      if (!sc.leaderName) return;
      rows.push({ id: sc.id, leaderName: sc.leaderName, leaderPhone: sc.leaderPhone ?? null, scName: sc.name, pcfName: null });
    });
    return rows;
  }, [data]);

  const flatPCFs = useMemo(() => {
    return pcfs.filter((p: any) => !!p.leaderName).map((p: any) => ({
      id: p.id, leaderName: p.leaderName, leaderPhone: p.leaderPhone ?? null, pcfName: p.name,
    }));
  }, [data]);

  const skeletonCols = filter === "pcf" ? 3 : 4;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-wrap gap-2">
        {filterBtns.map(b => (
          <button
            key={b.value}
            onClick={() => setFilter(b.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${filter === b.value ? b.color + " border-transparent shadow-sm" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
          >
            {b.label}
          </button>
        ))}
        {!isLoading && (
          <span className="ml-auto text-xs text-gray-400 self-center">{totalLeaders} leaders total</span>
        )}
      </div>

      {/* ── ALL LEADERS — hierarchy table (unchanged) ── */}
      {filter === "all" && (
        <div className="border rounded-xl overflow-hidden bg-white">
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="text-left px-3 py-2.5 w-8">#</th>
                  <th className="text-left px-3 py-2.5 min-w-[160px]">Leader Name</th>
                  <th className="text-left px-3 py-2.5 min-w-[120px]">Fellowship</th>
                  <th className="text-left px-3 py-2.5 w-32">Role</th>
                  <th className="text-right px-3 py-2.5 w-20">Members</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {[1,2,3,4,5].map(j => <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>)}
                    </tr>
                  ))
                ) : (() => {
                  let sn = 0;
                  const rows: React.ReactNode[] = [];

                  pcfs.forEach((pcf: any) => {
                    const pcfExpanded = expandedPcfs.has(pcf.id);
                    if (pcf.leaderName) {
                      sn++;
                      rows.push(
                        <tr key={`pcf-${pcf.id}`} className="border-b bg-amber-50 hover:bg-amber-100 cursor-pointer" onClick={() => togglePcf(pcf.id)}>
                          <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">{sn}</td>
                          <td className="px-3 py-2.5 font-semibold text-gray-800 text-sm">
                            <div className="flex items-center gap-1.5">
                              {pcfExpanded ? <ChevronDown className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />}
                              {pcf.leaderName}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-sm text-gray-600">{pcf.name}</td>
                          <td className="px-3 py-2.5"><span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">PCF Leader</span></td>
                          <td className="text-right px-3 py-2.5 text-xs text-gray-500">{pcf.memberCount ?? "—"}</td>
                        </tr>
                      );
                    } else {
                      rows.push(
                        <tr key={`pcf-hdr-${pcf.id}`} className="border-b bg-amber-50/40 cursor-pointer hover:bg-amber-50" onClick={() => togglePcf(pcf.id)}>
                          <td className="px-3 py-2 text-xs text-gray-300">—</td>
                          <td className="px-3 py-2 text-xs text-gray-500 font-medium">
                            <div className="flex items-center gap-1">
                              {pcfExpanded ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                              {pcf.name}
                            </div>
                          </td>
                          <td colSpan={3} className="px-3 py-2 text-xs text-gray-400">PCF group</td>
                        </tr>
                      );
                    }

                    if (pcfExpanded) {
                      (pcf.seniorCells ?? []).forEach((sc: any) => {
                        const scExpanded = expandedScs.has(sc.id);
                        if (sc.leaderName) {
                          sn++;
                          rows.push(
                            <tr key={`sc-${sc.id}`} className="border-b bg-blue-50 hover:bg-blue-100 cursor-pointer" onClick={() => toggleSc(sc.id)}>
                              <td className="px-3 py-2 text-xs text-gray-400 font-mono pl-6">{sn}</td>
                              <td className="px-3 py-2 text-sm text-gray-800 font-medium pl-6">
                                <div className="flex items-center gap-1.5">
                                  {scExpanded ? <ChevronDown className="w-3 h-3 text-blue-600 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-blue-600 flex-shrink-0" />}
                                  {sc.leaderName}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-600">{sc.name}</td>
                              <td className="px-3 py-2"><span className="inline-block px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">Senior Cell Leader</span></td>
                              <td className="text-right px-3 py-2 text-xs text-gray-500">{sc.memberCount ?? "—"}</td>
                            </tr>
                          );
                        } else {
                          rows.push(
                            <tr key={`sc-hdr-${sc.id}`} className="border-b bg-blue-50/30 cursor-pointer hover:bg-blue-50" onClick={() => toggleSc(sc.id)}>
                              <td className="px-3 py-1.5 text-xs text-gray-300 pl-6">—</td>
                              <td className="px-3 py-1.5 text-xs text-gray-500 font-medium pl-6">
                                <div className="flex items-center gap-1">
                                  {scExpanded ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                                  {sc.name}
                                </div>
                              </td>
                              <td colSpan={3} className="px-3 py-1.5 text-xs text-gray-400">Senior Cell</td>
                            </tr>
                          );
                        }
                        if (scExpanded) {
                          (sc.cells ?? []).forEach((cell: any) => {
                            if (!cell.leaderName) return;
                            sn++;
                            rows.push(
                              <tr key={`cell-${cell.id}`} className="border-b hover:bg-green-50">
                                <td className="px-3 py-2 text-xs text-gray-400 font-mono pl-10">{sn}</td>
                                <td className="px-3 py-2 text-sm text-gray-700 pl-10">{cell.leaderName}</td>
                                <td className="px-3 py-2 text-sm text-gray-600">{cell.name}</td>
                                <td className="px-3 py-2"><span className="inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">Cell Leader</span></td>
                                <td className="text-right px-3 py-2 text-xs text-gray-500">{cell.memberCount ?? "—"}</td>
                              </tr>
                            );
                          });
                        }
                      });
                    }
                  });

                  standaloneSCs.forEach((sc: any) => {
                    const scExpanded = expandedScs.has(sc.id);
                    if (sc.leaderName) {
                      sn++;
                      rows.push(
                        <tr key={`ssc-${sc.id}`} className="border-b bg-blue-50 hover:bg-blue-100 cursor-pointer" onClick={() => toggleSc(sc.id)}>
                          <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">{sn}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-800 font-medium">
                            <div className="flex items-center gap-1.5">
                              {scExpanded ? <ChevronDown className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />}
                              {sc.leaderName}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-sm text-gray-600">{sc.name}</td>
                          <td className="px-3 py-2.5"><span className="inline-block px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">Senior Cell Leader</span></td>
                          <td className="text-right px-3 py-2.5 text-xs text-gray-500">{sc.memberCount ?? "—"}</td>
                        </tr>
                      );
                    } else {
                      rows.push(
                        <tr key={`ssc-hdr-${sc.id}`} className="border-b bg-blue-50/30 cursor-pointer hover:bg-blue-50" onClick={() => toggleSc(sc.id)}>
                          <td className="px-3 py-1.5 text-xs text-gray-300">—</td>
                          <td className="px-3 py-1.5 text-xs text-gray-500 font-medium">
                            <div className="flex items-center gap-1">
                              {scExpanded ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                              {sc.name}
                            </div>
                          </td>
                          <td colSpan={3} className="px-3 py-1.5 text-xs text-gray-400">Senior Cell</td>
                        </tr>
                      );
                    }
                    if (scExpanded) {
                      (sc.cells ?? []).forEach((cell: any) => {
                        if (!cell.leaderName) return;
                        sn++;
                        rows.push(
                          <tr key={`scell-${cell.id}`} className="border-b hover:bg-green-50">
                            <td className="px-3 py-2 text-xs text-gray-400 font-mono pl-8">{sn}</td>
                            <td className="px-3 py-2 text-sm text-gray-700 pl-8">{cell.leaderName}</td>
                            <td className="px-3 py-2 text-sm text-gray-600">{cell.name}</td>
                            <td className="px-3 py-2"><span className="inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">Cell Leader</span></td>
                            <td className="text-right px-3 py-2 text-xs text-gray-500">{cell.memberCount ?? "—"}</td>
                          </tr>
                        );
                      });
                    }
                  });

                  standaloneCells.forEach((cell: any) => {
                    if (!cell.leaderName) return;
                    sn++;
                    rows.push(
                      <tr key={`stcell-${cell.id}`} className="border-b hover:bg-green-50">
                        <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">{sn}</td>
                        <td className="px-3 py-2.5 text-sm text-gray-700">{cell.leaderName}</td>
                        <td className="px-3 py-2.5 text-sm text-gray-600">{cell.name}</td>
                        <td className="px-3 py-2.5"><span className="inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">Cell Leader</span></td>
                        <td className="text-right px-3 py-2.5 text-xs text-gray-500">{cell.memberCount ?? "—"}</td>
                      </tr>
                    );
                  });

                  if (rows.length === 0) {
                    return <tr><td colSpan={5} className="text-center py-10 text-gray-400 text-sm">No leaders assigned yet.</td></tr>;
                  }
                  return rows;
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CELL LEADERS — flat table ── */}
      {filter === "cell" && (
        <div className="border rounded-xl overflow-hidden bg-white">
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="text-left px-3 py-2.5 w-8">#</th>
                  <th className="text-left px-3 py-2.5 min-w-[160px]">Leader Full Name</th>
                  <th className="text-left px-3 py-2.5 w-36">Phone Number</th>
                  <th className="text-left px-3 py-2.5 min-w-[180px]">Cell</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {[1,2,3,4].map(j => <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>)}
                    </tr>
                  ))
                ) : flatCells.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-10 text-gray-400 text-sm">No cell leaders assigned yet.</td></tr>
                ) : flatCells.map((row, idx) => (
                  <tr key={row.id} className="border-b hover:bg-green-50">
                    <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">{idx + 1}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-800">{row.leaderName}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-500 font-mono">{row.leaderPhone ?? "—"}</td>
                    <td className="px-3 py-2.5 text-sm">
                      <span className="font-bold text-gray-800">{row.cellName}</span>
                      {row.scName && <span className="text-gray-400"> — {row.scName}</span>}
                      {row.pcfName && <span className="text-gray-400"> — {row.pcfName}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SENIOR CELL LEADERS — flat table ── */}
      {filter === "sc" && (
        <div className="border rounded-xl overflow-hidden bg-white">
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="text-left px-3 py-2.5 w-8">#</th>
                  <th className="text-left px-3 py-2.5 min-w-[160px]">Leader Full Name</th>
                  <th className="text-left px-3 py-2.5 w-36">Phone Number</th>
                  <th className="text-left px-3 py-2.5 min-w-[180px]">Senior Cell</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {[1,2,3,4].map(j => <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>)}
                    </tr>
                  ))
                ) : flatSCs.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-10 text-gray-400 text-sm">No senior cell leaders assigned yet.</td></tr>
                ) : flatSCs.map((row, idx) => (
                  <tr key={row.id} className="border-b hover:bg-blue-50">
                    <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">{idx + 1}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-800">{row.leaderName}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-500 font-mono">{row.leaderPhone ?? "—"}</td>
                    <td className="px-3 py-2.5 text-sm">
                      <span className="font-bold text-gray-800">{row.scName}</span>
                      {row.pcfName && <span className="text-gray-400"> — {row.pcfName}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PCF LEADERS — flat table ── */}
      {filter === "pcf" && (
        <div className="border rounded-xl overflow-hidden bg-white">
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="text-left px-3 py-2.5 w-8">#</th>
                  <th className="text-left px-3 py-2.5 min-w-[160px]">Leader Full Name</th>
                  <th className="text-left px-3 py-2.5 min-w-[160px]">PCF Name</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {[1,2,3].map(j => <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>)}
                    </tr>
                  ))
                ) : flatPCFs.length === 0 ? (
                  <tr><td colSpan={3} className="text-center py-10 text-gray-400 text-sm">No PCF leaders assigned yet.</td></tr>
                ) : flatPCFs.map((row: any, idx: number) => (
                  <tr key={row.id} className="border-b hover:bg-amber-50">
                    <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">{idx + 1}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-800">{row.leaderName}</td>
                    <td className="px-3 py-2.5 text-sm font-bold text-gray-800">{row.pcfName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── main page ─── */
export default function Fellowship() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canManage = (user?.roleLevel ?? 5) <= 3;

  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [memberViewTarget, setMemberViewTarget] = useState<MemberViewTarget | null>(null);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetFellowshipHierarchyQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListCellsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListSeniorCellsQueryKey() });
  };

  const { data, isLoading } = useGetFellowshipHierarchy({ query: { queryKey: getGetFellowshipHierarchyQueryKey() } });
  const { data: allCellsData } = useListCells({}, { query: { queryKey: getListCellsQueryKey() } });
  const { data: allSCsData } = useListSeniorCells({}, { query: { queryKey: getListSeniorCellsQueryKey() } });

  const makeOpts = (label: string) => ({
    mutation: {
      onSuccess: () => { invalidateAll(); setDialogMode(null); setEditTarget(undefined); toast({ title: `${label} saved` }); },
      onError: (e: any) => toast({ title: "Error", description: e?.message ?? "Failed", variant: "destructive" }),
    },
  });

  const createCell = useCreateCell(makeOpts("Cell"));
  const updateCell = useUpdateCell(makeOpts("Cell"));
  const deleteCell = useDeleteCell({ mutation: { onSuccess: (data: any) => {
    invalidateAll(); setDeleteTarget(null); setDeleteReason("");
    let description: string | undefined;
    if (data?.autoDeletedSc && data?.autoDeletedPcf) {
      description = `"${data.autoDeletedSc}" senior cell and "${data.autoDeletedPcf}" PCF were automatically removed (only 1 child remaining each).`;
    } else if (data?.autoDeletedSc) {
      description = `"${data.autoDeletedSc}" senior cell was automatically removed — only 1 cell remaining, it is now standalone.`;
    } else if (data?.autoDeletedPcf) {
      description = `"${data.autoDeletedPcf}" PCF was automatically removed — only 1 senior cell remaining, it is now standalone.`;
    }
    toast({ title: "Cell deleted", description });
  }, onError: (e: any) => toast({ title: e?.message ?? "Cannot delete", variant: "destructive" }) } });
  const createSC = useCreateSeniorCell(makeOpts("Senior Cell"));
  const updateSC = useUpdateSeniorCell(makeOpts("Senior Cell"));
  const deleteSC = useDeleteSeniorCell({ mutation: { onSuccess: (data: any) => {
    invalidateAll(); setDeleteTarget(null); setDeleteReason("");
    let description: string | undefined;
    if (data?.autoDeletedPcf) {
      description = `"${data.autoDeletedPcf}" PCF was automatically removed — only 1 senior cell remaining, it is now standalone.`;
    }
    toast({ title: "Senior Cell deleted", description });
  }, onError: (e: any) => toast({ title: e?.message ?? "Cannot delete", variant: "destructive" }) } });
  const createPcf = useCreatePcf(makeOpts("PCF"));
  const updatePcf = useUpdatePcf(makeOpts("PCF"));
  const deletePcf = useDeletePcf({ mutation: { onSuccess: () => { invalidateAll(); setDeleteTarget(null); setDeleteReason(""); toast({ title: "PCF deleted" }); }, onError: (e: any) => toast({ title: e?.message ?? "Cannot delete", variant: "destructive" }) } });

  const handleSave = (formData: any) => {
    if (!dialogMode) return;
    if (editTarget?.id) {
      if (dialogMode === "cell") updateCell.mutate({ id: editTarget.id, data: formData });
      if (dialogMode === "senior_cell") updateSC.mutate({ id: editTarget.id, data: formData });
      if (dialogMode === "pcf") updatePcf.mutate({ id: editTarget.id, data: formData });
    } else {
      if (dialogMode === "cell") createCell.mutate({ data: formData });
      if (dialogMode === "senior_cell") createSC.mutate({ data: formData });
      if (dialogMode === "pcf") createPcf.mutate({ data: formData });
    }
  };

  const isSaving = createCell.isPending || updateCell.isPending || createSC.isPending || updateSC.isPending || createPcf.isPending || updatePcf.isPending;
  const isDeleting = deleteCell.isPending || deleteSC.isPending || deletePcf.isPending;

  const handleDelete = () => {
    if (!deleteTarget || !deleteReason) return;
    const { type, id } = deleteTarget;
    const data = { reason: deleteReason };
    if (type === "cell") deleteCell.mutate({ id, data });
    if (type === "senior_cell") deleteSC.mutate({ id, data });
    if (type === "pcf") deletePcf.mutate({ id, data });
  };

  const openEdit = (t: EditTarget) => { setEditTarget(t); setDialogMode(t.type); };
  const openDelete = (t: any) => { setDeleteTarget(t); setDeleteReason(""); };

  const pcfs = (data as any)?.pcfs ?? [];
  const standaloneSCs = (data as any)?.standaloneSeniorCells ?? [];
  const standaloneCells = (data as any)?.standaloneCells ?? [];

  const allCells: any[] = allCellsData ?? [];
  const allSCs: any[] = allSCsData ?? [];
  const scMap = new Map(allSCs.map((sc: any) => [sc.id, sc]));

  const totalCells = allCells.length;
  const totalSCs = allSCs.length;
  const totalPcfs = pcfs.length;
  const totalMembers = allCells.reduce((a: number, c: any) => a + (c.memberCount ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fellowship</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalPcfs} PCF{totalPcfs !== 1 ? "s" : ""} · {totalSCs} Senior Cells · {totalCells} Cells · {totalMembers} members
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50"
            onClick={() => exportFellowshipToExcel(data, toast)}>
            <Download className="w-3.5 h-3.5 mr-1" /> Export Excel
          </Button>
          {canManage && (
            <>
              <Button size="sm" variant="outline" className="border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                onClick={() => { setEditTarget(undefined); setDialogMode("cell"); }}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Cell
              </Button>
              <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={() => { setEditTarget(undefined); setDialogMode("senior_cell"); }}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Senior Cell
              </Button>
              <Button size="sm" className="bg-purple-700 hover:bg-purple-800 text-white"
                onClick={() => { setEditTarget(undefined); setDialogMode("pcf"); }}>
                <Plus className="w-3.5 h-3.5 mr-1" /> PCF
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="hierarchy">
        <div className="overflow-x-auto w-full pb-px">
          <TabsList className="bg-gray-100 h-9 w-max">
            <TabsTrigger value="hierarchy" className="text-xs data-[state=active]:bg-purple-700 data-[state=active]:text-white">
              Fellowships
            </TabsTrigger>
            <TabsTrigger value="cells" className="text-xs data-[state=active]:bg-purple-700 data-[state=active]:text-white">
              Cells ({totalCells})
            </TabsTrigger>
            <TabsTrigger value="senior-cells" className="text-xs data-[state=active]:bg-purple-700 data-[state=active]:text-white">
              Senior Cells ({totalSCs})
            </TabsTrigger>
            <TabsTrigger value="pcfs" className="text-xs data-[state=active]:bg-purple-700 data-[state=active]:text-white">
              PCFs ({totalPcfs})
            </TabsTrigger>
            <TabsTrigger value="leaders" className="text-xs data-[state=active]:bg-purple-700 data-[state=active]:text-white">
              <Users className="w-3 h-3 mr-1" /> Leaders
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── CELLS TABLE ── */}
        <TabsContent value="cells" className="mt-4">
          {isLoading ? <Skeleton className="h-48 w-full" /> : (
            <div className="border rounded-lg overflow-hidden bg-white max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-gray-50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>Cell Name</TableHead>
                    <TableHead>Senior Cell</TableHead>
                    <TableHead>PCF</TableHead>
                    <TableHead>Leader</TableHead>
                    <TableHead className="text-right">Members</TableHead>
                    {canManage && <TableHead className="w-16" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allCells.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-gray-400">
                        <Network className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        No cells yet. Create your first cell.
                      </TableCell>
                    </TableRow>
                  )}
                  {allCells.map((c: any, idx: number) => {
                    const sc = c.seniorCellId ? scMap.get(c.seniorCellId) : null;
                    return (
                      <TableRow key={c.id} className="group">
                        <TableCell className="text-center text-xs text-gray-400 font-mono">{idx + 1}</TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
                            {c.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          {c.seniorCellName
                            ? <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-100">{c.seniorCellName}</Badge>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </TableCell>
                        <TableCell>
                          {sc?.pcfName
                            ? <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-100">{sc.pcfName}</Badge>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </TableCell>
                        <TableCell>
                          {c.leaderName
                            ? <span className="text-sm text-gray-700">{c.leaderName}</span>
                            : <span className="inline-flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 rounded-full"><AlertTriangle className="w-3 h-3" /> None</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <button type="button"
                            onClick={() => setMemberViewTarget({ type: "cell", id: c.id, name: c.name, count: c.memberCount ?? 0 })}
                            className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full hover:bg-green-100 transition-colors cursor-pointer">
                            <Users className="w-3 h-3" />{c.memberCount ?? 0}
                          </button>
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-purple-600"
                                onClick={() => openEdit({ type: "cell", id: c.id, name: c.name, leaderId: c.leaderId, leaderName: c.leaderName })}>
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                                onClick={() => openDelete({ type: "cell", id: c.id, name: c.name })}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── SENIOR CELLS TABLE ── */}
        <TabsContent value="senior-cells" className="mt-4">
          {isLoading ? <Skeleton className="h-48 w-full" /> : (
            <div className="border rounded-lg overflow-hidden bg-white max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-gray-50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>Senior Cell Name</TableHead>
                    <TableHead>PCF</TableHead>
                    <TableHead>Leader</TableHead>
                    <TableHead className="text-right">Cells</TableHead>
                    <TableHead className="text-right">Members</TableHead>
                    {canManage && <TableHead className="w-16" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allSCs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-gray-400">
                        <Network className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        No senior cells yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {allSCs.map((sc: any, idx: number) => (
                    <TableRow key={sc.id} className="group">
                      <TableCell className="text-center text-xs text-gray-400 font-mono">{idx + 1}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                          {sc.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        {sc.pcfName
                          ? <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-100">{sc.pcfName}</Badge>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </TableCell>
                      <TableCell>
                        {sc.leaderName
                          ? <span className="text-sm text-gray-700">{sc.leaderName}</span>
                          : <span className="inline-flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 rounded-full"><AlertTriangle className="w-3 h-3" /> None</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm text-gray-600">{sc.cellCount ?? 0}</TableCell>
                      <TableCell className="text-right">
                        <button type="button"
                          onClick={() => setMemberViewTarget({ type: "sc", id: sc.id, name: sc.name, count: sc.memberCount ?? 0 })}
                          className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full hover:bg-green-100 transition-colors cursor-pointer">
                          <Users className="w-3 h-3" />{sc.memberCount ?? 0}
                        </button>
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-purple-600"
                              onClick={() => openEdit({ type: "senior_cell", id: sc.id, name: sc.name, leaderId: sc.leaderId, leaderName: sc.leaderName })}>
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                              onClick={() => openDelete({ type: "senior_cell", id: sc.id, name: sc.name })}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── PCFS TABLE ── */}
        <TabsContent value="pcfs" className="mt-4">
          {isLoading ? <Skeleton className="h-48 w-full" /> : (
            <div className="border rounded-lg overflow-hidden bg-white max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-gray-50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>PCF Name</TableHead>
                    <TableHead>Leader</TableHead>
                    <TableHead className="text-right">Senior Cells</TableHead>
                    <TableHead className="text-right">Members</TableHead>
                    {canManage && <TableHead className="w-16" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pcfs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-gray-400">
                        <Network className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        No PCFs yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {pcfs.map((pcf: any, idx: number) => (
                    <TableRow key={pcf.id} className="group">
                      <TableCell className="text-center text-xs text-gray-400 font-mono">{idx + 1}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
                          {pcf.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        {pcf.leaderName
                          ? <span className="text-sm text-gray-700">{pcf.leaderName}</span>
                          : <span className="inline-flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 rounded-full"><AlertTriangle className="w-3 h-3" /> None</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm text-gray-600">{pcf.seniorCellCount ?? 0}</TableCell>
                      <TableCell className="text-right">
                        <button type="button"
                          onClick={() => setMemberViewTarget({ type: "pcf", id: pcf.id, name: pcf.name, count: pcf.memberCount ?? 0 })}
                          className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full hover:bg-green-100 transition-colors cursor-pointer">
                          <Users className="w-3 h-3" />{pcf.memberCount ?? 0}
                        </button>
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-purple-600"
                              onClick={() => openEdit({ type: "pcf", id: pcf.id, name: pcf.name, leaderId: pcf.leaderId, leaderName: pcf.leaderName })}>
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                              onClick={() => openDelete({ type: "pcf", id: pcf.id, name: pcf.name })}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── LEADERS ── */}
        <TabsContent value="leaders">
          <LeadersReport />
        </TabsContent>

        {/* ── FELLOWSHIPS TREE ── */}
        <TabsContent value="hierarchy" className="mt-4">
          {isLoading ? (
            <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
          ) : (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {(() => {
                let num = 0;
                const viewMembers: OnViewMembers = (type, id, name, count) => setMemberViewTarget({ type, id, name, count });
                return [
                  ...pcfs.map((pcf: any) => {
                    num++;
                    return <PcfCard key={pcf.id} pcf={pcf} canManage={canManage} onEdit={openEdit} onDelete={openDelete} fellowshipNum={num} onViewMembers={viewMembers} />;
                  }),
                  ...standaloneSCs.map((sc: any) => {
                    num++;
                    return <SeniorCellCard key={sc.id} sc={sc} canManage={canManage} onEdit={openEdit} onDelete={openDelete} fellowshipNum={num} onViewMembers={viewMembers} />;
                  }),
                  ...standaloneCells.map((c: any) => {
                    num++;
                    return <CellCard key={c.id} cell={c} canManage={canManage} onEdit={openEdit} onDelete={openDelete} fellowshipNum={num} onViewMembers={viewMembers} />;
                  }),
                ];
              })()}

              {pcfs.length === 0 && standaloneSCs.length === 0 && standaloneCells.length === 0 && (
                <div className="text-center py-16 text-gray-400">
                  <Network className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No fellowship structure yet</p>
                  <p className="text-sm mt-1">Start by adding your first cell</p>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {dialogMode && (
        <FellowshipDialog
          mode={dialogMode}
          editTarget={editTarget}
          cells={allCells}
          seniorCells={allSCs}
          onClose={() => { setDialogMode(null); setEditTarget(undefined); }}
          onSave={handleSave}
          saving={isSaving}
        />
      )}

      {deleteTarget && (
        <DeleteDialog
          label={deleteTarget.name}
          reason={deleteReason}
          setReason={setDeleteReason}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
          loading={isDeleting}
        />
      )}

      {memberViewTarget && (
        <MemberViewDialog target={memberViewTarget} onClose={() => setMemberViewTarget(null)} />
      )}
    </div>
  );
}
