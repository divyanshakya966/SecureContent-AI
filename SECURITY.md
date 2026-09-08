# Security Policy

## Reporting a vulnerability

If you believe you have found a security issue in SecureContent AI, please do **not** open a public GitHub issue. Instead:

1. Email the project maintainer privately (use your SIH team channel) with:
   - a description of the issue
   - steps to reproduce or a proof-of-concept
   - the commit or file involved
2. You will receive a response within **3 business days**.
3. If the issue is confirmed, a fix will be prioritized and a coordinated disclosure date agreed.

## Scope

This repository is a **prototype** for SIH26154. It demonstrates security controls but is **not** production-hardened.

- Do **not** upload real credentials, government IDs, or customer data to a demo instance.
- All benchmark documents are synthetic — the detectors are heuristic (regex + entropy + context) and do not guarantee complete PII/secret coverage.
- The LLM adapter treats document content as **untrusted data** inside an explicit `<UNTRUSTED_DOCUMENT>` envelope and never merges it with system instructions.

## Security controls in this prototype

- **Zero-trust ingestion:** every file is validated for size/MIME, parsed in isolation, and scanned before reaching the model.
- **Detectors:** multi-signal PII / secret / prompt-injection scans with confidence scores (`src/lib/security/detectors.ts`).
- **Policy engine:** `allow / mask / remove / block` buckets per transformation profile (`src/lib/security/policies.ts`).
- **Sanitization:** mask/redact/replace/quarantine; injection spans are always quarantined (`src/lib/security/sanitize.ts`).
- **Output DLP:** deterministic re-scan before release (`src/lib/security/output-dlp.ts`).
- **Trust boundaries** T1–T7 each with validation, auth, logging, and rate-limit notes (see `docs/threat-model.md`).

## Supply-chain & DevSecOps

- `bun audit`, `gitleaks`, `semgrep` (OWASP + JS/TS + secrets) in `.github/workflows/security.yml`.
- `eslint` + `tsc --noEmit` + `vitest` in `.github/workflows/ci.yml`.
- Dependencies are pinned via `bun.lock`; review `bun audit` output before merging.

## Hardening checklist before production use

- [ ] Replace the demo `z-ai-web-dev-sdk` mock with an authenticated, tenant-scoped LLM provider and rotate keys via a secrets manager.
- [ ] Put the Docling worker (if used) behind auth and a sandbox; do not expose `DOCLING_WORKER_URL` publicly.
- [ ] Add persistence-layer encryption at rest (SQLite SQLCipher or Postgres + pgcrypto) and TLS everywhere.
- [ ] Add RBAC, tenant isolation, and ACL-aware RAG (not just shared SQLite).
- [ ] Add WAF, rate limiting, and object-storage scanning for malware.
- [ ] Never log `rawContent` or full findings verbatim — audit logs should store hashes/summaries.
- [ ] Run regular dependency scans (`pip-audit`, `npm audit`, `trivy`).

## Supported versions

| Version | Supported |
|---------|-----------|
| `main` (prototype) | best-effort patches only |

For the SIH internal hackathon, the `main` branch is the supported line.
