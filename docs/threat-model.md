# Threat Model

All input is treated as untrusted until validated.

## Trust Boundaries

| ID | Boundary | Controls |
|---|---|---|
| T0 | Internet → App (access) | Optional bearer auth (`API_AUTH_TOKEN`, `REQUIRE_AUTH_FOR_READS`), seed gating (`ALLOW_SEED`), per-IP + global rate limits, security headers, Caddy TLS/reverse-proxy |
| T1 | Browser → Backend | Input validation (Zod, incl. multipart bounds), pre-read size caps (10 MB docs / 25 MB media), MIME allowlist, audit |
| T2 | Backend → Parser | Isolated parsers, 15s Docling timeout, SSRF allowlist (`isAllowedDoclingUrl`: loopback/RFC1918/service-names only; metadata + public IPs denied) |
| T3 | Sanitized → LLM | Sanitized copy only, `<UNTRUSTED_DOCUMENT>` envelope, no tool access |
| T4 | RAG → LLM | Reserved (ACL-filtered retrieval when enabled) |
| T5 | LLM → Validator | Output treated as untrusted; DLP + grounding |
| T6 | Backend → Storage | ORM, file permission 600 |
| T7 | Backend → Provider | Env-based API key, raw secrets never sent |

## STRIDE

| Threat | Impact | Defense |
|---|---|---|
| Spoofing | Tenant impersonation | Tenant ID, audit log |
| Tampering | Hidden instructions | Injection detection, quarantine, isolation |
| Repudiation | Denied action | Audit log per decision |
| Information disclosure | PII/secret leak | Pre + post DLP, policy buckets, allow-list invariants (secrets/injections never allow-listed) |
| Denial of service | Large/bulk uploads | Pre-read size limits, MIME check, timeout, zip-bomb caps, rate-limiter memory cap |
| Elevation of privilege | Role override | Role-manipulation detection, least privilege |
| Policy tampering | Weakened custom policy / reviewer override | Built-ins immutable (403), bucket validation, injection-quarantine and no-secret-passthrough invariants enforced in API + engine |
| Data poisoning | Malicious KB chunk | Trusted-source controls, grounding |

## OWASP GenAI Mapping

- **LLM01 Injection** → envelope, detectors, quarantine, DLP
- **LLM02 Disclosure** → detectors, sanitization, DLP
- **LLM05 Output handling** → untrusted output, DLP gate
- **Misinformation** → grounding check
- **Unbounded consumption** → pre-read size limits, timeout, zip-bomb caps
- **Framework templates** → `OWASP_GENAI_STRICT` policy maps LLM01/LLM02/LLM06 handling onto buckets (see `src/lib/security/policy-templates.ts`)

Findings are heuristic. Measure recall/precision via `bun run benchmark`.
