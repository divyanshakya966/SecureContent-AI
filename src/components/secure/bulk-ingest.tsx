"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Layers, Loader2, UploadCloud, X, Play, Square, RotateCcw, ArrowRight } from "lucide-react";
import { api } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { documentPath } from "@/lib/nav";
import type { BulkItemStatus, OutputType, PolicyRule } from "@/types";
import { OUTPUT_LABELS, policyDisplayName } from "@/lib/security/policies";
import { formatBytes } from "@/lib/display";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpButton } from "@/components/secure/help-button";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.docx,.pptx,.txt,.md,.csv,.json,.html,.png,.jpg,.jpeg,.webp,.svg,.mp4,.mov,.webm,.avi,.mp3,.wav,.ogg,text/*,image/*,video/*,audio/*";
const MAX_FILES = 20;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

interface BulkRow {
  key: string;
  filename: string;
  size: number;
  status: BulkItemStatus;
  detail?: string;
  documentId?: string;
}

const STATUS_STYLE: Record<BulkItemStatus, string> = {
  pending: "bg-muted text-muted-foreground border-border",
  uploading: "bg-primary/10 text-primary border-primary/30",
  ingested: "bg-[var(--risk-low)]/10 text-[var(--risk-low)] border-[var(--risk-low)]/30",
  pipelined: "bg-[var(--risk-safe)]/10 text-[var(--risk-safe)] border-[var(--risk-safe)]/30",
  skipped: "bg-muted text-muted-foreground border-border",
  blocked: "bg-[var(--risk-critical)]/10 text-[var(--risk-critical)] border-[var(--risk-critical)]/30",
  "pipeline-failed": "bg-[var(--risk-high)]/10 text-[var(--risk-high)] border-[var(--risk-high)]/30",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const TERMINAL: BulkItemStatus[] = ["ingested", "pipelined", "skipped", "blocked", "pipeline-failed", "failed", "cancelled"];

function rowKey(f: File): string {
  return `${f.name}-${f.size}-${f.lastModified}`;
}

export function BulkIngest() {
  const { bumpRefresh } = useApp();
  const router = useRouter();
  const openDocument = (id: string) => router.push(documentPath(id));
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [policies, setPolicies] = useState<PolicyRule[] | null>(null);
  const [policy, setPolicy] = useState("PUBLIC_RELEASE");
  const [outputTypes, setOutputTypes] = useState<OutputType[]>(["EXECUTIVE_SUMMARY"]);
  const [tone, setTone] = useState("professional");
  const [language, setLanguage] = useState("en");
  const [detailLevel, setDetailLevel] = useState("standard");
  const [objective, setObjective] = useState("inform");
  const [style, setStyle] = useState("structured");
  const [runPipeline, setRunPipeline] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [stopOnError, setStopOnError] = useState(false);
  const [concurrency, setConcurrency] = useState("3");

  useEffect(() => {
    api.getPolicies().then((ps) => setPolicies(ps.filter((p) => p.active))).catch(() => setPolicies(null));
  }, []);

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    if (!incoming.length) return;
    setFinished(false);
    setFiles((prev) => {
      const seen = new Set(prev.map(rowKey));
      const fresh = incoming.filter((f) => !seen.has(rowKey(f)));
      const merged = [...prev, ...fresh].slice(0, MAX_FILES);
      if (prev.length + fresh.length > MAX_FILES) {
        toast.warning(`Capped at ${MAX_FILES} files per batch`, { description: "Run another batch for the rest." });
      }
      return merged;
    });
  }

  const totalBytes = files.reduce((s, f) => s + f.size, 0);

  const displayRows: BulkRow[] = files.map(
    (f) => rows.find((r) => r.key === rowKey(f)) ?? { key: rowKey(f), filename: f.name, size: f.size, status: "pending" as BulkItemStatus }
  );
  const doneCount = displayRows.filter((r) => TERMINAL.includes(r.status)).length;

  async function start() {
    if (!files.length || running) return;
    if (files.length > MAX_FILES) {
      toast.error(`Too many files (max ${MAX_FILES} per batch).`);
      return;
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      toast.error("Batch too large", { description: `Total ${(totalBytes / 1024 / 1024).toFixed(1)} MB exceeds the 100 MB batch cap. Split into smaller batches.` });
      return;
    }
    if (runPipeline && !outputTypes.length) {
      toast.error("Pick at least one output type for the auto pipeline.");
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    setFinished(false);
    setRows(files.map((f) => ({ key: rowKey(f), filename: f.name, size: f.size, status: "uploading" as BulkItemStatus })));

    try {
      const form = new FormData();
      for (const f of files) form.append("files", f, f.name);
      form.append("policy", policy);
      form.append("runPipeline", String(runPipeline));
      form.append("skipDuplicates", String(skipDuplicates));
      form.append("stopOnError", String(stopOnError));
      form.append("concurrency", concurrency);
      if (runPipeline) {
        form.append("outputTypes", JSON.stringify(outputTypes));
        form.append("tone", tone);
        form.append("language", language);
        form.append("detailLevel", detailLevel);
        form.append("objective", objective);
        form.append("style", style);
      }
      const res = await api.ingestBatch(form, ctrl.signal);
      setRows((prev) =>
        prev.map((row, i) => {
          const r = res.results[i];
          if (!r) return row;
          const detail =
            r.status === "pipelined"
              ? `${r.transformations ?? 0} artefact(s)${r.transformationErrors?.length ? ` · ${r.transformationErrors.length} failed` : ""} · risk ${r.risk ?? "—"}`
              : r.status === "ingested"
                ? `risk ${r.risk ?? "—"} · ${r.classification ?? ""}`
                : r.error ?? r.status;
          return { ...row, status: r.status, detail, documentId: r.documentId };
        })
      );
      setFinished(true);
      bumpRefresh();
      const s = res.summary;
      if (s.failed > 0 || s.blocked > 0) {
        toast.warning(`Batch finished with issues`, { description: `${s.pipelined + s.ingested} ok · ${s.skipped} skipped · ${s.blocked} blocked · ${s.failed} failed · ${s.cancelled} cancelled` });
      } else {
        toast.success(`Batch complete`, { description: `${s.pipelined + s.ingested} processed · ${s.skipped} duplicates skipped` });
      }
    } catch (e: any) {
      if (ctrl.signal.aborted) {
        setRows((prev) => prev.map((r) => (TERMINAL.includes(r.status) ? r : { ...r, status: "cancelled" as BulkItemStatus, detail: "Stopped — files already processed are kept. Check inventory." })));
        setFinished(true);
        bumpRefresh();
        toast.warning("Bulk run stopped", { description: "Finished files were kept — check inventory." });
      } else {
        setRows((prev) => prev.map((r) => (TERMINAL.includes(r.status) ? r : { ...r, status: "failed" as BulkItemStatus, detail: e.message })));
        toast.error("Bulk ingest failed", { description: e.message });
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function clearFinished() {
    const remaining = files.filter((f) => {
      const row = rows.find((r) => r.key === rowKey(f));
      return !row || !TERMINAL.includes(row.status);
    });
    setFiles(remaining);
    setRows((prev) => prev.filter((r) => !TERMINAL.includes(r.status)));
    if (!remaining.length) setFinished(false);
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-tight flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-muted-foreground" />
            Bulk ingest
            <HelpButton title="Bulk ingest for teams">
              Drop up to {MAX_FILES} files (100 MB total) and process them in one server-orchestrated run. Each file is parsed, scanned, and deduplicated on its own; optionally the full auto pipeline (sanitize → transform → validate) runs per file. One bad file never sinks the batch — every file reports its own outcome below.
            </HelpButton>
          </div>
          <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
            Many files at once — each parsed, scanned, and optionally pipelined with per-file results.
          </p>
        </div>
        {rows.length > 0 && (
          <span className="hidden sm:inline-flex rounded-full border bg-muted px-2.5 py-1 font-mono text-[11px] tabular-nums text-muted-foreground shrink-0">
            {doneCount}/{displayRows.length} done
          </span>
        )}
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Drop files or click to browse"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "mt-4 flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          dragging ? "border-primary bg-primary/[0.04] shadow-sm" : "border-border bg-muted/20 hover:border-primary/30 hover:bg-card"
        )}
      >
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.currentTarget.value = ""; }} />
        <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-card shadow-sm">
          {running ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <UploadCloud className="h-5 w-5 text-muted-foreground" />}
        </div>
        <p className="mt-3 text-sm font-medium tracking-tight">{running ? "Processing batch on server…" : "Drop up to 20 files here or click to browse"}</p>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          {files.length ? `${files.length} queued · ${(totalBytes / 1024 / 1024).toFixed(1)} MB / 100 MB` : "PDF · DOCX · PPTX · Images · Video/Audio · TXT · CSV · JSON"}
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4 min-w-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <Label className="text-xs font-medium">Policy</Label>
              <Select value={policy} onValueChange={setPolicy} disabled={running}>
                <SelectTrigger className="mt-1.5 h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(policies ?? []).map((p) => <SelectItem key={p.id} value={p.name}>{policyDisplayName(p.name)}</SelectItem>)}
                  {policies && !policies.some((p) => p.name === policy) && <SelectItem value={policy}>{policyDisplayName(policy)}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium">Concurrency</Label>
              <Select value={concurrency} onValueChange={setConcurrency} disabled={running}>
                <SelectTrigger className="mt-1.5 h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 — sequential</SelectItem>
                  <SelectItem value="2">2 files at once</SelectItem>
                  <SelectItem value="3">3 files at once</SelectItem>
                  <SelectItem value="5">5 files at once</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs font-medium">Auto pipeline outputs</Label>
              <HelpButton title="Bulk auto pipeline">When on, every ingested file is sanitized with the policy above and transformed into each selected output (up to 8), then validated — the same chain as the single-document auto pipeline. Pipelines run file by file to stay within provider limits.</HelpButton>
            </div>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {Object.entries(OUTPUT_LABELS).map(([k, v]) => {
                const checked = outputTypes.includes(k as OutputType);
                return (
                  <label key={k} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-xs transition-colors", checked ? "border-primary/30 bg-primary/10" : "bg-card hover:bg-muted/50", (!runPipeline || running) && "opacity-60")}>
                    <input
                      type="checkbox" checked={checked} disabled={!runPipeline || running}
                      onChange={() => setOutputTypes((prev) => (prev.includes(k as OutputType) ? prev.filter((x) => x !== k) : [...prev, k as OutputType].slice(0, 8)))}
                      className="h-3.5 w-3.5 rounded border-input accent-primary"
                    />
                    <span className="font-medium">{v}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Tone", value: tone, set: setTone, opts: ["formal", "professional", "technical", "friendly", "persuasive", "neutral", "concise"] },
              { label: "Language", value: language, set: setLanguage, opts: ["en", "es", "fr", "de", "ja", "zh", "hi", "pt"] },
              { label: "Detail", value: detailLevel, set: setDetailLevel, opts: ["brief", "standard", "detailed", "comprehensive"] },
              { label: "Objective", value: objective, set: setObjective, opts: ["inform", "summarize", "persuade", "educate", "announce", "report", "analyze", "comply"] },
              { label: "Style", value: style, set: setStyle, opts: ["narrative", "bullet", "structured", "conversational", "formal", "executive", "creative"] },
            ].map((f) => (
              <div key={f.label} className="min-w-0">
                <Label className="text-xs font-medium">{f.label}</Label>
                <Select value={f.value} onValueChange={f.set} disabled={!runPipeline || running}>
                  <SelectTrigger className="mt-1.5 h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {f.opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2.5 rounded-lg border border-border bg-muted/20 p-3 h-fit lg:sticky lg:top-16">
          <div className="text-xs font-semibold">Run options</div>
          {[
            { label: "Auto pipeline", hint: "Sanitize → transform → validate per file", value: runPipeline, set: setRunPipeline },
            { label: "Skip duplicates", hint: "Already-ingested content is skipped", value: skipDuplicates, set: setSkipDuplicates },
            { label: "Stop on error", hint: "Halt the queue at the first failure", value: stopOnError, set: setStopOnError },
          ].map((o) => (
            <div key={o.label} className="flex items-center gap-2.5 rounded-md border border-border bg-card p-2.5">
              <Switch checked={o.value} onCheckedChange={o.set} disabled={running} aria-label={o.label} className="shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-medium">{o.label}</div>
                <div className="text-[11px] text-muted-foreground">{o.hint}</div>
              </div>
            </div>
          ))}
          <div className="flex flex-col gap-2 pt-1">
            {running ? (
              <Button variant="outline" size="sm" onClick={() => abortRef.current?.abort()} className="w-full gap-1.5">
                <Square className="h-3.5 w-3.5" /> Stop
              </Button>
            ) : (
              <Button size="sm" onClick={start} disabled={!files.length} className="w-full gap-1.5">
                <Play className="h-3.5 w-3.5" /> {runPipeline ? `Ingest + pipeline ${files.length} file${files.length !== 1 ? "s" : ""}` : `Ingest ${files.length} file${files.length !== 1 ? "s" : ""}`}
              </Button>
            )}
            {finished && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={clearFinished} className="flex-1 gap-1.5 text-xs">
                  <RotateCcw className="h-3.5 w-3.5" /> Clear done
                </Button>
                <Button variant="outline" size="sm" onClick={() => router.push("/documents")} className="flex-1 gap-1.5 text-xs">
                  Inventory <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {displayRows.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <div className="max-h-[320px] overflow-auto scroll-thin">
            <ul className="divide-y divide-border">
              {displayRows.map((row) => (
                <li key={row.key} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-medium" title={row.filename}>{row.filename}</span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">{formatBytes(row.size)}</span>
                    </div>
                    {row.detail && <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={row.detail}>{row.detail}</p>}
                  </div>
                  <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider", STATUS_STYLE[row.status])}>
                    {row.status === "uploading" && <Loader2 className="h-3 w-3 animate-spin" />}
                    {row.status.replace("-", " ")}
                  </span>
                  {row.documentId ? (
                    <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-2 text-xs" onClick={() => openDocument(row.documentId!)}>Open</Button>
                  ) : !running && row.status === "pending" ? (
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={`Remove ${row.filename}`} onClick={() => { setFiles((prev) => prev.filter((f) => rowKey(f) !== row.key)); setRows((prev) => prev.filter((r) => r.key !== row.key)); }}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          {displayRows.length > 1 && (
            <div className="border-t border-border bg-muted/20 px-3 py-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((doneCount / displayRows.length) * 100)}%` }} />
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
