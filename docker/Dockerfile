# STOCKZ backend + desk in one image. Zero NPM dependencies at runtime — the server is
# node: builtins only and the desk is raw ES modules — so there is no install step and
# nothing to build: COPY is the whole pipeline.
FROM node:22-slim

# Non-root with a fixed UID for volume permission predictability.
RUN groupadd -g 10001 app && useradd -m -u 10001 -g app app

WORKDIR /srv
COPY package.json ./
COPY server/ ./server/
COPY index.html favicon.svg ./
COPY src/ ./src/

# /srv/data backs the stockz-data volume. Nothing writes there yet; it exists app-owned
# so the day something does (server-side journal exports, recordings), a fresh named
# volume inherits writable ownership on first mount instead of failing at 2am.
RUN mkdir -p /srv/data && chown -R app:app /srv/data

USER app
ENV NODE_ENV=production
# An explicit V8 ceiling, or the kernel's cgroup OOM kill arrives before Node's own
# memory handling ever runs — no stack trace, just a silent restart. 192m under the
# compose file's 256m mem_limit leaves headroom for buffers and native overhead; keep
# the two numbers in lockstep if either changes.
ENV NODE_OPTIONS="--max-old-space-size=192"

# The deployed commit, baked in so the post-deploy health gate can confirm the NEW code
# is serving (/api/health.build), not a stale image.
ARG BUILD_SHA=dev
ENV BUILD_SHA=$BUILD_SHA
# The exact file-content hash, as an OCI label — a distinct provenance question from
# "which commit": does this image's content match what that commit contained.
ARG TREE_SHA=dev
LABEL org.opencontainers.image.revision=$BUILD_SHA \
      org.opencontainers.image.source="https://github.com/D-dezeeuw/stockz" \
      nl.stockz.tree-sha=$TREE_SHA

EXPOSE 8643
# /api/health is deliberately unauthenticated (it reveals a commit hash and nothing
# else), so the probe needs no key and works before .env exists.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:8643/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "server/main.js"]
