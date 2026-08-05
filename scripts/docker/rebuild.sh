#!/usr/bin/env bash
# Rebuild from scratch (no cache) and restart — for when a cached layer is suspect.
set -euo pipefail
cd "$(dirname "$0")/../.."

BUILD_SHA=$(git rev-parse HEAD)
TREE_SHA=$(git rev-parse 'HEAD^{tree}')
export BUILD_SHA TREE_SHA

echo "==> rebuilding stockz without cache ($BUILD_SHA)"
docker compose build --no-cache --pull
docker compose up -d --remove-orphans
