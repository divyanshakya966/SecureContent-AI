# API

Base: `http://localhost:3000/api/v1` — JSON, `{ error }` on failure. All mutation responses include `x-request-id` / `x-correlation-id` and rate-limit headers.

## Documents

| Method | Path | Description |
|---|---|---|
| `GET` | `/documents` | List (filter `?status=` `?take=` `?skip=`) |
| `POST` | `/documents` | Ingest: `file` (multipart) \| `{ sampleId }` \| `{ title, content }` → `201 { document }` |
| `GET` | `/documents/:id` | Get with findings, transformations, intelligence |
| `DELETE` | `/documents/:id` | Delete with cascade |
| `POST` | `/documents/:id/scan` | Re-scan rawContent, optional `{ config }` (detector families + `minConfidence`) → `{ document }` |
| `POST` | `/documents/:id/sanitize` | `{ policy, findingActions[]? }` (per-finding `{ id, action }` reviewer overrides) → `{ document, actions, blocked, residualRisk }` |
| `POST` | `/documents/:id/transform` | Single or batch: `{ profile, outputType | outputTypes[], tone, language, detailLevel, objective, style }` → `{ document, transformation | transformations, dlpReasons, batchId, errors? }` (partial batches keep successes, failures listed in `errors`) |
| `GET` | `/documents/:id/security-report` | Risk, breakdown, DLP, top findings, sanitized preview |
| `GET` | `/documents/:id/history` | `{ transformations, audit }` |
| `GET` | `/documents/:id/intelligence` | Intelligence (cached) |
| `POST` | `/documents/:id/intelligence` | Intelligence (force refresh) |
| `POST` | `/documents/:id/policy-compare` | `{ profiles[] (1..10, built-ins + custom policies), outputType }` → compare sanitization across audiences |

**Generation parameters** (all optional, backward-compatible defaults in parentheses):

- `profile` — target audience: `PUBLIC_RELEASE` | `INTERNAL_SUMMARY` | `EXECUTIVE_BRIEF` | `HR_SAFE` | `SECURITY_INCIDENT` or any custom policy name (default `PUBLIC_RELEASE`)
- `outputType` / `outputTypes[]` — deliverables (15): `EXECUTIVE_SUMMARY` | `FAQ` | `TECHNICAL_REPORT` | `SLIDE_OUTLINE` | `EMAIL_DRAFT` | `PRESS_RELEASE` | `SOCIAL_POST` | `NEWSLETTER` | `POLICY_BRIEF` | `TRAINING_GUIDE` | `INCIDENT_SUMMARY` | `RESEARCH_DIGEST` | `ANNOUNCEMENT` | `BLOG_POST` | `MEETING_MINUTES` (batch up to 8)
- `tone` — `formal` | `professional` | `technical` | `friendly` | `persuasive` | `neutral` | `concise` (default `professional`)
- `language` — `en` | `es` | `fr` | `de` | `ja` | `zh` | `hi` | `pt` (default `en`)
- `detailLevel` — `brief` | `standard` | `detailed` | `comprehensive` (default `standard`)
- `objective` — `inform` | `summarize` | `persuade` | `educate` | `announce` | `report` | `analyze` | `comply` (default `inform`)
- `style` — `narrative` | `bullet` | `structured` | `conversational` | `formal` | `executive` | `creative` (default `structured`)

Example — batch press release + socials in French, executive tone:

```bash
curl -X POST http://localhost:3000/api/v1/documents/<id>/transform \
  -H "Content-Type: application/json" \
  -d '{
    "profile": "PUBLIC_RELEASE",
    "outputTypes": ["PRESS_RELEASE","SOCIAL_POST"],
    "tone": "formal",
    "language": "fr",
    "detailLevel": "standard",
    "objective": "announce",
    "style": "executive"
  }'
```

All transforms use the **sanitized working copy only**, wrapped in `<UNTRUSTED_DOCUMENT>`, with system-prompt non-negotiables (no secret exfiltration, no tool calls, citation grounding). Output is HTML-sanitized and DLP-repaired before delivery.

## System

| Method | Path | Description |
|---|---|---|
| `GET` | `/stats` | Totals, category breakdown, risk trend, recent activity, intelligence counts |
| `GET` | `/audit` | Latest 100 entries (`?take=`) |
| `GET` | `/policies` | Policy rules (built-ins + customs) |
| `POST` | `/policies` | Create custom policy `{ name, description?, classification?, audience?, allow[], mask[], remove[], block[], active? }` (max 50 customs) |
| `PUT` | `/policies/:name` | Update custom policy (built-ins: `403`) |
| `DELETE` | `/policies/:name` | Delete custom policy (built-ins: `403`) |
| `GET` | `/samples` | Synthetic sample documents (5) |
| `POST` | `/seed` | Ingest all samples through full pipeline (idempotent) |
| `GET` | `/api` | Health — `{ status, database, llm, pipeline, dbLatencyMs }` |

## Custom policies

- **Buckets** accept only engine-known finding types/categories (`KNOWN_BUCKET_ENTRIES`); unknown entries and cross-bucket duplicates are rejected (`400`).
- **Invariants:** credentials (`SECRET` family) and prompt-injection types can never be allow-listed (`400`); injection spans are always quarantined regardless of bucket.
- **Built-ins are immutable:** `PUT`/`DELETE` on `PUBLIC_RELEASE`, `INTERNAL_SUMMARY`, `EXECUTIVE_BRIEF`, `HR_SAFE`, `SECURITY_INCIDENT` return `403` — clone under a new `UPPER_SNAKE_CASE` name to customize.
- **Framework templates** (`src/lib/security/policy-templates.ts`) seed the gallery: `OWASP_GENAI_STRICT`, `GDPR_MINIMIZED`, `HIPAA_SAFE_HARBOR`, `PCI_DSS_SAFE` — starting points, not certifications.
- **Finding overrides** (`findingActions[]` on sanitize): reviewer-chosen `{ id, action }` per `INPUT` finding, resolved by id within the document. `ALLOW` on injections/secrets is rejected (`400`); the engine additionally degrades such requests instead of failing open.

Client: `src/lib/api-client.ts` — `api.transformDocument(id, profile, outputType, params)`, `api.transformBatch(id, {profile, outputTypes, ...params})`.
