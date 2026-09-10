# Threat Model

All input is treated as untrusted until validated.

## Trust Boundaries

| ID | Boundary | Controls |
|---|---|---|
| T1 | Browser → Backend | Input validation, 10 MB limit, MIME allowlist, audit |
| T2 | Backend → Parser | Isolated parsers, 15s Docling timeout |
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
| Information disclosure | PII/secret leak | Pre + post DLP, policy buckets |
| Denial of service | Large/bulk uploads | Size limit, MIME check, timeout |
| Elevation of privilege | Role override | Role-manipulation detection, least privilege |
| Data poisoning | Malicious KB chunk | Trusted-source controls, grounding |

## OWASP GenAI Mapping

- **LLM01 Injection** → envelope, detectors, quarantine, DLP
- **LLM02 Disclosure** → detectors, sanitization, DLP
- **LLM05 Output handling** → untrusted output, DLP gate
- **Misinformation** → grounding check
- **Unbounded consumption** → size limit, timeout

Findings are heuristic. Measure recall/precision via `bun run benchmark`.
