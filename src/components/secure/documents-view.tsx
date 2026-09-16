"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Trash2, Loader2, Inbox, Filter, ArrowUpDown } from "lucide-react";
import { api } from "@/lib/api-client";
import { useApp } from "@/lib/store";
import type { DocumentRecord } from "@/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClassificationBadge, StatusBadge } from "@/components/secure/badges";
import { riskColor, formatRelativeTime, formatBytes, truncate } from "@/lib/display";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function DocumentsView() {
  const { refreshKey, openDocument, bumpRefresh, setView } = useApp();
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"recent" | "risk" | "name">("recent");

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.listDocuments()
      .then((d) => active && setDocs(d))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    let out = docs.filter((d) => {
      const q = query.trim().toLowerCase();
      const matchesQuery = !q || d.title.toLowerCase().includes(q) || d.classification.toLowerCase().includes(q) || d.filename.toLowerCase().includes(q);
      const matchesClass = filterClass === "all" || d.classification === filterClass;
      const matchesStatus = filterStatus === "all" || d.status === filterStatus;
      return matchesQuery && matchesClass && matchesStatus;
    });
    if (sortBy === "risk") out = [...out].sort((a, b) => b.riskScore - a.riskScore);
    else if (sortBy === "name") out = [...out].sort((a, b) => a.title.localeCompare(b.title));
    else out = [...out].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return out;
  }, [docs, query, filterClass, filterStatus, sortBy]);

  async function remove(id: string, title: string) {
    try {
      await api.deleteDocument(id);
      toast.success(`Removed "${title}"`);
      bumpRefresh();
    } catch (e: any) {
      toast.error("Delete failed", { description: e.message });
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Documents <span className="ml-2 rounded-full bg-muted px-2 py-0.5 font-mono text-xs font-medium text-muted-foreground">{filtered.length}/{docs.length}</span></h3>
            <p className="mt-1 text-xs text-muted-foreground">Click a row to inspect findings and transformations</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, file, classification" className="h-8 pl-8 text-xs bg-muted/40 border-border focus:bg-card" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"><Filter className="h-3 w-3" /> Filters</span>
          <Select value={filterClass} onValueChange={setFilterClass}>
            <SelectTrigger className="h-7 w-[148px] text-xs bg-card"><SelectValue placeholder="Classification" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classifications</SelectItem>
              <SelectItem value="RESTRICTED">Restricted</SelectItem>
              <SelectItem value="CONFIDENTIAL">Confidential</SelectItem>
              <SelectItem value="INTERNAL">Internal</SelectItem>
              <SelectItem value="PUBLIC">Public</SelectItem>
              <SelectItem value="UNCLASSIFIED">Unclassified</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-7 w-[132px] text-xs bg-card"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="SCANNED">Scanned</SelectItem>
              <SelectItem value="SANITIZED">Sanitized</SelectItem>
              <SelectItem value="TRANSFORMED">Transformed</SelectItem>
              <SelectItem value="BLOCKED">Blocked</SelectItem>
              <SelectItem value="UPLOADED">Uploaded</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="h-7 w-[122px] text-xs bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Newest</SelectItem>
              <SelectItem value="risk">Highest risk</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
            </SelectContent>
          </Select>
          {(query || filterClass !== "all" || filterStatus !== "all") && (
            <Button variant="ghost" size="sm" className="h-7 text-xs rounded-md" onClick={() => { setQuery(""); setFilterClass("all"); setFilterStatus("all"); }}>Clear</Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading inventory…</div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border bg-muted">
            <Inbox className="h-5 w-5 text-muted-foreground/70" />
          </div>
          <p className="text-sm font-semibold tracking-tight">{docs.length === 0 ? "No documents ingested" : "No matching documents"}</p>
          <p className="max-w-[44ch] text-xs leading-relaxed text-muted-foreground">
            {docs.length === 0
              ? "Ingest a document to populate this inventory. Documents appear here after scan/sanitize/transform with genuine risk and classification."
              : "No documents match your filters. Adjust or clear filters to see all items."}
          </p>
          {docs.length === 0 ? (
            <Button size="sm" className="mt-1" onClick={() => setView("upload")}>Ingest document</Button>
          ) : (
            <Button variant="outline" size="sm" className="mt-1" onClick={() => { setQuery(""); setFilterClass("all"); setFilterStatus("all"); }}>Clear filters</Button>
          )}
        </div>
      ) : (
        <div className="overflow-auto scroll-thin max-h-[70vh]">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/40 backdrop-blur-md z-10 border-b">
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="w-[42%] text-xs font-semibold tracking-wide">Document</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide">Classification</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide">Status</TableHead>
                <TableHead className="text-right text-xs font-semibold tracking-wide"><span className="inline-flex items-center gap-1">Risk <ArrowUpDown className="h-3 w-3 opacity-40" /></span></TableHead>
                <TableHead className="text-right hidden md:table-cell text-xs">Size</TableHead>
                <TableHead className="text-right hidden lg:table-cell text-xs">Added</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => (
                <TableRow key={d.id} className="cursor-pointer group hover:bg-muted/40 transition-colors" onClick={() => openDocument(d.id)}>
                  <TableCell className="py-3">
                    <div className="font-medium leading-tight tracking-tight text-sm">{d.title}</div>
                    <div className="font-mono text-[11px] text-muted-foreground truncate max-w-[320px]">{truncate(d.filename, 48)}</div>
                  </TableCell>
                  <TableCell className="py-3"><ClassificationBadge value={d.classification} /></TableCell>
                  <TableCell className="py-3"><StatusBadge status={d.status} /></TableCell>
                  <TableCell className="text-right py-3">
                    <div className="inline-flex items-center gap-2.5">
                      <div className="hidden h-1.5 w-[72px] overflow-hidden rounded-full bg-muted sm:block"><div className="h-full rounded-full" style={{ width: `${d.riskScore}%`, backgroundColor: riskColor(d.riskScore) }} /></div>
                      <span className="font-mono text-xs tabular-nums font-medium" style={{ color: riskColor(d.riskScore) }}>{d.riskScore}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right hidden md:table-cell font-mono text-xs text-muted-foreground py-3">{formatBytes(d.sizeBytes)}</TableCell>
                  <TableCell className="text-right hidden lg:table-cell text-xs text-muted-foreground py-3">{formatRelativeTime(d.createdAt)}</TableCell>
                  <TableCell className="py-3">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/60 hover:text-destructive opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()} aria-label={`Delete ${d.title}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader><AlertDialogTitle>Delete document?</AlertDialogTitle><AlertDialogDescription>Remove “{d.title}” and associated findings. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(d.id, d.title)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
            <span>{filtered.length} documents · {docs.filter(d=>d.status==="TRANSFORMED").length} transformed</span>
            <span className="hidden sm:inline">Click a row to inspect · ⌘K to jump</span>
          </div>
        </div>
      )}
    </Card>
  );
}
