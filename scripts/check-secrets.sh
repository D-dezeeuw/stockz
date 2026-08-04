#!/usr/bin/env bash
# Scan every ref, and the build output, for credential-shaped strings.
#
# The version this replaces ran `git grep` against the working tree only, which is exactly
# why it never saw the leak of 2026-08-03: the exposed bundle lived on `gh-pages`, and a
# branch that is never checked out is one that kind of check silently ignores.
#
# Reports commit:file rather than the matching line — a minified bundle is one line, and
# printing it buries the finding in a screenful of noise. Test fixtures are excluded: they
# hold deliberately fake values, and a scanner that cries wolf is one people stop running.
set -uo pipefail

status=0
refs=$(git rev-list --all)

report() {
  local label="$1" pattern="$2"
  local hits
  hits=$(git grep -lIE "$pattern" $refs -- '*.js' '*.html' '*.json' \
    ':!*.test.js' ':!package-lock.json' 2>/dev/null | sort -u)

  if [ -n "$hits" ]; then
    echo "!! $label"
    echo "$hits" | sed 's/^/     /'
    status=1
  fi
}

# A credential inlined into shipped JS. `key`/`secret`/`passphrase` followed by a quoted
# value of real length — short values are fixtures, not keys.
report "inlined env credential in a committed artifact" \
  "STOCKZ_[A-Z_]*(KEY|SECRET|PASSPHRASE)[A-Z_]*[:=][[:space:]]*[\`'\"][^\`'\"]{16,}"

report "recognised secret format" \
  "(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|xox[baprs]-|ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9-]{20,})"

# The build output is what actually ships, so it is checked directly rather than inferred
# from the config being correct.
if [ -d dist ]; then
  if grep -rIElE "STOCKZ_[A-Z_]*(KEY|SECRET|PASSPHRASE)[A-Z_]*:[[:space:]]*[\`'\"][^\`'\"]{16,}" dist 2>/dev/null; then
    echo "!! the build inlined a credential — do NOT publish this"
    status=1
  fi
fi

if [ "$status" -eq 0 ]; then
  echo "clean: no credential-shaped strings in any ref or in dist/"
else
  echo
  echo "Rotate the exposed values first. Removing the commit does not un-leak them."
fi
exit "$status"
