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
  IntelligenceReport,
  PolicyCompareResult,
} from "@/types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let msg = `Request failed (${res.status})`;
    try {
      const parsed = JSON.parse(txt);
      msg = parsed.error || msg;
    } catch {
      if (txt) msg = txt.slice(0, 300);
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

export const api = {
  async listDocuments(): Promise<DocumentRecord[]> {
    const r = await fetchWithTimeout("/api/v1/documents", { cache: "no-store" });
    return (await json<{ documents: DocumentRecord[] }>(r)).documents;
  },

  async getDocument(id: string): Promise<DocumentRecord> {
    const r = await fetchWithTimeout(`/api/v1/documents/${id}`, { cache: "no-store" });
    return (await json<{ document: DocumentRecord }>(r)).document;
  },

  async uploadFile(file: File): Promise<DocumentRecord> {
    const form = new FormData();
    form.append("file", file);
    const r = await fetchWithTimeout("/api/v1/documents", { method: "POST", body: form });
    return (await json<{ document: DocumentRecord }>(r)).document;
  },

  async uploadSample(sampleId: string): Promise<DocumentRecord> {
    const r = await fetchWithTimeout("/api/v1/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sampleId }),
    });
    return (await json<{ document: DocumentRecord }>(r)).document;
  },

  async uploadPaste(title: string, content: string): Promise<DocumentRecord> {
    const r = await fetchWithTimeout("/api/v1/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    return (await json<{ document: DocumentRecord }>(r)).document;
  },

  async deleteDocument(id: string): Promise<void> {
    const r = await fetchWithTimeout(`/api/v1/documents/${id}`, { method: "DELETE" });
    await json<{ ok: boolean }>(r);
  },

  async scanDocument(id: string): Promise<DocumentRecord> {
    const r = await fetchWithTimeout(`/api/v1/documents/${id}/scan`, { method: "POST" });
    return (await json<{ document: DocumentRecord }>(r)).document;
  },

  async sanitizeDocument(id: string, policy: string) {
    const r = await fetchWithTimeout(`/api/v1/documents/${id}/sanitize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy }),
    });
    return json<{ document: DocumentRecord; actions: unknown[]; blocked: boolean; residualRisk: number }>(r);
  },

  async transformDocument(id: string, profile: TransformationProfile, outputType: OutputType) {
    const r = await fetchWithTimeout(`/api/v1/documents/${id}/transform`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, outputType }),
    });
    return json<{ document: DocumentRecord; transformation: TransformationRecord; dlpReasons: string[] }>(r);
  },

  async getSecurityReport(id: string) {
    const r = await fetchWithTimeout(`/api/v1/documents/${id}/security-report`, { cache: "no-store" });
    return json<{ report: SecurityReport; riskBreakdown: unknown }>(r);
  },

  async getHistory(id: string) {
    const r = await fetchWithTimeout(`/api/v1/documents/${id}/history`, { cache: "no-store" });
    return json<{ transformations: TransformationRecord[]; audit: AuditLogEntry[] }>(r);
  },

  async getStats(): Promise<DashboardStats> {
    const r = await fetchWithTimeout("/api/v1/stats", { cache: "no-store" });
    return (await json<{ stats: DashboardStats }>(r)).stats;
  },

  async getAudit(): Promise<AuditLogEntry[]> {
    const r = await fetchWithTimeout("/api/v1/audit", { cache: "no-store" });
    return (await json<{ audit: AuditLogEntry[] }>(r)).audit;
  },

  async getPolicies(): Promise<PolicyRule[]> {
    const r = await fetchWithTimeout("/api/v1/policies", { cache: "no-store" });
    return (await json<{ policies: PolicyRule[] }>(r)).policies;
  },

  async getSamples(): Promise<SampleDocument[]> {
    const r = await fetchWithTimeout("/api/v1/samples", { cache: "no-store" });
    return (await json<{ samples: SampleDocument[] }>(r)).samples;
  },

  async getIntelligence(id: string): Promise<IntelligenceReport> {
    const r = await fetchWithTimeout(`/api/v1/documents/${id}/intelligence`, { cache: "no-store" });
    return (await json<{ intelligence: IntelligenceReport }>(r)).intelligence;
  },

  async refreshIntelligence(id: string): Promise<IntelligenceReport> {
    const r = await fetchWithTimeout(`/api/v1/documents/${id}/intelligence`, { method: "POST" });
    return (await json<{ intelligence: IntelligenceReport }>(r)).intelligence;
  },

  async policyCompare(id: string, profiles: TransformationProfile[], outputType: OutputType = "EXECUTIVE_SUMMARY"): Promise<PolicyCompareResult> {
    const r = await fetchWithTimeout(`/api/v1/documents/${id}/policy-compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profiles, outputType }),
    });
    return json<PolicyCompareResult>(r);
  },

  async seed(): Promise<{ seeded: { title: string; status: string; risk: number }[] }> {
    const r = await fetchWithTimeout("/api/v1/seed", { method: "POST" }, 60_000);
    return json<{ seeded: { title: string; status: string; risk: number }[] }>(r);
  },
};
