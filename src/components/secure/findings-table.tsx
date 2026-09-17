"use client";

import type { Finding, SanitizeAction } from "@/types";
import { sanitizeForDisplay, safeTruncate } from "@/lib/text";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CategoryBadge, FindingTypeBadge, SeverityBadge, ActionBadge,
} from "@/components/secure/badges";
import { Badge } from "@/components/secure/badges";

interface FindingsTableProps {
  findings: Finding[];
  emptyHint?: string;
  maxHeight?: string;
  /** Reviewer-chosen actions by finding id. When `onOverrideAction` is set, the Action column becomes editable. */
  overrideActions?: Record<string, SanitizeAction>;
  onOverrideAction?: (findingId: string, action: SanitizeAction) => void;
}

/** Which actions a reviewer may pick per category. Secrets can never pass through; injections stay quarantined. */
export function allowedOverrideActions(category: Finding["category"]): { value: SanitizeAction; label: string; disabled?: string }[] {
  if (category === "PROMPT_INJECTION") {
    return [
      { value: "QUARANTINE", label: "Quarantine" },
      { value: "REDACT", label: "Redact" },
    ];
  }
  if (category === "SECRET") {
    return [
      { value: "MASK", label: "Mask" },
      { value: "REDACT", label: "Redact" },
      { value: "REPLACE", label: "Replace" },
    ];
  }
  return [
    { value: "ALLOW", label: "Keep" },
    { value: "MASK", label: "Mask" },
    { value: "REDACT", label: "Redact" },
    { value: "REPLACE", label: "Replace" },
    { value: "QUARANTINE", label: "Quarantine" },
  ];
}

export function FindingsTable({ findings, emptyHint = "No findings.", maxHeight = "max-h-[28rem]", overrideActions, onOverrideAction }: FindingsTableProps) {
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
            <TableHead className="min-w-[92px] text-xs">Category</TableHead>
            <TableHead className="min-w-[110px] text-xs">Type</TableHead>
            <TableHead className="min-w-[84px] text-xs">Severity</TableHead>
            <TableHead className="min-w-[128px] text-xs">Action</TableHead>
            <TableHead className="min-w-[52px] text-right text-xs">Conf.</TableHead>
            <TableHead className="min-w-[220px] text-xs">Matched → Masked</TableHead>
            <TableHead className="hidden lg:table-cell min-w-[120px] text-xs">Location</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {findings.map((f) => (
            <TableRow key={f.id} className="align-top">
              <TableCell><CategoryBadge category={f.category} /></TableCell>
              <TableCell><FindingTypeBadge type={f.type} /></TableCell>
              <TableCell><SeverityBadge severity={f.severity} /></TableCell>
              <TableCell>
                {onOverrideAction ? (
                  <Select
                    value={overrideActions?.[f.id] ?? f.action}
                    onValueChange={(v) => onOverrideAction(f.id, v as SanitizeAction)}
                  >
                    <SelectTrigger className="h-7 min-w-[118px] text-[11px] font-medium" aria-label={`Action for ${f.type} finding`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedOverrideActions(f.category).map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                      ))}
                      {/* Current engine action, shown disabled when not reviewer-selectable */}
                      {!allowedOverrideActions(f.category).some((o) => o.value === (overrideActions?.[f.id] ?? f.action)) && (
                        <SelectItem value={overrideActions?.[f.id] ?? f.action} disabled className="text-xs">
                          {overrideActions?.[f.id] ?? f.action} (policy)
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <ActionBadge action={f.action} />
                )}
                {overrideActions?.[f.id] && overrideActions[f.id] !== f.action && (
                  <div className="mt-1 text-[10px] font-medium text-primary">Your choice · was {f.action}</div>
                )}
              </TableCell>
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

