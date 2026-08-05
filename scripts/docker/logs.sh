#!/usr/bin/env bash
# Follow the container's logs.
set -euo pipefail
cd "$(dirname "$0")/../.."

docker compose logs -f --tail 100 app
