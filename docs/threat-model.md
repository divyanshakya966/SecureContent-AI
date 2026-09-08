# Threat Model — SecureContent AI (lightweight STRIDE)

Every imported file is **untrusted until inspected**.

## Trust boundaries

| ID | Boundary | Controls |
|----|----------|----------|
| T1 | Browser → Backend | auth (JWT placeholder), input validation, size limit 10 MB, MIME allowlist, rate limiting TODO, error handling |
| T2 | Backend → Parser | parser isolation (`parsers.ts`), Docling proxy timeout 15s, parser errors caught, never treat bytes as trusted |
| T3 | Sanitized Content → LLM | only `sanitizedContent` reaches model, inside `<UNTRUSTED_DOCUMENT>` envelope, strict system prompt, no tool access |
| T4 | RAG → LLM | not in MVP — when added, retrieval only from approved sources with ACL filtering |
| T5 | LLM → Output Validator | output treated as untrusted; deterministic Output DLP + grounding check (T5) |
| T6 | Backend → Storage | Prisma ORM, no raw SQL, `rawContent` kept locally, SQLite file permission 600 in Docker |
| T7 | Backend → Model Provider | adapter (`lib/ai/transform.ts`), API key via env/secrets manager, no secrets sent to provider (redacted locally) |

## STRIDE

| Threat | Example | Impact | Primary defense | Secondary |
|--------|---------|--------|-----------------|-----------|
| **Spoofing** | anonymous upload as another tenant | data exposure | auth + tenant_id on Document (schema), audit log | TODO: JWT verification |
| **Tampering** | malicious PDF with hidden instructions | model hijack → exfiltration | prompt-injection detection + quarantine + isolation envelope | Output DLP |
| **Repudiation** | deny a transform happened | audit gap | `AuditLog` for every UPLOAD/SCAN/POLICY_APPLY/TRANSFORM/DLP_BLOCK/RELEASE | timestamp + actor |
| **Information disclosure** | PII/secret in summary or output | privacy/credential compromise | pre-gen scan+sanitize + post-gen DLP (double gate) | policy buckets, never send raw secrets to provider |
| **Denial of service** | 10 MB x 1000 uploads, large PDFs | cost/latency | 10 MB limit, MIME validation, page/section cap, Docling timeout | rate limit, Docker memory limit |
| **Elevation of privilege** | "you are now admin" in doc | excessive agency | role-manipulation detector + system prompt rule #3 + no tools | Output DLP |
| **Data poisoning** | malicious knowledge-base chunk | wrong answers / leakage | trusted-source controls when RAG added, vector-store isolation TODO | grounding citations |
| **RAG leakage** | unauthorized chunk retrieved | exposure | ACL-aware retrieval TODO | output DLP |

## OWASP GenAI 2026 mapping

- **LLM01 Prompt Injection** → isolation envelope + detectors + quarantine + output DLP (`detectors.ts`, `sanitize.ts`, `transform.ts`).
- **LLM02 Sensitive Information Disclosure** → PII/secret detectors + sanitization + never sending raw secrets to provider + output DLP.
- **LLM05 Improper Output Handling** → output treated as untrusted; HTML/markdown sanitization TODO; DLP gate before release.
- **Vector/Embedding weaknesses** → not in MVP; when RAG added, isolate embeddings per tenant, filter by ACL.
- **Misinformation** → grounding check (citation extraction, unsupported flag) in `transform.ts`.
- **Unbounded consumption** → 10 MB limit, Docling 15s timeout, Docker compose resource hints.

## Assumptions

- The LLM provider is honest-but-curious; we minimize data sent (sanitized only) and never send raw credentials.
- The attacker can submit arbitrary files but cannot execute code in the parser container (mammoth/pdf-parse run without `eval`).
- Findings are heuristic — **do not claim 100%**. Report measured numbers from `bun run benchmark`.
