"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ScrollText, ShieldX, EyeOff, Ban, CheckCircle2, Users, Crown, HeartHandshake,
  Bug, Eye, Plus, Pencil, Copy, Trash2, SlidersHorizontal, Loader2, Landmark,
} from "lucide-react";
import { api } from "@/lib/api-client";
import type { PolicyRule } from "@/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge, ClassificationBadge } from "@/components/secure/badges";
import { HelpButton } from "@/components/secure/help-button";
import { FINDING_TYPE_LABEL } from "@/lib/display";
import {
  isBuiltinPolicy,
  policyDisplayName,
  validatePolicyBuckets,
  FORBIDDEN_ALLOW_ENTRIES,
} from "@/lib/security/policies";
import { POLICY_TEMPLATES, type PolicyTemplate } from "@/lib/security/policy-templates";
import { cn } from "@/lib/utils";

const META: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  PUBLIC_RELEASE: { icon: Eye, color: "bg-[var(--risk-safe)]/10 text-[var(--risk-safe)] border-[var(--risk-safe)]/20" },
  INTERNAL_SUMMARY: { icon: Users, color: "bg-[var(--chart-4)]/10 text-[var(--chart-4)] border-[var(--chart-4)]/20" },
  EXECUTIVE_BRIEF: { icon: Crown, color: "bg-[var(--risk-medium)]/12 text-[var(--risk-medium)] border-[var(--risk-medium)]/20" },
  HR_SAFE: { icon: HeartHandshake, color: "bg-[var(--chart-5)]/10 text-[var(--chart-5)] border-[var(--chart-5)]/20" },
  SECURITY_INCIDENT: { icon: Bug, color: "bg-[var(--risk-critical)]/10 text-[var(--risk-critical)] border-[var(--risk-critical)]/20" },
};
const CUSTOM_META = { icon: SlidersHorizontal, color: "bg-primary/10 text-primary border-primary/20" };

type Bucket = "allow" | "mask" | "remove" | "block";

