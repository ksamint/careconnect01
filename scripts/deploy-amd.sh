#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# The H5 app is built inside the Docker image; the SQLite database lives in the careconnect-data volume.
echo "==> Building Docker image (linux/amd64)..."
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose build

echo "==> Starting container..."
docker compose up -d

PORT="8080"
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source .env
  PORT="${HOST_PORT:-8080}"
fi

echo "==> CareConnect is running at http://localhost:${PORT}/login"
docker compose ps
