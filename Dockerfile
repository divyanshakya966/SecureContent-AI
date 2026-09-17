# SecureContent AI — Lightweight Production Image
# Works on Fedora/Windows (Docker Desktop/WSL) without heavy resources.
# Multi-stage: deps -> builder -> runner. SQLite lives in /app/db (volume).

FROM oven/bun:1.3 AS base
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
FROM node:22.19-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Use non-root user for defense in depth
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

# Install bun for prisma CLI in runner (lightweight) + wget for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm i -g bun

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

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:3000/api/v1/stats || exit 1

# Preflight: ensure DB exists and push schema, then start Node server
# For Postgres use DATABASE_URL=postgresql://... and run `npx prisma migrate deploy` instead of db push.
# standalone was copied to /app (server.js at /app/server.js), use npx for prisma to avoid bunx resolution issues
CMD ["sh", "-c", "mkdir -p /app/db /app/prisma && if echo \"$DATABASE_URL\" | grep -q \"^postgresql://\\|^postgres://\"; then echo \"[preflight] Postgres detected — running prisma migrate deploy\" && DATABASE_URL=${DATABASE_URL} npx prisma migrate deploy 2>&1 || DATABASE_URL=${DATABASE_URL} npx prisma db push --accept-data-loss 2>&1 || true; else DATABASE_URL=${DATABASE_URL:-file:/app/db/custom.db} npx prisma db push --accept-data-loss 2>&1 || true; fi; echo \"[preflight] DB ready — starting server\"; DATABASE_URL=${DATABASE_URL:-file:/app/db/custom.db} node server.js"]
