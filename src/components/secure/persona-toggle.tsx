"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Users, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

export function PersonaToggle() {
  const { persona, setPersona } = useApp();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = typeof window !== "undefined" ? (window.localStorage.getItem("sc-persona") as "simple" | "pro" | null) : null;
    if (saved && saved !== persona) setPersona(saved);
  }, []);

  if (!mounted) {
    // Avoid hydration mismatch — render placeholder
    return <div className="h-8 w-[180px] rounded-full border bg-muted/30 animate-pulse" />;
  }

  return (
    <div className="inline-flex items-center rounded-full border border-border bg-muted/40 p-1">
      <button
        onClick={() => setPersona("simple")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
          persona === "simple" ? "bg-card shadow border border-border text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
        aria-pressed={persona === "simple"}
        title="Simple: plain language, guided steps, fewer details"
      >
        <Users className="h-3.5 w-3.5" />
        Simple
      </button>
      <button
        onClick={() => setPersona("pro")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
          persona === "pro" ? "bg-card shadow border border-border text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
        aria-pressed={persona === "pro"}
        title="Pro: full technical details, tables, confidence scores, audit filters"
      >
        <Briefcase className="h-3.5 w-3.5" />
        Pro
      </button>
    </div>
  );
}
