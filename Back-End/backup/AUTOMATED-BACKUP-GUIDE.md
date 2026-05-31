# BMS Automated Backup System — Setup & Reference Guide

End-to-end automated daily backup pipeline:

```
Production server (Ubuntu/MySQL)
        │  10:00 AM cron
        ▼
   backup.sh  →  /var/backups/bms/daily/bms_db_<timestamp>.sql.gz + checksum
        │
        │  10:30 AM Windows Task Scheduler
        ▼
   pull-backups.ps1  →  rsync/scp over SSH key  →  Local Windows folder
        │
        │  10:45 AM Windows Task Scheduler
        ▼
   auto-restore-mirror.ps1  →  verify checksum + gzip  →  rebuild bms_mirror DB
```

**Safety properties**
- Working DB `bms_db` is never written to by the automation. Only `bms_mirror` is touched.
- Backups are append-only files. A bad backup today does not overwrite yesterday's.
- Checksums + gzip integrity are verified before any restore. Bad files are rejected and the previous good `bms_mirror` is preserved.
- SSH uses a dedicated key with no password, no shell login on the laptop side.

---

## 1. Server-side setup (one time, run as root on production)

You SSH into the server as root for these steps. Example: `ssh root@136.244.85.226`.

### 1.1 Install the backup script

```bash
mkdir -p /opt/bms/backup /var/backups/bms
chmod 700 /var/backups/bms

cat > /opt/bms/backup/backup.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
: "${DB_NAME:=bms_db}"
: "${DB_HOST:=127.0.0.1}"
: "${MY_CNF:=$HOME/.my.cnf}"
: "${BACKUP_ROOT:=/var/backups/bms}"
: "${MEDIA_DIR:=/var/www/bms/media}"
: "${RETAIN_DAILY:=7}"
: "${RETAIN_WEEKLY:=4}"
: "${RETAIN_MONTHLY:=12}"
[ -f /etc/default/bms-backup ] && . /etc/default/bms-backup
TS=$(date +%Y-%m-%dT%H-%M-%S); DOW=$(date +%u); DOM=$(date +%d)
if   [ "$DOM" = "01" ]; then TIER=monthly
elif [ "$DOW" = "7"  ]; then TIER=weekly
else                          TIER=daily
fi
DEST="$BACKUP_ROOT/$TIER"; mkdir -p "$DEST"; chmod 700 "$DEST"
DB_FILE="$DEST/${DB_NAME}_${TS}.sql.gz"
MEDIA_FILE="$DEST/media_${TS}.tar.gz"
LOG="$BACKUP_ROOT/backup.log"
log(){ echo "[$(date '+%F %T')] $*" | tee -a "$LOG" >&2; }
trap 'log "FAILED at line $LINENO (exit $?)"' ERR
log "-- Starting $TIER backup ($TS) --"
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
( cd "$DEST" && sha256sum *_${TS}.* > "checksums_${TS}.sha256" )
rotate(){
  local dir="$BACKUP_ROOT/$1" keep="$2"
  [ -d "$dir" ] || return 0
  ls -1t "$dir"/*.sql.gz 2>/dev/null | tail -n +"$((keep+1))" | while read -r f; do
    stamp=$(echo "$f" | sed -E 's/.*_([0-9T\-]+)\.sql\.gz.*/\1/')
    log "Rotating out $1: $stamp"; rm -f "$dir"/*"_${stamp}".*
  done
}
rotate daily "$RETAIN_DAILY"; rotate weekly "$RETAIN_WEEKLY"; rotate monthly "$RETAIN_MONTHLY"
log "-- Backup $TS OK --"
EOF

chmod +x /opt/bms/backup/backup.sh
```

**What it does**

- Dumps the database with `mysqldump` (consistent snapshot via `--single-transaction`).
- Gzips the dump into `/var/backups/bms/<tier>/`.
- Tars the media folder if present.
- Writes a `sha256sum` checksum file alongside.
- Rotates old files: keeps 7 daily, 4 weekly (Sundays), 12 monthly (1st of month).
- Logs to `/var/backups/bms/backup.log`.

