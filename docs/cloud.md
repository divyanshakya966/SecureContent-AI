# Cloud Hosting Runbook

Applies to any VM / VPS / EC2 / Azure VM / Render / Fly.io / Vercel deployment.

## 1. Secrets (never commit, never bake into images)

| Secret | Where | Notes |
|---|---|---|
| `GEMINI_API_KEY` / `GROQ_API_KEY` | Host env / cloud secrets manager | Server-only; rotate on exposure; never `NEXT_PUBLIC_*` |
| `API_AUTH_TOKEN` | Host env (≥16 chars, `openssl rand -hex 32`) | Required for shared instances; distribute to operators out-of-band |
| `DATABASE_URL` | Host env | Postgres (`postgresql://…`) for cloud; SQLite only for single-node Docker |

`.env` is gitignored and excluded from the Docker build (`.dockerignore`). CI fails on secret
values in build output and gitleaks scans every push.

## 2. Network & TLS

- Never expose `:3000` publicly. Put Caddy (or cloud LB) in front; terminate TLS there.
  Replace `:81` in `Caddyfile` with your domain for automatic Let's Encrypt certs.
- Security headers ship in three layers (Next.js + `proxy.ts` + Caddy): CSP, HSTS,
  `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP.
- Caddy sets `X-Real-IP`, which the app prefers for rate limiting; a global per-route
  backstop also applies so header spoofing direct-to-app cannot bypass limits.
- Docling worker (if used) stays on the internal network — no published port in compose.

## 3. Container posture (`docker-compose.yml`)

- Pinned images, non-root `appuser`, read-only root FS (`/tmp` via `noexec,nosuid` tmpfs,
  SQLite via `db_data` volume), `no-new-privileges`, dropped capabilities, CPU/RAM limits.
- Healthchecks on app + proxy; `restart: unless-stopped`.
- Scan on every push: Trivy (container + FS, fails on CRITICAL) with SARIF upload.

## 4. Data

- SQLite persists in the `db_data` volume (`/app/db/custom.db`). Back it up on a schedule;
  test restores. For multi-node scale, move to Postgres (`prisma migrate deploy` runs
  automatically when `DATABASE_URL` is `postgresql://…`) and externalize rate limiting
  to Redis (see `src/lib/validation/rateLimit.ts`).
- `rawContent` stores source text for re-scanning — treat DB files/dumps as sensitive,
  restrict file permissions, encrypt backups, and define a retention/purge policy.

## 5. Updates (frequent-push ready)

```bash
git pull --ff-only
docker compose up --build -d
docker compose logs -f app
curl http://<host>:3000/api/v1/stats   # expect stats.totalDocuments
```

CI (`ci.yml`: lint → typecheck → tests → build) and Security (`security.yml`: audit-critical
gate, gitleaks, Semgrep, Trivy, `prisma validate`) run on every push/PR plus weekly.
`bun run verify` reproduces the full gate locally. Dependabot-style upgrades: bump,
`bun install`, `bun audit`, `bun run verify`, ship.
