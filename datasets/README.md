# SecureContent AI — Synthetic Datasets

All files here are **synthetic** — no real PII, credentials, or personal data.
Generated for benchmarking the security gateway (detect → sanitize → validate) and for the attack-driven demo.

## Layout

- `safe_documents/` — clean, low-risk content (strategy memos, policy docs)
- `pii/` — confidential rosters with fake names, emails, phones, Aadhaar, PAN, DOB, IPs
- `secrets/` — runbooks leaking fake AWS keys, PATs, JWTs, private keys, DB urls
- `injections/` — adversarial docs with indirect prompt injection, role manipulation, hidden HTML comments
- `mixed/` — hardest case: useful prose + PII + secrets + buried injection

Canonical samples: see `src/lib/security/samples.ts` (also mirrored as `.txt` files here).

## Benchmark methodology (per blueprint §26)

```
Dataset:  200 synthetic docs (extend from the 5 canonical samples)
Composition: 50 clean / 50 PII-heavy / 40 secret-heavy / 40 injection-heavy / 20 mixed

For each document:
  1. run scanContent() → findings + risk
  2. compare against ground-truth labels (inlined in samples.ts comments)
  3. compute precision/recall per detector
  4. sanitize with the target policy
  5. run output DLP on the sanitized text
  6. measure leakage=0, policy compliance, risk_before → risk_after
```

The harness in `scripts/benchmark.ts` (run `bun run benchmark`) implements this and prints
a markdown table suitable for your PPT.

> Never use real credentials or personal data in the benchmark.