### 1.2 Diagnose MySQL admin access

On Ubuntu/Debian, MySQL's `root` user usually uses **socket auth**, not a password. Check:

```bash
ls -l /etc/mysql/debian.cnf 2>&1
sudo mysql -e "SELECT user, host, plugin FROM mysql.user;"
```

- If you see `root | localhost | auth_socket` → use `sudo mysql` for admin operations.
- If a `/etc/mysql/debian.cnf` file exists → it contains a privileged user you can use with `mysql --defaults-extra-file=/etc/mysql/debian.cnf`.

If a stale `/root/.my.cnf` blocks login, move it out of the way:

```bash
mv /root/.my.cnf /root/.my.cnf.bak 2>/dev/null
```

### 1.3 Create the read-only backup MySQL user + credentials file

Single-quoted heredoc preserves special chars in the password. Replace `Bms!Backup@2026$Strong` with your own strong password.

```bash
sudo mysql <<'SQL'
CREATE USER IF NOT EXISTS 'bms_backup'@'localhost' IDENTIFIED BY 'Bms!Backup@2026$Strong';
ALTER USER 'bms_backup'@'localhost' IDENTIFIED BY 'Bms!Backup@2026$Strong';
GRANT SELECT, SHOW VIEW, RELOAD, PROCESS, LOCK TABLES, REPLICATION CLIENT,
      EVENT, TRIGGER ON bms_db.* TO 'bms_backup'@'localhost';
FLUSH PRIVILEGES;
SQL

cat > /root/.my.cnf <<'EOF'
[client]
user=bms_backup
password=Bms!Backup@2026$Strong
host=127.0.0.1

[mysqldump]
user=bms_backup
password=Bms!Backup@2026$Strong
host=127.0.0.1
EOF
chmod 600 /root/.my.cnf

# Verify the user can connect and see the DB:
mysql -e "SELECT CURRENT_USER(); SHOW DATABASES LIKE 'bms_db';"
```

**Why these grants?** `SELECT`, `SHOW VIEW`, `LOCK TABLES`, `EVENT`, `TRIGGER` are required for a complete `mysqldump`. `RELOAD`, `PROCESS`, `REPLICATION CLIENT` are recommended by MySQL docs for consistent online dumps.

**Common pitfalls encountered**

- `ERROR 1819: password does not satisfy policy` → MySQL validate_password plugin rejects weak passwords. Use a password with upper + lower + digit + special, 12+ chars.
- `-bash: !@: event not found` → bash history expansion. Either `set +H` first, or wrap the assignment in single quotes, or paste the password inside a single-quoted heredoc as shown above.

### 1.4 Configure paths (optional override)

```bash
cat > /etc/default/bms-backup <<'EOF'
DB_NAME=bms_db
DB_HOST=127.0.0.1
MEDIA_DIR=/var/www/bms/BMS-Bonus-Tracking-Management-System-/Back-End/bms/media
EOF
```

Adjust `MEDIA_DIR` to wherever your Django media folder lives. If the dir doesn't exist, the script skips media silently.

### 1.5 First test run

```bash
/opt/bms/backup/backup.sh
ls -lh /var/backups/bms/daily/
```

Expect: `bms_db_<timestamp>.sql.gz` and `checksums_<timestamp>.sha256`.

### 1.6 Schedule via cron

```bash
( crontab -l 2>/dev/null | grep -vF backup.s
  echo "0 10 * * * /opt/bms/backup/backup.sh >> /var/log/bms-backup.log 2>&1"
) | crontab -
crontab -l
```

The `grep -vF backup.s` filter removes any earlier (possibly broken) cron entries that mention `backup.s` or `backup.sh`, then re-adds the correct one. Idempotent — safe to re-run.

---

## 2. Local Windows setup (one time)

Run these in PowerShell on your laptop.

### 2.1 Install an SSH key on the server

This lets Task Scheduler connect silently — no password prompt.

