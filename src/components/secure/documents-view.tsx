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
import { riskColor, riskLabel, formatRelativeTime, formatBytes, truncate } from "@/lib/display";
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
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">Documents <span className="font-normal text-muted-foreground">· {filtered.length}/{docs.length}</span></h3>
            <p className="text-xs text-muted-foreground">Click a row to inspect</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="h-9 pl-8" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={filterClass} onValueChange={setFilterClass}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Classification" /></SelectTrigger>
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
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
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
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Newest</SelectItem>
              <SelectItem value="risk">Highest risk</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
          {(query || filterClass !== "all" || filterStatus !== "all") && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setQuery(""); setFilterClass("all"); setFilterStatus("all"); }}>Clear</Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed bg-muted/30">
            <Inbox className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground">{docs.length === 0 ? "No documents ingested" : "No matching documents"}</p>
          <p className="max-w-[44ch] text-xs leading-relaxed text-muted-foreground">
            {docs.length === 0
              ? "Ingest a document to collect information. Documents will appear here after you process them through the full pipeline — scan, sanitize, and transform — with genuine risk and classification results."
              : "No documents match your filters. Adjust filters or clear to see all ingested documents."}
          </p>
          {docs.length === 0 ? (
            <div className="flex flex-col items-center gap-2">
              <Button size="sm" onClick={() => setView("upload")}>Ingest document</Button>
              <span className="text-[11px] text-muted-foreground">No mock data is shown until you process a document manually.</span>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => { setQuery(""); setFilterClass("all"); setFilterStatus("all"); }}>Clear filters</Button>
          )}
        </div>
      ) : (
        <div className="max-h-[calc(100vh-300px)] overflow-auto scroll-thin">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/60 backdrop-blur-sm z-10">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[40%]">Document</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right"><span className="inline-flex items-center gap-1">Risk <ArrowUpDown className="h-3 w-3 opacity-50" /></span></TableHead>
                <TableHead className="text-right hidden md:table-cell">Size</TableHead>
                <TableHead className="text-right hidden lg:table-cell">Added</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => (
                <TableRow key={d.id} className="cursor-pointer" onClick={() => openDocument(d.id)}>
                  <TableCell>
                    <div className="font-medium leading-tight">{d.title}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{truncate(d.filename, 48)}</div>
                  </TableCell>
                  <TableCell><ClassificationBadge value={d.classification} /></TableCell>
                  <TableCell><StatusBadge status={d.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block"><div className="h-full rounded-full" style={{ width: `${d.riskScore}%`, backgroundColor: riskColor(d.riskScore) }} /></div>
                      <span className="font-mono text-xs tabular-nums" style={{ color: riskColor(d.riskScore) }}>{d.riskScore}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right hidden md:table-cell font-mono text-xs text-muted-foreground">{formatBytes(d.sizeBytes)}</TableCell>
                  <TableCell className="text-right hidden lg:table-cell text-xs text-muted-foreground">{formatRelativeTime(d.createdAt)}</TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={(e) => e.stopPropagation()} aria-label={`Delete ${d.title}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader><AlertDialogTitle>Delete document?</AlertDialogTitle><AlertDialogDescription>Remove "{d.title}" and associated findings. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(d.id, d.title)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
