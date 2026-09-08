// SecureContent AI — shared domain types
// Consumed by both the API layer and the client UI.

export type Classification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "UNCLASSIFIED";

export type DocumentStatus =
  | "UPLOADED"
  | "SCANNED"
  | "SANITIZED"
  | "TRANSFORMED"
  | "BLOCKED";

export type FindingCategory = "PII" | "SECRET" | "PROMPT_INJECTION" | "INTERNAL_ASSET" | "UNSAFE_URL";

export type FindingType =
  | "EMAIL"
  | "PHONE"
  | "AADHAAR"
  | "PAN"
  | "CREDIT_CARD"
  | "IP_ADDRESS"
  | "PERSON_NAME"
  | "DATE_OF_BIRTH"
  | "ADDRESS"
  | "ORG_ID"
  | "API_KEY"
  | "JWT"
  | "PRIVATE_KEY"
  | "DB_CONN_STRING"
  | "CLOUD_CRED"
  | "PASSWORD"
  | "INJECTION_PHRASE"
  | "ROLE_MANIPULATION"
  | "HIDDEN_INSTRUCTION"
  | "TOOL_INVOCATION"
  | "INTERNAL_URL"
  | "INTERNAL_PROJECT";

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type SanitizeAction = "ALLOW" | "MASK" | "REDACT" | "REPLACE" | "QUARANTINE" | "BLOCK";
export type FindingStage = "INPUT" | "OUTPUT";

export interface Finding {
  id: string;
  documentId: string;
  category: FindingCategory;
  type: FindingType;
  severity: Severity;
  confidence: number;
  action: SanitizeAction;
  stage: FindingStage;
  location: string;
  matchedText: string;
  maskedText: string;
  reason: string;
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  title: string;
  sourceKind: "UPLOAD" | "SAMPLE" | "PASTE";
  classification: Classification;
  status: DocumentStatus;
  riskScore: number;
  riskBefore: number;
  riskAfter: number;
  rawContent: string;
  sanitizedContent: string | null;
  metadata: DocumentMeta;
  createdAt: string;
  updatedAt: string;
  findings?: Finding[];
  transformations?: TransformationRecord[];
}

export interface DocumentMeta {
  pages?: number;
  sections?: number;
  charCount?: number;
  wordCount?: number;
  sha256?: string;
  sourceFormat?: string;
}

export type TransformationProfile =
  | "PUBLIC_RELEASE"
  | "INTERNAL_SUMMARY"
  | "EXECUTIVE_BRIEF"
  | "HR_SAFE"
  | "SECURITY_INCIDENT";

export type OutputType =
  | "EXECUTIVE_SUMMARY"
  | "FAQ"
  | "TECHNICAL_REPORT"
  | "SLIDE_OUTLINE"
  | "EMAIL_DRAFT";

export type ValidationStatus = "PASS" | "FAIL" | "PENDING" | "SKIPPED";

export interface Citation {
  claim: string;
  evidence: string;
  grounded: boolean;
}

export interface TransformationRecord {
  id: string;
  documentId: string;
  profile: TransformationProfile;
  outputType: OutputType;
  model: string;
  outputContent: string | null;
  grounding: ValidationStatus;
  policyStatus: ValidationStatus;
  outputDlp: ValidationStatus;
  riskDelta: number;
  leakageCount: number;
  citations: Citation[];
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  documentId: string | null;
  actor: string;
  action: string;
  detail: string;
  timestamp: string;
}

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  classification: Classification;
  allow: string[];
  mask: string[];
  remove: string[];
  block: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SecurityReport {
  documentId: string;
  riskScore: number;
  riskBefore: number;
  riskAfter: number;
  classification: Classification;
  findings: {
    pii: number;
    secrets: number;
    promptInjection: number;
    internalAssets: number;
    unsafeUrls: number;
    outputLeakage: number;
  };
  severityBreakdown: Record<Severity, number>;
  grounding: ValidationStatus;
  policyStatus: ValidationStatus;
  outputDlp: ValidationStatus;
  topFindings: Finding[];
  sanitizedPreview: string;
  generatedAt: string;
}

export interface DashboardStats {
  totalDocuments: number;
  scannedDocuments: number;
  sanitizedDocuments: number;
  transformedDocuments: number;
  blockedDocuments: number;
  highRiskDocuments: number;
  totalFindings: number;
  secretsBlocked: number;
  piiDetected: number;
  injectionBlocked: number;
  safeOutputsReleased: number;
  avgRiskReduction: number;
  findingsByCategory: { category: string; count: number; color: string }[];
  documentsByClassification: { classification: string; count: number }[];
  riskTrend: { label: string; title: string; before: number; after: number }[];
  recentActivity: AuditLogEntry[];
}

export interface DetectionResult {
  findings: Omit<Finding, "id" | "documentId" | "createdAt">[];
  riskScore: number;
  classification: Classification;
}

export interface SanitizeResult {
  sanitizedContent: string;
  actions: { finding: Finding; action: SanitizeAction; reason: string }[];
}

export interface OutputDlpResult {
  passed: boolean;
  leakageFindings: Omit<Finding, "id" | "documentId" | "createdAt">[];
  reasons: string[];
}

export interface SampleDocument {
  id: string;
  title: string;
  description: string;
  category: "CLEAN" | "PII_HEAVY" | "SECRET_HEAVY" | "INJECTION" | "MIXED";
  scenario: string;
  content: string;
}
