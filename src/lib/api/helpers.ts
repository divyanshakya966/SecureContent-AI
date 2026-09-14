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
  IntelligenceReport,
} from "@/types";
import { DEFAULT_POLICIES } from "@/lib/security/policies";

type DbFinding = {
  id: string; documentId: string; category: string; type: string; severity: string;
  confidence: number; action: string; stage: string; location: string;
  matchedText: string; maskedText: string; reason: string; createdAt: Date | string;
};
type DbTransformation = {
  id: string; documentId: string; profile: string; outputType: string; model: string;
  outputContent: string | null; grounding: string; policyStatus: string; outputDlp: string;
  riskDelta: number; leakageCount: number; citations: string | null; createdAt: Date | string;
  tone?: string | null; language?: string | null; detailLevel?: string | null; objective?: string | null; style?: string | null; batchId?: string | null;
};
type DbIntelligence = {
  id: string; documentId: string; entities: string | null; iocs: string | null; ttps: string | null;
  risks: string | null; keyFindings: string | null; evidence: string | null;
  summary: string | null; riskScore: number | null; classification: string | null;
  model: string | null; createdAt: Date | string;
};
type DbDocument = {
  id: string; filename: string; mimeType: string; sizeBytes: number; title: string;
  sourceKind: string; classification: string; status: string; riskScore: number;
  riskBefore: number; riskAfter: number; rawContent: string; sanitizedContent: string | null;
  metadata: string | null; createdAt: Date | string; updatedAt: Date | string;
  findings?: DbFinding[]; transformations?: DbTransformation[]; intelligence?: DbIntelligence | null;
};
type DbPolicy = {
  id: string; name: string; description: string | null; classification: string | null;
  audience: string | null; allow: string | null; mask: string | null; remove: string | null;
  block: string | null; active: boolean; createdAt: Date | string; updatedAt: Date | string;
};
type DbAudit = { id: string; documentId: string | null; actor: string; action: string; detail: string; timestamp: Date | string };

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

export function serializeFinding(f: DbFinding): Finding {
  return {
    id: f.id,
    documentId: f.documentId,
    category: f.category as Finding["category"],
    type: f.type as Finding["type"],
    severity: f.severity as Finding["severity"],
    confidence: f.confidence,
    action: f.action as Finding["action"],
    stage: f.stage as Finding["stage"],
    location: f.location,
    matchedText: f.matchedText,
    maskedText: f.maskedText,
    reason: f.reason,
    createdAt: toIso(f.createdAt),
  };
}

export function serializeTransformation(t: DbTransformation): TransformationRecord {
  let citations: Citation[] = [];
  try {
    citations = JSON.parse(t.citations ?? "[]");
  } catch {
    citations = [];
  }
  return {
    id: t.id,
    documentId: t.documentId,
    profile: t.profile as TransformationRecord["profile"],
    outputType: t.outputType as TransformationRecord["outputType"],
    model: t.model,
    outputContent: t.outputContent,
    grounding: t.grounding as TransformationRecord["grounding"],
    policyStatus: t.policyStatus as TransformationRecord["policyStatus"],
    outputDlp: t.outputDlp as TransformationRecord["outputDlp"],
    riskDelta: t.riskDelta,
    leakageCount: t.leakageCount,
    citations,
    createdAt: toIso(t.createdAt),
    tone: (t.tone as TransformationRecord["tone"]) ?? undefined,
    language: (t.language as TransformationRecord["language"]) ?? undefined,
    detailLevel: (t.detailLevel as TransformationRecord["detailLevel"]) ?? undefined,
    objective: (t.objective as TransformationRecord["objective"]) ?? undefined,
    style: (t.style as TransformationRecord["style"]) ?? undefined,
    batchId: (t.batchId as string | null) ?? null,
  };
}

export function serializeIntelligence(r: DbIntelligence): IntelligenceReport {
  const safe = <T>(v: unknown): T[] => {
    if (typeof v !== "string") return [];
    try { const p = JSON.parse(v); return Array.isArray(p) ? (p as T[]) : []; } catch { return []; }
  };
  return {
    id: r.id,
    documentId: r.documentId,
    entities: safe<import("@/types").ExtractedEntity>(r.entities),
    iocs: safe<import("@/types").IOC>(r.iocs),
    ttps: safe<import("@/types").TTP>(r.ttps),
    risks: safe<import("@/types").IntelRisk>(r.risks),
    keyFindings: safe<import("@/types").KeyFinding>(r.keyFindings),
    evidence: safe<{ claim: string; source: string; location: string }>(r.evidence),
    summary: r.summary ?? "",
    riskScore: r.riskScore ?? 0,
    classification: (r.classification ?? "UNCLASSIFIED") as IntelligenceReport["classification"],
    model: r.model ?? "heuristic-v1",
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    counts: {
      entities: safe(r.entities).length,
      iocs: safe(r.iocs).length,
      ttps: safe(r.ttps).length,
      risks: safe(r.risks).length,
      keyFindings: safe(r.keyFindings).length,
    },
  };
}

export function serializeDocument(d: DbDocument): DocumentRecord {
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
    sourceKind: d.sourceKind as DocumentRecord["sourceKind"],
    classification: d.classification as DocumentRecord["classification"],
    status: d.status as DocumentRecord["status"],
    riskScore: d.riskScore,
    riskBefore: d.riskBefore,
    riskAfter: d.riskAfter,
    rawContent: d.rawContent,
    sanitizedContent: d.sanitizedContent,
    metadata: meta,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
    findings: d.findings?.map(serializeFinding),
    transformations: d.transformations?.map(serializeTransformation),
    intelligence: d.intelligence ? serializeIntelligence(d.intelligence) : null,
  };
}

export function serializePolicy(p: DbPolicy): PolicyRule {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? "",
    classification: (p.classification ?? "INTERNAL") as PolicyRule["classification"],
    audience: (p.audience ?? p.classification ?? "INTERNAL") as string,
    allow: safeParseArr(p.allow),
    mask: safeParseArr(p.mask),
    remove: safeParseArr(p.remove),
    block: safeParseArr(p.block),
    active: p.active,
    createdAt: toIso(p.createdAt),
    updatedAt: toIso(p.updatedAt),
  };
}

export function serializeAudit(a: DbAudit): AuditLogEntry {
  return {
    id: a.id,
    documentId: a.documentId,
    actor: a.actor,
    action: a.action,
    detail: a.detail,
    timestamp: toIso(a.timestamp),
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
  if (count > 0) {
    // Backfill audience for older DBs where column may be null
    for (const p of DEFAULT_POLICIES) {
      const existing = await db.policy.findUnique({ where: { name: p.name } });
      const audience = (p as unknown as { audience?: string }).audience ?? p.classification;
      if (existing && !existing.audience) {
        await db.policy.update({ where: { name: p.name }, data: { audience } });
      }
    }
    return;
  }
  await db.policy.createMany({
    data: DEFAULT_POLICIES.map((p) => ({
      name: p.name,
      description: p.description,
      classification: p.classification,
      audience: (p as unknown as { audience?: string }).audience ?? p.classification,
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
