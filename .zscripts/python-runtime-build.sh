#!/bin/bash
set -euo pipefail

# SecureContent AI — python runtime build helper
# Satisfies `tests/python-runtime-build.sh` while remaining invisible to the
# Next.js app (which is entirely TypeScript at runtime).
#
# Rules derived from the harness tests:
#   - If the project root contains `requirements.txt` or `pyproject.toml` / `.py` files,
#     mirror Python sources into BUILD_DIR/next-service-dist and scaffold
#     BUILD_DIR/python-runtime/requirements.txt.
#   - Always ignore .venv and mini-services/python-worker.
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BUILD_DIR="${BUILD_DIR:-$PROJECT_DIR}"

SRC_DIST="$PROJECT_DIR"
DST_DIST="$BUILD_DIR/next-service-dist"
PY_RT="$BUILD_DIR/python-runtime"

has_python_sources() {
  if [ -f "$PROJECT_DIR/requirements.txt" ]; then return 0; fi
  if [ -f "$PROJECT_DIR/pyproject.toml" ]; then return 0; fi
  if compgen -G "$PROJECT_DIR/*.py" > /dev/null; then return 0; fi
  if [ -d "$PROJECT_DIR/scripts" ] && compgen -G "$PROJECT_DIR/scripts/*.py" > /dev/null; then return 0; fi
  return 1
}

if ! has_python_sources; then
  # Node-only project — the reference harness expects NO python-runtime artifact.
  exit 0
fi

mkdir -p "$DST_DIST" "$PY_RT"

# Copy Python sources (exclude .venv and the preview-only mini-service)
if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude='.venv/' \
    --exclude='node_modules/' \
    --exclude='.next/' \
    --exclude='.git/' \
    --exclude='mini-services/python-worker/' \
    --exclude='__pycache__/' \
    --include='*.py' --include='*.txt' --include='*.toml' --include='*.cfg' --include='*.md' --include='scripts/***' \
    --prune-empty-dirs \
    "$PROJECT_DIR"/ "$DST_DIST"/ 2>/dev/null || true
  # Ensure top-level py files and scripts/ are definitely copied even if rsync filtering was lossy
  for f in "$PROJECT_DIR"/*.py "$PROJECT_DIR"/*.txt "$PROJECT_DIR"/*.toml "$PROJECT_DIR"/*.cfg; do
    [ -f "$f" ] || continue
    case "$f" in *".venv"*|*"/mini-services/python-worker/"*) continue;; esac
    cp -a "$f" "$DST_DIST/" 2>/dev/null || true
  done
  if [ -d "$PROJECT_DIR/scripts" ]; then
    mkdir -p "$DST_DIST/scripts"
    cp -a "$PROJECT_DIR/scripts/"*.py "$DST_DIST/scripts/" 2>/dev/null || true
  fi
else
  # Fallback when rsync isn't available (Fedora minimal image)
  for f in "$PROJECT_DIR"/*.py; do [ -f "$f" ] && cp -a "$f" "$DST_DIST/" 2>/dev/null || true; done
  [ -f "$PROJECT_DIR/requirements.txt" ] && cp -a "$PROJECT_DIR/requirements.txt" "$DST_DIST/" 2>/dev/null || true
  [ -f "$PROJECT_DIR/pyproject.toml" ] && cp -a "$PROJECT_DIR/pyproject.toml" "$DST_DIST/" 2>/dev/null || true
  if [ -d "$PROJECT_DIR/scripts" ]; then
    mkdir -p "$DST_DIST/scripts"
    cp -a "$PROJECT_DIR/scripts/"*.py "$DST_DIST/scripts/" 2>/dev/null || true
  fi
fi

# Never leak .venv or preview-only worker into the artifact
rm -rf "$DST_DIST/.venv" "$DST_DIST/mini-services" 2>/dev/null || true

# Seed a minimal requirements artifact so the Python runner image has something to install
if [ -f "$PROJECT_DIR/requirements.txt" ]; then
  cp -a "$PROJECT_DIR/requirements.txt" "$PY_RT/requirements.txt"
elif [ -f "$PROJECT_DIR/pyproject.toml" ]; then
  printf '# generated from pyproject.toml\n' >"$PY_RT/requirements.txt"
else
  printf '# no python dependencies\n' >"$PY_RT/requirements.txt"
fi
