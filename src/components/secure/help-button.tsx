"use client";

import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

/** Compact contextual help — keeps the interface clean while explaining
 *  anything a user might find confusing, right where they need it. */
export function HelpButton({
  title,
  children,
  side = "top",
}: {
  title: string;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Help: ${title}`}
          title={title}
          className="h-5 w-5 shrink-0 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side={side} align="start" className="max-w-[300px] p-3">
        <div className="text-xs font-semibold tracking-tight">{title}</div>
        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

/** Inline section heading with a trailing ? help affordance. */
export function HelpHeading({
  title,
  helpTitle,
  help,
  aside,
}: {
  title: React.ReactNode;
  helpTitle: string;
  help: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1.5">{title}</span>
      <HelpButton title={helpTitle}>{help}</HelpButton>
      {aside && <span className="ml-auto">{aside}</span>}
    </div>
  );
}
