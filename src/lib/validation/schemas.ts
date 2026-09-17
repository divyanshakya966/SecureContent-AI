// Zod validation for every trust boundary.

import { z } from "zod";
import { KNOWN_BUCKET_ENTRIES } from "@/lib/security/policies";

export const DocumentUploadJsonSchema = z.object({
  sampleId: z.string().min(1).max(100).optional(),
  content: z.string().min(1).max(200_000).optional(),
  title: z.string().min(1).max(200).optional(),
}).refine((d) => d.sampleId || (d.content && d.content.trim()), {
  message: "Provide sampleId or content",
});

/** Any policy name: built-in profile or user-created UPPER_SNAKE_CASE policy. */
const PolicyNameSchema = z.string().min(2).max(60).regex(/^[A-Z][A-Z0-9_]+$/, "Policy name must be UPPER_SNAKE_CASE");

/** Bucket entries must be engine-known finding types/categories — typos otherwise silently weaken a policy. */
const BucketEntrySchema = z.string().min(1).max(60).refine(
  (v: string) => (KNOWN_BUCKET_ENTRIES as readonly string[]).includes(v),
  { message: "Unknown policy entry — use a known finding type or category." }
);

const BucketArraySchema = z.array(BucketEntrySchema).max(100).optional().default([]);

const FindingActionsSchema = z.array(z.object({
  id: z.string().min(5).max(100).optional(),
  location: z.string().max(60).optional(),
  type: z.string().max(60).optional(),
  action: z.enum(["ALLOW", "MASK", "REDACT", "REPLACE", "QUARANTINE"]),
})).max(500).optional().default([]);

export const SanitizeSchema = z.object({
  policy: PolicyNameSchema.optional().default("PUBLIC_RELEASE"),
  profile: PolicyNameSchema.optional(),
  findingActions: FindingActionsSchema,
});

const OutputTypeEnum = z.enum([
  "EXECUTIVE_SUMMARY",
  "FAQ",
  "TECHNICAL_REPORT",
  "SLIDE_OUTLINE",
  "EMAIL_DRAFT",
  "PRESS_RELEASE",
  "SOCIAL_POST",
  "NEWSLETTER",
  "POLICY_BRIEF",
  "TRAINING_GUIDE",
  "INCIDENT_SUMMARY",
  "RESEARCH_DIGEST",
  "ANNOUNCEMENT",
  "BLOG_POST",
  "MEETING_MINUTES",
]);

export const ToneEnum = z.enum(["formal", "professional", "technical", "friendly", "persuasive", "neutral", "concise"]);
export const LanguageEnum = z.enum(["en", "es", "fr", "de", "ja", "zh", "hi", "pt"]);
export const DetailLevelEnum = z.enum(["brief", "standard", "detailed", "comprehensive"]);
export const ObjectiveEnum = z.enum(["inform", "summarize", "persuade", "educate", "announce", "report", "analyze", "comply"]);
export const StyleEnum = z.enum(["narrative", "bullet", "structured", "conversational", "formal", "executive", "creative"]);

export const AuditQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(200).optional().default(100),
});

export const TransformSchema = z.object({
  profile: PolicyNameSchema.optional().default("PUBLIC_RELEASE"),
  outputType: OutputTypeEnum.optional().default("EXECUTIVE_SUMMARY"),

  outputTypes: z.array(OutputTypeEnum).min(1).max(8).optional(),

  tone: z.enum(["formal", "professional", "technical", "friendly", "persuasive", "neutral", "concise"]).optional().default("professional"),
  language: z.enum(["en", "es", "fr", "de", "ja", "zh", "hi", "pt"]).optional().default("en"),
  detailLevel: z.enum(["brief", "standard", "detailed", "comprehensive"]).optional().default("standard"),
  objective: z.enum(["inform", "summarize", "persuade", "educate", "announce", "report", "analyze", "comply"]).optional().default("inform"),
  style: z.enum(["narrative", "bullet", "structured", "conversational", "formal", "executive", "creative"]).optional().default("structured"),
  batchId: z.string().max(64).optional(),
});

