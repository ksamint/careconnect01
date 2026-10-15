#!/usr/bin/env bash
# Run after review and authorization; preserves the existing Traefik route and data volumes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
HOST="root@119.45.7.98"
REMOTE_DIR="/data/careconnect01"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=30)
if [[ -n "${CAREPRO_SSH_IDENTITY:-}" ]]; then
  [[ -f "$CAREPRO_SSH_IDENTITY" ]] || { echo 'SSH identity file missing.' >&2; exit 1; }
  SSH_OPTS+=(-o IdentityAgent=none -o IdentitiesOnly=yes -i "$CAREPRO_SSH_IDENTITY")
fi
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
npm --prefix h5 ci --no-audit --no-fund
npm --prefix h5 run build
ssh "${SSH_OPTS[@]}" "$HOST" "mkdir -p '$REMOTE_DIR/backups'; tar --exclude=backups --exclude=node_modules --exclude=h5/node_modules --exclude=.git --exclude=.env --exclude=materials -czf '$REMOTE_DIR/backups/source-$STAMP.tar.gz' -C '$REMOTE_DIR' .; docker image tag careconnect-h5:latest careconnect-h5:rollback-$STAMP"
# No --delete: preserve server-only secrets, approved materials and backups.
rsync -az -e "$(printf '%q ' ssh "${SSH_OPTS[@]}")" --exclude .git --exclude .env --exclude materials/ --exclude backups/ --exclude node_modules --exclude h5/node_modules --exclude backend/.venv --exclude __pycache__ --exclude '*.sqlite3*' "$ROOT/" "$HOST:$REMOTE_DIR/"
ssh "${SSH_OPTS[@]}" "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
cd /data/careconnect01
mkdir -p materials
if [[ ! -f .env ]]; then
  umask 077
  printf '%s\n' 'HOST_PORT=18080' 'PUBLIC_ORIGIN=https://carepro.opcglobal.cn' 'COOKIE_SECURE=true' > .env
fi
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
"${COMPOSE[@]}" config --quiet
# Snapshot an existing database before replacing running services.
if [[ -n "$("${COMPOSE[@]}" ps -q careconnect-api 2>/dev/null)" ]]; then
  "${COMPOSE[@]}" exec -T careconnect-backup python backup.py backup --directory /backups
fi
DOCKER_DEFAULT_PLATFORM=linux/amd64 "${COMPOSE[@]}" build --pull
"${COMPOSE[@]}" up -d --wait --wait-timeout 120
"${COMPOSE[@]}" ps
REMOTE
curl --fail --silent --show-error https://carepro.opcglobal.cn/api/health
