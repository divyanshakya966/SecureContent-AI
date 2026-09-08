"use client";

import { useCallback, useRef, useState } from "react";
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

  const loadSamples = useCallback(async () => {
    if (samples) return samples;
    const s = await api.getSamples();
    setSamples(s);
    return s;
  }, [samples]);

  useState(() => { loadSamples().catch(() => {}); });

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
      toast.success(`Loaded sample "${title}"`, { description: `Risk ${doc.riskScore}/100 · ${doc.findings?.length ?? 0} findings` });
      bumpRefresh();
      openDocument(doc.id);
    } catch (e: any) {
      toast.error("Sample load failed", { description: e.message });
    } finally {
      setBusy(null);
    }
  }

  async function handlePaste() {
    if (!pasteContent.trim()) {
      toast.error("Paste some content first.");
      return;
    }
    setBusy("paste");
    try {
      const doc = await api.uploadPaste(pasteTitle.trim() || "pasted-document.txt", pasteContent);
      toast.success("Ingested pasted content", { description: `Risk ${doc.riskScore}/100 · ${doc.classification}` });
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
        {/* Dropzone */}
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <UploadCloud className="h-4 w-4 text-primary" />
            Upload a document
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            PDF, DOCX, TXT, or plain text. The file is parsed and scanned for PII, secrets and
            prompt injection before anything reaches the model.
          </p>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            className={cn(
              "mt-4 flex h-44 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors",
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
            <p className="mt-2 text-sm font-medium">Drop a file or click to browse</p>
            <p className="text-[11px] text-muted-foreground">Up to ~2 MB · parsed server-side</p>
          </div>
        </Card>

        {/* Paste */}
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-primary" />
            Paste raw content
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Useful for transcripts, snippets or logs. Treated as untrusted data exactly like an upload.
          </p>
          <div className="mt-4 space-y-2">
            <div>
              <Label htmlFor="pt" className="text-xs">Title (optional)</Label>
              <Input
                id="pt"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
                placeholder="incident-snippet.txt"
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label htmlFor="pc" className="text-xs">Content</Label>
              <Textarea
                id="pc"
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder="Paste text containing PII, credentials, or injection attempts…"
                className="mt-1 min-h-[120px] font-mono text-xs scroll-thin"
              />
            </div>
            <Button onClick={handlePaste} disabled={busy === "paste"} className="w-full">
              {busy === "paste" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Ingest &amp; scan
            </Button>
          </div>
        </Card>
      </div>

      {/* Sample gallery — the attack-driven demo */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FlaskConical className="h-4 w-4 text-primary" />
              Attack-driven demo samples
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Synthetic benchmark documents — clean, PII-heavy, secret-heavy, injection and mixed.
              All names, keys and identifiers are fake, generated for testing.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(samples ?? []).map((s) => {
            const Icon = SAMPLE_ICON[s.category];
            const isBusy = busy === `sample:${s.id}`;
            return (
              <button
                key={s.id}
                onClick={() => handleSample(s.id, s.title)}
                disabled={!!busy}
                className={cn(
                  "group relative flex flex-col gap-2 rounded-xl border p-4 text-left transition-all hover:shadow-sm disabled:opacity-60",
                  SAMPLE_TONE[s.category]
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {s.category.replace("_", " ")}
                  </span>
                </div>
                <div>
                  <div className="text-sm font-semibold leading-tight">{s.title}</div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{s.description}</p>
                </div>
                <div className="mt-auto flex items-center gap-1 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Load &amp; scan →
                </div>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