```powershell
# 1. Generate a dedicated key. Press Enter at the passphrase prompt twice (no passphrase).
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\bms_backup -C "bms-backup"

# 2. Install the public key on the server. Asks for your root SSH password ONE last time.
$pub = Get-Content $env:USERPROFILE\.ssh\bms_backup.pub
ssh root@136.244.85.226 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '$pub' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo INSTALLED"

# 3. Verify silent login. Must print OK with NO password prompt.
ssh -i $env:USERPROFILE\.ssh\bms_backup -o IdentitiesOnly=yes root@136.244.85.226 "echo OK"
```

**Why a passphrase-less key?** A passphrase would require interactive input at every scheduled run. Compensating controls:

- Key file lives at `$env:USERPROFILE\.ssh\bms_backup` with NTFS user-only ACL.
- Key is dedicated to backups; not shared with any other system.
- Lose the laptop → revoke by removing the public key line from `/root/.ssh/authorized_keys` on the server.

**Common pitfall:** piping the key file straight through `ssh` (e.g. `type ...pub | ssh ...`) can close stdin before SSH can prompt for your password, resulting in `Connection closed`. Use the variable + interpolation pattern shown above instead.

### 2.2 The three local scripts

All live in `Back-End/backup/`:

| Script | Purpose |
|---|---|
| `pull-backups.ps1` | rsync (preferred) or scp the server's `/var/backups/bms` to local `Back-End/bms/backups`. Logs to `pull.log`. |
| `auto-restore-mirror.ps1` | Pick the newest `bms_db_<ts>.sql.gz` by filename timestamp, verify checksum, verify gzip integrity, then `DROP` and recreate `bms_mirror` and import. Never touches `bms_db`. Logs to `restore-mirror.log`. |
| `install-automation.ps1` | Registers both scripts as Windows Scheduled Tasks. Re-runnable; cleans up any prior `BMS-*` tasks. |

### 2.3 Bootstrap the schedule (run ONCE, as Administrator)

Open PowerShell **as Administrator** and run:

```powershell
cd C:\Users\mahme\OneDrive\Desktop\BMS\Back-End\backup
.\install-automation.ps1
```

Output should be:

```
Registered: BMS-Pull-Backups          (daily at 10:30)
Registered: BMS-Daily-Mirror-Restore  (daily at 10:45)
```

Tasks are registered with `LogonType S4U` and `RunLevel Highest`, so they run unattended even when you're logged out.

To pick different times:

```powershell
.\install-automation.ps1 -PullTime 02:30 -RestoreTime 02:45
```

To remove the automation:

```powershell
.\install-automation.ps1 -Uninstall
```

---

## 3. Verifying it works

### 3.1 Trigger the pipeline on demand

```powershell
Start-ScheduledTask -TaskName 'BMS-Pull-Backups'
# wait ~10 seconds
Start-ScheduledTask -TaskName 'BMS-Daily-Mirror-Restore'
```

### 3.2 Check logs

```powershell
Get-Content C:\Users\mahme\OneDrive\Desktop\BMS\Back-End\backup\pull.log -Tail 5
Get-Content C:\Users\mahme\OneDrive\Desktop\BMS\Back-End\backup\restore-mirror.log -Tail 5
```

Healthy log tails contain `Pull complete` and `Mirror restore <ts> OK`.

### 3.3 Inspect the mirror DB

```powershell
mysql -uroot -proot -e "SHOW TABLES IN bms_mirror; SELECT COUNT(*) AS users FROM bms_mirror.users;"
```

Row count should match production, not local.

### 3.4 Inspect scheduled tasks

```powershell
Get-ScheduledTask -TaskName 'BMS-*' | Select TaskName, State, LastRunTime, LastTaskResult
```

`LastTaskResult` of `0` means success.

---

## 4. Recovery / disaster scenarios

### 4.1 Restore an older backup into your working DB (manual)

