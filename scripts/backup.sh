#!/usr/bin/env bash
# Copy the CareConnect database (and the server's own daily backups) off the container.
# Cron example (every day 02:15):  15 2 * * * /opt/careconnect01/scripts/backup.sh >> /var/log/careconnect-backup.log 2>&1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
DEST="${BACKUP_DIR:-$ROOT/backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(date +%F_%H%M)"

mkdir -p "$DEST"
# Ask the server for a consistent snapshot first (VACUUM INTO), then copy the data folder out.
docker compose exec -T careconnect node -e "import('./db.mjs').then(m => console.log(m.backupNow()))" >/dev/null
docker compose cp careconnect:/data "$DEST/careconnect-$STAMP"
tar -czf "$DEST/careconnect-$STAMP.tar.gz" -C "$DEST" "careconnect-$STAMP" && rm -rf "$DEST/careconnect-$STAMP"
find "$DEST" -name 'careconnect-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup written: $DEST/careconnect-$STAMP.tar.gz"
