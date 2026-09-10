"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { UploadCloud, FileText, Loader2, FlaskConical, ShieldX, KeyRound, Bug } from "lucide-react";
import { api } from "@/lib/api-client";
import { useApp } from "@/lib/store";
import type { SampleDocument } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const SAMPLE_ICON = {
  CLEAN: FileText,
  PII_HEAVY: ShieldX,
  SECRET_HEAVY: KeyRound,
  INJECTION: Bug,
  MIXED: FlaskConical,
} as const;

const SAMPLE_TONE: Record<SampleDocument["category"], string> = {
  CLEAN: "border-[var(--risk-low)]/40 bg-[var(--risk-low)]/5",
  PII_HEAVY: "border-[var(--risk-medium)]/40 bg-[var(--risk-medium)]/5",
  SECRET_HEAVY: "border-[var(--risk-high)]/40 bg-[var(--risk-high)]/5",
  INJECTION: "border-[var(--chart-5)]/40 bg-[var(--chart-5)]/5",
  MIXED: "border-[var(--risk-critical)]/40 bg-[var(--risk-critical)]/5",
};

export function UploadView() {
  const { openDocument, bumpRefresh } = useApp();
  const [samples, setSamples] = useState<SampleDocument[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteContent, setPasteContent] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getSamples().then(setSamples).catch(() => setSamples([]));
  }, []);

  async function handleFile(file: File) {
    setBusy(`upload:${file.name}`);
    try {
      const doc = await api.uploadFile(file);
      toast.success(`Ingested "${doc.title}"`, { description: `Risk ${doc.riskScore}/100 · ${doc.classification}` });
      bumpRefresh();
      openDocument(doc.id);
    } catch (e: any) {
      toast.error("Upload failed", { description: e.message });
    } finally {
      setBusy(null);
    }
  }

  async function handleSample(id: string, title: string) {
    setBusy(`sample:${id}`);
    try {
      const doc = await api.uploadSample(id);
      toast.success(`Loaded "${title}"`, { description: `Risk ${doc.riskScore}/100` });
      bumpRefresh();
      openDocument(doc.id);
    } catch (e: any) {
      toast.error("Load failed", { description: e.message });
    } finally {
      setBusy(null);
    }
  }

  async function handlePaste() {
    if (!pasteContent.trim()) {
      toast.error("Paste content first.");
      return;
    }
    setBusy("paste");
    try {
      const doc = await api.uploadPaste(pasteTitle.trim() || "pasted-document.txt", pasteContent);
      toast.success("Ingested", { description: `Risk ${doc.riskScore}/100 · ${doc.classification}` });
      bumpRefresh();
      openDocument(doc.id);
      setPasteContent("");
      setPasteTitle("");
    } catch (e: any) {
      toast.error("Paste failed", { description: e.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <UploadCloud className="h-4 w-4 text-primary" />
            Upload
          </div>
          <p className="mt-1 text-xs text-muted-foreground">PDF, DOCX, TXT, CSV, JSON. Scanned before processing.</p>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            role="button"
            tabIndex={0}
            aria-label="Drop file or click to browse"
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
            className={cn(
              "mt-4 flex h-44 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40"
            )}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,.csv,.json,text/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.currentTarget.value = "";
              }}
            />
            {busy?.startsWith("upload:") ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : (
              <UploadCloud className="h-6 w-6 text-muted-foreground" />
            )}
            <p className="mt-2 text-sm font-medium">{busy?.startsWith("upload:") ? "Scanning…" : "Drop file or browse"}</p>
            <p className="text-[11px] text-muted-foreground">Max 10 MB</p>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-primary" />
            Paste
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Text snippet. Same protection as file upload.</p>
          <div className="mt-4 space-y-2">
            <div>
              <Label htmlFor="pt" className="text-xs">Title</Label>
              <Input id="pt" value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} placeholder="snippet.txt" className="mt-1 h-9" />
            </div>
            <div>
              <Label htmlFor="pc" className="text-xs">Content</Label>
              <Textarea id="pc" value={pasteContent} onChange={(e) => setPasteContent(e.target.value)} placeholder="Paste content…" className="mt-1 min-h-[120px] font-mono text-xs" />
            </div>
            <Button onClick={handlePaste} disabled={busy === "paste"} className="w-full">
              {busy === "paste" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Ingest
            </Button>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="text-sm font-semibold flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          Samples
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Synthetic datasets for evaluation. All identifiers are fictitious.</p>
        {samples === null ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-32 rounded-xl border bg-muted/20 animate-pulse" />)}
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {samples.map((s) => {
              const Icon = SAMPLE_ICON[s.category];
              const isBusy = busy === `sample:${s.id}`;
              return (
                <button
                  key={s.id}
                  onClick={() => handleSample(s.id, s.title)}
                  disabled={!!busy}
                  className={cn("flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors hover:shadow-sm disabled:opacity-60", SAMPLE_TONE[s.category])}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border bg-background"><Icon className="h-4 w-4" /></div>
                    <span className="font-mono text-[10px] text-muted-foreground">{s.category}</span>
                  </div>
                  <div className="text-sm font-medium leading-tight">{s.title}</div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>
                  <div className="mt-auto text-[11px] font-medium text-primary flex items-center gap-1">
                    {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Load →
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
