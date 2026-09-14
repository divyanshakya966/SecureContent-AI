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
    mask: ["PERSON_NAME", "EMAIL", "PHONE", "ORG_ID", "IP_ADDRESS", "DATE_OF_BIRTH"],
    remove: ["AADHAAR", "PAN", "CREDIT_CARD", "INTERNAL_URL", "INTERNAL_PROJECT"],
    block: ["API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "CLOUD_CRED", "PASSWORD", "INJECTION_PHRASE", "ROLE_MANIPULATION", "HIDDEN_INSTRUCTION", "TOOL_INVOCATION"],
    active: true,
  },
  {
    name: "INTERNAL_SUMMARY",
    description:
      "Internal teams: aggregate detail is acceptable, but individuals must not be identifiable and no credentials may appear. Preserves internal project names.",
    classification: "INTERNAL",
    audience: "INTERNAL",
    allow: ["high_level_facts", "aggregate_statistics", "internal_project_names"],
    mask: ["PERSON_NAME", "EMAIL", "PHONE", "DATE_OF_BIRTH"],
    remove: ["AADHAAR", "PAN", "CREDIT_CARD", "API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "PASSWORD", "INJECTION_PHRASE", "ROLE_MANIPULATION", "HIDDEN_INSTRUCTION", "TOOL_INVOCATION"],
    block: ["CLOUD_CRED"],
    active: true,
  },
  {
    name: "EXECUTIVE_BRIEF",
    description:
      "Executives: concise, strategic. Operational secrets omitted; strategic context preserved. Audience: leadership.",
    classification: "CONFIDENTIAL",
    audience: "EXECUTIVE",
    allow: ["high_level_facts", "aggregate_statistics", "strategic_context"],
    mask: ["PERSON_NAME", "EMAIL", "PHONE", "IP_ADDRESS", "ORG_ID"],
    remove: ["AADHAAR", "PAN", "CREDIT_CARD", "API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "PASSWORD", "INTERNAL_URL"],
    block: ["INJECTION_PHRASE", "ROLE_MANIPULATION", "HIDDEN_INSTRUCTION", "TOOL_INVOCATION", "CLOUD_CRED"],
    active: true,
  },
  {
    name: "HR_SAFE",
    description:
      "HR audience: strong PII minimization — names, contact details, IDs, and dates of birth are masked or removed. Roles preserved, not names.",
    classification: "CONFIDENTIAL",
    audience: "HR",
    allow: ["aggregate_statistics", "role_descriptions"],
    mask: ["PERSON_NAME", "EMAIL", "PHONE", "ORG_ID"],
    remove: ["AADHAAR", "PAN", "CREDIT_CARD", "DATE_OF_BIRTH", "IP_ADDRESS", "INTERNAL_URL", "API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "PASSWORD"],
    block: ["INJECTION_PHRASE", "ROLE_MANIPULATION", "HIDDEN_INSTRUCTION", "TOOL_INVOCATION", "CLOUD_CRED"],
    active: true,
  },
  {
    name: "SECURITY_INCIDENT",
    description:
      "Security responders: timeline, root cause, IOCs, TTPs preserved; credentials abstracted; injections quarantined. Audience: SOC/incident team.",
    classification: "RESTRICTED",
    audience: "SECURITY",
    allow: ["timeline_facts", "root_cause_summary", "follow_up_actions", "iocs", "ttps", "evidence"],
    mask: ["PERSON_NAME", "EMAIL", "PHONE", "IP_ADDRESS", "ORG_ID"],
    remove: ["API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "PASSWORD", "CLOUD_CRED", "INTERNAL_URL", "INTERNAL_PROJECT"],
    block: ["INJECTION_PHRASE", "ROLE_MANIPULATION", "HIDDEN_INSTRUCTION", "TOOL_INVOCATION", "AADHAAR", "PAN", "CREDIT_CARD"],
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
