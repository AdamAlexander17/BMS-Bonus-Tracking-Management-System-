#!/usr/bin/env bash
# pull-backups.sh — run on the LOCAL machine to mirror the server's backups.
# Schedule via cron (Linux/macOS/WSL) or Task Scheduler (Windows + Git Bash).
set -euo pipefail

: "${REMOTE_HOST:=bms-prod}"        # ssh alias from ~/.ssh/config
: "${REMOTE_PATH:=/var/backups/bms/}"
: "${LOCAL_PATH:=$HOME/backups/bms/}"
: "${SSH_KEY:=$HOME/.ssh/bms_backup_ed25519}"

mkdir -p "$LOCAL_PATH"

echo ">> Mirroring $REMOTE_HOST:$REMOTE_PATH → $LOCAL_PATH"
rsync -avz --delete-after \
  --partial --append-verify \
  -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new" \
  "$REMOTE_HOST:$REMOTE_PATH" "$LOCAL_PATH"

LATEST=$(ls -1t "$LOCAL_PATH"daily/checksums_*.sha256 2>/dev/null | head -1 || true)
if [ -n "$LATEST" ]; then
    echo ">> Verifying checksums for $(basename "$LATEST")"
    ( cd "$(dirname "$LATEST")" && sha256sum -c "$(basename "$LATEST")" )
else
    echo "WARN: no daily checksums file found yet."
fi

echo ">> Pull complete."
