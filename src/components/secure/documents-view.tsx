"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, Trash2, Loader2, Inbox } from "lucide-react";
import { api } from "@/lib/api-client";
import { useApp } from "@/lib/store";
import type { DocumentRecord } from "@/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ClassificationBadge, StatusBadge,
} from "@/components/secure/badges";
import {
  riskColor, riskLabel, formatRelativeTime, formatBytes, truncate,
} from "@/lib/display";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function DocumentsView() {
  const { refreshKey, openDocument, bumpRefresh } = useApp();
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    api.listDocuments()
      .then((d) => active && setDocs(d))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [refreshKey]);

  const filtered = docs.filter((d) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return d.title.toLowerCase().includes(q) || d.classification.toLowerCase().includes(q) || d.filename.toLowerCase().includes(q);
  });

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
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Ingested documents</h3>
          <p className="text-xs text-muted-foreground">{docs.length} total · sorted by most recent</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title, classification or filename…"
            className="h-9 pl-8"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Inbox className="h-6 w-6 opacity-50" />
          <p className="text-sm">{docs.length === 0 ? "No documents yet." : "No matches for your filter."}</p>
        </div>
      ) : (
        <div className="max-h-[calc(100vh-260px)] overflow-auto scroll-thin">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[40%]">Document</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Risk</TableHead>
                <TableHead className="text-right hidden md:table-cell">Size</TableHead>
                <TableHead className="text-right hidden lg:table-cell">Ingested</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => (
                <TableRow
                  key={d.id}
                  className="cursor-pointer"
                  onClick={() => openDocument(d.id)}
                >
                  <TableCell>
                    <div className="font-medium leading-tight">{d.title}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{truncate(d.filename, 48)}</div>
                  </TableCell>
                  <TableCell><ClassificationBadge value={d.classification} /></TableCell>
                  <TableCell><StatusBadge status={d.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block">
                        <div className="h-full rounded-full" style={{ width: `${d.riskScore}%`, backgroundColor: riskColor(d.riskScore) }} />
                      </div>
                      <span className="font-mono text-xs tabular-numnums" style={{ color: riskColor(d.riskScore) }}>
                        {d.riskScore}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right hidden md:table-cell font-mono text-xs text-muted-foreground">
                    {formatBytes(d.sizeBytes)}
                  </TableCell>
                  <TableCell className="text-right hidden lg:table-cell text-xs text-muted-foreground">
                    {formatRelativeTime(d.createdAt)}
                  </TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this document?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes "{d.title}" and all of its findings, transformations
                            and audit entries. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => remove(d.id, d.title)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
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
