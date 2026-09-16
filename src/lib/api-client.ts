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
  FindingActionOverride,
  ScanConfig,
  GenerationTone,
  GenerationLanguage,
  DetailLevel,
  CommunicationObjective,
  ContentStyle,
} from "@/types";

export interface TransformParams {
  profile?: TransformationProfile;
  outputType?: OutputType;
  outputTypes?: OutputType[];
  tone?: GenerationTone;
  language?: GenerationLanguage;
  detailLevel?: DetailLevel;
  objective?: CommunicationObjective;
  style?: ContentStyle;
}

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
  } catch (e: any) {
    // fetch throws DOMException AbortError on timeout — surface a clear message
    // so the UI can distinguish "client gave up" from "server failed".
    if (e?.name === "AbortError" || controller.signal.aborted) {
      throw new Error(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s — the server may still be processing. Reload to check.`
      );
    }
    throw e;
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

  async scanDocument(id: string, config?: ScanConfig): Promise<DocumentRecord> {
    const r = await fetchWithTimeout(`/api/v1/documents/${id}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config ? { config } : {}),
    });
    return (await json<{ document: DocumentRecord }>(r)).document;
  },

  async sanitizeDocument(id: string, policy: string, findingActions?: FindingActionOverride[]) {
    const r = await fetchWithTimeout(`/api/v1/documents/${id}/sanitize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(findingActions?.length ? { policy, findingActions } : { policy }),
    });
    return json<{ document: DocumentRecord; actions: unknown[]; blocked: boolean; residualRisk: number }>(r);
  },

  async transformDocument(
    id: string,
    profile: TransformationProfile,
    outputType: OutputType,
    params?: Omit<TransformParams, "profile" | "outputType">
  ) {
    // LLM chain (Gemini → Groq) routinely takes 14–25s; the old 15s default
    // aborted just as the server succeeded (POST 200 in 15.0s) → false "failed" popup.
    const r = await fetchWithTimeout(`/api/v1/documents/${id}/transform`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, outputType, ...params }),
    }, 90_000);
    return json<{ document: DocumentRecord; transformation: TransformationRecord; transformations?: TransformationRecord[]; dlpReasons: string[]; batchId?: string | null }>(r);
  },

  async transformBatch(
    id: string,
    params: { profile?: TransformationProfile; outputTypes: OutputType[] } & Omit<TransformParams, "outputType" | "outputTypes">
  ) {
    const r = await fetchWithTimeout(`/api/v1/documents/${id}/transform`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }, 120_000);
    return json<{ document: DocumentRecord; transformations: TransformationRecord[]; dlpReasons: string[]; batchId: string }>(r);
  },

  async transformBatchDedicated(
    id: string,
    params: { profile?: TransformationProfile; outputTypes: OutputType[] } & Omit<TransformParams, "outputType" | "outputTypes">
  ) {
    // Backwards compat — batch is now handled by the main transform endpoint via outputTypes[]
    const r = await fetchWithTimeout(`/api/v1/documents/${id}/transform`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }, 120_000);
    return json<{ document: DocumentRecord; transformations: TransformationRecord[]; batchId: string; dlpReasons: string[] }>(r);
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

  async createPolicy(input: { name: string; description?: string; classification?: string; audience?: string; allow?: string[]; mask?: string[]; remove?: string[]; block?: string[]; active?: boolean }): Promise<PolicyRule> {
    const r = await fetchWithTimeout("/api/v1/policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return (await json<{ policy: PolicyRule }>(r)).policy;
  },

  async updatePolicy(name: string, input: { description?: string; classification?: string; audience?: string; allow?: string[]; mask?: string[]; remove?: string[]; block?: string[]; active?: boolean }): Promise<PolicyRule> {
    const r = await fetchWithTimeout(`/api/v1/policies/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return (await json<{ policy: PolicyRule }>(r)).policy;
  },

  async deletePolicy(name: string): Promise<void> {
    const r = await fetchWithTimeout(`/api/v1/policies/${encodeURIComponent(name)}`, { method: "DELETE" });
    await json<{ ok: boolean }>(r);
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

  async policyCompare(id: string, profiles: string[], outputType: OutputType = "EXECUTIVE_SUMMARY"): Promise<PolicyCompareResult> {
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
