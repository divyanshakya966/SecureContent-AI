# SecureContent AI — Zero-Trust GenAI Content Transformation

> **SIH26154 — GenAI Platform for Automated Content Transformation**  
> *Transform any content securely — without letting sensitive data or hostile instructions escape.*

A security-control-plane for GenAI: every uploaded document, image, webpage or knowledge-base item is treated as **untrusted data** until scanned, classified, sanitized and re-validated after generation.

```
User Content → Ingestion & Parsing → Security Gateway (PII / Secrets / Prompt-Injection) →
Policy Engine → Sanitization / Isolation → Grounded GenAI Transformation → Output DLP →
Safe Content Delivery
```

---

## 1. Why this exists

Generic summarizers send raw documents to the LLM and trust the system prompt. SecureContent AI **detects → sanitizes → isolates → transforms → validates**:

- **Before LLM:** PII / secrets / credentials / internal IDs / malicious instructions / suspicious URLs
- **During LLM:** untrusted-content envelope `<UNTRUSTED_DOCUMENT>`, least-privilege, policy-driven
- **After LLM:** re-scan for PII/secret leakage, policy violations, hallucination checks, then release or repair

Relevant OWASP GenAI categories: prompt injection, sensitive-info disclosure, improper output handling, vector/embedding weaknesses, misinformation, unbounded consumption. See [OWASP GenAI LLM Top 10 2026](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/).

---

## 2. Quick start (lightweight — no heavy deps)

Works on **Fedora KDE Plasma**, **Windows 10/11 (PowerShell/cmd)**, **WSL**, **macOS** with only Node + SQLite.

### Linux (Fedora / Ubuntu)

```bash
git clone <your-fork> SecureContent-AI && cd SecureContent-AI
chmod +x scripts/setup.sh
./scripts/setup.sh          # bun install → prisma db push → generate
bun run dev                 # → http://localhost:3000
# in another terminal, seed the attack-driven demo:
curl -X POST http://localhost:3000/api/v1/seed
```

### Windows (PowerShell)

```powershell
git clone <your-fork> SecureContent-AI; cd SecureContent-AI
.\scripts\setup.ps1         # or scripts\setup.bat for cmd
bun run dev                 # → http://localhost:3000
Invoke-RestMethod -Method Post http://localhost:3000/api/v1/seed
```

### Windows (cmd)

```cmd
scripts\setup.bat
bun run dev
```

### Docker (optional, still lightweight)

```bash
docker compose up --build           # app + caddy on :3000 and :81
docker compose --profile docling up  # + Python Docling worker on :8001
```

No cloud, no Kubernetes, no GPU required. The app runs entirely in-process for the MVP.

---

## 3. Features (per blueprint)

**P0 — MVP (built):**

- [x] Multi-format ingestion (PDF via `pdf-parse`, DOCX via `mammoth`, TXT/MD/CSV/JSON direct, images as placeholder)
- [x] Parser isolation + size/MIME validation + trust-boundary logging
- [x] PII detection (email, phone, Aadhaar, PAN, credit-card, DOB, IP, org IDs, person names)
- [x] Secret detection (AWS keys, GitHub PAT, Slack, JWT, PEM, DB URLs, sk-*, entropy+context)
- [x] Prompt-injection detection (instruction overrides, role manipulation, hidden HTML, tool invocation, conflicting instructions)
- [x] Policy engine (5 built-in profiles) + sanitization (MASK / REDACT / REPLACE / QUARANTINE)
- [x] Transformations (executive summary, FAQ, technical report, slide outline, email draft) via `z-ai-web-dev-sdk`
- [x] Output DLP (re-scan before release, auto-repair)
- [x] Risk score (transparent weighted model) + explainable findings + audit trail
- [x] Dashboard + before/after diff + architecture view

**Optional / next:**

- OCR for scanned PDFs (plugged via Docling worker), PPTX, audio/video, RAG with ACL, multilingual

---

## 4. Project structure

```
securecontent-ai/
├── src/
│   ├── app/api/v1/            # FastAPI-equivalent Next.js routes
│   │   ├── documents/[id]/scan | sanitize | transform | security-report | history
│   │   ├── stats | audit | policies | samples | seed
│   ├── lib/security/          # detectors, risk, sanitize, output-dlp, policies, samples
│   ├── lib/parsers.ts         # PDF/DOCX/TXT/image ingestion + optional Docling proxy
│   ├── lib/ai/transform.ts    # z-ai-web-dev-sdk adapter + grounding check
│   ├── components/secure/     # dashboard, upload, documents, detail, policies, audit, architecture
│   └── types/
├── prisma/schema.prisma       # SQLite (prisma/dev.db) — document, finding, transformation, audit, policy
├── mini-services/docling-worker/  # optional Python worker (FastAPI + Docling/PyMuPDF/pdfminer)
├── datasets/                  # synthetic benchmark (safe_documents/pii/secrets/injections/mixed)
├── tests/                     # unit / integration / security / redteam (vitest)
├── scripts/                   # setup.sh / setup.ps1 / setup.bat / benchmark.ts
├── .github/workflows/         # CI + Security (lint, typecheck, test, build, gitleaks, semgrep, docker)
├── Caddyfile + docker-compose.yml + Dockerfile
└── docs/
```

See `docs/architecture.md`, `docs/threat-model.md`, `docs/api.md`, `docs/demo-script.md`.

---

## 5. Environment

Copy `.env.example` → `.env`:

