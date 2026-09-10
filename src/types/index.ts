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
  intelligence?: IntelligenceReport | null;
}

export interface DocumentMeta {
  pages?: number;
  sections?: number;
  charCount?: number;
  wordCount?: number;
  sha256?: string;
  sourceFormat?: string;
  warnings?: string[];
  parser?: string;
  intelligenceVersion?: string;
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
  /** Human audience this policy is tailored for — distinct from classification. */
  audience?: string;
  allow: string[];
  mask: string[];
  remove: string[];
  block: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Policy-Aware Transformation (signature innovation #1)
// ---------------------------------------------------------------------------

export type AudienceKey = "PUBLIC" | "INTERNAL" | "EXECUTIVE" | "HR" | "SECURITY" | "CUSTOM";

export interface PolicyCompareItem {
  profile: TransformationProfile;
  audience: string;
  sanitizedPreview: string;
  sanitizedContent: string;
  findingsRedacted: number;
  riskBefore: number;
  riskAfter: number;
  blocked: boolean;
  blockReason?: string;
  transformation?: TransformationRecord;
}

export interface PolicyCompareResult {
  documentId: string;
  outputType: OutputType;
  items: PolicyCompareItem[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Intelligence-Aware Extraction (signature innovation #2)
// ---------------------------------------------------------------------------

export type EntityType = "PERSON" | "ORG" | "LOCATION" | "EMAIL" | "PHONE" | "DATE" | "IP" | "URL" | "ID" | "MISC";
export type IOCType = "IP" | "DOMAIN" | "URL" | "HASH_MD5" | "HASH_SHA1" | "HASH_SHA256" | "CVE" | "EMAIL" | "PHONE";
export type TacticType = "Reconnaissance" | "Resource Development" | "Initial Access" | "Execution" | "Persistence" | "Privilege Escalation" | "Defense Evasion" | "Credential Access" | "Discovery" | "Lateral Movement" | "Collection" | "Exfiltration" | "Command and Control" | "Impact";

export interface ExtractedEntity {
  type: EntityType;
  value: string;
  location: string;
  confidence: number;
  context?: string;
}

export interface IOC {
  type: IOCType;
  value: string;
  location: string;
  severity: Severity;
  confidence: number;
  context?: string;
}

export interface TTP {
  technique: string;
  tactic: TacticType;
  mitreId: string; // e.g. T1566, T1003
  confidence: number;
  evidence: string;
  location: string;
}

export interface IntelRisk {
  category: string;
  severity: Severity;
  description: string;
  score: number;
  evidence?: string;
}

export interface KeyFinding {
  finding: string;
  evidence: string;
  location: string;
  confidence: number;
  grounded: boolean;
}

export interface IntelligenceReport {
  id: string;
  documentId: string;
  entities: ExtractedEntity[];
  iocs: IOC[];
  ttps: TTP[];
  risks: IntelRisk[];
  keyFindings: KeyFinding[];
  evidence: { claim: string; source: string; location: string }[];
  summary: string;
  riskScore: number;
  classification: Classification;
  model: string;
  createdAt: string;
  // counts for dashboard
  counts: {
    entities: number;
    iocs: number;
    ttps: number;
    risks: number;
    keyFindings: number;
  };
}

// ---------------------------------------------------------------------------
// Zero-Trust Pipeline (signature innovation #3) — validation types
// ---------------------------------------------------------------------------

export type TrustBoundary = "T1_BROWSER_BACKEND" | "T2_BACKEND_PARSER" | "T3_SANITIZED_LLM" | "T4_RAG_LLM" | "T5_LLM_VALIDATOR" | "T6_BACKEND_STORAGE" | "T7_BACKEND_PROVIDER";

export interface ZeroTrustGate {
  boundary: TrustBoundary;
  status: ValidationStatus;
  checks: { name: string; passed: boolean; detail: string }[];
  timestamp: string;
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
  // Intelligence stats (signature innovation #2)
  totalIntelligenceReports?: number;
  totalEntities?: number;
  totalIOCs?: number;
  totalTTPs?: number;
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
