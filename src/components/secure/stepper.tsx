"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export interface StepDef {
  key: string;
  label: string;
  desc?: string;
  status: "done" | "current" | "upcoming" | "blocked";
}

export function Stepper({ steps, onStepClick }: { steps: StepDef[]; onStepClick?: (key: string) => void }) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto scroll-thin py-1">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-0 shrink-0">
          <button
            onClick={() => onStepClick?.(s.key)}
            disabled={!onStepClick || s.status === "upcoming"}
            className={cn(
              "group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors",
              s.status === "done" && "text-foreground",
              s.status === "current" && "bg-primary/8 text-primary font-medium ring-1 ring-primary/15",
              s.status === "upcoming" && "text-muted-foreground",
              s.status === "blocked" && "text-[var(--risk-critical)] bg-[var(--risk-critical)]/8 ring-1 ring-[var(--risk-critical)]/20",
              onStepClick && s.status !== "upcoming" && "hover:bg-muted/60 cursor-pointer"
            )}
            title={s.desc}
          >
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-semibold",
                s.status === "done" && "bg-[var(--risk-safe)] text-white border-[var(--risk-safe)]",
                s.status === "current" && "bg-primary text-primary-foreground border-primary",
                s.status === "upcoming" && "bg-card text-muted-foreground border-border",
                s.status === "blocked" && "bg-[var(--risk-critical)] text-white border-[var(--risk-critical)]"
              )}
            >
              {s.status === "done" ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className="hidden sm:inline">{s.label}</span>
            {s.desc && <span className="hidden lg:inline text-[11px] text-muted-foreground group-hover:text-foreground/70">· {s.desc}</span>}
          </button>
          {i < steps.length - 1 && (
            <span className={cn("mx-1 h-px w-5 shrink-0", s.status === "done" ? "bg-[var(--risk-safe)]/30" : "bg-border")} />
          )}
        </div>
      ))}
    </div>
  );
}

export function SimpleStepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  const steps: StepDef[] = [
    { key: "1", label: "Add", desc: "Upload or paste", status: current > 1 ? "done" : current === 1 ? "current" : "upcoming" },
    { key: "2", label: "Check", desc: "Scan findings", status: current > 2 ? "done" : current === 2 ? "current" : "upcoming" },
    { key: "3", label: "Clean", desc: "Sanitize with policy", status: current > 3 ? "done" : current === 3 ? "current" : "upcoming" },
    { key: "4", label: "Generate", desc: "Transform & validate", status: current === 4 ? "current" : "upcoming" },
  ];
  return <Stepper steps={steps} />;
}
