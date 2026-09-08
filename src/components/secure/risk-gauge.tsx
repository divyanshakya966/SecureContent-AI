"use client";

import { useEffect, useState } from "react";
import { riskColor, riskLabel } from "@/lib/display";

interface RiskGaugeProps {
  value: number;
  before?: number;
  size?: number;
  label?: string;
}

export function RiskGauge({ value, before, size = 132, label }: RiskGaugeProps) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(value), 80);
    return () => clearTimeout(t);
  }, [value]);

  const stroke = Math.max(8, size * 0.075);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, animated)) / 100;
  const color = riskColor(value);

  return (
    <div className="flex flex-col items-center gap-1" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={stroke}
            opacity={0.5}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.4s" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-3xl font-semibold tabular-nums" style={{ color }}>
            {value}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">/ 100</span>
        </div>
        {typeof before === "number" && before !== value && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-background border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            ↓ {before - value} from {before}
          </span>
        )}
      </div>
      <span className="text-xs font-medium" style={{ color }}>
        {label ?? `${riskLabel(value)} risk`}
      </span>
    </div>
  );
}
