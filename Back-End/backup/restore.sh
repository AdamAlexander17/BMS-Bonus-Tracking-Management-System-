#!/usr/bin/env bash
# restore.sh — disaster recovery for BMS
# Usage: ./restore.sh <db_dump.sql.gz> [media_tarball.tar.gz]
set -euo pipefail

: "${DB_NAME:=bms}"
: "${DB_HOST:=127.0.0.1}"
: "${MY_CNF:=$HOME/.my.cnf}"
: "${MEDIA_DIR:=/var/www/bms/media}"

DB_ARCHIVE="${1:?Usage: restore.sh <db.sql.gz> [media.tar.gz]}"
MEDIA_ARCHIVE="${2:-}"

echo ">> Verifying archive integrity..."
gzip -t "$DB_ARCHIVE"

echo ">> About to DROP and recreate database '$DB_NAME' on $DB_HOST"
read -r -p "Type the database name to confirm: " CONFIRM
[ "$CONFIRM" = "$DB_NAME" ] || { echo "Aborted."; exit 1; }

echo ">> Recreating database schema..."
mysql --defaults-extra-file="$MY_CNF" -h "$DB_HOST" -e \
  "DROP DATABASE IF EXISTS \`$DB_NAME\`;
   CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo ">> Restoring data..."
gunzip -c "$DB_ARCHIVE" | mysql --defaults-extra-file="$MY_CNF" -h "$DB_HOST" "$DB_NAME"

if [ -n "$MEDIA_ARCHIVE" ] && [ -f "$MEDIA_ARCHIVE" ]; then
    echo ">> Restoring media to $(dirname "$MEDIA_DIR")"
    mkdir -p "$(dirname "$MEDIA_DIR")"
    tar -xzf "$MEDIA_ARCHIVE" -C "$(dirname "$MEDIA_DIR")"
fi

echo ">> Applying any pending Django migrations..."
( cd "$(dirname "$0")/../bms" && python manage.py migrate --noinput ) || \
    echo "WARN: could not auto-run migrate; run it manually from the Django project root."

echo ">> Restore complete."
