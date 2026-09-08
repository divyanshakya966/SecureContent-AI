# API — SecureContent AI

Base: `http://localhost:3000/api/v1`

All routes return JSON. Errors are `{ error: string }` with appropriate status codes.

## Documents

### `GET /api/v1/documents` — list

Query: `?status=UPLOADED|SCANNED|SANITIZED|TRANSFORMED|BLOCKED` (optional)

```json
{ "documents": [ { "id": "...", "title": "...", "classification": "CONFIDENTIAL", "riskScore": 72, "findings": [...], "transformations": [...] } ] }
```

### `POST /api/v1/documents` — ingest

Three modes (one request):

- **Multipart file:** `file` (File) + optional `title`
- **Sample:** JSON `{ "sampleId": "sample-pii" }`
- **Paste:** JSON `{ "title": "...", "content": "..." }`

Validation: 10 MB limit, MIME allowlist, parser isolation. Response: `201 { document }` with eager scan (`riskScore`, `classification`, `findings`).

### `GET /api/v1/documents/:id`

Returns the document with `findings` and `transformations`.

### `DELETE /api/v1/documents/:id`

Deletes the document and cascades findings/transformations.

### `POST /api/v1/documents/:id/scan` — re-scan

Re-runs `scanContent(rawContent)` and replaces INPUT findings. Returns `{ document, risk }`.

### `POST /api/v1/documents/:id/sanitize` — apply policy

Body: `{ "policy": "PUBLIC_RELEASE" }` (one of the 5 built-ins, or a custom name from `GET /api/v1/policies`).

Produces `sanitizedContent` via `sanitizeContent(raw, findings, policy)`. Computes residual risk. Updates document `status` to `SANITIZED` or `BLOCKED`. Returns `{ document, actions, blocked, residualRisk }`.

### `POST /api/v1/documents/:id/transform` — generate

Body: `{ "profile": "PUBLIC_RELEASE", "outputType": "EXECUTIVE_SUMMARY" }`

- `profile`: `PUBLIC_RELEASE | INTERNAL_SUMMARY | EXECUTIVE_BRIEF | HR_SAFE | SECURITY_INCIDENT`
- `outputType`: `EXECUTIVE_SUMMARY | FAQ | TECHNICAL_REPORT | SLIDE_OUTLINE | EMAIL_DRAFT`

Flow: `sanitizedContent || rawContent` → `transformContent()` inside `<UNTRUSTED_DOCUMENT>` → `runOutputDlp()` (auto-repair) → grounding check → store `Transformation`. Returns `{ document, transformation, dlpReasons }`.

### `GET /api/v1/documents/:id/security-report`

Derived report (risk, findings breakdown, severity, grounding/policy/DLP, top findings, sanitized preview):

```json
{
  "report": {
    "riskScore": 72,
    "riskBefore": 72,
    "riskAfter": 12,
    "classification": "CONFIDENTIAL",
    "findings": { "pii": 14, "secrets": 2, "promptInjection": 1, "internalAssets": 3, "unsafeUrls": 0, "outputLeakage": 0 },
    "severityBreakdown": { "LOW":0,"MEDIUM":10,"HIGH":3,"CRITICAL":1 },
    "grounding": "PASS",
    "policyStatus": "PASS",
    "outputDlp": "PASS",
    "topFindings": [ ... ],
    "sanitizedPreview": "...",
    "generatedAt": "2026-..."
  },
  "riskBreakdown": { "total": 72, "pii": 30, "secrets": 20, "promptInjection": 15, "classification": "CONFIDENTIAL" }
}
```

### `GET /api/v1/documents/:id/history`

```json
{ "transformations": [ { "id": "...", "profile": "...", "outputType": "...", "grounding": "PASS", ... } ], "audit": [ ... ] }
```

## Stats / Audit / Policies / Samples

- `GET /api/v1/stats` → `{ stats: DashboardStats }` with totals, category breakdown, `riskTrend` (before/after per doc), `recentActivity`.
- `GET /api/v1/audit` → `{ audit: AuditLogEntry[] }` (latest 100).
- `GET /api/v1/policies` → `{ policies: PolicyRule[] }` (also `POST` to create).
- `GET /api/v1/samples` → `{ samples: SampleDocument[] }` (5 canonical attack samples).
- `POST /api/v1/seed` → ingests all 5 samples end-to-end (scan→sanitize→transform→DLP). Idempotent.

## Frontend client

Typed helpers in `src/lib/api-client.ts`. Used by the Zustand-driven UI.
