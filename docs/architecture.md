# Architecture

```
Dashboard (Operator) → Submits Source Content (text / docs / images / video / prompts / contextual info)
                    → Selects Output Type(s) + Generation Params (audience, tone, language, detail, objective, style)
                              ↓
Frontend (Next.js) → API Gateway → Ingestion | Policy Engine | Audit
                              ↓
              Security Gateway (PII / Secrets / Injection / Internal Assets)
                              ↓
                 Sanitization Engine (policy-aware working copy)
                              ↓
            Transformation Engine (LLM) — configurable generation
                              ↓
                   Output Validator (HTML sanitize + DLP + Grounding)
                              ↓
                      Safe Delivery (single or batch 1..8 artefacts)
```

The platform is an **intelligent content transformation engine**: it analyses the source, understands context & intent, and generates the requested artefact(s) corresponding to the operator's selection.

## Components

| Component | File | Responsibility |
|---|---|---|
| Parsers | `src/lib/parsers.ts` | Pre-read size caps (10 MB docs / 25 MB media), MIME validation, PDF/DOCX/HTML extraction, image/video placeholders, Docling proxy (T2) |
| Detectors | `src/lib/security/detectors.ts` | PII / financial / secrets / injection / internal assets / unsafe URLs; per-document scan config (families + confidence floor); output DLP always full-scan |
| Risk | `src/lib/security/risk.ts` | Weighted risk, classification (PUBLIC→RESTRICTED) |
| Sanitize | `src/lib/security/sanitize.ts` | Policy buckets + reviewer per-finding overrides (injection/secret invariants enforced) → sanitized working copy |
| Policies | `src/lib/security/policies.ts` + `policy-templates.ts` | 5 immutable built-ins, custom CRUD (max 50), framework templates (OWASP GenAI, GDPR, HIPAA, PCI DSS) |
| Transform | `src/lib/ai/transform.ts` | LLM envelope (`<UNTRUSTED_DOCUMENT>`), 15 output instructions, 6 generation dimensions, grounding citations, Gemini→Groq→offline fallback |
| Output DLP | `src/lib/security/output-dlp.ts` + `outputSanitizer.ts` | HTML/JS sanitize, DLP rescan, auto-repair |
| Intelligence | `src/lib/intelligence/` | Entity/IOC/TTP/Risk extraction, MITRE ATT&CK |
| Storage | `prisma/schema.prisma` | SQLite (dev/Docker) or Postgres (cloud): Document, Finding, Transformation (with tone/language/detail/objective/style/batchId), AuditLog, Policy, IntelligenceReport |
| Frontend | `src/app/page.tsx`, `components/secure/` | Dashboard, ingest, documents, transform studio (configurable), policy studio (custom CRUD + templates), policy lab (built-ins + customs), intelligence, audit |

## Flows

### 1. Ingest & Scan
1. `POST /documents` — validate (Zod, multipart bounds match JSON), pre-read size caps, parse (isolated, SSRF-guarded Docling optional), `scanContent` → `computeRisk` → classify → store `SCANNED` → build intelligence → audit `UPLOAD`.
   Re-scan (`POST /documents/:id/scan`) accepts an optional `{ config }` (detector families + `minConfidence`), persisted per document and reused by default.

### 2. Sanitize
2. `POST /documents/:id/sanitize` `{ policy, findingActions[]? }` — map findings → policy buckets (allow/mask/remove/block, injections always quarantine) with reviewer per-finding overrides applied on top (secret/injection `ALLOW` rejected and engine-degraded) → `sanitizeContent` → compute residual risk → store `SANITIZED`/`BLOCKED` (+ `sanitizedPolicy` marker) → audit.

### 3. Transform (single or batch via `outputTypes[]`)
3. `POST /documents/:id/transform` `{ profile, outputType | outputTypes[] (1..8), tone, language, detailLevel, objective, style }`
   - Ensures sanitized copy exists **under the requested profile** (auto-sanitizes if missing or stale from another profile).
   - For each requested `OutputType`:
     - Assembles prompt: system non-negotiables + profile constraint + output instruction + tone/language/detail/objective/style.
     - Calls `transformContent` (Gemini with 20s timeout → Groq → offline mock in dev/test).
     - Runs `sanitizeOutputHtml` → `runOutputDlp` → repair if needed.
     - Persists `Transformation` with generation params and `batchId`; `policyStatus` mirrors validation (fails if DLP/grounding failed).
   - Item failures don't abort the batch: successes persist, failures listed in `errors[]`; all-failed returns 502/503.
   - Updates `Document` to `TRANSFORMED`, audits each artefact.

### 4. Validate & Deliver
4. `GET /documents/:id/security-report`, `/history`, `/intelligence` — risk breakdown, DLP status, citations, audit trail.

## Generation Parameters

| Dimension | Values | Effect |
|---|---|---|
| **Audience / Profile** | `PUBLIC_RELEASE` … `SECURITY_INCIDENT` + custom policy names | Selects policy buckets; sanitization before LLM; stale copies re-sanitized on profile change |
| **Tone** | formal, professional, technical, friendly, persuasive, neutral, concise | Injected into system/user prompt |
| **Language** | en, es, fr, de, ja, zh, hi, pt | Directs LLM to write entirely in target language |
| **Detail** | brief, standard, detailed, comprehensive | Controls length (120 → 700 words) |
| **Objective** | inform, summarize, persuade, educate, announce, report, analyze, comply | Shapes intent |
| **Style** | narrative, bullet, structured, conversational, formal, executive, creative | Shapes formatting |

## Storage

- `prisma/dev.db` (local) or `db/custom.db` (Docker volume) via `DATABASE_URL=file:...`; Postgres via `postgresql://` for cloud (switch provider, `prisma migrate deploy`).
- Raw/sanitized text stored in DB; findings retain `matchedText` locally only; transformations store `tone/language/detail/objective/style/batchId` for reproducibility.

## Deployment

- `next build` → `.next/standalone` (Bun/Node runtime, `output: standalone`)
- `docker-compose.yml`: `app` (Next) + `caddy` (:81 reverse-proxy with HSTS/CSP) + optional `docling` Python worker
- `proxy.ts` + `next.config.ts` emit security headers; rate-limit is in-memory (swap to Redis for scale)
- Single-page frontend (`src/app/page.tsx`, Zustand, Tailwind, shadcn/ui, Recharts, TanStack Table)
