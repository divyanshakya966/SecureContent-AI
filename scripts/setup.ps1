# SecureContent AI — Local setup (Windows PowerShell)
# Lightweight: only Node + SQLite. Works on Windows 10/11 with Node 18+ / Bun.
$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectDir

Write-Host "== SecureContent AI — Windows setup ==" -ForegroundColor Green

# 1. Check bun / node
try {
  $bunVer = bun --version
  Write-Host "bun $bunVer  node $(node --version)"
} catch {
  Write-Host "Installing bun via npm..."
  npm i -g bun
}

# 2. Install deps
Write-Host ">> bun install"
bun install

# 3. Env
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example"
}

# 4. DB
Write-Host ">> prisma db push"
$env:DATABASE_URL = "file:./dev.db"
bunx prisma db push --accept-data-loss
bunx prisma generate

# 5. Optional build
if ($args -contains "--build") {
  Write-Host ">> bun run build"
  bun run build
}

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "  Start dev server:  bun run dev"
Write-Host "  Open:              http://localhost:3000"
Write-Host "  Seed demo data:    Invoke-RestMethod -Method Post http://localhost:3000/api/v1/seed"
Write-Host ""
Write-Host "  Optional Docker:   docker compose up --build"
Write-Host "  Optional Docling:  cd mini-services/docling-worker; pip install -r requirements.txt; uvicorn app:app --port 8001"
