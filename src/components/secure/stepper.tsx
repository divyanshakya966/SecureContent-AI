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
    <div className="flex items-center gap-1 overflow-x-auto scroll-thin py-1">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onStepClick?.(s.key)}
            disabled={!onStepClick || s.status === "upcoming"}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
              s.status === "done" && "bg-[var(--risk-safe)]/10 border-[var(--risk-safe)]/30 text-[var(--risk-safe)]",
              s.status === "current" && "bg-primary/10 border-primary/30 text-primary font-semibold",
              s.status === "upcoming" && "bg-muted text-muted-foreground border-border",
              s.status === "blocked" && "bg-[var(--risk-critical)]/10 border-[var(--risk-critical)]/30 text-[var(--risk-critical)]",
              onStepClick && s.status !== "upcoming" && "hover:opacity-90 cursor-pointer"
            )}
            title={s.desc}
          >
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
                s.status === "done" && "bg-[var(--risk-safe)] text-white",
                s.status === "current" && "bg-primary text-primary-foreground",
                s.status === "upcoming" && "bg-muted-foreground/20 text-muted-foreground",
                s.status === "blocked" && "bg-[var(--risk-critical)] text-white"
              )}
            >
              {s.status === "done" ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span>{s.label}</span>
          </button>
          {i < steps.length - 1 && <span className="h-px w-6 bg-border shrink-0" />}
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
