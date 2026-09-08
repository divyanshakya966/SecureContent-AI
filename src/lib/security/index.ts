// SecureContent AI — security engine public surface
// Single entry point used by the API layer.

export { scanContent, detectOutputLeakage } from "./detectors";
export type { RawFinding } from "./detectors";
export { computeRisk } from "./risk";
export type { RiskBreakdown } from "./risk";
export { sanitizeContent } from "./sanitize";
export type { SanitizeOutput, SanitizeActionRecord } from "./sanitize";
export { runOutputDlp } from "./output-dlp";
export type { OutputDlpResult } from "./output-dlp";
export { DEFAULT_POLICIES, findPolicy, POLICY_LABELS, OUTPUT_LABELS } from "./policies";
export { SAMPLE_DOCUMENTS } from "./samples";
export { transformContent } from "@/lib/ai/transform";
export type { TransformResult } from "@/lib/ai/transform";
