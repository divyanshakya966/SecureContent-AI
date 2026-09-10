"use client";

import { useApp } from "@/lib/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Keyboard } from "lucide-react";

export function HelpLegend() {
  const { helpOpen, setHelpOpen } = useApp();

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">Help</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Card className="p-3">
            <div className="text-xs font-semibold">Workflow</div>
            <ol className="mt-2 list-decimal pl-4 text-xs text-muted-foreground space-y-1">
              <li>Ingest — upload or paste</li>
              <li>Review — findings and risk</li>
              <li>Sanitize — apply policy</li>
              <li>Transform — generate, validate</li>
            </ol>
          </Card>
          <Card className="p-3">
            <div className="text-xs font-semibold">Risk / Classification</div>
            <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
              <div className="flex justify-between"><span>0 Safe</span><span className="font-mono">0</span></div>
              <div className="flex justify-between"><span>Low</span><span className="font-mono">1–14</span></div>
              <div className="flex justify-between"><span>Medium</span><span className="font-mono">15–39</span></div>
              <div className="flex justify-between"><span>High</span><span className="font-mono">40–69</span></div>
              <div className="flex justify-between"><span>Critical</span><span className="font-mono">70–100</span></div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">PUBLIC → INTERNAL → CONFIDENTIAL → RESTRICTED</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs font-semibold flex items-center gap-2"><Keyboard className="h-3.5 w-3.5" /> Shortcuts</div>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between"><span>Command palette</span><span className="font-mono border rounded px-1 py-0.5 text-[11px]">⌘K</span></div>
              <div className="flex justify-between"><span>Help</span><span className="font-mono border rounded px-1 py-0.5 text-[11px]">?</span></div>
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
