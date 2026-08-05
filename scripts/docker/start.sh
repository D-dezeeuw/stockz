#!/usr/bin/env bash
# Start (or restart into) the current image.
set -euo pipefail
cd "$(dirname "$0")/../.."

BUILD_SHA=$(git rev-parse HEAD)
TREE_SHA=$(git rev-parse 'HEAD^{tree}')
export BUILD_SHA TREE_SHA

docker compose up -d --remove-orphans
docker compose ps
