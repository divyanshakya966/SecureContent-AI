"use client";

import { cn } from "@/lib/utils";
import {
  SEVERITY_STYLE,
  CLASSIFICATION_STYLE,
  STATUS_STYLE,
  VALIDATION_STYLE,
  ACTION_STYLE,
  FINDING_TYPE_LABEL,
  CATEGORY_META,
} from "@/lib/display";
import type {
  Severity,
  Classification,
  DocumentStatus,
  ValidationStatus,
  SanitizeAction,
  FindingType,
  FindingCategory,
} from "@/types";

export function Badge({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={style}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide",
        className
      )}
    >
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge className={SEVERITY_STYLE[severity]}>{severity}</Badge>;
}

export function ClassificationBadge({ value }: { value: Classification }) {
  return <Badge className={CLASSIFICATION_STYLE[value] ?? CLASSIFICATION_STYLE.UNCLASSIFIED}>{value}</Badge>;
}

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return <Badge className={STATUS_STYLE[status]}>{label}</Badge>;
}

export function ValidationBadge({ status }: { status: ValidationStatus }) {
  return <Badge className={VALIDATION_STYLE[status]}>{status}</Badge>;
}

export function ActionBadge({ action }: { action: SanitizeAction }) {
  return <Badge className={ACTION_STYLE[action]}>{action}</Badge>;
}

export function FindingTypeBadge({ type }: { type: FindingType }) {
  return (
    <Badge className="bg-muted text-muted-foreground border-border font-mono">
      {FINDING_TYPE_LABEL[type] ?? type}
    </Badge>
  );
}

export function CategoryBadge({ category }: { category: FindingCategory }) {
  const meta = CATEGORY_META[category];
  return (
    <Badge
      className="border-border"
      style={{
        backgroundColor: `color-mix(in oklch, ${meta.color} 12%, transparent)`,
        color: meta.color,
        borderColor: `color-mix(in oklch, ${meta.color} 35%, transparent)`,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      {meta.label}
    </Badge>
  );
}
