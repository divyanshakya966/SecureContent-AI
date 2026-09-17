// Security engine public surface.

export { scanContent, detectOutputLeakage } from "./detectors";
export type { RawFinding } from "./detectors";
export { computeRisk } from "./risk";
export type { RiskBreakdown } from "./risk";
export { sanitizeContent, overrideKeyForFinding } from "./sanitize";
export type { SanitizeOutput, SanitizeActionRecord, FindingOverrides } from "./sanitize";
export { runOutputDlp } from "./output-dlp";
export type { OutputDlpResult } from "./output-dlp";
export { DEFAULT_POLICIES, findPolicy, POLICY_LABELS, OUTPUT_LABELS, BUILTIN_POLICY_NAMES, isBuiltinPolicy, policyDisplayName, KNOWN_BUCKET_ENTRIES, FORBIDDEN_ALLOW_ENTRIES, validatePolicyBuckets } from "./policies";
export type { PolicyBucketInput } from "./policies";
export { POLICY_TEMPLATES } from "./policy-templates";
export type { PolicyTemplate } from "./policy-templates";
export { SAMPLE_DOCUMENTS } from "./samples";
export { transformContent } from "@/lib/ai/transform";
export type { TransformResult } from "@/lib/ai/transform";
export { sanitizeOutputHtml } from "./outputSanitizer";
export type { OutputSanitizeResult } from "./outputSanitizer";
export { buildIntelligenceReport } from "@/lib/intelligence/extractor";
export { ensureIntelligence, getIntelligence } from "@/lib/intelligence/service";
