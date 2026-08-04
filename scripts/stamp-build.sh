#!/usr/bin/env bash
#
# Stamp the current commit into src/app/build.js.
#
# The site is served as raw ES modules straight from `main` — there is no build step to
# inject anything at deploy time, so the deploy stamps the file and commits it. That is one
# extra commit per deploy, and it buys the only thing that answers "am I looking at the
# version I just pushed": a number in the footer that changes every deploy, rather than one
# that only moves when a phase closes.
#
# Idempotent: re-running with nothing to change leaves the tree clean and makes no commit.
#
# Usage: bash scripts/stamp-build.sh
set -euo pipefail

TARGET="src/app/build.js"
SHA="$(git rev-parse --short HEAD)"
AT="$(date -u +%Y-%m-%dT%H:%M)"

# Stamped from the commit that is about to be pushed, so the footer names the code being
# served rather than the stamping commit that follows it. Close enough to be useful and
# honest about which change is live.
sed -i.bak \
  -e "s|^export const BUILD_SHA = .*|export const BUILD_SHA = '${SHA}'|" \
  -e "s|^export const BUILD_AT = .*|export const BUILD_AT = '${AT}'|" \
  "$TARGET"
rm -f "${TARGET}.bak"

if git diff --quiet -- "$TARGET"; then
  echo "build stamp unchanged (${SHA})"
  exit 0
fi

git add "$TARGET"
git commit -q -m "chore: stamp build ${SHA}"
echo "stamped build ${SHA} @ ${AT}Z"
