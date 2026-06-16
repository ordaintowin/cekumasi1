import { useState } from "react";
import {
  useListArchivedMembers, getListArchivedMembersQueryKey,
  useRestoreArchivedMember, usePermanentDeleteMember,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, RotateCcw, Archive, ChevronLeft, ChevronRight, Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Archives() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);

  const { data, isLoading } = useListArchivedMembers(
    { search, page, limit: 25 },
    { query: { queryKey: getListArchivedMembersQueryKey({ search, page, limit: 25 }) } }
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/archives/members"] });

  const restore = useRestoreArchivedMember({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Member restored to active status" }); },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const permanentDelete = usePermanentDeleteMember({
    mutation: {
      onSuccess: () => {
        invalidate();
        setConfirmDelete(null);
        toast({ title: "Member permanently deleted", description: "All records have been removed from the database." });
      },
      onError: (e: any) => {
        setConfirmDelete(null);
        toast({ title: "Error", description: e?.message, variant: "destructive" });
      },
    },
  });

  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 25);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Archives</h1>
        <p className="text-sm text-gray-500 mt-1">{total} archived member{total !== 1 ? "s" : ""} — transferred, deceased, or removed</p>
      </div>

      <div className="flex items-center gap-2 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search archived members..." className="pl-9"
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden bg-white">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Archived</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : (data?.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-16 text-gray-400">
                  <Archive className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>No archived records found</p>
                </TableCell>
              </TableRow>
            ) : (
              (data?.data ?? []).map((m: any) => (
                <TableRow key={m.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium text-gray-700">{m.firstName} {m.lastName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-gray-50 text-gray-600 capitalize">{m.memberType}</Badge>
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">{m.reason || "—"}</TableCell>
                  <TableCell className="text-gray-400 text-sm">
                    {m.deletedAt ? new Date(m.deletedAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-200 hover:bg-green-50 h-7 text-xs"
                        onClick={() => restore.mutate({ id: m.id, data: { reason: "Restored by admin" } })}
                        disabled={restore.isPending}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" /> Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50 h-7 text-xs"
                        onClick={() => setConfirmDelete({ id: m.id, name: `${m.firstName} ${m.lastName}` })}
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> Delete Forever
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

      {/* ── Permanent Delete Confirmation Dialog ──────────────────────────── */}
      <Dialog open={!!confirmDelete} onOpenChange={open => { if (!open) setConfirmDelete(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Permanently Delete Member?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-gray-700">
              You are about to permanently delete{" "}
              <strong>{confirmDelete?.name}</strong> from the database.
            </p>
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 space-y-1">
              <p className="font-semibold">This will erase:</p>
              <ul className="list-disc list-inside space-y-0.5 text-red-600">
                <li>The member profile and login account</li>
                <li>All attendance records</li>
                <li>All giving records</li>
                <li>Department and leadership roles</li>
                <li>Family links</li>
              </ul>
              <p className="font-semibold mt-2">This cannot be undone.</p>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmDelete(null)}
                disabled={permanentDelete.isPending}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={() => confirmDelete && permanentDelete.mutate({ id: confirmDelete.id })}
                disabled={permanentDelete.isPending}
              >
                {permanentDelete.isPending ? "Deleting…" : "Yes, Delete Forever"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
