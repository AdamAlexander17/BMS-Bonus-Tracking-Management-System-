#!/usr/bin/env bash
# BMS production backup — MySQL + media, GFS rotation, optional GPG.
# Invoke from cron at 10:00 daily. Credentials live in ~/.my.cnf (mode 600).
set -euo pipefail

: "${DB_NAME:=bms}"
: "${DB_HOST:=127.0.0.1}"
: "${MY_CNF:=$HOME/.my.cnf}"
: "${BACKUP_ROOT:=/var/backups/bms}"
: "${MEDIA_DIR:=/var/www/bms/media}"
: "${RETAIN_DAILY:=7}"
: "${RETAIN_WEEKLY:=4}"
: "${RETAIN_MONTHLY:=12}"
: "${GPG_RECIPIENT:=}"          # empty = no encryption
[ -f /etc/default/bms-backup ] && . /etc/default/bms-backup

TS=$(date +%Y-%m-%dT%H-%M-%S); DOW=$(date +%u); DOM=$(date +%d)
if   [ "$DOM" = "01" ]; then TIER=monthly
elif [ "$DOW" = "7"  ]; then TIER=weekly
else                          TIER=daily
fi
DEST="$BACKUP_ROOT/$TIER"; mkdir -p "$DEST"; chmod 700 "$BACKUP_ROOT" "$DEST"
DB_FILE="$DEST/${DB_NAME}_${TS}.sql.gz"
MEDIA_FILE="$DEST/media_${TS}.tar.gz"
LOG="$BACKUP_ROOT/backup.log"
log(){ echo "[$(date '+%F %T')] $*" | tee -a "$LOG" >&2; }
trap 'log "FAILED at line $LINENO (exit $?)"' ERR
log "── Starting $TIER backup ($TS) ──"

umask 077
mysqldump --defaults-extra-file="$MY_CNF" --host="$DB_HOST" \
  --single-transaction --quick --routines --triggers --events \
  --set-gtid-purged=OFF --default-character-set=utf8mb4 \
  "$DB_NAME" | gzip -9 > "$DB_FILE"
log "DB dump: $DB_FILE ($(du -h "$DB_FILE" | cut -f1))"

if [ -d "$MEDIA_DIR" ]; then
  tar -czf "$MEDIA_FILE" -C "$(dirname "$MEDIA_DIR")" "$(basename "$MEDIA_DIR")"
  log "Media: $MEDIA_FILE ($(du -h "$MEDIA_FILE" | cut -f1))"
fi

if [ -n "$GPG_RECIPIENT" ]; then
  for f in "$DB_FILE" "$MEDIA_FILE"; do
    [ -f "$f" ] || continue
    gpg --batch --yes --trust-model always -r "$GPG_RECIPIENT" \
        -o "$f.gpg" --encrypt "$f" && shred -u "$f"
  done
fi

( cd "$DEST" && sha256sum *_${TS}.* > "checksums_${TS}.sha256" )

rotate(){
  local dir="$BACKUP_ROOT/$1" keep="$2"
  [ -d "$dir" ] || return 0
  ls -1t "$dir"/*.sql.gz* 2>/dev/null | tail -n +"$((keep+1))" | while read -r f; do
    stamp=$(echo "$f" | sed -E 's/.*_([0-9T\-]+)\.sql\.gz.*/\1/')
    log "Rotating out $1: $stamp"; rm -f "$dir"/*"_${stamp}".*
  done
}
rotate daily "$RETAIN_DAILY"; rotate weekly "$RETAIN_WEEKLY"; rotate monthly "$RETAIN_MONTHLY"
log "── Backup $TS OK ──"
