// SecureContent AI — Built-in transformation policies.
// Each policy defines what the generated output is allowed to contain.

import type { PolicyRule } from "@/types";

export const DEFAULT_POLICIES: Omit<PolicyRule, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "PUBLIC_RELEASE",
    description:
      "Strictest profile. Public audience: high-level facts and public contacts only. All PII, secrets, internal assets, and prompt injection are removed or redacted.",
    classification: "PUBLIC",
    audience: "PUBLIC",
    allow: ["high_level_facts", "aggregate_statistics", "public_contact_information"],
    mask: ["PERSON_NAME", "EMAIL", "PHONE", "ORG_ID", "IP_ADDRESS", "IPV6_ADDRESS", "DATE_OF_BIRTH", "POSTAL_CODE"],
    remove: ["AADHAAR", "PAN", "SSN", "PASSPORT", "DRIVERS_LICENSE", "ADDRESS", "CREDIT_CARD", "BANK_ACCOUNT", "IBAN", "IFSC", "UPI", "INTERNAL_URL", "UNSAFE_URL", "INTERNAL_PROJECT"],
    block: ["API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "CLOUD_CRED", "AUTH_TOKEN", "PASSWORD", "INJECTION_PHRASE", "ROLE_MANIPULATION", "HIDDEN_INSTRUCTION", "TOOL_INVOCATION"],
    active: true,
  },
  {
    name: "INTERNAL_SUMMARY",
    description:
      "Internal teams: aggregate detail is acceptable, but individuals must not be identifiable and no credentials may appear. Preserves internal project names.",
    classification: "INTERNAL",
    audience: "INTERNAL",
    allow: ["high_level_facts", "aggregate_statistics", "internal_project_names"],
    mask: ["PERSON_NAME", "EMAIL", "PHONE", "DATE_OF_BIRTH", "ORG_ID", "IP_ADDRESS", "IPV6_ADDRESS", "POSTAL_CODE"],
    remove: ["AADHAAR", "PAN", "SSN", "PASSPORT", "DRIVERS_LICENSE", "ADDRESS", "CREDIT_CARD", "BANK_ACCOUNT", "IBAN", "IFSC", "UPI", "INTERNAL_URL", "UNSAFE_URL"],
    block: ["API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "CLOUD_CRED", "AUTH_TOKEN", "PASSWORD", "INJECTION_PHRASE", "ROLE_MANIPULATION", "HIDDEN_INSTRUCTION", "TOOL_INVOCATION", "INTERNAL_PROJECT"],
    active: true,
  },
  {
    name: "EXECUTIVE_BRIEF",
    description:
      "Executives: concise, strategic. Operational secrets omitted; strategic context preserved. Audience: leadership.",
    classification: "CONFIDENTIAL",
    audience: "EXECUTIVE",
    allow: ["high_level_facts", "aggregate_statistics", "strategic_context"],
    mask: ["PERSON_NAME", "EMAIL", "PHONE", "IP_ADDRESS", "IPV6_ADDRESS", "ORG_ID", "POSTAL_CODE"],
    remove: ["AADHAAR", "PAN", "SSN", "PASSPORT", "DRIVERS_LICENSE", "ADDRESS", "CREDIT_CARD", "BANK_ACCOUNT", "IBAN", "IFSC", "UPI", "API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "CLOUD_CRED", "AUTH_TOKEN", "PASSWORD", "INTERNAL_URL", "UNSAFE_URL"],
    block: ["INJECTION_PHRASE", "ROLE_MANIPULATION", "HIDDEN_INSTRUCTION", "TOOL_INVOCATION", "INTERNAL_PROJECT"],
    active: true,
  },
  {
    name: "HR_SAFE",
    description:
      "HR audience: strong PII minimization — names, contact details, IDs, and dates of birth are masked or removed. Roles preserved, not names.",
    classification: "CONFIDENTIAL",
    audience: "HR",
    allow: ["aggregate_statistics", "role_descriptions"],
    mask: ["PERSON_NAME", "EMAIL", "PHONE", "ORG_ID", "IP_ADDRESS", "IPV6_ADDRESS"],
    remove: ["AADHAAR", "PAN", "SSN", "PASSPORT", "DRIVERS_LICENSE", "ADDRESS", "CREDIT_CARD", "BANK_ACCOUNT", "IBAN", "IFSC", "UPI", "DATE_OF_BIRTH", "POSTAL_CODE", "INTERNAL_URL", "UNSAFE_URL", "API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "CLOUD_CRED", "AUTH_TOKEN", "PASSWORD"],
    block: ["INJECTION_PHRASE", "ROLE_MANIPULATION", "HIDDEN_INSTRUCTION", "TOOL_INVOCATION", "INTERNAL_PROJECT"],
    active: true,
  },
  {
    name: "SECURITY_INCIDENT",
    description:
      "Security responders: timeline, root cause, IOCs, TTPs preserved; credentials abstracted; injections quarantined. Audience: SOC/incident team.",
    classification: "RESTRICTED",
    audience: "SECURITY",
    allow: ["timeline_facts", "root_cause_summary", "follow_up_actions", "iocs", "ttps", "evidence"],
    mask: ["PERSON_NAME", "EMAIL", "PHONE", "IP_ADDRESS", "IPV6_ADDRESS", "ORG_ID", "POSTAL_CODE"],
    remove: ["API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "CLOUD_CRED", "AUTH_TOKEN", "PASSWORD", "INTERNAL_URL", "UNSAFE_URL", "INTERNAL_PROJECT", "ADDRESS", "BANK_ACCOUNT", "IBAN", "IFSC", "UPI"],
    block: ["INJECTION_PHRASE", "ROLE_MANIPULATION", "HIDDEN_INSTRUCTION", "TOOL_INVOCATION", "AADHAAR", "PAN", "SSN", "PASSPORT", "DRIVERS_LICENSE", "CREDIT_CARD"],
    active: true,
  },
];

export function findPolicy(
  policies: PolicyRule[],
  name: string
): PolicyRule | undefined {
  return policies.find((p) => p.name === name && p.active);
}

export const POLICY_LABELS: Record<string, string> = {
  PUBLIC_RELEASE: "Public Release",
  INTERNAL_SUMMARY: "Internal Summary",
  EXECUTIVE_BRIEF: "Executive Brief",
  HR_SAFE: "HR Safe",
  SECURITY_INCIDENT: "Security Incident",
};

export const OUTPUT_LABELS: Record<string, string> = {
  EXECUTIVE_SUMMARY: "Executive Summary",
  FAQ: "FAQ",
  TECHNICAL_REPORT: "Technical Report",
  SLIDE_OUTLINE: "Slide Outline",
  EMAIL_DRAFT: "Email Draft",
  PRESS_RELEASE: "Press Release",
  SOCIAL_POST: "Social Post",
  NEWSLETTER: "Newsletter",
  POLICY_BRIEF: "Policy Brief",
  TRAINING_GUIDE: "Training Guide",
  INCIDENT_SUMMARY: "Incident Summary",
  RESEARCH_DIGEST: "Research Digest",
  ANNOUNCEMENT: "Announcement",
  BLOG_POST: "Blog Post",
  MEETING_MINUTES: "Meeting Minutes",
};

// ---------------------------------------------------------------------------
// Custom-policy support
// ---------------------------------------------------------------------------

/** Names shipped with the platform. Built-ins are immutable (clone to customize). */
export const BUILTIN_POLICY_NAMES: readonly string[] = [
  "PUBLIC_RELEASE",
  "INTERNAL_SUMMARY",
  "EXECUTIVE_BRIEF",
  "HR_SAFE",
  "SECURITY_INCIDENT",
] as const;

export function isBuiltinPolicy(name: string): boolean {
  return (BUILTIN_POLICY_NAMES as readonly string[]).includes(name);
}

/** Human label for any policy name, including user-created ones. */
export function policyDisplayName(name: string): string {
  return POLICY_LABELS[name] ?? name.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Every value the engine understands inside allow/mask/remove/block buckets. */
export const KNOWN_BUCKET_ENTRIES: readonly string[] = [
  // Finding types
  "EMAIL", "PHONE", "AADHAAR", "PAN", "CREDIT_CARD", "SSN", "PASSPORT",
  "DRIVERS_LICENSE", "POSTAL_CODE", "BANK_ACCOUNT", "IBAN", "IFSC", "UPI",
  "IP_ADDRESS", "IPV6_ADDRESS", "PERSON_NAME", "DATE_OF_BIRTH", "ADDRESS",
  "ORG_ID", "API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "CLOUD_CRED",
  "AUTH_TOKEN", "PASSWORD", "INJECTION_PHRASE", "ROLE_MANIPULATION",
  "HIDDEN_INSTRUCTION", "TOOL_INVOCATION", "UNSAFE_URL", "INTERNAL_URL",
  "INTERNAL_PROJECT",
  // Finding categories
  "PII", "SECRET", "PROMPT_INJECTION", "INTERNAL_ASSET", "UNSAFE_URL",
  // Legacy allow-tokens (content classes, not finding types)
  "high_level_facts", "aggregate_statistics", "public_contact_information",
  "internal_project_names", "strategic_context", "role_descriptions",
  "timeline_facts", "root_cause_summary", "follow_up_actions", "iocs", "ttps", "evidence",
] as const;

/**
 * Entries that must NEVER appear in `allow`. Allowing them would pipe live
 * credentials into model prompts. The engine also force-quarantines prompt
 * injection regardless of bucket — this keeps the API honest up front.
 */
export const FORBIDDEN_ALLOW_ENTRIES: readonly string[] = [
  "SECRET",
  "API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "CLOUD_CRED", "AUTH_TOKEN", "PASSWORD",
  "PROMPT_INJECTION",
  "INJECTION_PHRASE", "ROLE_MANIPULATION", "HIDDEN_INSTRUCTION", "TOOL_INVOCATION",
] as const;

export interface PolicyBucketInput {
  allow?: string[];
  mask?: string[];
  remove?: string[];
  block?: string[];
}

/** Shared bucket validation used by the API and (via import) the policy editor. */
export function validatePolicyBuckets(buckets: PolicyBucketInput): string[] {
  const errors: string[] = [];
  const known = new Set<string>(KNOWN_BUCKET_ENTRIES);
  const seen = new Map<string, string>(); // entry -> first bucket
  (["allow", "mask", "remove", "block"] as const).forEach((bucket) => {
    const entries = buckets[bucket] ?? [];
    if (entries.length > 100) errors.push(`${bucket}: too many entries (max 100).`);
    for (const raw of entries) {
      const entry = String(raw ?? "").trim();
      if (!entry) {
        errors.push(`${bucket}: empty entry.`);
        continue;
      }
      if (!known.has(entry)) {
        errors.push(`${bucket}: unknown entry "${entry.slice(0, 60)}" — pick from the known finding types.`);
        continue;
      }
      const first = seen.get(entry);
      if (first && first !== bucket) {
        errors.push(`"${entry}" appears in both ${first} and ${bucket} — each entry belongs in exactly one bucket.`);
      } else if (!first) {
        seen.set(entry, bucket);
      }
    }
  });
  for (const entry of buckets.allow ?? []) {
    if ((FORBIDDEN_ALLOW_ENTRIES as readonly string[]).includes(String(entry))) {
      errors.push(`allow: "${entry}" must never be allow-listed — credentials and injections cannot pass through to the model.`);
    }
  }
  return errors;
}
