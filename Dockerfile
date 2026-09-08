# SecureContent AI — Lightweight Production Image
# Works on Fedora/Windows (Docker Desktop/WSL) without heavy resources.
# Multi-stage: deps -> builder -> runner. SQLite lives in /app/db (volume).

FROM oven/bun:1 AS base
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY package.json bun.lock ./
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
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Only production artifacts
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Helper scripts for DB preflight (optional)
COPY --from=builder /app/.zscripts ./.zscripts
COPY --from=builder /app/package.json ./package.json

# Create writable locations for SQLite
RUN mkdir -p /app/db /app/prisma && chown -R bun:bun /app/db /app/prisma 2>/dev/null || true

EXPOSE 3000

# Preflight: ensure DB exists and push schema, then start
CMD ["sh", "-c", "mkdir -p /app/db /app/prisma && DATABASE_URL=${DATABASE_URL:-file:/app/db/custom.db} bunx prisma db push --accept-data-loss 2>/dev/null || true; DATABASE_URL=${DATABASE_URL:-file:/app/db/custom.db} bun --bun run .next/standalone/server.js"]
