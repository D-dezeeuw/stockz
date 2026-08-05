# Deployment — Docker on Hetzner

The desk ships as one container: a zero-dependency Node backend (`server/main.js`) that
serves the static desk, relays venue REST on the same origin, and holds the usr/admin
login. nginx-proxy-manager terminates TLS and proxies a hostname to the container's
static IP on `nginx-proxy-manager_default` (172.22.0.41:8643 — newstrader holds .40).

## Push is deploy

Every push to `main` runs `.github/workflows/deploy.yml` (the repo's ONE GitHub Action,
deploy-only): it SSHes to the Hetzner host and invokes the root-owned
`/nebula/apps/deploy-stockz.sh` via passwordless sudo. That script is canonical in this
repo at `docker/deploy-stockz.sh` — root installs it by hand (command in its header), the
workflow warns loudly on drift. It pulls `origin/main`, builds the image with
BUILD_SHA/TREE_SHA baked in, kill-and-removes the old container, starts the new one, and
gates on `/api/health` serving the new commit within 60s — rolling back to the
`stockz-app:previous` image (and paging red in CI) if not. `:previous-2` exists for a
manual second-step rollback.

## One-time host setup

```
sudo mkdir -p /nebula/apps && cd /nebula/apps
sudo git clone https://github.com/D-dezeeuw/stockz
cd stockz && sudo cp .env.example .env && sudo vi .env   # usr/admin passwords + secret
sudo install -o root -g root -m 0755 docker/deploy-stockz.sh /nebula/apps/deploy-stockz.sh
echo 'ddezeeuw ALL=(root) NOPASSWD: /nebula/apps/deploy-stockz.sh' | sudo tee /etc/sudoers.d/deploy-stockz
# repo secret HETZNER_SSH_KEY = the private key matching the server's authorized_keys
# NPM: add a proxy host → stockz (172.22.0.41:8643), TLS via NPM as usual
```

Until `.env` exists the desk boots LOCKED (the login page says so) — never open.

## Local

`node server/main.js` runs the real backend (export the STOCKZ_* vars to log in).
`npm run dev` runs Vite with the same `/okx-eea` `/okx` `/etoro` proxies, no login.
`scripts/docker/{build,rebuild,start,stop,logs}.sh` drive the container locally.

## Rollback

Automatic on a failed health gate. By hand on the host:
`docker tag stockz-app:previous stockz-app:latest && docker compose -f /nebula/apps/stockz/docker-compose.yml up -d --no-build`

## The GitHub Pages era

Retired 2026-08-05. Pages can still serve the static files but has no backend: no login,
no venue relay — venue calls 404. Turn Pages off in the repo settings when convenient.