```powershell
cd C:\Users\mahme\OneDrive\Desktop\BMS\Back-End\backup
# Pick whichever archive you want — any timestamp from daily / weekly / monthly:
.\restore-mysql.ps1 -Archive ..\bms\backups\daily\bms_db_2026-05-28T10-00-01.sql.gz
```

The interactive restore prompts you to type `RESTORE` to confirm before it drops and recreates `bms_db`.

### 4.2 Production server is wiped/compromised

You always have up to 7 daily + 4 weekly + 12 monthly clean copies locally. To rehydrate a fresh server:

1. Provision a new server with the same MySQL + Django stack.
2. From your laptop: `scp ..\bms\backups\daily\bms_db_<known_good_timestamp>.sql.gz root@new-server:/tmp/`.
3. On the new server: decompress and import:
   ```bash
   gunzip -c /tmp/bms_db_<ts>.sql.gz | mysql bms_db
   ```
4. Run `python manage.py migrate` if needed.
5. Repoint DNS.

### 4.3 Latest pulled backup is corrupted

`auto-restore-mirror.ps1` rejects bad files (checksum mismatch or truncated gzip) and leaves the previous `bms_mirror` intact. Look at `restore-mirror.log` for the error, then either wait for the next day's backup or manually restore an earlier one.

---

## 5. Daily / weekly maintenance

**Daily:** nothing. The pipeline is fully unattended.

**Weekly (30 seconds, optional):**

```powershell
Get-Content C:\Users\mahme\OneDrive\Desktop\BMS\Back-End\backup\pull.log -Tail 3
Get-Content C:\Users\mahme\OneDrive\Desktop\BMS\Back-End\backup\restore-mirror.log -Tail 3
```

Both tails should show recent `OK` lines.

**Caveat:** Windows Scheduled Tasks only fire if the machine is on (or wakes up). If the laptop was off at 10:30, the task runs at next boot thanks to `-StartWhenAvailable`. The backup itself still happened on the server regardless — you just pull later.

---

## 6. File reference

| Path | What it is |
|---|---|
| **Production server** | |
| `/opt/bms/backup/backup.sh` | Daily backup script |
| `/etc/default/bms-backup` | Env overrides (DB name, media dir) |
| `/root/.my.cnf` | MySQL credentials for `bms_backup` user (mode 600) |
| `/var/backups/bms/{daily,weekly,monthly}/` | Backup archives + checksums |
| `/var/log/bms-backup.log` | Cron output log |
| `crontab -e` line | `0 10 * * * /opt/bms/backup/backup.sh >> /var/log/bms-backup.log 2>&1` |
| **Local Windows** | |
| `Back-End/backup/pull-backups.ps1` | Mirrors server backups to local |
| `Back-End/backup/auto-restore-mirror.ps1` | Verifies + restores into `bms_mirror` |
| `Back-End/backup/install-automation.ps1` | Registers Scheduled Tasks |
| `Back-End/backup/restore-mysql.ps1` | Interactive manual restore (any archive → any DB) |
| `Back-End/backup/backup-mysql.ps1` | Local-source backup (not used in prod pipeline; kept for offline dev) |
| `Back-End/bms/backups/{daily,weekly,monthly}/` | Local mirror of server archives |
| `Back-End/backup/pull.log` | Pull job output |
| `Back-End/backup/restore-mirror.log` | Restore job output |
| `~\.ssh\bms_backup` + `.pub` | Dedicated SSH keypair for unattended backups |
| Scheduled tasks | `BMS-Pull-Backups` (10:30), `BMS-Daily-Mirror-Restore` (10:45) |

---

## 7. Reapplying this on a new project or new machine

Quick checklist when setting this up again from scratch:

1. **Server:** sections 1.1 → 1.6.
2. **Local:** copy `Back-End/backup/` from the repo to the new machine.
3. **Local:** section 2.1 (generate + install SSH key).
4. **Local:** open scripts and edit defaults if the server IP, DB name, or paths differ.
5. **Local:** section 2.3 (`install-automation.ps1` as Admin).
6. **Verify:** section 3.

That's it. The whole system is six small files and one cron line.
