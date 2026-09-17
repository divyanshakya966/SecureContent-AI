

import type {
  Classification,
  DocumentStatus,
  FindingCategory,
  FindingType,
  SanitizeAction,
  Severity,
  ValidationStatus,
} from "@/types";

export function riskColor(score: number): string {
  if (score >= 70) return "var(--risk-critical)";
  if (score >= 40) return "var(--risk-high)";
  if (score >= 15) return "var(--risk-medium)";
  if (score > 0) return "var(--risk-low)";
  return "var(--risk-safe)";
}

export function riskLabel(score: number): string {
  if (score >= 70) return "Critical";
  if (score >= 40) return "High";
  if (score >= 15) return "Medium";
  if (score > 0) return "Low";
  return "Safe";
}

export const SEVERITY_STYLE: Record<Severity, string> = {
  CRITICAL: "bg-[var(--risk-critical)]/10 text-[var(--risk-critical)] border-[var(--risk-critical)]/30",
  HIGH: "bg-[var(--risk-high)]/10 text-[var(--risk-high)] border-[var(--risk-high)]/30",
  MEDIUM: "bg-[var(--risk-medium)]/10 text-[var(--risk-medium)] border-[var(--risk-medium)]/30",
  LOW: "bg-[var(--risk-low)]/10 text-[var(--risk-low)] border-[var(--risk-low)]/30",
};

export const CLASSIFICATION_STYLE: Record<string, string> = {
  PUBLIC: "bg-[var(--risk-low)]/10 text-[var(--risk-low)] border-[var(--risk-low)]/30",
  INTERNAL: "bg-[var(--chart-4)]/10 text-[var(--chart-4)] border-[var(--chart-4)]/30",
  CONFIDENTIAL: "bg-[var(--risk-medium)]/10 text-[var(--risk-medium)] border-[var(--risk-medium)]/30",
  RESTRICTED: "bg-[var(--risk-critical)]/10 text-[var(--risk-critical)] border-[var(--risk-critical)]/30",
  UNCLASSIFIED: "bg-muted text-muted-foreground border-border",
};

export const STATUS_STYLE: Record<DocumentStatus, string> = {
  UPLOADED: "bg-muted text-muted-foreground border-border",
  SCANNED: "bg-[var(--chart-4)]/10 text-[var(--chart-4)] border-[var(--chart-4)]/30",
  SANITIZED: "bg-[var(--risk-low)]/10 text-[var(--risk-low)] border-[var(--risk-low)]/30",
  TRANSFORMED: "bg-[var(--risk-safe)]/10 text-[var(--risk-safe)] border-[var(--risk-safe)]/30",
  BLOCKED: "bg-[var(--risk-critical)]/10 text-[var(--risk-critical)] border-[var(--risk-critical)]/30",
};

export const VALIDATION_STYLE: Record<ValidationStatus, string> = {
  PASS: "bg-[var(--risk-safe)]/10 text-[var(--risk-safe)] border-[var(--risk-safe)]/30",
  FAIL: "bg-[var(--risk-critical)]/10 text-[var(--risk-critical)] border-[var(--risk-critical)]/30",
  PENDING: "bg-[var(--risk-medium)]/10 text-[var(--risk-medium)] border-[var(--risk-medium)]/30",
  SKIPPED: "bg-muted text-muted-foreground border-border",
};

export const CATEGORY_META: Record<FindingCategory, { label: string; color: string }> = {
  PII: { label: "PII", color: "var(--chart-1)" },
  SECRET: { label: "Secret", color: "var(--chart-3)" },
  PROMPT_INJECTION: { label: "Injection", color: "var(--chart-5)" },
  INTERNAL_ASSET: { label: "Internal Asset", color: "var(--chart-2)" },
  UNSAFE_URL: { label: "Unsafe URL", color: "var(--chart-4)" },
};

export const ACTION_STYLE: Record<SanitizeAction, string> = {
  ALLOW: "bg-muted text-muted-foreground border-border",
  MASK: "bg-[var(--chart-4)]/10 text-[var(--chart-4)] border-[var(--chart-4)]/30",
  REDACT: "bg-[var(--risk-medium)]/10 text-[var(--risk-medium)] border-[var(--risk-medium)]/30",
  REPLACE: "bg-[var(--risk-low)]/10 text-[var(--risk-low)] border-[var(--risk-low)]/30",
  QUARANTINE: "bg-[var(--chart-5)]/10 text-[var(--chart-5)] border-[var(--chart-5)]/30",
  BLOCK: "bg-[var(--risk-critical)]/10 text-[var(--risk-critical)] border-[var(--risk-critical)]/30",
};

export const FINDING_TYPE_LABEL: Record<FindingType, string> = {
  EMAIL: "Email",
  PHONE: "Phone",
  AADHAAR: "Aadhaar ID",
  PAN: "PAN",
  CREDIT_CARD: "Credit Card",
  SSN: "SSN",
  PASSPORT: "Passport",
  DRIVERS_LICENSE: "Driver License",
  POSTAL_CODE: "Postal Code",
  BANK_ACCOUNT: "Bank Account",
  IBAN: "IBAN",
  IFSC: "IFSC",
  UPI: "UPI ID",
  IP_ADDRESS: "IP Address",
  IPV6_ADDRESS: "IPv6 Address",
  PERSON_NAME: "Person Name",
  DATE_OF_BIRTH: "Date of Birth",
  ADDRESS: "Address",
  ORG_ID: "Org Identifier",
  API_KEY: "API Key",
  JWT: "JWT",
  PRIVATE_KEY: "Private Key",
  DB_CONN_STRING: "DB Connection",
  CLOUD_CRED: "Cloud Credential",
  AUTH_TOKEN: "Auth Token",
  PASSWORD: "Password / Secret",
  INJECTION_PHRASE: "Injection Phrase",
  ROLE_MANIPULATION: "Role Manipulation",
  HIDDEN_INSTRUCTION: "Hidden Instruction",
  TOOL_INVOCATION: "Tool Invocation",
  UNSAFE_URL: "Unsafe URL",
  INTERNAL_URL: "Internal URL",
  INTERNAL_PROJECT: "Internal Project",
};

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
