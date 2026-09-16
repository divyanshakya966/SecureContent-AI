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
import { HelpButton } from "@/components/secure/help-button";

const SAMPLE_ICON = {
  CLEAN: FileText,
  PII_HEAVY: ShieldX,
  SECRET_HEAVY: KeyRound,
  INJECTION: Bug,
  MIXED: FlaskConical,
} as const;

const SAMPLE_TONE: Record<SampleDocument["category"], string> = {
  CLEAN: "border-[var(--risk-low)]/40 bg-[var(--risk-low)]/10",
  PII_HEAVY: "border-[var(--risk-medium)]/40 bg-[var(--risk-medium)]/10",
  SECRET_HEAVY: "border-[var(--risk-high)]/40 bg-[var(--risk-high)]/10",
  INJECTION: "border-[var(--chart-5)]/40 bg-[var(--chart-5)]/10",
  MIXED: "border-[var(--risk-critical)]/40 bg-[var(--risk-critical)]/10",
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
      <Card className="p-4 border-primary/20 bg-primary/[0.04]">
        <div className="flex gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"><FlaskConical className="h-4 w-4" /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
              Content transformation
              <HelpButton title="How transformation works">
                Submit a source and select deliverables. The platform analyses context and intent, then generates each artefact from the sanitized working copy only — raw secrets never reach the model. Every output is re-scanned (DLP) and grounding-checked before delivery.
              </HelpButton>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground max-w-[80ch]">
              Submit a source and select deliverables. Every output is sanitized, grounded, and validated before delivery.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 border border-primary/15 text-primary"><UploadCloud className="h-4 w-4" /></span>
              Upload file
              <HelpButton title="Supported files">
                PDF, DOCX, PPTX, TXT, MD, CSV, JSON, HTML, images (OCR) and video/audio (transcribed). Files are validated, parsed in isolation, then scanned. Scanned images and PDFs use local OCR with quality scoring — enable the enhanced OCR worker for best results on low-quality scans.
              </HelpButton>
            </div>
            <span className="rounded-full border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Max 25 MB</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">PDF, DOCX, PPTX, TXT, MD, CSV, JSON, HTML, images and video/audio — validated, parsed in isolation, then scanned.</p>
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
              "mt-4 flex h-[172px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              dragging ? "border-primary bg-primary/[0.04] shadow-sm" : "border-border bg-muted/20 hover:border-primary/30 hover:bg-card"
            )}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.pptx,.txt,.md,.csv,.json,.html,.png,.jpg,.jpeg,.webp,.svg,.mp4,.mov,.webm,.avi,.mp3,.wav,.ogg,text/*,image/*,video/*,audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.currentTarget.value = "";
              }}
            />
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-full border bg-card shadow-sm", dragging && "border-primary/30")}>
              {busy?.startsWith("upload:") ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : (
                <UploadCloud className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <p className="mt-3 text-sm font-medium tracking-tight">{busy?.startsWith("upload:") ? "Scanning…" : "Drop file here or click to browse"}</p>
            <p className="mt-1 text-xs text-muted-foreground">PDF · DOCX · PPTX · Images · Video/Audio · TXT · CSV · JSON</p>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Parser-isolated · Size/MIME validated
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted border text-muted-foreground"><FileText className="h-4 w-4" /></span>
            Paste content
            <HelpButton title="When to paste">
              Best for text, reports, prompts, or transcripts. Pasted content goes through the same scan and audit trail as file uploads, and can accompany a file as extra context.
            </HelpButton>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Text, reports, or prompts — same scan and audit as file uploads.</p>
          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="pt" className="text-xs font-medium">Title <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="pt" value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} placeholder="incident-notes.txt" className="mt-1.5 h-8 text-xs" />
            </div>
            <div>
              <Label htmlFor="pc" className="text-xs font-medium">Content</Label>
              <Textarea id="pc" value={pasteContent} onChange={(e) => setPasteContent(e.target.value)} placeholder="Paste text for scanning…" className="mt-1.5 min-h-[122px] font-mono text-xs leading-relaxed resize-none" />
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{pasteContent.length} chars {pasteContent.length > 180000 ? "· near limit" : ""}</span>
                <span>≤ 200k chars</span>
              </div>
            </div>
            <Button onClick={handlePaste} disabled={busy === "paste" || !pasteContent.trim()} className="w-full h-9 gap-1.5">
              {busy === "paste" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Ingest and scan
            </Button>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="rounded-lg border border-dashed bg-muted/20 p-3 mb-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            Next: configure generation on the document page
            <HelpButton title="Configuring generation">
              After ingest, open the document and use the Transform tab. Pick one or more of the 15 output formats and tune audience, tone, language, detail, objective and style. Each artefact is generated from the sanitized working copy and validated before delivery.
            </HelpButton>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">After ingest, open the document → <span className="font-medium text-foreground">Transform</span> tab to pick outputs and tune generation.</p>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold tracking-tight flex items-center gap-1.5">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              Evaluation datasets
              <HelpButton title="About evaluation datasets">
                Built-in scenarios that run through the real pipeline (scan → sanitize → transform → validate) and populate dashboard, intelligence, and audit. All identifiers are fictitious and safe for testing. Try generating multiple artefacts from one source to compare policy behavior.
              </HelpButton>
            </div>
            <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">Built-in scenarios for evaluation — each runs through the real pipeline. All identifiers are fictitious.</p>
          </div>
          <span className="hidden sm:inline-flex rounded-full border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{samples === null ? "…" : `${samples.length} datasets`}</span>
        </div>
        {samples === null ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[128px] rounded-xl border bg-muted/20 animate-pulse" />)}
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
                  className={cn("group flex flex-col gap-2.5 rounded-xl border bg-card p-4 text-left transition-all hover:shadow-md hover:border-primary/20 disabled:opacity-60", SAMPLE_TONE[s.category])}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border bg-card shadow-sm"><Icon className="h-4 w-4" /></div>
                    <span className="rounded-full border bg-card px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">{s.category}</span>
                  </div>
                  <div className="text-sm font-semibold leading-tight tracking-tight group-hover:text-primary">{s.title}</div>
                  <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">{s.description}</p>
                  <div className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary">
                    {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="transition-transform group-hover:translate-x-0.5">→</span>}
                    {isBusy ? "Loading…" : "Load dataset"}
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
