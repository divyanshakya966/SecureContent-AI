"use client";

import { useMemo } from "react";

interface DiffViewProps {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
}

// Lightweight inline diff: splits both texts on whitespace and marks spans
// present in `before` but not in `after` as deletions, and new spans as
// additions. Good enough to visualize sanitization redactions visually.
export function DiffView({ before, after, beforeLabel = "Raw input", afterLabel = "Sanitized copy" }: DiffViewProps) {
  const diff = useMemo(() => computeDiff(before, after), [before, after]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DiffColumn title={beforeLabel} tone="del" segments={diff.before} />
      <DiffColumn title={afterLabel} tone="add" segments={diff.after} />
    </div>
  );
}

function DiffColumn({
  title, segments, tone,
}: {
  title: string;
  tone: "add" | "del";
  segments: { text: string; changed: boolean }[];
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        <span className={`font-mono text-[10px] ${tone === "add" ? "text-[var(--risk-safe)]" : "text-[var(--risk-critical)]"}`}>
          {segments.filter((s) => s.changed).length} changed
        </span>
      </div>
      <pre className="m-0 max-h-[28rem] overflow-auto scroll-thin whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed">
        {segments.map((s, i) => (
          <span key={i} className={s.changed ? (tone === "add" ? "diff-add rounded px-0.5" : "diff-del rounded px-0.5") : ""}>
            {s.text}
          </span>
        ))}
      </pre>
    </div>
  );
}

function tokenize(text: string): string[] {
  // Split into words + whitespace runs, preserving structure.
  return text.split(/(\s+)/);
}

function computeDiff(before: string, after: string) {
  const a = tokenize(before);
  const b = tokenize(after);
  const bSet = new Set(b.filter((t) => t.trim().length > 0));
  const aSet = new Set(a.filter((t) => t.trim().length > 0));

  const beforeSegs = a.map((tok) => {
    const isWord = tok.trim().length > 0;
    return { text: tok, changed: isWord && !bSet.has(tok) };
  });
  const afterSegs = b.map((tok) => {
    const isWord = tok.trim().length > 0;
    return { text: tok, changed: isWord && !aSet.has(tok) };
  });

  return { before: beforeSegs, after: afterSegs };
}
