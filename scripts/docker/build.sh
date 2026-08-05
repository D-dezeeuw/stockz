#!/usr/bin/env bash
# Build the STOCKZ image, stamping the exact code it contains.
set -euo pipefail
cd "$(dirname "$0")/../.."

BUILD_SHA=$(git rev-parse HEAD)
TREE_SHA=$(git rev-parse 'HEAD^{tree}')
export BUILD_SHA TREE_SHA

echo "==> building stockz ($BUILD_SHA, tree $TREE_SHA)"
docker compose build --pull
