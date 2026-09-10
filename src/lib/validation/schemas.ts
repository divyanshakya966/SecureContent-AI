// Secure Intelligence — Zod validation for Zero-Trust boundaries
// Every API input is validated before it reaches the engine.

import { z } from "zod";

export const DocumentUploadJsonSchema = z.object({
  sampleId: z.string().optional(),
  content: z.string().min(1).max(200_000).optional(),
  title: z.string().min(1).max(200).optional(),
}).refine((d) => d.sampleId || (d.content && d.content.trim()), {
  message: "Provide sampleId or content",
});

export const SanitizeSchema = z.object({
  policy: z.string().min(1).max(50).optional().default("PUBLIC_RELEASE"),
  profile: z.string().min(1).max(50).optional(),
});

export const TransformSchema = z.object({
  profile: z.enum(["PUBLIC_RELEASE", "INTERNAL_SUMMARY", "EXECUTIVE_BRIEF", "HR_SAFE", "SECURITY_INCIDENT"]).optional().default("PUBLIC_RELEASE"),
  outputType: z.enum(["EXECUTIVE_SUMMARY", "FAQ", "TECHNICAL_REPORT", "SLIDE_OUTLINE", "EMAIL_DRAFT"]).optional().default("EXECUTIVE_SUMMARY"),
});

export const PolicyCompareSchema = z.object({
  profiles: z.array(z.enum(["PUBLIC_RELEASE", "INTERNAL_SUMMARY", "EXECUTIVE_BRIEF", "HR_SAFE", "SECURITY_INCIDENT"])).min(1).max(5).optional().default(["PUBLIC_RELEASE", "INTERNAL_SUMMARY", "SECURITY_INCIDENT"]),
  outputType: z.enum(["EXECUTIVE_SUMMARY", "FAQ", "TECHNICAL_REPORT", "SLIDE_OUTLINE", "EMAIL_DRAFT"]).optional().default("EXECUTIVE_SUMMARY"),
});

export const IntelligenceExtractSchema = z.object({
  force: z.boolean().optional().default(false),
});

export function parseOr400<T>(schema: z.ZodSchema<T>, data: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const r = schema.safeParse(data);
  if (r.success) return { ok: true, data: r.data };
  const msg = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return { ok: false, error: msg };
}
