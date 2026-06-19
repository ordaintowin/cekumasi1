import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Trash2, RefreshCw, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const getToken = () => typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;

const TYPE_COLORS: Record<string, string> = {
  member_added:       "bg-green-100 text-green-700 border-green-200",
  member_updated:     "bg-blue-100 text-blue-700 border-blue-200",
  member_archived:    "bg-orange-100 text-orange-700 border-orange-200",
  member_restored:    "bg-teal-100 text-teal-700 border-teal-200",
  attendance:         "bg-purple-100 text-purple-700 border-purple-200",
  finance:            "bg-yellow-100 text-yellow-700 border-yellow-200",
  login:              "bg-gray-100 text-gray-700 border-gray-200",
  settings:           "bg-red-100 text-red-700 border-red-200",
  announcement:       "bg-indigo-100 text-indigo-700 border-indigo-200",
};

function typeBadgeClass(type: string) {
  return TYPE_COLORS[type] ?? "bg-gray-100 text-gray-600 border-gray-200";
}

function formatDate(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminLogs() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const fetchLogs = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200", offset: "0" });
      if (q) params.set("search", q);
      const res = await fetch(`/api/admin/activity-log?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Failed to load logs");
      setLogs(await res.json());
    } catch (err: any) {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchLogs(search); }, [search, fetchLogs]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this log entry?")) return;
    try {
      const res = await fetch(`/api/admin/activity-log/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Failed to delete");
      setLogs(l => l.filter(x => x.id !== id));
      toast({ title: "Log entry deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-purple-700" />
            Admin Activity Log
          </h1>
          <p className="text-sm text-gray-500 mt-1">Full audit trail of admin actions in the system</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchLogs(search)} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by description, type or member name..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
              />
            </div>
            <Button type="submit" className="bg-purple-700 text-white hover:bg-purple-800">Search</Button>
            {search && (
              <Button type="button" variant="outline" onClick={() => { setSearch(""); setSearchInput(""); }}>
                Clear
              </Button>
            )}
          </form>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{search ? "No logs match your search." : "No activity logged yet."}</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="w-[120px]">Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[150px]">Member</TableHead>
                  <TableHead className="w-[160px]">Date & Time</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => (
                  <TableRow key={log.id} className="hover:bg-gray-50 align-top">
                    <TableCell className="pt-3">
                      <Badge variant="outline" className={`text-xs whitespace-nowrap ${typeBadgeClass(log.type)}`}>
                        {log.type.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-700 py-3">{log.description}</TableCell>
                    <TableCell className="text-sm text-gray-500 py-3">{log.memberName ?? "—"}</TableCell>
                    <TableCell className="text-xs text-gray-400 py-3 whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </TableCell>
                    <TableCell className="py-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-600 h-7 w-7 p-0"
                        onClick={() => handleDelete(log.id)}
                        title="Delete entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!loading && logs.length > 0 && (
            <p className="text-xs text-gray-400 mt-3 text-right">{logs.length} entr{logs.length === 1 ? "y" : "ies"} shown</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
