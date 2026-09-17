// Framework-aligned policy templates (clone and tune; not compliance certifications).

import type { Classification } from "@/types";

export interface PolicyTemplate {
  /** Suggested UPPER_SNAKE_CASE policy name (editable before creation). */
  name: string;
  /** Framework this template is aligned with. */
  framework: string;
  /** Short framework reference shown in the gallery. */
  frameworkRef: string;
  description: string;
  classification: Classification;
  audience: string;
  allow: string[];
  mask: string[];
  remove: string[];
  block: string[];
}

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    name: "OWASP_GENAI_STRICT",
    framework: "OWASP GenAI",
    frameworkRef: "OWASP GenAI LLM Top 10 — LLM01 (prompt injection), LLM02 (sensitive information disclosure), LLM06 (excessive agency)",
    description:
      "Maximum-caution profile aligned with the OWASP GenAI guidance: prompt-injection content is quarantined, all credentials are blocked from ever reaching the model, and every identifier class is removed or masked. Use for untrusted or external-facing sources.",
    classification: "RESTRICTED",
    audience: "SECURITY",
    allow: ["high_level_facts", "aggregate_statistics"],
    mask: ["PERSON_NAME", "EMAIL", "PHONE", "ORG_ID", "IP_ADDRESS", "IPV6_ADDRESS", "POSTAL_CODE"],
    remove: [
      "AADHAAR", "PAN", "SSN", "PASSPORT", "DRIVERS_LICENSE", "ADDRESS",
      "CREDIT_CARD", "BANK_ACCOUNT", "IBAN", "IFSC", "UPI", "DATE_OF_BIRTH",
      "INTERNAL_URL", "UNSAFE_URL", "INTERNAL_PROJECT",
    ],
    block: [
      "API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "CLOUD_CRED",
      "AUTH_TOKEN", "PASSWORD", "INJECTION_PHRASE", "ROLE_MANIPULATION",
      "HIDDEN_INSTRUCTION", "TOOL_INVOCATION",
    ],
  },
  {
    name: "GDPR_MINIMIZED",
    framework: "GDPR",
    frameworkRef: "GDPR Art. 5(1)(c) data minimisation — process only what is adequate, relevant and necessary",
    description:
      "EU privacy–aligned starting point built around data minimisation: direct identifiers are removed, contact data is masked, and nothing credential-like is retained. Review with your DPO — retention, lawful basis, and subject-rights handling live outside this policy.",
    classification: "CONFIDENTIAL",
    audience: "CUSTOM",
    allow: ["aggregate_statistics", "role_descriptions"],
    mask: ["PERSON_NAME", "EMAIL", "PHONE", "ORG_ID", "IP_ADDRESS", "IPV6_ADDRESS", "POSTAL_CODE"],
    remove: [
      "AADHAAR", "PAN", "SSN", "PASSPORT", "DRIVERS_LICENSE", "ADDRESS",
      "CREDIT_CARD", "BANK_ACCOUNT", "IBAN", "IFSC", "UPI", "DATE_OF_BIRTH",
      "INTERNAL_URL", "UNSAFE_URL",
    ],
    block: [
      "API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "CLOUD_CRED",
      "AUTH_TOKEN", "PASSWORD", "INJECTION_PHRASE", "ROLE_MANIPULATION",
      "HIDDEN_INSTRUCTION", "TOOL_INVOCATION", "INTERNAL_PROJECT",
    ],
  },
  {
    name: "HIPAA_SAFE_HARBOR",
    framework: "HIPAA",
    frameworkRef: "HIPAA Privacy Rule §164.514(b)(2) Safe Harbor — 18 identifier classes",
    description:
      "Health-data handling starting point mapped from HIPAA Safe Harbor's 18 identifier classes onto the detectors in this engine (names, locations, dates, contacts, IDs, IPs, URLs). Treat as de-identification assistance only — expert determination and your own review are still required.",
    classification: "RESTRICTED",
    audience: "CUSTOM",
    allow: ["aggregate_statistics"],
    mask: ["PERSON_NAME", "ORG_ID", "IP_ADDRESS", "IPV6_ADDRESS"],
    remove: [
      "EMAIL", "PHONE", "ADDRESS", "POSTAL_CODE", "DATE_OF_BIRTH",
      "AADHAAR", "PAN", "SSN", "PASSPORT", "DRIVERS_LICENSE",
      "CREDIT_CARD", "BANK_ACCOUNT", "IBAN", "IFSC", "UPI",
      "INTERNAL_URL", "UNSAFE_URL", "INTERNAL_PROJECT",
    ],
    block: [
      "API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "CLOUD_CRED",
      "AUTH_TOKEN", "PASSWORD", "INJECTION_PHRASE", "ROLE_MANIPULATION",
      "HIDDEN_INSTRUCTION", "TOOL_INVOCATION",
    ],
  },
  {
    name: "PCI_DSS_SAFE",
    framework: "PCI DSS",
    frameworkRef: "PCI DSS Req. 3 — protect stored account data; never retain sensitive authentication data",
    description:
      "Payment-data starting point aligned with PCI DSS storage principles: card numbers, verification values, and bank rails are blocked or removed outright; contact PII is masked. Never use outputs as a cardholder-data store — this policy reduces exposure, it does not make storage compliant.",
    classification: "CONFIDENTIAL",
    audience: "CUSTOM",
    allow: ["high_level_facts", "aggregate_statistics"],
    mask: ["PERSON_NAME", "EMAIL", "PHONE", "ORG_ID", "IP_ADDRESS", "IPV6_ADDRESS", "POSTAL_CODE", "DATE_OF_BIRTH"],
    remove: [
      "AADHAAR", "PAN", "SSN", "PASSPORT", "DRIVERS_LICENSE", "ADDRESS",
      "INTERNAL_URL", "UNSAFE_URL", "INTERNAL_PROJECT",
    ],
    block: [
      "CREDIT_CARD", "BANK_ACCOUNT", "IBAN", "IFSC", "UPI",
      "API_KEY", "JWT", "PRIVATE_KEY", "DB_CONN_STRING", "CLOUD_CRED",
      "AUTH_TOKEN", "PASSWORD", "INJECTION_PHRASE", "ROLE_MANIPULATION",
      "HIDDEN_INSTRUCTION", "TOOL_INVOCATION",
    ],
  },
];
