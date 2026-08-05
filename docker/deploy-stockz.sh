#!/usr/bin/env bash
# Deploy STOCKZ — kill-and-remove-first, health-gated, self-rolling-back.
#
# This is the CANONICAL copy of the root-owned script CI invokes over SSH
# (sudo -n /nebula/apps/deploy-stockz.sh). The host copy is deliberately root-owned and
# NOT auto-synced from the repo — that boundary is what keeps a git push from widening
# what CI may run as root. After changing this file, root installs it once, by hand:
#
#   sudo install -o root -g root -m 0755 \
#     /nebula/apps/stockz/docker/deploy-stockz.sh \
#     /nebula/apps/deploy-stockz.sh
#
# (The deploy workflow compares hashes and warns loudly when the host copy drifts.)
#
# NOTE: this replaces the old newstrader-flavoured /nebula/apps/deply-stockz.sh — remove
# that one when installing this.
set -euo pipefail

REPO=/nebula/apps/stockz
PROJECT=stockz
IMAGE="${PROJECT}-app"

cd "$REPO"

echo "==> pull (deterministic: the deploy IS origin/main, local edits lose)"
git fetch origin main
git reset --hard origin/main

# BUILD_SHA (the commit) and TREE_SHA (the exact file content, independent of commit
# metadata) both get baked into the image — "which commit" and "does the image really
# contain what that commit says" are different provenance questions.
BUILD_SHA=$(git rev-parse HEAD)
TREE_SHA=$(git rev-parse 'HEAD^{tree}')
export BUILD_SHA TREE_SHA
prev_image=$(docker inspect --format '{{.Image}}' stockz 2>/dev/null || true)
echo "==> deploying $BUILD_SHA (tree $TREE_SHA, previous image: ${prev_image:-none})"

# Two generations of rollback target: :previous is what the automatic rollback below
# steps back to; :previous-2 exists for a manual "that rollback also broke" drill.
if [ -n "$prev_image" ]; then
  if docker image inspect "${IMAGE}:previous" > /dev/null 2>&1; then
    docker tag "${IMAGE}:previous" "${IMAGE}:previous-2"
  fi
  docker tag "$prev_image" "${IMAGE}:previous"
fi

echo "==> build new image (old container keeps serving while this runs)"
docker compose build --pull

echo "==> kill + remove old container"
docker compose rm --stop --force app || true

echo "==> sweep strays: stockz* containers from any other compose project"
for id in $(docker ps -aq --filter "name=^stockz"); do
  proj=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$id" 2>/dev/null || echo "")
  if [ "$proj" != "$PROJECT" ]; then
    name=$(docker inspect -f '{{ .Name }}' "$id" 2>/dev/null || echo "$id")
    echo "    removing stray ${name#/} (compose project: '${proj:-none}')"
    docker rm -f "$id" || true
  fi
done

echo "==> start fresh container"
docker compose up -d --remove-orphans

echo "==> health gate: the app must serve $BUILD_SHA within 60s"
healthy=""
for i in $(seq 1 12); do
  sleep 5
  # /api/health is unauthenticated by design (it reveals a commit hash and nothing
  # else), so the gate works before .env exists and without holding any credential.
  build=$(docker exec stockz node -e "
    fetch('http://127.0.0.1:8643/api/health')
      .then(r=>r.json()).then(b=>{console.log(b.build??'')})
      .catch(()=>process.exit(1))
  " 2>/dev/null || true)
  if [ "$build" = "$BUILD_SHA" ]; then
    healthy=1
    break
  fi
  echo "    attempt $i/12: not healthy yet (build='${build:-none}')"
done

if [ -z "$healthy" ]; then
  echo "==> DEPLOY FAILED the health gate — rolling back"
  docker logs --tail 50 stockz || true
  if [ -n "$prev_image" ]; then
    # Retag the previous image as the compose image and restart from it without
    # building; CI still sees red (exit 1) so the bad commit is loud.
    docker tag "$prev_image" "${IMAGE}:latest"
    docker compose rm --stop --force app || true
    docker compose up -d --no-build --remove-orphans
    echo "==> rolled back to previous image $prev_image"
  else
    echo "==> no previous image to roll back to (first deploy?) — the app may be down"
  fi
  exit 1
fi

echo "==> deployed $BUILD_SHA"
