"use client";

import { useApp } from "@/lib/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Keyboard } from "lucide-react";

export function HelpLegend() {
  const { helpOpen, setHelpOpen } = useApp();

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="max-w-xl sm:max-w-xl max-h-[82vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="text-sm tracking-tight">Reference</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <Card className="p-4">
            <div className="text-xs font-semibold tracking-tight">Pipeline</div>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
              <div className="rounded-md border bg-muted/20 p-2 text-center"><div className="font-semibold text-foreground">Ingest</div><div className="mt-1">Validate + parse</div></div>
              <div className="rounded-md border bg-muted/20 p-2 text-center"><div className="font-semibold text-foreground">Scan</div><div className="mt-1">PII / secrets / injection</div></div>
              <div className="rounded-md border bg-muted/20 p-2 text-center"><div className="font-semibold text-foreground">Sanitize</div><div className="mt-1">Policy → working copy</div></div>
              <div className="rounded-md border bg-muted/20 p-2 text-center"><div className="font-semibold text-foreground">Validate</div><div className="mt-1">DLP + grounding</div></div>
            </div>
          </Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="p-4">
              <div className="text-xs font-semibold tracking-tight">Risk · Classification</div>
              <div className="mt-2 space-y-1.5 text-xs">
                {[
                  ["Safe", "0", "var(--risk-safe)"],
                  ["Low", "1–14", "var(--risk-low)"],
                  ["Medium", "15–39", "var(--risk-medium)"],
                  ["High", "40–69", "var(--risk-high)"],
                  ["Critical", "70–100", "var(--risk-critical)"],
                ].map(([label, range, color]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: color as string }} />{label}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{range}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-md border bg-muted/30 px-2.5 py-2 font-mono text-[11px] text-muted-foreground">PUBLIC → INTERNAL → CONFIDENTIAL → RESTRICTED</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-semibold tracking-tight flex items-center gap-1.5"><Keyboard className="h-3.5 w-3.5" /> Shortcuts</div>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between"><span>Command palette</span><span className="font-mono rounded border bg-muted px-1.5 py-0.5 text-[11px]">⌘ K</span></div>
                <div className="flex items-center justify-between"><span>Help</span><span className="font-mono rounded border bg-muted px-1.5 py-0.5 text-[11px]">?</span></div>
                <div className="flex items-center justify-between"><span>Search documents</span><span className="font-mono rounded border bg-muted px-1.5 py-0.5 text-[11px]">/</span></div>
              </div>
            </Card>
          </div>
          <Card className="p-4">
            <div className="text-xs font-semibold tracking-tight">Policy buckets</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border p-2"><div className="font-medium">Allow</div><div className="text-muted-foreground text-[11px]">Pass through</div></div>
              <div className="rounded-md border p-2"><div className="font-medium">Mask</div><div className="text-muted-foreground text-[11px]">Partial redact</div></div>
              <div className="rounded-md border p-2"><div className="font-medium">Remove</div><div className="text-muted-foreground text-[11px]">Full redact</div></div>
              <div className="rounded-md border p-2"><div className="font-medium">Block</div><div className="text-muted-foreground text-[11px]">Refuse transform</div></div>
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
