// SecureContent AI — API helpers: Prisma <-> API type serialization + audit logging.

import { db } from "@/lib/db";
import type {
  DocumentRecord,
  Finding,
  TransformationRecord,
  AuditLogEntry,
  PolicyRule,
  DocumentMeta,
  Citation,
} from "@/types";
import { DEFAULT_POLICIES } from "@/lib/security/policies";

export function serializeFinding(f: any): Finding {
  return {
    id: f.id,
    documentId: f.documentId,
    category: f.category,
    type: f.type,
    severity: f.severity,
    confidence: f.confidence,
    action: f.action,
    stage: f.stage,
    location: f.location,
    matchedText: f.matchedText,
    maskedText: f.maskedText,
    reason: f.reason,
    createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : String(f.createdAt),
  };
}

export function serializeTransformation(t: any): TransformationRecord {
  let citations: Citation[] = [];
  try {
    citations = JSON.parse(t.citations ?? "[]");
  } catch {
    citations = [];
  }
  return {
    id: t.id,
    documentId: t.documentId,
    profile: t.profile,
    outputType: t.outputType,
    model: t.model,
    outputContent: t.outputContent,
    grounding: t.grounding,
    policyStatus: t.policyStatus,
    outputDlp: t.outputDlp,
    riskDelta: t.riskDelta,
    leakageCount: t.leakageCount,
    citations,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
  };
}

export function serializeDocument(d: any): DocumentRecord {
  let meta: DocumentMeta = {};
  try {
    meta = JSON.parse(d.metadata ?? "{}");
  } catch {
    meta = {};
  }
  return {
    id: d.id,
    filename: d.filename,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    title: d.title,
    sourceKind: d.sourceKind,
    classification: d.classification,
    status: d.status,
    riskScore: d.riskScore,
    riskBefore: d.riskBefore,
    riskAfter: d.riskAfter,
    rawContent: d.rawContent,
    sanitizedContent: d.sanitizedContent,
    metadata: meta,
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
    updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : String(d.updatedAt),
    findings: d.findings?.map(serializeFinding),
    transformations: d.transformations?.map(serializeTransformation),
  };
}

export function serializePolicy(p: any): PolicyRule {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    classification: p.classification,
    allow: safeParseArr(p.allow),
    mask: safeParseArr(p.mask),
    remove: safeParseArr(p.remove),
    block: safeParseArr(p.block),
    active: p.active,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
    updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : String(p.updatedAt),
  };
}

export function serializeAudit(a: any): AuditLogEntry {
  return {
    id: a.id,
    documentId: a.documentId,
    actor: a.actor,
    action: a.action,
    detail: a.detail,
    timestamp: a.timestamp instanceof Date ? a.timestamp.toISOString() : String(a.timestamp),
  };
}

function safeParseArr(v: unknown): string[] {
  if (typeof v !== "string") return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function stringifyArr(arr: string[]): string {
  return JSON.stringify(arr ?? []);
}

export async function logAudit(opts: {
  documentId?: string | null;
  actor?: string;
  action: string;
  detail?: string;
}) {
  try {
    return await db.auditLog.create({
      data: {
        documentId: opts.documentId ?? null,
        actor: opts.actor ?? "system",
        action: opts.action,
        detail: opts.detail ?? "",
      },
    });
  } catch (e) {
    console.error("[audit] failed to write log:", e);
    return null;
  }
}

export async function ensureDefaultPolicies(): Promise<void> {
  const count = await db.policy.count();
  if (count > 0) return;
  await db.policy.createMany({
    data: DEFAULT_POLICIES.map((p) => ({
      name: p.name,
      description: p.description,
      classification: p.classification,
      allow: stringifyArr(p.allow),
      mask: stringifyArr(p.mask),
      remove: stringifyArr(p.remove),
      block: stringifyArr(p.block),
      active: p.active,
    })),
  });
}

export async function getPolicyByName(name: string) {
  await ensureDefaultPolicies();
  const p = await db.policy.findFirst({ where: { name, active: true } });
  return p ? serializePolicy(p) : undefined;
}

export async function listPolicies(): Promise<PolicyRule[]> {
  await ensureDefaultPolicies();
  const rows = await db.policy.findMany({ orderBy: { name: "asc" } });
  return rows.map(serializePolicy);
}

export function findingLocation(offset: number): string {
  return `char_offset:${offset}`;
}
