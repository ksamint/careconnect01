#!/usr/bin/env bash
# Build and start CareConnect (H5 + Node/SQLite server) with Docker Compose.
# Safe to re-run: it rebuilds the image and restarts the container; the database volume is kept.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

command -v docker >/dev/null || { echo "ERROR: docker is not installed" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "ERROR: docker compose plugin is missing" >&2; exit 1; }

# First run: create .env with random passwords (used only when the database is first created).
if [[ ! -f .env ]]; then
  gen() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 14; }
  cat > .env <<EOF
HOST_PORT=8080
DEFAULT_PASSWORD=$(gen)
ADMIN_PASSWORD=$(gen)
SEED_DEMO=1
EOF
  chmod 600 .env
  echo "==> Created .env with new random passwords (see below). Keep this file private."
fi

# shellcheck disable=SC1091
source .env
HOST_PORT="${HOST_PORT:-8080}"
PORT="${HOST_PORT##*:}"   # HOST_PORT may be "8080" or "127.0.0.1:8080"

echo "==> Building image (linux/amd64)..."
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose build

echo "==> Starting container..."
docker compose up -d

echo "==> Waiting for health check..."
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    echo "==> CareConnect is up: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo localhost):${PORT}/login"
    echo "    admin password:          ${ADMIN_PASSWORD:-$DEFAULT_PASSWORD}"
    echo "    nurses/research password: ${DEFAULT_PASSWORD}  (user2, user4, user3, orgadmin, user1)"
    echo "    (passwords only apply to a NEW database; change them in Admin > User management)"
    docker compose ps
    exit 0
  fi
  sleep 2
done

echo "ERROR: health check failed. Recent logs:" >&2
docker compose logs --tail 50 careconnect >&2
exit 1
