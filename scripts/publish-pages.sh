#!/usr/bin/env bash
#
# Publish dist/ to the gh-pages branch — deterministically.
#
# Why not `gh-pages -d dist` alone: that package's remove step leaves repository
# dotfiles (.claude/, .env.example, .gitignore, src/**/.gitkeep) behind in the branch,
# so source files end up on the public site. This builds a single orphan commit whose
# tree is EXACTLY dist/, then force-pushes it. The gh-pages branch is generated output;
# its history is disposable by design (.claude/context/deployment.md).
#
# Usage: npm run deploy   (predeploy runs the production build first)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"
STAGE="$ROOT/.pages-publish"
BRANCH="gh-pages"

[ -d "$DIST" ] || { echo "no dist/ — run 'npm run build' first" >&2; exit 1; }
[ -f "$DIST/index.html" ] || { echo "dist/index.html missing — build looks wrong" >&2; exit 1; }

REMOTE="$(git -C "$ROOT" remote get-url origin)"
SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
NAME="$(git -C "$ROOT" config user.name)"
EMAIL="$(git -C "$ROOT" config user.email)"

rm -rf "$STAGE"
cp -R "$DIST" "$STAGE"

# GitHub Pages serves the tree as-is; .nojekyll stops Jekyll from dropping _-prefixed
# asset paths.
touch "$STAGE/.nojekyll"

git -C "$STAGE" init -q -b "$BRANCH"
git -C "$STAGE" config user.name "$NAME"
git -C "$STAGE" config user.email "$EMAIL"
git -C "$STAGE" add -A
git -C "$STAGE" commit -q -m "deploy: build of $SHA"
git -C "$STAGE" push -q --force "$REMOTE" "$BRANCH:$BRANCH"

echo "published $(git -C "$STAGE" ls-files | wc -l | tr -d ' ') files to $BRANCH (build of $SHA)"
rm -rf "$STAGE"