export const BatchTransformSchema = z.object({
  profile: PolicyNameSchema.optional().default("PUBLIC_RELEASE"),
  outputTypes: z.array(OutputTypeEnum).min(1).max(8),
  tone: z.enum(["formal", "professional", "technical", "friendly", "persuasive", "neutral", "concise"]).optional().default("professional"),
  language: z.enum(["en", "es", "fr", "de", "ja", "zh", "hi", "pt"]).optional().default("en"),
  detailLevel: z.enum(["brief", "standard", "detailed", "comprehensive"]).optional().default("standard"),
  objective: z.enum(["inform", "summarize", "persuade", "educate", "announce", "report", "analyze", "comply"]).optional().default("inform"),
  style: z.enum(["narrative", "bullet", "structured", "conversational", "formal", "executive", "creative"]).optional().default("structured"),
});

export const PolicyCompareSchema = z.object({
  profiles: z.array(PolicyNameSchema).min(1).max(10).optional().default(["PUBLIC_RELEASE", "INTERNAL_SUMMARY", "SECURITY_INCIDENT"]),
  outputType: OutputTypeEnum.optional().default("EXECUTIVE_SUMMARY"),
});

/** Full auto pipeline: sanitize + transform + validate in one server-side run. */
export const PipelineSchema = z.object({
  policy: PolicyNameSchema.optional().default("PUBLIC_RELEASE"),
  outputType: OutputTypeEnum.optional().default("EXECUTIVE_SUMMARY"),
  outputTypes: z.array(OutputTypeEnum).min(1).max(8).optional(),
  findingActions: FindingActionsSchema,
  tone: z.enum(["formal", "professional", "technical", "friendly", "persuasive", "neutral", "concise"]).optional().default("professional"),
  language: z.enum(["en", "es", "fr", "de", "ja", "zh", "hi", "pt"]).optional().default("en"),
  detailLevel: z.enum(["brief", "standard", "detailed", "comprehensive"]).optional().default("standard"),
  objective: z.enum(["inform", "summarize", "persuade", "educate", "announce", "report", "analyze", "comply"]).optional().default("inform"),
  style: z.enum(["narrative", "bullet", "structured", "conversational", "formal", "executive", "creative"]).optional().default("structured"),
  batchId: z.string().max(64).optional(),
});

export const IntelligenceExtractSchema = z.object({
  force: z.boolean().optional().default(false),
});

export const PolicyCreateSchema = z.object({
  name: z.string().min(2).max(60).regex(/^[A-Z][A-Z0-9_]+$/, "Policy name must be UPPER_SNAKE_CASE"),
  description: z.string().max(500).optional().default(""),
  classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "UNCLASSIFIED"]).optional().default("INTERNAL"),
  audience: z.enum(["PUBLIC", "INTERNAL", "EXECUTIVE", "HR", "SECURITY", "CUSTOM"]).optional(),
  allow: BucketArraySchema,
  mask: BucketArraySchema,
  remove: BucketArraySchema,
  block: BucketArraySchema,
  active: z.boolean().optional().default(true),
});

export const PolicyUpdateSchema = z.object({
  description: z.string().max(500).optional(),
  classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "UNCLASSIFIED"]).optional(),
  audience: z.enum(["PUBLIC", "INTERNAL", "EXECUTIVE", "HR", "SECURITY", "CUSTOM"]).optional(),
  allow: z.array(BucketEntrySchema).max(100).optional(),
  mask: z.array(BucketEntrySchema).max(100).optional(),
  remove: z.array(BucketEntrySchema).max(100).optional(),
  block: z.array(BucketEntrySchema).max(100).optional(),
  active: z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: "Provide at least one field to update." });

export const ScanConfigSchema = z.object({
  pii: z.boolean().optional().default(true),
  secrets: z.boolean().optional().default(true),
  injections: z.boolean().optional().default(true),
  internalAssets: z.boolean().optional().default(true),
  unsafeUrls: z.boolean().optional().default(true),
  minConfidence: z.number().min(0).max(1).optional().default(0),
});

export const PaginationSchema = z.object({
  status: z.enum(["UPLOADED", "SCANNED", "SANITIZED", "TRANSFORMED", "BLOCKED"]).optional(),
  take: z.coerce.number().int().min(1).max(200).optional().default(100),
  skip: z.coerce.number().int().min(0).max(10000).optional().default(0),
});

export const DocumentIdSchema = z.string().min(10).max(100).regex(/^[a-zA-Z0-9_-]+$/, "Invalid document id format");

export const BulkDeleteSchema = z.object({
  ids: z.array(DocumentIdSchema).min(1).max(100),
});

export function parseOr400<T>(schema: z.ZodSchema<T>, data: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const r = schema.safeParse(data);
  if (r.success) return { ok: true, data: r.data };
  const msg = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return { ok: false, error: msg };
}
