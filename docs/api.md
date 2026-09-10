# API

Base: `http://localhost:3000/api/v1` — JSON, `{ error }` on failure.

## Documents

| Method | Path | Description |
|---|---|---|
| `GET` | `/documents` | List (filter `?status=`) |
| `POST` | `/documents` | Ingest: `file` (multipart) \| `{ sampleId }` \| `{ title, content }` → `201 { document }` |
| `GET` | `/documents/:id` | Get with findings, transformations |
| `DELETE` | `/documents/:id` | Delete with cascade |
| `POST` | `/documents/:id/scan` | Re-scan → `{ document }` |
| `POST` | `/documents/:id/sanitize` | `{ policy }` → `{ document, actions, blocked, residualRisk }` |
| `POST` | `/documents/:id/transform` | `{ profile, outputType }` → `{ document, transformation }` |
| `GET` | `/documents/:id/security-report` | Risk, breakdown, DLP, top findings, preview |
| `GET` | `/documents/:id/history` | `{ transformations, audit }` |

`profile`: `PUBLIC_RELEASE | INTERNAL_SUMMARY | EXECUTIVE_BRIEF | HR_SAFE | SECURITY_INCIDENT`
`outputType`: `EXECUTIVE_SUMMARY | FAQ | TECHNICAL_REPORT | SLIDE_OUTLINE | EMAIL_DRAFT`

## System

| Method | Path | Description |
|---|---|---|
| `GET` | `/stats` | Totals, category breakdown, risk trend, recent activity |
| `GET` | `/audit` | Latest 100 entries |
| `GET` | `/policies` | Policy rules (also `POST` to create) |
| `GET` | `/samples` | Sample documents |
| `POST` | `/seed` | Ingest all samples (idempotent) |

Client: `src/lib/api-client.ts`