const ENTRY_GROUPS: { title: string; entries: string[]; buckets: Bucket[] }[] = [
  { title: "Identity & contact", entries: ["EMAIL", "PHONE", "PERSON_NAME", "DATE_OF_BIRTH", "ADDRESS", "POSTAL_CODE", "ORG_ID"], buckets: ["allow", "mask", "remove", "block"] },
  { title: "Government IDs", entries: ["AADHAAR", "PAN", "SSN", "PASSPORT", "DRIVERS_LICENSE"], buckets: ["allow", "mask", "remove", "block"] },
  { title: "Financial data", entries: ["CREDIT_CARD", "BANK_ACCOUNT", "IBAN", "IFSC", "UPI"], buckets: ["allow", "mask", "remove", "block"] },
  { title: "Network & internal", entries: ["IP_ADDRESS", "IPV6_ADDRESS", "INTERNAL_URL", "INTERNAL_PROJECT", "UNSAFE_URL"], buckets: ["allow", "mask", "remove", "block"] },
  { title: "Secrets & credentials", entries: ["API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "CLOUD_CRED", "AUTH_TOKEN", "PASSWORD"], buckets: ["mask", "remove", "block"] },
  { title: "Prompt injection", entries: ["INJECTION_PHRASE", "ROLE_MANIPULATION", "HIDDEN_INSTRUCTION", "TOOL_INVOCATION"], buckets: ["mask", "remove", "block"] },
];

const ALLOW_CLASS_GROUPS: { title: string; entries: string[] }[] = [
  { title: "Releasable content classes", entries: ["high_level_facts", "aggregate_statistics", "public_contact_information", "internal_project_names", "strategic_context", "role_descriptions", "timeline_facts", "root_cause_summary", "follow_up_actions", "iocs", "ttps", "evidence"] },
];

interface PolicyForm {
  name: string;
  description: string;
  classification: string;
  audience: string;
  active: boolean;
  buckets: Record<Bucket, string[]>;
}

function emptyForm(): PolicyForm {
  return { name: "", description: "", classification: "INTERNAL", audience: "INTERNAL", active: true, buckets: { allow: [], mask: [], remove: [], block: [] } };
}

function formFromPolicy(p: PolicyRule): PolicyForm {
  return {
    name: p.name,
    description: p.description ?? "",
    classification: p.classification,
    audience: p.audience ?? p.classification,
    active: p.active,
    buckets: { allow: [...p.allow], mask: [...p.mask], remove: [...p.remove], block: [...p.block] },
  };
}

function formFromTemplate(t: PolicyTemplate): PolicyForm {
  return {
    name: t.name,
    description: t.description,
    classification: t.classification,
    audience: t.audience,
    active: true,
    buckets: { allow: [...t.allow], mask: [...t.mask], remove: [...t.remove], block: [...t.block] },
  };
}

export function PoliciesView() {
  const [policies, setPolicies] = useState<PolicyRule[] | null>(null);
  const [editor, setEditor] = useState<{ mode: "create" | "edit" | "clone"; form: PolicyForm } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PolicyRule | null>(null);

  async function refresh() {
    try {
      setPolicies(await api.getPolicies());
    } catch {
      setPolicies([]);
    }
  }

  useEffect(() => { refresh(); }, []);
  if (!policies) return <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>;

  async function handleSave() {
    if (!editor) return;
    const { mode, form } = editor;
    setSaving(true);
    try {
      if (mode === "edit") {
        await api.updatePolicy(form.name, {
          description: form.description,
          classification: form.classification,
          audience: form.audience,
          ...form.buckets,
          active: form.active,
        });
        toast.success(`Updated "${form.name}"`);
      } else {
        await api.createPolicy({
          name: form.name,
          description: form.description,
          classification: form.classification,
          audience: form.audience,
          ...form.buckets,
          active: form.active,
        });
        toast.success(`Created "${form.name}"`, { description: "The policy is now available anywhere a policy can be applied." });
      }
      setEditor(null);
      await refresh();
    } catch (e: any) {
      toast.error("Save failed", { description: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(confirmDelete.name);
    try {
      await api.deletePolicy(confirmDelete.name);
      toast.success(`Deleted "${confirmDelete.name}"`);
      setConfirmDelete(null);
      await refresh();
    } catch (e: any) {
      toast.error("Delete failed", { description: e.message });
    } finally {
      setDeleting(null);
    }
  }

  async function toggleActive(p: PolicyRule) {
    try {
      const updated = await api.updatePolicy(p.name, { active: !p.active });
      setPolicies((prev) => prev?.map((x) => (x.name === p.name ? updated : x)) ?? prev);
      toast.success(`"${policyDisplayName(p.name)}" ${updated.active ? "activated" : "deactivated"}`);
    } catch (e: any) {
      toast.error("Update failed", { description: e.message });
    }
  }

  const customs = policies.filter((p) => !isBuiltinPolicy(p.name));

  return (
    <div className="space-y-4">
      <Card className="p-4 flex items-start gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted shrink-0"><ScrollText className="h-4 w-4 text-muted-foreground" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-tight flex items-center gap-1.5">
            Transformation policies
            <HelpButton title="Custom policies">
              Built-in profiles are locked — clone one (or start from a framework template) to make your own. Your policies appear everywhere a policy can be applied: sanitization, transformation, and the Policy Lab. Credentials and prompt injections can never be allow-listed, and injections are always quarantined no matter what a policy says.
            </HelpButton>
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{policies.length} profiles ({policies.length - customs.length} built-in · {customs.length} custom), enforced before model access.</p>
        </div>
        <Button size="sm" className="shrink-0 gap-1.5" onClick={() => setEditor({ mode: "create", form: emptyForm() })}>
          <Plus className="h-3.5 w-3.5" /> New policy
        </Button>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-1.5">
          <Landmark className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-tight">Framework templates</h3>
          <HelpButton title="About these templates">
            Starting points inspired by reputable public frameworks (OWASP GenAI, GDPR, HIPAA, PCI DSS), mapped onto this engine's buckets. They are not certifications — review with your compliance team, then save as your own editable policy.
          </HelpButton>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {POLICY_TEMPLATES.map((t) => (
            <div key={t.name} className="flex min-w-0 flex-col rounded-lg border border-border p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary shrink-0">{t.framework}</span>
                <span className="font-mono text-[11px] text-muted-foreground truncate" title={t.name}>{t.name}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground line-clamp-3" title={t.description}>{t.description}</p>
              <p className="mt-1.5 font-mono text-[10px] text-muted-foreground line-clamp-1" title={t.frameworkRef}>{t.frameworkRef}</p>
              <div className="mt-3 flex items-center gap-2">
                <ClassificationBadge value={t.classification} />
                <Button variant="outline" size="sm" className="ml-auto h-7 text-xs gap-1.5" onClick={() => setEditor({ mode: "create", form: formFromTemplate(t) })}>
                  <Copy className="h-3 w-3" /> Use template
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {policies.map((p) => {
          const builtin = isBuiltinPolicy(p.name);
          const m = META[p.name] ?? CUSTOM_META;
          const Icon = m.icon;
          return (
            <Card key={p.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${m.color}`}><Icon className="h-3.5 w-3.5" /></span>
                  <h3 className="text-sm font-semibold tracking-tight truncate" title={p.name}>{policyDisplayName(p.name)}</h3>
                  <ClassificationBadge value={p.classification as any} />
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                  <Badge className={builtin ? "bg-muted text-muted-foreground border-border" : "bg-primary/10 text-primary border-primary/25"}>{builtin ? "Built-in" : "Custom"}</Badge>
                  <Badge className={p.active ? "bg-[var(--risk-safe)]/10 text-[var(--risk-safe)] border-[var(--risk-safe)]/20" : "bg-muted text-muted-foreground border-border"}>{p.active ? "Active" : "Inactive"}</Badge>
                </div>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground line-clamp-2" title={p.description}>{p.description}</p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Bucket icon={CheckCircle2} label="Allow" items={p.allow} tone="safe" />
                <Bucket icon={EyeOff} label="Mask" items={p.mask} tone="low" />
                <Bucket icon={ShieldX} label="Remove" items={p.remove} tone="medium" />
                <Bucket icon={Ban} label="Block" items={p.block} tone="critical" />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={p.active} onCheckedChange={() => toggleActive(p)} aria-label={`${builtin ? "Deactivate" : "Activate"} ${p.name}`} />
                  <span>{p.active ? "Active" : "Inactive"}</span>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setEditor({ mode: "clone", form: { ...formFromPolicy(p), name: `${p.name}_CUSTOM`, active: true } })}>
                    <Copy className="h-3 w-3" /> Clone
                  </Button>
                  {!builtin && (
                    <>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setEditor({ mode: "edit", form: formFromPolicy(p) })}>
                        <Pencil className="h-3 w-3" /> Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(p)}>
                        <Trash2 className="h-3 w-3" /> Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {editor && (
        <PolicyEditor
          mode={editor.mode}
          form={editor.form}
          saving={saving}
          onChange={(form) => setEditor({ ...editor, form })}
          onSave={handleSave}
          onClose={() => setEditor(null)}
        />
      )}

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Delete policy?</DialogTitle></DialogHeader>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Remove “{confirmDelete && policyDisplayName(confirmDelete.name)}”? Documents already sanitized under it keep their working copies. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={!!deleting}>
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Bucket({ icon: Icon, label, items, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; items: string[]; tone: "safe" | "low" | "medium" | "critical" }) {
  const cls = {
    safe: "border-[var(--risk-safe)]/30 bg-[var(--risk-safe)]/5 text-[var(--risk-safe)]",
    low: "border-[var(--risk-low)]/30 bg-[var(--risk-low)]/5 text-[var(--risk-low)]",
    medium: "border-[var(--risk-medium)]/30 bg-[var(--risk-medium)]/5 text-[var(--risk-medium)]",
    critical: "border-[var(--risk-critical)]/30 bg-[var(--risk-critical)]/5 text-[var(--risk-critical)]",
  }[tone];
  return (
    <div className="rounded-lg border border-border p-3">
      <div className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider", cls)}><Icon className="h-3 w-3" /> {label}</div>
      <div className="mt-2 flex flex-wrap gap-1">
        {items.length === 0 ? <span className="text-[11px] text-muted-foreground">—</span> : items.map((it) => <span key={it} className="font-mono text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{it}</span>)}
      </div>
    </div>
  );
}


function PolicyEditor({
  mode, form, saving, onChange, onSave, onClose,
}: {
  mode: "create" | "edit" | "clone";
  form: PolicyForm;
  saving: boolean;
  onChange: (f: PolicyForm) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const set = (patch: Partial<PolicyForm>) => onChange({ ...form, ...patch });

  function toggle(bucket: Bucket, entry: string) {
    const has = form.buckets[bucket].includes(entry);
    const buckets = { ...form.buckets };
    if (has) {
      buckets[bucket] = buckets[bucket].filter((e) => e !== entry);
    } else {

      (Object.keys(buckets) as Bucket[]).forEach((b) => {
        buckets[b] = buckets[b].filter((e) => e !== entry);
      });
      buckets[bucket] = [...buckets[bucket], entry];
    }
    onChange({ ...form, buckets });
  }

  const errors = useMemo(() => {
    const out: string[] = [];
    if (!/^[A-Z][A-Z0-9_]{1,59}$/.test(form.name)) out.push("Name must be UPPER_SNAKE_CASE (letters, digits, underscores).");
    if (form.description.length > 500) out.push("Description must be 500 characters or fewer.");
    out.push(...validatePolicyBuckets(form.buckets));
    return out;
  }, [form]);

  const allowBlocked = useMemo(
    () => [...form.buckets.allow].filter((e) => (FORBIDDEN_ALLOW_ENTRIES as readonly string[]).includes(e)),
    [form.buckets]
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* sm: prefixes re-assert width: the dialog primitive's sm:max-w-lg would otherwise win the cascade on desktop */}
      <DialogContent className="max-w-3xl sm:max-w-3xl max-h-[88vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="text-sm tracking-tight">
            {mode === "edit" ? `Edit ${policyDisplayName(form.name)}` : mode === "clone" ? "Clone as new policy" : "New custom policy"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs font-medium">Name</Label>
            <Input
              value={form.name}
              disabled={mode === "edit"}
              onChange={(e) => set({ name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 60) })}
              placeholder="MY_TEAM_POLICY"
              className="mt-1.5 h-8 font-mono text-xs"
            />
            {mode !== "edit" && <p className="mt-1 text-[11px] text-muted-foreground">UPPER_SNAKE_CASE. Built-in names are reserved.</p>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="min-w-0">
              <Label className="text-xs font-medium">Class</Label>
              <Select value={form.classification} onValueChange={(v) => set({ classification: v })}>
                <SelectTrigger className="mt-1.5 h-8 w-full min-w-0 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "UNCLASSIFIED"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="text-xs font-medium">Audience</Label>
              <Select value={form.audience} onValueChange={(v) => set({ audience: v })}>
                <SelectTrigger className="mt-1.5 h-8 w-full min-w-0 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["PUBLIC", "INTERNAL", "EXECUTIVE", "HR", "SECURITY", "CUSTOM"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col justify-end pb-1">
              <Label className="text-xs font-medium mb-1.5">Active</Label>
              <Switch checked={form.active} onCheckedChange={(v) => set({ active: v })} aria-label="Policy active" />
            </div>
          </div>
        </div>

        <div>
          <Label className="text-xs font-medium">Description</Label>
          <Input value={form.description} onChange={(e) => set({ description: e.target.value.slice(0, 500) })} placeholder="What this policy is for and who should use it" className="mt-1.5 h-8 text-xs" />
        </div>

        <div className="rounded-lg border border-[var(--risk-medium)]/25 bg-[var(--risk-medium)]/5 p-3 text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Safety invariants (always enforced):</span> credentials and prompt injections can never be allow-listed
          {allowBlocked.length ? <span className="font-semibold text-[var(--risk-critical)]"> — remove {allowBlocked.join(", ")} from Allow to save</span> : null};
          injection spans are always quarantined regardless of bucket.
        </div>

        {(["allow", "mask", "remove", "block"] as Bucket[]).map((bucket) => (
          <div key={bucket} className="rounded-lg border border-border">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-muted/30 px-3 py-2">
              <span className="text-xs font-semibold capitalize">{bucket}</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{form.buckets[bucket].length}</span>
              <span className="text-[11px] text-muted-foreground">
                {bucket === "allow" && "— passes through untouched"}
                {bucket === "mask" && "— partially hidden"}
                {bucket === "remove" && "— fully redacted"}
                {bucket === "block" && "— force-removed"}
              </span>
            </div>
            <div className="space-y-3 p-3">
              {(bucket === "allow" ? [{ title: "Finding types & categories", entries: ENTRY_GROUPS.flatMap((g) => g.entries), buckets: ["allow"] as Bucket[] }, ...ALLOW_CLASS_GROUPS.map((g) => ({ ...g, buckets: ["allow"] as Bucket[] }))] : ENTRY_GROUPS).map((group) => (
                <div key={group.title}>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{group.title}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.entries.map((entry) => {
                      const checked = form.buckets[bucket].includes(entry);
                      const forbidden = bucket === "allow" && (FORBIDDEN_ALLOW_ENTRIES as readonly string[]).includes(entry);
                      return (
                        <label
                          key={entry}
                          title={forbidden ? "Cannot be allow-listed — credentials and injections never pass through" : (FINDING_TYPE_LABEL as Record<string, string>)[entry] ?? entry}
                          className={cn(
                            "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] transition-colors",
                            checked ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/60",
                            forbidden && "cursor-not-allowed opacity-50"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={forbidden}
                            onChange={() => toggle(bucket, entry)}
                            className="h-3 w-3 accent-primary"
                          />
                          {entry}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {errors.length > 0 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs leading-relaxed">
            <div className="font-semibold text-destructive">Fix before saving</div>
            <ul className="mt-1 list-disc pl-4 text-destructive/90">
              {errors.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={onSave} disabled={saving || errors.length > 0}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {mode === "edit" ? "Save changes" : "Create policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
