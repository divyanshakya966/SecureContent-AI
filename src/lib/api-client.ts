// Frontend API client — typed fetch helpers for the /api/v1 surface.

import type {
  DocumentRecord,
  DashboardStats,
  AuditLogEntry,
  PolicyRule,
  SampleDocument,
  SecurityReport,
  TransformationRecord,
  Finding,
  TransformationProfile,
  OutputType,
} from "@/types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let msg = `Request failed (${res.status})`;
    try {
      const parsed = JSON.parse(txt);
      msg = parsed.error || msg;
    } catch {
      if (txt) msg = txt.slice(0, 200);
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  async listDocuments(): Promise<DocumentRecord[]> {
    const r = await fetch("/api/v1/documents", { cache: "no-store" });
    return (await json<{ documents: DocumentRecord[] }>(r)).documents;
  },

  async getDocument(id: string): Promise<DocumentRecord> {
    const r = await fetch(`/api/v1/documents/${id}`, { cache: "no-store" });
    return (await json<{ document: DocumentRecord }>(r)).document;
  },

  async uploadFile(file: File): Promise<DocumentRecord> {
    const form = new FormData();
    form.append("file", file);
    const r = await fetch("/api/v1/documents", { method: "POST", body: form });
    return (await json<{ document: DocumentRecord }>(r)).document;
  },

  async uploadSample(sampleId: string): Promise<DocumentRecord> {
    const r = await fetch("/api/v1/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sampleId }),
    });
    return (await json<{ document: DocumentRecord }>(r)).document;
  },

  async uploadPaste(title: string, content: string): Promise<DocumentRecord> {
    const r = await fetch("/api/v1/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    return (await json<{ document: DocumentRecord }>(r)).document;
  },

  async deleteDocument(id: string): Promise<void> {
    await fetch(`/api/v1/documents/${id}`, { method: "DELETE" });
  },

  async scanDocument(id: string): Promise<DocumentRecord> {
    const r = await fetch(`/api/v1/documents/${id}/scan`, { method: "POST" });
    return (await json<{ document: DocumentRecord }>(r)).document;
  },

  async sanitizeDocument(id: string, policy: string) {
    const r = await fetch(`/api/v1/documents/${id}/sanitize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy }),
    });
    return json<{ document: DocumentRecord; actions: any[]; blocked: boolean; residualRisk: number }>(r);
  },

  async transformDocument(id: string, profile: TransformationProfile, outputType: OutputType) {
    const r = await fetch(`/api/v1/documents/${id}/transform`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, outputType }),
    });
    return json<{ document: DocumentRecord; transformation: TransformationRecord; dlpReasons: string[] }>(r);
  },

  async getSecurityReport(id: string) {
    const r = await fetch(`/api/v1/documents/${id}/security-report`, { cache: "no-store" });
    return json<{ report: SecurityReport; riskBreakdown: any }>(r);
  },

  async getHistory(id: string) {
    const r = await fetch(`/api/v1/documents/${id}/history`, { cache: "no-store" });
    return json<{ transformations: TransformationRecord[]; audit: AuditLogEntry[] }>(r);
  },

  async getStats(): Promise<DashboardStats> {
    const r = await fetch("/api/v1/stats", { cache: "no-store" });
    return (await json<{ stats: DashboardStats }>(r)).stats;
  },

  async getAudit(): Promise<AuditLogEntry[]> {
    const r = await fetch("/api/v1/audit", { cache: "no-store" });
    return (await json<{ audit: AuditLogEntry[] }>(r)).audit;
  },

  async getPolicies(): Promise<PolicyRule[]> {
    const r = await fetch("/api/v1/policies", { cache: "no-store" });
    return (await json<{ policies: PolicyRule[] }>(r)).policies;
  },

  async getSamples(): Promise<SampleDocument[]> {
    const r = await fetch("/api/v1/samples", { cache: "no-store" });
    return (await json<{ samples: SampleDocument[] }>(r)).samples;
  },
};
