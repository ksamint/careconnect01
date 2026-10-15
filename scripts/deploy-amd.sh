#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[[ -f .env ]] || { echo 'Configure .env with the HTTPS origin first.' >&2; exit 1; }
# Compose reads .env; never execute it as shell code.
npm --prefix h5 ci --no-audit --no-fund
npm --prefix h5 run build
docker compose config --quiet
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose build --pull
# Existing named data and backup volumes survive replacement and rollback.
docker compose up -d --wait --wait-timeout 120
docker compose ps
echo 'Deployment ready. Bootstrap staff access with the backend CLI; verify using synthetic participants.'
