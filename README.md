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

## Run Locally (Perfect Setup)

**Prerequisites:** Node 20+ or Bun 1.x, SQLite (bundled via Prisma), Git

**1) Clone & install**

```bash
git clone https://github.com/divyanshakya966/SecureContent-AI.git
cd SecureContent-AI
# automated (installs Bun if missing, installs deps, creates .env, pushes DB)
./scripts/setup.sh

# manual alternative
bun install
cp .env.example .env   # then edit .env — see Configuration below
bunx prisma generate
bunx prisma db push --accept-data-loss
```

**2) Configure `.env`**

```env
DATABASE_URL="file:./prisma/dev.db"   # local SQLite; for Postgres use postgresql://...
GEMINI_API_KEY=""                      # https://aistudio.google.com/apikey
GROQ_API_KEY=""                        # https://console.groq.com/keys (fallback)
GEMINI_MODEL="gemini-2.0-flash"
GROQ_MODEL="openai/gpt-oss-120b"
# optional OCR
# DOCLING_WORKER_URL="http://localhost:8001/parse"
```

> Keys are server-only (`src/lib/ai/transform.ts` runtime guard). Without keys the app uses a deterministic offline mock that still exercises DLP/grounding.

**3) Develop**

```bash
bun run dev          # http://localhost:3000 — Next.js with proxy + security headers
# in another terminal, ingest synthetic data to populate every view
curl -X POST http://localhost:3000/api/v1/seed
```

**4) Verify (local CI)**

```bash
bun run verify   # lint + typecheck + vitest (64 tests) + next build
bun run benchmark
```

**5) Production build locally**

```bash
bun run build
NODE_ENV=production bun .next/standalone/server.js  # standalone output, no Bun needed
```

**Windows:** `.\scripts\setup.ps1` or `scripts\setup.bat` (same steps).

---

## Run on Cloud

### Option A — Docker (recommended for any VM / VPS / EC2 / Azure VM)

```bash
# on the cloud machine with Docker & Docker Compose
git clone https://github.com/divyanshakya966/SecureContent-AI.git && cd SecureContent-AI

# create env file on the host (never commit)
cat > .env <<'EOF'
DATABASE_URL="file:/app/db/custom.db"
GEMINI_API_KEY="your-gemini-key"
GROQ_API_KEY="your-groq-key"
EOF

docker compose up --build -d            # app :3000 + caddy :81
docker compose logs -f app
# seed once (optional)
curl -X POST http://<host>:3000/api/v1/seed
```

Caddy terminates as reverse-proxy on `:81` with HSTS/CSP. SQLite persists in Docker volume `db_data` (`/app/db/custom.db`). For horizontal scale, replace `DATABASE_URL` with Postgres and add external Redis for rate limiting (swap in `src/lib/validation/rateLimit.ts`).

Optional Docling OCR worker:

```bash
docker compose --profile docling up --build -d   # adds Python worker :8001, app auto-proxies via DOCLING_WORKER_URL
```

### Option B — Vercel / Render / Fly.io (Next.js standalone)

1. Push the repo to GitHub.
2. Import project in Vercel/Render.
3. **Build command:** `bun run build`  **Output:** `.next/standalone` (set via `next.config.ts` `output: "standalone"`)
4. **Env vars:** `DATABASE_URL` (use Neon/Supabase Postgres for cloud), `GEMINI_API_KEY`, `GROQ_API_KEY`
5. **Deploy** — `proxy.ts` headers and `next.config` CSP apply automatically. For SQLite on ephemeral FS, switch to Postgres before deploying.

### Option C — Bare VM without Docker

```bash
curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH"
bun install --frozen-lockfile
bunx prisma generate
DATABASE_URL="file:./prisma/dev.db" bunx prisma db push
bun run build
NODE_ENV=production DATABASE_URL="file:./prisma/dev.db" node .next/standalone/server.js
```

**Troubleshooting ingest obscure characters:** fixed in `src/lib/parsers.ts` + `src/lib/text.ts` — binary PPTX/PDF fallback no longer decodes as UTF-8, all parser outputs are NFC-normalized and stripped of control/zero-width/� chars, plus `sanitizeForDisplay` on every `<pre>`/table cell with `[overflow-wrap:anywhere]`. If a file still shows empty, the UI now surfaces `No extractable text — enable Docling` instead of boxes.

**Verify cloud:** `curl http://<host>/api/v1/stats` should return `stats.totalDocuments`.

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
