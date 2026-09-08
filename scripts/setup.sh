#!/usr/bin/env bash
# SecureContent AI — Local setup (Fedora KDE / Linux)
# Lightweight: only Node + SQLite. No heavy deps unless you opt into the Docling worker.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "== SecureContent AI — Linux setup =="

# 1. Node/Bun check
if ! command -v bun >/dev/null 2>&1; then
  echo "Installing bun (https://bun.sh) ..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi
echo "bun $(bun --version)  node $(node --version)"

# 2. Install deps
echo ">> bun install"
bun install

# 3. Env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example (DATABASE_URL=file:./dev.db -> prisma/dev.db)"
fi

# 4. DB
echo ">> prisma db push"
DATABASE_URL="file:./dev.db" bunx prisma db push --accept-data-loss
DATABASE_URL="file:./dev.db" bunx prisma generate

# 5. Optional: build check
if [ "${1:-}" = "--build" ]; then
  echo ">> bun run build"
  bun run build
fi

echo ""
echo "✓ Setup complete."
echo "  Start dev server:  bun run dev"
echo "  Open:              http://localhost:3000"
echo "  Seed demo data:    curl -X POST http://localhost:3000/api/v1/seed"
echo ""
echo "  Optional Docker:   docker compose up --build"
echo "  Optional Docling:  cd mini-services/docling-worker && pip install -r requirements.txt && uvicorn app:app --port 8001"
