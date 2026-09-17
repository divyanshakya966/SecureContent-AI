# SecureContent AI

[![CI](https://github.com/divyanshakya966/SecureContent-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/divyanshakya966/SecureContent-AI/actions/workflows/ci.yml)
[![Security](https://github.com/divyanshakya966/SecureContent-AI/actions/workflows/security.yml/badge.svg)](https://github.com/divyanshakya966/SecureContent-AI/actions/workflows/security.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

AI-powered content transformation engine. Converts a common source of information (articles, reports, advisories, policy docs, research papers, prompts, images, videos or contextual information) into the specific deliverable requested by the operator — reducing manual effort, improving consistency, and accelerating creation.

Policy-aware with built-in data protection: every upload is scanned, classified, and sanitized before generation, and every output is re-validated before delivery.

```
Ingest → Scan → Classify → Sanitize → Transform (configurable) → Validate → Deliver
```

## Platform Overview

**Source content** is submitted via the dashboard as high-quality English text, documents, articles, reports, prompts, images, videos or contextual information. The operator selects **one or more desired output types** and tunes **generation parameters**; the platform analyses input, understands context & intent, and generates the requested artefact(s).

- **Source types:** PDF, DOCX, PPTX, TXT, MD, CSV, JSON, HTML, images (PNG/JPG/WebP/SVG/TIFF via local `tesseract.js`+`sharp` OCR or Docling), video/audio (MP4/MOV/WebM/MP3/WAV via transcript placeholder), plus direct paste of prompts & contextual info. Image/video OCR & transcription are enabled locally (no worker needed) and via the optional Docling/Python worker or by pasting the transcript.
- **15 output formats:** Executive Summary, FAQ, Technical Report, Slide Outline, Email Draft, Press Release, Social Post (3 variants), Newsletter, Policy Brief, Training Guide, Incident Summary, Research Digest, Announcement, Blog Post, Meeting Minutes — single or batch (up to 8) per request.
- **Configurable generation parameters:** Target audience (5 built-in + unlimited custom policy profiles), tone (formal/professional/technical/friendly/persuasive/neutral/concise), language (en/es/fr/de/ja/zh/hi/pt), level of detail (brief/standard/detailed/comprehensive), communication objective (inform/summarize/persuade/educate/announce/report/analyze/comply), and content style (narrative/bullet/structured/conversational/formal/executive/creative).

## Features

- **Ingestion** — PDF, DOCX, PPTX (local `jszip`), TXT, MD, CSV, JSON, HTML, images & video/audio with isolated parsers + quality gate (`scoreTextQuality`); Images OCR locally via `tesseract.js`+`sharp`; Docling worker for enhanced OCR & scanned PDFs
- **Detection** — PII (emails, phones, Aadhaar/PAN/SSN/passports/licenses, addresses, DOB), financial data (cards + Luhn, CVV/expiry, IBAN/IFSC/UPI/bank accounts), secrets (AWS/Azure/GCP/Stripe/GitHub/GitLab/npm/Slack, JWT, SSH/PGP, DB URLs, Bearer/Basic), prompt injection (override phrases, jailbreaks, role tricks, tool calls, hidden directives), internal assets (IPv4/IPv6, internal hosts, project names), unsafe URLs — heuristic + entropy + context-gated
- **Scan options** — detector families and confidence floor tunable per document (output DLP always full-scan)
- **Risk scoring** — Weighted, transparent breakdown with classification (PUBLIC → RESTRICTED)
- **Policy engine** — 5 built-in audience profiles (Public, Internal, Executive, HR, Security) + unlimited custom policies (create/clone/edit from the Policy Studio or API) with allow / mask / remove / block; framework-aligned templates (OWASP GenAI, GDPR, HIPAA Safe Harbor, PCI DSS)
- **Sanitization** — Mask / redact / replace / quarantine working copy; per-finding reviewer overrides; `<UNTRUSTED_DOCUMENT>` isolation for LLM
- **Transformation** — 15 artefacts with 6 configurable dimensions (audience, tone, language, detail, objective, style); batch generation; grounding citations
- **Output validation** — DLP rescan, HTML sanitization, grounding check, auto-repair
- **Operations** — Dashboard, documents, intelligence (entities / IOCs / TTPs), policy comparison, audit trail, batch history

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
GEMINI_MODEL="gemini-3.6-flash"
GROQ_MODEL="openai/gpt-oss-120b"
# optional rollback chains (comma-separated, tried in order)
# Sep-2026: 2.5-* is 404 for new users — use 3.6-flash / 3.5-flash-lite / 3.1-pro-preview
# GEMINI_FALLBACK_MODELS="gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-pro-preview"
# GROQ_FALLBACK_MODELS="openai/gpt-oss-120b,openai/gpt-oss-20b,llama-3.3-70b-versatile,llama-3.1-8b-instant,qwen/qwen3-32b"
# MAX_TRANSFORM_CHARS="90000"  # truncate before LLM to avoid context_length_exceeded
# optional OCR (Docling worker is preferred; local tesseract is opt-in)
# DOCLING_WORKER_URL="http://localhost:8001/parse"
# ENABLE_LOCAL_OCR="false"  # set "true" to enable local tesseract.js (slow; prefer Docling worker)
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
bun run verify   # lint + typecheck + vitest + next build
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

**Ingest quality (no obscure output):** every extraction is quality-scored and garbled output (hex, CID, `PJYI~`, `�` boxes) is discarded, never stored — see the source table below and `docs/ingestion.md` for the per-format chain (local parsers + optional Docling OCR).

**Verify cloud:** `curl http://<host>/api/v1/stats` should return `stats.totalDocuments`.

## Configuration

Copy `.env.example` to `.env` — same variables as the quickstart block above (plus `DOCLING_WORKER_URL` / `ENABLE_LOCAL_OCR` for OCR, below).

> **Security:** `GEMINI_API_KEY` / `GROQ_API_KEY` are read **only** on the server
> (`src/lib/ai/transform.ts`, `import "server-only"`). Architecture is
> `Next.js Frontend -> Next.js API (server) -> Security Pipeline -> Gemini/Groq`.
> Never use `NEXT_PUBLIC_*`, never commit keys, never put them in screenshots/PPT.
> If no keys are set, transforms fall back to a deterministic offline mock (still
> exercises Output DLP + grounding).

| Source | How it is handled (never obscure) |
|---|---|
| **Text** (articles, reports, prompts, contextual info) — TXT/MD/CSV/JSON/HTML | Direct UTF-8, NFC-normalized, control/zero-width stripped + `scoreTextQuality` garbage filter |
| **Documents** — PDF | `pdf-parse` + quality gate → Docling `pymupdf` → `pymupdf+OCR` (150dpi) → `pdfminer` for scanned/complex |
| **Documents** — DOCX | `mammoth` + quality gate; Docling `python-docx` for complex |
| **Slides** — PPTX | Local `jszip` extracts `<a:t>` from `ppt/slides/slide*.xml`; Docling `python-pptx` fallback |
| **Images** — PNG/JPG/WebP/SVG/TIFF/BMP | Local `tesseract.js`+`sharp` (grayscale/normalize/upscale) or Docling `Pillow+pytesseract`; SVG extracts `<text>`/`<tspan>`; metadata placeholder if no text |
| **Video/Audio** — MP4/MOV/WebM/MP3/WAV | Metadata placeholder; paste transcript or run Whisper worker; then transform transcript |

Generation is **always** `sanitized working copy → LLM inside `<UNTRUSTED_DOCUMENT>` envelope → output sanitizer → DLP rescan → grounding`.

### Enhanced OCR — Docling worker (optional)

For best quality on scanned PDFs, complex layouts, and photo scans (Docker setups can use `docker compose --profile docling up` instead):

```bash
cd mini-services/docling-worker
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt pymupdf pillow pytesseract
# OS-level OCR engine: sudo dnf install tesseract tesseract-langpack-eng  (or: sudo apt install tesseract-ocr)
uvicorn app:app --host 127.0.0.1 --port 8001
```

Then set `DOCLING_WORKER_URL=http://localhost:8001/parse` in `.env`, restart the app, and re-upload — files are proxied to the worker first (20s timeout, SSRF-guarded) with automatic fallback to local parsers. Details: `mini-services/docling-worker/README.md`.

## Policies

| Profile | Audience | Behavior |
|---|---|---|
| `PUBLIC_RELEASE` | Public | Strictest; redact all sensitive |
| `INTERNAL_SUMMARY` | Internal | Aggregate detail |
| `EXECUTIVE_BRIEF` | Leadership | Strategic context |
| `HR_SAFE` | HR | Roles, not names |
| `SECURITY_INCIDENT` | Security | Preserve IOCs/TTPs |

Injection spans are always quarantined (`QUARANTINE`).

### Custom policies

Built-ins are immutable — the Policy Studio (or `POST /api/v1/policies`) clones them into editable custom policies (create / edit / activate / delete, max 50). Every bucket entry must be an engine-known finding type or category; credentials and injections can never be allow-listed (rejected with `400`).

Framework-aligned starting points (clone, review with your compliance team — not certifications):

| Template | Aligned with |
|---|---|
| `OWASP_GENAI_STRICT` | OWASP GenAI LLM Top 10 (LLM01 injection, LLM02 disclosure, LLM06 agency) |
| `GDPR_MINIMIZED` | GDPR Art. 5(1)(c) data minimisation |
| `HIPAA_SAFE_HARBOR` | HIPAA §164.514(b)(2), 18 identifier classes |
| `PCI_DSS_SAFE` | PCI DSS Req. 3, account-data protection |

### Finding-level control & scan options

After scanning, reviewers can overrule any finding's action (keep / mask / redact / replace / quarantine) and sanitize with their choices — locked so secrets can never be kept and injections stay quarantined. Scan options tune detector families and the confidence floor per document; output DLP always scans everything.

## API

```
POST   /api/v1/documents                    # file (multipart) | { sampleId } | { title, content }
POST   /api/v1/documents/bulk-delete        # { ids[] (1–100) } → { deleted, ids } (unknown ids ignored)
GET    /api/v1/documents                    # ?status=&take=&skip=
GET    /api/v1/documents/:id
DELETE /api/v1/documents/:id
POST   /api/v1/documents/:id/scan          # { config? } — detector families + minConfidence
POST   /api/v1/documents/:id/sanitize       # { policy, findingActions[]? } — per-finding reviewer overrides
POST   /api/v1/documents/:id/transform      # { profile, outputType | outputTypes[] (1..8), tone, language, detailLevel, objective, style } — partial batch returns { errors[] }
GET    /api/v1/documents/:id/security-report
GET    /api/v1/documents/:id/history
GET    /api/v1/documents/:id/intelligence   # GET (cached) | POST (force refresh)
POST   /api/v1/documents/:id/policy-compare # { profiles[] (1..10, built-ins + customs), outputType }
POST   /api/v1/documents/:id/pipeline      # auto sanitize→transform→validate (SSE stages); { policy, outputType | outputTypes[] (1..8), findingActions[]?, tone, language, detailLevel, objective, style }
POST   /api/v1/documents/batch              # bulk: files[] (1–20, 100 MB) + { policy, outputTypes[]?, runPipeline?, skipDuplicates?, stopOnError?, concurrency? } → per-file results + summary
GET    /api/v1/stats
GET    /api/v1/audit                        # ?take=
GET    /api/v1/policies                     # GET list | POST create
PUT    /api/v1/policies/:name                # update custom policy (built-ins: 403)
DELETE /api/v1/policies/:name                # delete custom policy (built-ins: 403)
GET    /api/v1/samples
POST   /api/v1/seed
GET    /api/health                          # (also /api) -> { status, database, llm, pipeline }
```

`profile`: `PUBLIC_RELEASE | INTERNAL_SUMMARY | EXECUTIVE_BRIEF | HR_SAFE | SECURITY_INCIDENT` or any custom policy name (target audience)  
`outputType` (15): `EXECUTIVE_SUMMARY | FAQ | TECHNICAL_REPORT | SLIDE_OUTLINE | EMAIL_DRAFT | PRESS_RELEASE | SOCIAL_POST | NEWSLETTER | POLICY_BRIEF | TRAINING_GUIDE | INCIDENT_SUMMARY | RESEARCH_DIGEST | ANNOUNCEMENT | BLOG_POST | MEETING_MINUTES`  
`outputTypes[]` (batch 1..8) and generation controls `tone`, `language` (`en/es/fr/de/ja/zh/hi/pt`), `detailLevel` (`brief/standard/detailed/comprehensive`), `objective` (`inform/summarize/persuade/educate/announce/report/analyze/comply`), `style` (`narrative/bullet/structured/conversational/formal/executive/creative`) are all documented in `docs/api.md`.

Details: `docs/api.md`

## Project Structure

```
src/
  app/(app)/               # Routed pages: overview, ingest, documents, intelligence, policy-lab, policies, audit, architecture
  app/api/v1/              # Route handlers
  lib/security/            # Detectors, risk, sanitize, DLP, policies (+ framework templates)
  lib/parsers.ts           # Ingestion (+ lib/ingest.ts shared routine, lib/ocr.ts)
  lib/ai/transform.ts      # LLM adapter (+ lib/pipeline-run.ts shared auto-pipeline)
  components/secure/       # UI
  types/
prisma/schema.prisma       # SQLite model
mini-services/docling-worker/  # Optional OCR microservice
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

- Parser isolation, size/MIME validation, SSRF allowlist (loopback/RFC1918/service-names only)
- Pre-LLM scan + post-LLM DLP (double gate) with deterministic repair
- Policy-enforced sanitization — built-in + custom profiles (allow / mask / remove / block), per-finding reviewer overrides, injection quarantine no policy or override can lift
- Optional bearer auth: set `API_AUTH_TOKEN` (≥16 chars) to lock all `POST/PUT/DELETE` under `/api/v1/*` (token entry in the topbar, `REQUIRE_AUTH_FOR_READS=true` also locks `GET`s); `/api/v1/seed` additionally gated by `ALLOW_SEED` in production
- Audit log for every state transition (upload, scan, sanitize, transform, release)
- Security headers: CSP, HSTS, X-Frame-Options, etc. (next.config + proxy + Caddy)
- Rate limiting per IP/route plus a global backstop (in-memory; swap to Redis in production)
- Containers: read-only FS, no-new-privileges, dropped caps, pinned images, Trivy-gated CI
- See `SECURITY.md`, `docs/threat-model.md`, `docs/architecture.md`, and `docs/cloud.md` (cloud runbook)

## References

- OWASP GenAI LLM Top 10 2026 — https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/
- OWASP Prompt Injection — https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- OWASP Sensitive Information Disclosure — https://genai.owasp.org/llmrisk/llm022025-sensitive-information-disclosure/
