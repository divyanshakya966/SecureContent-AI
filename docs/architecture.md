# Architecture — SecureContent AI

## High-level

```
                    +-----------------------+
                    |       FRONTEND        |
                    | Next.js 16 (App R.)  |  ← single "/" route, Zustand view switch
                    +-----------+-----------+
                                |
                                v
                    +-----------------------+
                    |       API GATEWAY     |
                    | Next.js route handlers|  ← T1: Browser → Backend
                    +-----------+-----------+
                                |
          +---------------------+---------------------+
          |                     |                     |
          v                     v                     v
  +---------------+   +----------------+   +----------------+
  | Ingestion     |   | Policy Engine  |   | Audit Service  |
  | parsers.ts    |   | policies.ts    |   | auditLog table |
  +-------+-------+   +-------+--------+   +----------------+
          |                     |
          v                     v
  +---------------+   +-----------------------+
  | Parser / OCR  |   | Security Gateway      |
  | pdf-parse     |   | detectors.ts (PII/    |
  | mammoth       |   |   Secrets/Injection)  |
  | (Docling opt) |   +-----------------------+
          |                     |
          +-----------+---------+
                      |
                      v
           +-----------------------+
           | Sanitization Engine   |  ← sanitize.ts
           +-----------+-----------+
                       |
                       v
           +-----------------------+
           | Transformation Engine |  ← lib/ai/transform.ts (z-ai-web-dev-sdk)
           +-----------+-----------+
                       |
                       v
           +-----------------------+
           | Output Validator      |  ← output-dlp.ts + grounding check
           +-----------+-----------+
                       |
                       v
           +-----------------------+
           | Safe Output Delivery  |
           +-----------------------+
```

## Key files

- `src/lib/parsers.ts` — validates size/MIME (T2), proxies to Docling if configured, falls back to `pdf-parse`/`mammoth`.
- `src/lib/security/detectors.ts` — multi-signal detectors + `scanContent()` orchestration.
- `src/lib/security/risk.ts` — transparent weighted risk: severity × confidence × category weight + mitigation credit.
- `src/lib/security/sanitize.ts` — policy-driven MASK/REDACT/REPLACE/QUARANTINE; document-level BLOCK only when no usable prose remains.
- `src/lib/security/output-dlp.ts` — re-scan generated content; auto-repair before release.
- `src/lib/ai/transform.ts` — strict system prompt, `<UNTRUSTED_DOCUMENT>` envelope, per-profile constraints, citation extraction.
- `prisma/schema.prisma` — SQLite: `Document`, `Finding`, `Transformation`, `AuditLog`, `Policy`.

## Data flow (secure transformation)

```
1. POST /api/v1/documents  → validate file → parse → scan → risk+classify → store findings+doc (status SCANNED)
2. POST /api/v1/documents/:id/sanitize → apply policy → sanitizedContent → residual risk → status SANITIZED
3. POST /api/v1/documents/:id/transform → sanitizedContent (never raw) inside <UNTRUSTED_DOCUMENT>
     → LLM → output → Output DLP (auto-repair if needed) → grounding check → store Transformation → status TRANSFORMED
4. GET /api/v1/documents/:id/security-report → risk, breakdown, top findings, sanitized preview, grounding/policy/DLP
5. Every step writes AuditLog (actor: analyst | policy_engine | llm_adapter | output_validator)
```

## Storage

- `prisma/dev.db` locally (gitignored) or `db/custom.db` in Docker (`DATABASE_URL=file:...`).
- No object store in the MVP; raw/sanitized text live in SQLite. For large files move to S3/GCS + store text in DB.
- Findings keep `matchedText` locally only; never log verbatim to stdout.

## Deployment

- `next build` → `.next/standalone` (Docker `oven/bun` runner).
- `docker-compose.yml`: `app` + `caddy` (reverse-proxy on :81 per harness) + optional `docling` (profile).
- `Caddyfile`: proxies `localhost:3000` and `?XTransformPort=` query (harness).
- `.zscripts/database-runtime-build.sh` / `python-runtime-build.sh` satisfy the platform test harness.

## Frontend

Single Next.js page (`src/app/page.tsx`) with Zustand store switching views: dashboard, upload, documents, document detail (6 tabs), policies, audit, architecture. Tailwind 4 + shadcn/ui + Recharts + emerald security palette; no page reloads, no separate routes.
