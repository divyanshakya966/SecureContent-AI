"use client";

import { useEffect, useState } from "react";
import { riskColor, riskLabel } from "@/lib/display";
import { cn } from "@/lib/utils";

interface RiskGaugeProps {
  value: number;
  before?: number;
  size?: number;
  label?: string;
}

export function RiskGauge({ value, before, size = 132, label }: RiskGaugeProps) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    setAnimated(0);
    const t = setTimeout(() => setAnimated(value), 80);
    return () => clearTimeout(t);
  }, [value]);

  const stroke = Math.max(8, Math.round(size * 0.09));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, animated));
  // Keep a visible nub for tiny non-zero risk so the ring never looks broken;
  // a true 0 stays empty (track only) which reads as "clean".
  const visiblePct = clamped === 0 ? 0 : Math.max(clamped, 4) / 100;
  const color = riskColor(value);
  const valueFontSize = Math.round(size * 0.3);
  const hasDelta = typeof before === "number" && before !== value;
  const delta = (before ?? 0) - value;

  return (
    <div className="flex flex-col items-center gap-1.5" style={{ width: size + 24 }}>
      <div className="relative shrink-0 overflow-visible" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`Risk ${value} of 100`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeWidth={stroke}
          />
          {visiblePct > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - visiblePct)}
              style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.4s" }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono font-semibold tabular-nums leading-none"
            style={{ color, fontSize: valueFontSize }}
          >
            {value}
          </span>
          <span className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">/ 100</span>
        </div>
      </div>
      {hasDelta && (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium tabular-nums ${delta >= 0 ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-[var(--risk-critical)]/25 bg-[var(--risk-critical)]/10 text-[var(--risk-critical)]"}`}>
          {delta >= 0 ? "↓" : "↑"} {Math.abs(delta)} from {before}
        </span>
      )}
      <span className={cn("text-xs font-medium")} style={{ color }}>
        {label ?? `${riskLabel(value)} risk`}
      </span>
    </div>
  );
}