```
DATABASE_URL="file:./dev.db"          # → prisma/dev.db (gitignored)
# Z_AI_API_KEY="..."                  # optional — without it transform uses a mock offline
# DOCLING_WORKER_URL="http://localhost:8001/parse"  # optional Python worker
```

---

## 6. Document ingestion

| Format | Local parser | Via Docling worker |
|--------|--------------|--------------------|
| TXT/MD/CSV/JSON | direct UTF-8 | — |
| PDF | `pdf-parse` (fallback heuristic) | docling → PyMuPDF → pdfminer |
| DOCX | `mammoth` | docling → python-docx |
| PPTX | placeholder (use Docling) | docling |
| PNG/JPG/WEBP/TIFF | placeholder (keep lightweight) | docling / Tesseract |

Docling worker: `cd mini-services/docling-worker && pip install -r requirements.txt && uvicorn app:app --port 8001` — then set `DOCLING_WORKER_URL`.

---

## 7. Security policies

Five built-ins (see `src/lib/security/policies.ts`):

- **PUBLIC_RELEASE** — strictest, for public distribution
- **INTERNAL_SUMMARY** — internal teams
- **EXECUTIVE_BRIEF** — leadership
- **HR_SAFE** — HR review
- **SECURITY_INCIDENT** — postmortem

Each defines `allow / mask / remove / block` buckets over finding types. Injection spans are always `QUARANTINE` (treated as data, never instructions).

---

## 8. API

```
POST   /api/v1/documents              # upload (multipart) | sampleId | paste JSON
GET    /api/v1/documents              # list
GET    /api/v1/documents/:id
DELETE /api/v1/documents/:id
POST   /api/v1/documents/:id/scan     # re-scan
POST   /api/v1/documents/:id/sanitize # { policy }
POST   /api/v1/documents/:id/transform # { profile, outputType }
GET    /api/v1/documents/:id/security-report
GET    /api/v1/documents/:id/history
GET    /api/v1/stats                  # dashboard
GET    /api/v1/audit
GET    /api/v1/policies
GET    /api/v1/samples
POST   /api/v1/seed                   # ingest all 5 attack samples end-to-end
```

Full details: `docs/api.md`.

---

## 9. Demo script (attack-driven)

1. **Clean memo** → risk 0 → executive summary → PASS
2. **PII roster** → 14 PII, PAN/Aadhaar → PUBLIC_RELEASE sanitize → risk 100→0 → FAQ → leakage 0
3. **Runbook with secrets** → AWS/PAT/JWT/PEM/DB → SECURITY_INCIDENT → redacted → slide outline → leakage 0
4. **Vendor injection** → prompt-injection DETECTED, content ISOLATED → transform quarantines hidden instructions → output DLP PASS
5. **Mixed incident** → PII + secret + injection + IP → risk before→after chart, before/after diff, citations, grounding

See `docs/demo-script.md`.

---

## 10. Testing & benchmark

```bash
bun run test             # vitest — all 53 tests (detectors, sanitize, risk, parser, DLP, injection, redteam)
bun run test:unit
bun run test:security
bun run benchmark        # synthetic 5-doc harness → markdown table for PPT
```

Benchmark dataset: `datasets/` (safe_documents/pii/secrets/injections/mixed) — all synthetic. Never use real credentials/PII.

Expected (on current synthetic set): risk reduction ~40–60 pts on mixed docs, leakage rate 0%, detection recall >90% for the tested patterns (measure yours — do not fabricate PPT numbers).

---

## 11. DevSecOps

- **CI** (`.github/workflows/ci.yml`): lint → typecheck → prisma validate/push → vitest → benchmark → next build
- **Security** (`.github/workflows/security.yml`): `bun audit`, `gitleaks`, `semgrep` (OWASP + JS/TS + secrets), `prisma validate`, Docker smoke build
- Local: `bun run lint`, `bun run typecheck`, `bun run verify`

---

## 12. Trust boundaries & threat model

`T1 Browser→Backend | T2 Backend→Parser | T3 Sanitized→LLM | T4 RAG→LLM | T5 LLM→Output Validator | T6 Backend→Storage | T7 Backend→Model Provider`

Each has auth, validation, logging, rate limiting, error handling. See `docs/threat-model.md` + `docs/architecture.md` for STRIDE table.

---

## 13. FAQ

**Do I need an LLM API key?** No. Without `Z_AI_API_KEY` the transform endpoint uses a deterministic mock so the pipeline still demonstrates sanitization → output DLP → risk reduction offline.

**Is this production DLP?** No — regex + entropy + context heuristics with confidence scores. Do not claim perfect detection. Use as a measured, policy-controlled gateway.

**Windows vs Fedora parity?** Both use Node + SQLite + pure-JS parsers (`pdf-parse`, `mammoth`). No native toolchain required. Docling worker is optional and runs the same on both via `uvicorn`.

**Where is the DB?** `prisma/dev.db` locally (gitignored), `db/custom.db` in Docker (volume `db_data`), or any `DATABASE_URL=file:...` you set.

---

## 14. References

- [OWASP GenAI LLM Top 10 2026](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/)
- [OWASP Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- [OWASP Sensitive Information Disclosure](https://genai.owasp.org/llmrisk/llm022025-sensitive-information-disclosure/)
- [OWASP Improper Output Handling](https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/)
- [OWASP AI Red Teaming Landscape 2026](https://genai.owasp.org/resource/ai-security-solutions-landscape-for-ai-and-agentic-red-teaming-q2-2026/)

For SIH submission rules, use your college's official SIH 2026 materials — they change independently of this README.
