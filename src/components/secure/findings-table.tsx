"use client";

import type { Finding } from "@/types";
import { sanitizeForDisplay, safeTruncate } from "@/lib/text";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CategoryBadge, FindingTypeBadge, SeverityBadge, ActionBadge,
} from "@/components/secure/badges";
import { Badge } from "@/components/secure/badges";

interface FindingsTableProps {
  findings: Finding[];
  emptyHint?: string;
  maxHeight?: string;
}

export function FindingsTable({ findings, emptyHint = "No findings.", maxHeight = "max-h-[28rem]" }: FindingsTableProps) {
  if (findings.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        {emptyHint}
      </div>
    );
  }
  return (
    <div className={`overflow-auto scroll-thin rounded-lg border border-border ${maxHeight}`}>
      <Table>
        <TableHeader className="sticky top-0 bg-muted/60 backdrop-blur-sm">
          <TableRow className="hover:bg-transparent border-border">
            <TableHead className="w-32">Category</TableHead>
            <TableHead className="w-40">Type</TableHead>
            <TableHead className="w-24">Severity</TableHead>
            <TableHead className="w-28">Action</TableHead>
            <TableHead className="w-20 text-right">Conf.</TableHead>
            <TableHead>Matched → Masked</TableHead>
            <TableHead className="hidden lg:table-cell w-40">Location</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {findings.map((f) => (
            <TableRow key={f.id} className="align-top">
              <TableCell><CategoryBadge category={f.category} /></TableCell>
              <TableCell><FindingTypeBadge type={f.type} /></TableCell>
              <TableCell><SeverityBadge severity={f.severity} /></TableCell>
              <TableCell><ActionBadge action={f.action} /></TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                {Math.round(f.confidence * 100)}%
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <div className="font-mono text-[11px] text-foreground/80 break-all">
                    <span className="diff-del rounded px-0.5">{safeTruncate(sanitizeForDisplay(f.matchedText), 80)}</span>
                  </div>
                  <div className="font-mono text-[11px] break-all">
                    <span className="diff-add rounded px-0.5">{sanitizeForDisplay(f.maskedText)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{sanitizeForDisplay(f.reason)}</p>
                </div>
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <Badge className="font-mono text-[10px]">{f.location.replace("char_offset:", "@")}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// local truncate deprecated — use safeTruncate from @/lib/text
