# SecureContent AI

[![CI](https://github.com/securecontent-ai/securecontent-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/securecontent-ai/securecontent-ai/actions/workflows/ci.yml)
[![Security](https://github.com/securecontent-ai/securecontent-ai/actions/workflows/security.yml/badge.svg)](https://github.com/securecontent-ai/securecontent-ai/actions/workflows/security.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

Policy-aware content transformation with built-in data protection. Uploads are scanned, classified, and sanitized before generation. Outputs are re-validated before delivery.

```
Ingest → Scan → Classify → Sanitize → Transform → Validate → Deliver
```

## Features

- **Ingestion** — PDF, DOCX, TXT, MD, CSV, JSON, images (OCR via optional worker)
- **Detection** — PII, secrets, prompt injection, internal assets, unsafe URLs
- **Risk scoring** — Weighted model, transparent breakdown
- **Policy engine** — 5 profiles (Public, Internal, Executive, HR, Security) with allow / mask / remove / block
- **Sanitization** — Mask / redact / quarantine working copy; `<UNTRUSTED_DOCUMENT>` isolation for LLM
- **Transformation** — Executive summary, FAQ, technical report, slide outline, email draft
- **Output validation** — DLP rescan, grounding check, auto-repair
- **Operations** — Dashboard, documents, intelligence (entities / IOCs / TTPs), policy comparison, audit trail

## Quick Start

**Requirements:** Node 20+, SQLite, Bun 1.x

```bash
git clone <repo> SecureContent-AI && cd SecureContent-AI
./scripts/setup.sh
bun run dev          # http://localhost:3000
curl -X POST http://localhost:3000/api/v1/seed   # optional sample data
```

**Windows:** `.\scripts\setup.ps1` or `scripts\setup.bat`

**Docker:**

```bash
docker compose up --build              # app + caddy (:3000, :81)
docker compose --profile docling up    # + Python OCR worker (:8001)
```

**Verify:**

```bash
bun run verify   # lint + typecheck + test + build
```

## Configuration

Copy `.env.example` to `.env`:

```env
# Database
DATABASE_URL="file:./dev.db"

# LLM — server-side only (never expose to client or commit)
GEMINI_API_KEY=""              # primary — Google AI Studio: https://aistudio.google.com/apikey
GROQ_API_KEY=""                # fallback — Groq console: https://console.groq.com/keys (model: openai/gpt-oss-120b)
GEMINI_MODEL="gemini-2.0-flash"
GROQ_MODEL="openai/gpt-oss-120b"

# Optional
DOCLING_WORKER_URL=""          # optional: http://localhost:8001/parse
```

> **Security:** `GEMINI_API_KEY` / `GROQ_API_KEY` are read **only** on the server
> (`src/lib/ai/transform.ts`, `import "server-only"`). Architecture is
> `Next.js Frontend -> Next.js API (server) -> Security Pipeline -> Gemini/Groq`.
> Never use `NEXT_PUBLIC_*`, never commit keys, never put them in screenshots/PPT.
> If no keys are set, transforms fall back to a deterministic offline mock (still
> exercises Output DLP + grounding).

| Format | Parser |
|---|---|
| TXT/MD/CSV/JSON | Direct UTF-8 |
| PDF | pdf-parse (or Docling → PyMuPDF → pdfminer) |
| DOCX | mammoth (or Docling) |
| PPTX / Images | Docling worker (optional) |

## Policies

| Profile | Audience | Behavior |
|---|---|---|
| `PUBLIC_RELEASE` | Public | Strictest; redact all sensitive |
| `INTERNAL_SUMMARY` | Internal | Aggregate detail |
| `EXECUTIVE_BRIEF` | Leadership | Strategic context |
| `HR_SAFE` | HR | Roles, not names |
| `SECURITY_INCIDENT` | Security | Preserve IOCs/TTPs |

Injection spans are always quarantined (`QUARANTINE`).

## API

```
POST   /api/v1/documents                    # file (multipart) | { sampleId } | { title, content }
GET    /api/v1/documents
GET    /api/v1/documents/:id
DELETE /api/v1/documents/:id
POST   /api/v1/documents/:id/scan
POST   /api/v1/documents/:id/sanitize       # { policy }
POST   /api/v1/documents/:id/transform      # { profile, outputType }
GET    /api/v1/documents/:id/security-report
GET    /api/v1/documents/:id/history
GET    /api/v1/stats
GET    /api/v1/audit
GET    /api/v1/policies
GET    /api/v1/samples
POST   /api/v1/seed
```

Details: `docs/api.md`

## Project Structure

```
src/
  app/api/v1/              # Route handlers
  lib/security/            # Detectors, risk, sanitize, DLP, policies
  lib/parsers.ts           # Ingestion
  lib/ai/transform.ts      # LLM adapter
  components/secure/       # UI
  types/
prisma/schema.prisma       # SQLite model
mini-services/docling-worker/
tests/                     # unit / integration / security
```

## Quality Gates

```bash
bun run lint        # ESLint (warnings as CI signal)
bun run typecheck   # tsc --noEmit (strict)
bun run test        # vitest (unit + integration + security + redteam)
bun run benchmark   # synthetic detection benchmark
bun run verify      # full local CI (lint + typecheck + test + build)
```

CI runs on every push/PR via `.github/workflows/ci.yml`; security scans via `security.yml` (gitleaks, semgrep, audit, docker build).

## Security

- Parser isolation, size/MIME validation, SSRF guards
- Pre-LLM scan + post-LLM DLP (double gate) with deterministic repair
- Policy-enforced sanitization (5 profiles, allow / mask / remove / block)
- Audit log for every state transition (upload, scan, sanitize, transform, release)
- Security headers: CSP, HSTS, X-Frame-Options, etc. (next.config + proxy + Caddy)
- Rate limiting per IP/route (in-memory; swap to Redis in production)
- See `docs/threat-model.md` and `docs/architecture.md`

## References

- OWASP GenAI LLM Top 10 2026 — https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/
- OWASP Prompt Injection — https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- OWASP Sensitive Information Disclosure — https://genai.owasp.org/llmrisk/llm022025-sensitive-information-disclosure/
