#!/usr/bin/env bash
# Stop and remove the container (the image and the data volume stay).
set -euo pipefail
cd "$(dirname "$0")/../.."

docker compose rm --stop --force app
