"use client";

import { useEffect } from "react";
import { useApp, type ViewKey } from "@/lib/store";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  UploadCloud,
  FileStack,
  Brain,
  Scale,
  ScrollText,
  BookLock,
  Network,
  Search,
  Sparkles,
  ShieldCheck,
  HelpCircle,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "next-themes";

const NAV_ITEMS: { key: ViewKey; label: string; desc: string; icon: any; keywords: string[] }[] = [
  { key: "dashboard", label: "Overview", desc: "Risk and activity", icon: LayoutDashboard, keywords: ["dashboard", "overview", "stats"] },
  { key: "upload", label: "Ingest", desc: "Upload or paste", icon: UploadCloud, keywords: ["upload", "ingest", "paste", "sample"] },
  { key: "documents", label: "Documents", desc: "Inventory", icon: FileStack, keywords: ["documents", "files", "list"] },
  { key: "intelligence", label: "Intelligence", desc: "Entities, IOCs, TTPs", icon: Brain, keywords: ["intelligence", "ioc", "ttp"] },
  { key: "policy-compare", label: "Policy Lab", desc: "Compare outputs", icon: Scale, keywords: ["compare", "policy"] },
  { key: "policies", label: "Policies", desc: "Rules", icon: ScrollText, keywords: ["policies", "rules"] },
  { key: "audit", label: "Audit", desc: "Trail", icon: BookLock, keywords: ["audit", "log"] },
  { key: "architecture", label: "Architecture", desc: "Pipeline", icon: Network, keywords: ["architecture", "pipeline"] },
];

export function CommandPalette() {
  const { commandOpen, setCommandOpen, setView, setHelpOpen } = useApp();
  const { setTheme, theme } = useTheme();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(!commandOpen);
      }
      if (e.key === "?" && !commandOpen && (e.target as HTMLElement)?.tagName !== "INPUT" && (e.target as HTMLElement)?.tagName !== "TEXTAREA") {
        // Shift+? opens help
        if (e.shiftKey) {
          e.preventDefault();
          setHelpOpen(true);
        }
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [commandOpen, setCommandOpen, setHelpOpen]);

  return (
    <CommandDialog open={commandOpen} onOpenChange={setCommandOpen} title="Search" description="Quick navigation">
      <CommandInput placeholder="Search…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        <CommandGroup heading="Jump to">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.key}
                value={`${item.label} ${item.desc} ${item.keywords.join(" ")}`}
                onSelect={() => {
                  setView(item.key);
                  setCommandOpen(false);
                }}
                className="gap-3"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.desc}</div>
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem value="help" onSelect={() => { setCommandOpen(false); setHelpOpen(true); }}>
            <HelpCircle className="h-4 w-4" />
            <span>Help</span>
          </CommandItem>
          <CommandItem value="theme" onSelect={() => { setTheme(theme === "dark" ? "light" : "dark"); setCommandOpen(false); }}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span>Toggle theme</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
