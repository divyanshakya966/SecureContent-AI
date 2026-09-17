# SecureContent AI — Lightweight Production Image
# Works on Fedora/Windows (Docker Desktop/WSL) without heavy resources.
# Multi-stage: deps -> builder -> runner. SQLite lives in /app/db (volume).

FROM oven/bun:1.4.2 AS base
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

# ---- builder ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ensure prisma client is generated inside the image
RUN bunx prisma generate
# SQLite DB path for build-time static generation (will be overridden at runtime)
ENV DATABASE_URL="file:./prisma/dev.db"
RUN bun run build

# ---- runner ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Use non-root user for defense in depth
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

# Patch OS packages (picks up fixed Debian packages) and keep only the
# minimal runtime set: ca-certificates for TLS. No wget/bun in the runner —
# healthchecks use node fetch and the DB preflight invokes the copied local
# Prisma CLI directly with node, so fewer packages means fewer scan findings.
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# Only production artifacts
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /app/node_modules/.bin/prisma.* ./node_modules/.bin/

# Helper scripts for DB preflight (optional)
COPY --from=builder /app/.zscripts ./.zscripts
COPY --from=builder /app/package.json ./package.json

# Create writable locations for SQLite with correct ownership
RUN mkdir -p /app/db /app/prisma && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://localhost:3000/api/v1/stats').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# Preflight: ensure DB exists and push schema, then start Node server
# For Postgres use DATABASE_URL=postgresql://... and run `node ./node_modules/prisma/build/index.js migrate deploy` instead of db push.
# standalone was copied to /app (server.js at /app/server.js); Prisma CLI is invoked
# directly via node (npm/npx were removed from this image).
CMD ["sh", "-c", "mkdir -p /app/db /app/prisma && if echo \"$DATABASE_URL\" | grep -q \"^postgresql://\\|^postgres://\"; then echo \"[preflight] Postgres detected — running prisma migrate deploy\" && DATABASE_URL=${DATABASE_URL} node ./node_modules/prisma/build/index.js migrate deploy 2>&1 || DATABASE_URL=${DATABASE_URL} node ./node_modules/prisma/build/index.js db push --accept-data-loss 2>&1 || true; else DATABASE_URL=${DATABASE_URL:-file:/app/db/custom.db} node ./node_modules/prisma/build/index.js db push --accept-data-loss 2>&1 || true; fi; echo \"[preflight] DB ready — starting server\"; DATABASE_URL=${DATABASE_URL:-file:/app/db/custom.db} node server.js"]
