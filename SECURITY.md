# Security Policy

## Reporting a vulnerability

If you believe you have found a security issue in SecureContent AI, please do **not** open a public GitHub issue. Instead:

1. Contact the project maintainers privately with:
   - a description of the issue
   - steps to reproduce or a proof-of-concept
   - the commit or file involved
2. You will receive a response within **3 business days**.
3. If the issue is confirmed, a fix will be prioritized and a coordinated disclosure date agreed.

## Scope

This repository ships with layered security controls and CI enforcement (gitleaks, Semgrep,
dependency audit, Trivy, secret-in-build checks), but it remains a **community-built product**:
review the hardening checklist before exposing it beyond a trusted operator group.

- Do **not** upload real credentials, government IDs, or customer data to a shared or public instance.
- All benchmark documents are synthetic — the detectors are heuristic (regex + entropy + context) and do not guarantee complete PII/secret coverage.
- The LLM adapter treats document content as **untrusted data** inside an explicit `<UNTRUSTED_DOCUMENT>` envelope and never merges it with system instructions.

## Security controls in this product

- **Zero-trust ingestion:** every file is validated for size/MIME, parsed in isolation, and scanned before reaching the model.
- **Detectors:** multi-signal PII / financial / secret / prompt-injection scans with confidence scores and per-document scan options (`src/lib/security/detectors.ts`). Output DLP always scans everything.
- **Policy engine:** `allow / mask / remove / block` buckets over 5 immutable built-in profiles plus user-created custom policies and framework templates (`src/lib/security/policies.ts`, `policy-templates.ts`). Credentials and injections can never be allow-listed; injections are always quarantined.
- **Sanitization:** mask/redact/replace/quarantine plus reviewer per-finding overrides that cannot weaken the invariants (`src/lib/security/sanitize.ts`).
- **Output DLP:** deterministic re-scan before release (`src/lib/security/output-dlp.ts`) plus HTML/URL sanitization (`outputSanitizer.ts`, incl. `javascript:`/`data:`/event-handler stripping).
- **API auth (opt-in):** set `API_AUTH_TOKEN` (≥16 chars) and every `POST/PUT/DELETE` under `/api/v1/*` requires `Authorization: Bearer`. Browser token entry lives in the topbar (localStorage only). Set `REQUIRE_AUTH_FOR_READS=true` to lock `GET`s too.
- **Seed gating:** `/api/v1/seed` runs only in dev/test unless `ALLOW_SEED=true` (and honors API auth).
- **SSRF guard:** `DOCLING_WORKER_URL` is restricted to loopback / RFC1918 / compose service names; metadata (`169.254.169.254`), public IPs, and credentialed URLs are rejected (`isAllowedDoclingUrl`).
- **Abuse guards:** per-IP + global rate limits on expensive routes (bulk/pipeline/seed), strict Zod validation on every trust boundary, security headers (CSP/HSTS/X-Frame-Options/COOP/CORP) in `next.config.ts` + `proxy.ts` + Caddy.
- **Supply chain:** pinned lockfile, `overrides` for patched transitives, `bun audit` critical-gate + Trivy container scan in CI.
- **Trust boundaries** T0–T7 each with validation, auth, logging, and rate-limit notes (see `docs/threat-model.md`).

## Supply-chain & DevSecOps

- `bun audit`, `gitleaks`, `semgrep` (OWASP + JS/TS + secrets) in `.github/workflows/security.yml`.
- `eslint` + `tsc --noEmit` + `vitest` in `.github/workflows/ci.yml`.
- Dependencies are pinned via `bun.lock`; review `bun audit` output before merging.

## Hardening checklist before production use

- [x] LLM provider is now server-only Gemini (primary, `GEMINI_API_KEY`) + Groq backup (`GROQ_API_KEY`, `openai/gpt-oss-120b`) via `src/lib/ai/transform.ts` (runtime server-only guard; keys never leave the server). Rotate keys via env/secrets manager; never expose via `NEXT_PUBLIC_*`.
- [x] Next.js ≥16.3.5 (fixes GHSA-p293-qw3h-jr36 / GHSA-2xp9-vwfh-vxw4 RCEs + DoS/SSRF advisories), sharp ≥0.35.4, postcss/prismjs overrides; `bun audit` critical-gate + Trivy in CI.
- [x] Optional bearer auth (`API_AUTH_TOKEN`), seed gating (`ALLOW_SEED`), Docling SSRF allowlist, per-IP + global rate limits, hardened compose (read-only FS, no-new-privileges, dropped caps, resource limits, pinned images).
- [ ] Put the Docling worker (if used) behind auth and a sandbox; do not expose `DOCLING_WORKER_URL` publicly.
- [ ] Add persistence-layer encryption at rest (SQLite SQLCipher or Postgres + pgcrypto) and TLS everywhere.
- [ ] Add RBAC, tenant isolation, and ACL-aware RAG (not just shared SQLite).
- [ ] Add WAF, rate limiting, and object-storage scanning for malware.
- [ ] Never log `rawContent` or full findings verbatim — audit logs should store hashes/summaries.
- [ ] Run regular dependency scans (`pip-audit`, `npm audit`, `trivy`).
- [ ] See `docs/cloud.md` for the cloud-hosting runbook (TLS, secrets, Postgres, backups, updates).

## Supported versions

| Version | Supported |
|---------|-----------|
| `main` | best-effort patches only |
