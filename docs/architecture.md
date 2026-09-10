# Architecture

```
Frontend (Next.js) → API Gateway → Ingestion | Policy Engine | Audit
                              ↓
              Security Gateway (PII / Secrets / Injection)
                              ↓
                 Sanitization Engine
                              ↓
                 Transformation Engine (LLM)
                              ↓
                   Output Validator (DLP)
                              ↓
                      Safe Delivery
```

## Components

| Component | File | Responsibility |
|---|---|---|
| Parsers | `src/lib/parsers.ts` | Size/MIME validation, PDF/DOCX extraction, Docling proxy (T2) |
| Detectors | `src/lib/security/detectors.ts` | PII / secrets / injection detection |
| Risk | `src/lib/security/risk.ts` | Weighted risk, classification |
| Sanitize | `src/lib/security/sanitize.ts` | Policy-driven mask/redact/quarantine |
| Output DLP | `src/lib/security/output-dlp.ts` | Rescan, auto-repair |
| Transform | `src/lib/ai/transform.ts` | LLM envelope, grounding |
| Storage | `prisma/schema.prisma` | SQLite: Document, Finding, Transformation, AuditLog, Policy |

## Flow

1. `POST /documents` — validate, parse, scan, classify, store (SCANNED)
2. `POST /documents/:id/sanitize` — apply policy, write sanitized copy (SANITIZED/BLOCKED)
3. `POST /documents/:id/transform` — transform sanitized copy inside `<UNTRUSTED_DOCUMENT>`, validate output (TRANSFORMED)
4. `GET /documents/:id/security-report` — risk breakdown, findings, DLP status
5. All steps write `AuditLog`

## Storage

- `prisma/dev.db` (local) or `db/custom.db` (Docker) via `DATABASE_URL=file:...`
- Raw/sanitized text stored in SQLite; findings retain `matchedText` locally only

## Deployment

- `next build` → `.next/standalone` (Bun runtime)
- `docker-compose.yml`: `app` + `caddy` (:81) + optional `docling`
- Single-page frontend (`src/app/page.tsx`, Zustand, Tailwind, shadcn/ui)
