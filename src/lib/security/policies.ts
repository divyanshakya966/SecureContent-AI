// SecureContent AI — Built-in transformation policies.
// Each policy defines what the generated output is allowed to contain.

import type { PolicyRule } from "@/types";

export const DEFAULT_POLICIES: Omit<PolicyRule, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "PUBLIC_RELEASE",
    description:
      "Strictest profile. Output is intended for unrestricted public distribution. All PII, secrets, internal assets, and prompt injection are removed or redacted.",
    classification: "PUBLIC",
    allow: ["high_level_facts", "aggregate_statistics", "public_contact_information"],
    mask: ["PERSON_NAME", "EMAIL", "PHONE", "ORG_ID", "IP_ADDRESS", "DATE_OF_BIRTH"],
    remove: ["AADHAAR", "PAN", "CREDIT_CARD", "INTERNAL_URL", "INTERNAL_PROJECT"],
    block: ["API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "CLOUD_CRED", "PASSWORD", "INJECTION_PHRASE", "ROLE_MANIPULATION", "HIDDEN_INSTRUCTION", "TOOL_INVOCATION"],
    active: true,
  },
  {
    name: "INTERNAL_SUMMARY",
    description:
      "Output for internal teams. PII is masked, secrets are removed, prompt injection is quarantined. Internal identifiers may be retained in aggregate form.",
    classification: "INTERNAL",
    allow: ["high_level_facts", "aggregate_statistics", "internal_project_names"],
    mask: ["PERSON_NAME", "EMAIL", "PHONE", "DATE_OF_BIRTH"],
    remove: ["AADHAAR", "PAN", "CREDIT_CARD", "API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "PASSWORD", "INJECTION_PHRASE", "ROLE_MANIPULATION", "HIDDEN_INSTRUCTION", "TOOL_INVOCATION"],
    block: ["CLOUD_CRED"],
    active: true,
  },
  {
    name: "EXECUTIVE_BRIEF",
    description:
      "Concise brief for leadership. Removes operational secrets, redacts government IDs, masks contact details, preserves strategic context.",
    classification: "CONFIDENTIAL",
    allow: ["high_level_facts", "aggregate_statistics", "strategic_context"],
    mask: ["PERSON_NAME", "EMAIL", "PHONE", "IP_ADDRESS", "ORG_ID"],
    remove: ["AADHAAR", "PAN", "CREDIT_CARD", "API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "PASSWORD", "INTERNAL_URL"],
    block: ["INJECTION_PHRASE", "ROLE_MANIPULATION", "HIDDEN_INSTRUCTION", "TOOL_INVOCATION", "CLOUD_CRED"],
    active: true,
  },
  {
    name: "HR_SAFE",
    description:
      "HR-safe summary. Strong PII minimization — names, contact details, IDs, and dates of birth are masked or removed.",
    classification: "CONFIDENTIAL",
    allow: ["aggregate_statistics", "role_descriptions"],
    mask: ["PERSON_NAME", "EMAIL", "PHONE", "ORG_ID"],
    remove: ["AADHAAR", "PAN", "CREDIT_CARD", "DATE_OF_BIRTH", "IP_ADDRESS", "INTERNAL_URL", "API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "PASSWORD"],
    block: ["INJECTION_PHRASE", "ROLE_MANIPULATION", "HIDDEN_INSTRUCTION", "TOOL_INVOCATION", "CLOUD_CRED"],
    active: true,
  },
  {
    name: "SECURITY_INCIDENT",
    description:
      "Incident postmortem transformation. Operational secrets and credentials are removed; infrastructure identifiers are abstracted; injection attempts are quarantined.",
    classification: "RESTRICTED",
    allow: ["timeline_facts", "root_cause_summary", "follow_up_actions"],
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
  EMAIL_DRAFT: "Email / Newsletter Draft",
};
