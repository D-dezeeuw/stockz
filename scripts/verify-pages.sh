#!/usr/bin/env bash
#
# Verify the live GitHub Pages site actually works.
#
# STOCKZ is served as raw ES modules straight from the `main` branch root — there is no
# build step in the deploy path, so "it pushed" is not evidence that it loads. This
# checks the three things that break in practice: the page, its entry module, and the
# asset paths staying relative (absolute paths escape the /stockz/ prefix).
#
# Usage: npm run deploy   (after the push) or: bash scripts/verify-pages.sh [url]
set -uo pipefail

URL="${1:-https://d-dezeeuw.github.io/stockz/}"
FAIL=0

check() {
  local label="$1" target="$2" want="$3"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -L "$target")"
  if [ "$code" = "$want" ]; then
    printf '  ok    %-22s %s\n' "$label" "$code"
  else
    printf '  FAIL  %-22s %s (want %s)\n' "$label" "$code" "$want"
    FAIL=1
  fi
}

echo "verifying $URL"
check "index"        "$URL"                 200
check "entry module" "${URL}src/main.js"    200
check "favicon"      "${URL}favicon.svg"    200

html="$(curl -s -L "$URL")"

if grep -qE '(src|href)="/[^/]' <<<"$html"; then
  echo '  FAIL  absolute asset path found - must be relative (./src/main.js)'
  grep -oE '(src|href)="/[^"]*"' <<<"$html" | sed 's/^/        /'
  FAIL=1
else
  echo '  ok    asset paths are relative'
fi

if grep -q 'id="app"' <<<"$html"; then
  echo '  ok    #app mount present'
else
  echo '  FAIL  #app mount missing'
  FAIL=1
fi

[ "$FAIL" -eq 0 ] && echo "live: $URL" || echo "deploy verification FAILED" >&2
exit "$FAIL"
