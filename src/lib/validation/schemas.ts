// Secure Intelligence — Zod validation for Zero-Trust boundaries
// Every API input is validated before it reaches the engine.

import { z } from "zod";

export const DocumentUploadJsonSchema = z.object({
  sampleId: z.string().min(1).max(100).optional(),
  content: z.string().min(1).max(200_000).optional(),
  title: z.string().min(1).max(200).optional(),
}).refine((d) => d.sampleId || (d.content && d.content.trim()), {
  message: "Provide sampleId or content",
});

const PolicyNameEnum = z.enum([
  "PUBLIC_RELEASE",
  "INTERNAL_SUMMARY",
  "EXECUTIVE_BRIEF",
  "HR_SAFE",
  "SECURITY_INCIDENT",
]);

export const SanitizeSchema = z.object({
  policy: PolicyNameEnum.optional().default("PUBLIC_RELEASE"),
  profile: PolicyNameEnum.optional(),
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

export const TransformSchema = z.object({
  profile: z.enum(["PUBLIC_RELEASE", "INTERNAL_SUMMARY", "EXECUTIVE_BRIEF", "HR_SAFE", "SECURITY_INCIDENT"]).optional().default("PUBLIC_RELEASE"),
  outputType: OutputTypeEnum.optional().default("EXECUTIVE_SUMMARY"),
  // Batch support — either single outputType or array
  outputTypes: z.array(OutputTypeEnum).min(1).max(8).optional(),
  // Industry-grade generation controls
  tone: z.enum(["formal", "professional", "technical", "friendly", "persuasive", "neutral", "concise"]).optional().default("professional"),
  language: z.enum(["en", "es", "fr", "de", "ja", "zh", "hi", "pt"]).optional().default("en"),
  detailLevel: z.enum(["brief", "standard", "detailed", "comprehensive"]).optional().default("standard"),
  objective: z.enum(["inform", "summarize", "persuade", "educate", "announce", "report", "analyze", "comply"]).optional().default("inform"),
  style: z.enum(["narrative", "bullet", "structured", "conversational", "formal", "executive", "creative"]).optional().default("structured"),
  batchId: z.string().max(64).optional(),
});

export const BatchTransformSchema = z.object({
  profile: z.enum(["PUBLIC_RELEASE", "INTERNAL_SUMMARY", "EXECUTIVE_BRIEF", "HR_SAFE", "SECURITY_INCIDENT"]).optional().default("PUBLIC_RELEASE"),
  outputTypes: z.array(OutputTypeEnum).min(1).max(8),
  tone: z.enum(["formal", "professional", "technical", "friendly", "persuasive", "neutral", "concise"]).optional().default("professional"),
  language: z.enum(["en", "es", "fr", "de", "ja", "zh", "hi", "pt"]).optional().default("en"),
  detailLevel: z.enum(["brief", "standard", "detailed", "comprehensive"]).optional().default("standard"),
  objective: z.enum(["inform", "summarize", "persuade", "educate", "announce", "report", "analyze", "comply"]).optional().default("inform"),
  style: z.enum(["narrative", "bullet", "structured", "conversational", "formal", "executive", "creative"]).optional().default("structured"),
});

export const PolicyCompareSchema = z.object({
  profiles: z.array(z.enum(["PUBLIC_RELEASE", "INTERNAL_SUMMARY", "EXECUTIVE_BRIEF", "HR_SAFE", "SECURITY_INCIDENT"])).min(1).max(5).optional().default(["PUBLIC_RELEASE", "INTERNAL_SUMMARY", "SECURITY_INCIDENT"]),
  outputType: OutputTypeEnum.optional().default("EXECUTIVE_SUMMARY"),
});

export const IntelligenceExtractSchema = z.object({
  force: z.boolean().optional().default(false),
});

export const PolicyCreateSchema = z.object({
  name: z.string().min(2).max(60).regex(/^[A-Z][A-Z0-9_]+$/, "Policy name must be UPPER_SNAKE_CASE"),
  description: z.string().max(500).optional().default(""),
  classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "UNCLASSIFIED"]).optional().default("INTERNAL"),
  audience: z.enum(["PUBLIC", "INTERNAL", "EXECUTIVE", "HR", "SECURITY", "CUSTOM"]).optional(),
  allow: z.array(z.string().min(1).max(60)).max(50).optional().default([]),
  mask: z.array(z.string().min(1).max(60)).max(50).optional().default([]),
  remove: z.array(z.string().min(1).max(60)).max(50).optional().default([]),
  block: z.array(z.string().min(1).max(60)).max(50).optional().default([]),
  active: z.boolean().optional().default(true),
});

export const PaginationSchema = z.object({
  status: z.enum(["UPLOADED", "SCANNED", "SANITIZED", "TRANSFORMED", "BLOCKED"]).optional(),
  take: z.coerce.number().int().min(1).max(200).optional().default(100),
  skip: z.coerce.number().int().min(0).max(10000).optional().default(0),
});

export const DocumentIdSchema = z.string().min(10).max(100).regex(/^[a-zA-Z0-9_-]+$/, "Invalid document id format");

export function parseOr400<T>(schema: z.ZodSchema<T>, data: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const r = schema.safeParse(data);
  if (r.success) return { ok: true, data: r.data };
  const msg = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return { ok: false, error: msg };
}
