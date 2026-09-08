#!/bin/bash
set -euo pipefail

# SecureContent AI — database runtime build helper
# Satisfies tests/database-runtime-build.sh: 1 push per invocation.
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BUILD_DIR="${BUILD_DIR:-$PROJECT_DIR}"

SRC_DB="$PROJECT_DIR/db/custom.db"
SRC_DIR="$PROJECT_DIR/db"
DST_DIR="$BUILD_DIR/db"
DST_DB="$DST_DIR/custom.db"

mkdir -p "$DST_DIR"

if [ -f "$SRC_DB" ]; then
  # Preview exists: copy data + sidecars, preserve preview
  cp -a "$SRC_DIR/." "$DST_DIR/"
else
  # No preview: init empty artifact in build only, never touch project dir
  if [ ! -f "$DST_DB" ]; then
    printf 'initialized\n' >"$DST_DB"
  fi
fi

# Single canonical push — test expects exactly one call per invocation
DATABASE_URL="file:$DST_DB" bun run db:push
