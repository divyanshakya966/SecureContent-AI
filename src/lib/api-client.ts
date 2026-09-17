

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
  PipelineEvent,
  PipelineDone,
  BulkIngestResult,
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

const API_TOKEN_KEY = "sc-api-token";

export function getApiToken(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(API_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setApiToken(token: string | null): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (!token) localStorage.removeItem(API_TOKEN_KEY);
    else localStorage.setItem(API_TOKEN_KEY, token.trim());
  } catch {
    // ignore (private mode)
  }
}

function withAuthHeader(headers?: HeadersInit): HeadersInit | undefined {
  const token = getApiToken();
  if (!token) return headers;
  if (headers instanceof Headers) {
    if (!headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
    return headers;
  }
  if (Array.isArray(headers)) {
    if (!headers.some(([k]) => k.toLowerCase() === "authorization")) {
      return [...headers, ["authorization", `Bearer ${token}`] as [string, string]];
    }
    return headers;
  }
  const h = { ...(headers as Record<string, string> | undefined) };
  const hasAuth = Object.keys(h).some((k) => k.toLowerCase() === "authorization");
  if (!hasAuth) h["Authorization"] = `Bearer ${token}`;
  return h;
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
    const res = await fetch(input, { ...init, signal: controller.signal, headers: withAuthHeader(init.headers) });
    return res;
  } catch (e: any) {
    // Surface timeouts distinctly from server failures.
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

  async bulkDeleteDocuments(ids: string[]): Promise<{ deleted: number; ids: string[] }> {
    const r = await fetchWithTimeout("/api/v1/documents/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    return json<{ deleted: number; ids: string[] }>(r);
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
    // LLM chains run long; give transforms a generous budget.
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
    // Batch goes through the main transform endpoint.
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

  /**
   * Bulk ingest: many files in one server-orchestrated request, optionally
   * with the auto pipeline per document. No client timeout (batches run long);
   * pass an AbortSignal to cancel (server keeps finished files).
   */
  async ingestBatch(form: FormData, signal?: AbortSignal): Promise<BulkIngestResult> {
    const r = await fetch("/api/v1/documents/batch", { method: "POST", body: form, signal, headers: withAuthHeader() as HeadersInit });
    return json<BulkIngestResult>(r);
  },

  /**
   * Full auto pipeline: sanitize → transform → validate in one server-side run.
   * Streams Server-Sent Events; `onEvent` receives `{ event, ...payload }` for
   * sanitize/transform progress. Resolves with the terminal `done` payload
   * (or rejects on `blocked` / `error` events and HTTP failures). No client
   * timeout — the server heartbeats long LLM batches; callers may pass an
   * AbortSignal to cancel (server-side work already persisted is kept).
   */
  async runPipeline(
    id: string,
    params: {
      policy?: string;
      outputType?: OutputType;
      outputTypes?: OutputType[];
      findingActions?: FindingActionOverride[];
    } & Omit<TransformParams, "profile" | "outputType" | "outputTypes">,
    onEvent?: (msg: PipelineEvent) => void,
    signal?: AbortSignal
  ): Promise<PipelineDone> {
    const r = await fetch(`/api/v1/documents/${id}/pipeline`, {
      method: "POST",
      headers: withAuthHeader({ "Content-Type": "application/json" }) as HeadersInit,
      body: JSON.stringify(params),
      signal,
    });
    // The 200 body is an event stream, not JSON — only errors carry `{ error }`.
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      let msg = `Request failed (${r.status})`;
      try {
        const parsed = JSON.parse(txt);
        msg = (parsed as { error?: string }).error || msg;
      } catch {
        if (txt) msg = txt.slice(0, 300);
      }
      throw new Error(msg);
    }
    if (!r.body) throw new Error("Streaming not supported in this browser.");
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let terminal: PipelineDone | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        for (const line of part.split("\n")) {
          if (!line.startsWith("data:")) continue;
          let msg: PipelineEvent;
          try {
            msg = JSON.parse(line.slice(5).trim()) as PipelineEvent;
          } catch {
            continue; // malformed frame — skip
          }
          onEvent?.(msg);
          if (msg.event === "done") {
            terminal = msg as PipelineDone;
          } else if (msg.event === "blocked") {
            throw new Error(msg.blockReason ?? "Policy blocked transformation.");
          } else if (msg.event === "error") {
            throw new Error(msg.error ?? "Pipeline failed.");
          }
        }
      }
      if (terminal) break;
    }
    try { await reader.cancel(); } catch { /* already closed */ }
    if (!terminal) throw new Error("Pipeline stream ended without a result — reload to check progress.");
    return terminal;
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
