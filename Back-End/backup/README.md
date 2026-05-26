# BMS Backup & Restore

Production-grade backup system for the BMS Django + MySQL stack.

## Files
| File | Where it runs | Purpose |
|---|---|---|
| `backup.sh`        | Production server | Daily MySQL dump + media tar + GFS rotation |
| `restore.sh`       | Any target server | Restore DB + media from an archive |
| `pull-backups.sh`  | Local machine (Linux/macOS/WSL) | Mirror server backups via rsync+ssh |
| `pull-backups.ps1` | Local machine (Windows) | Same, PowerShell version |
| `.my.cnf.example`  | Production server | Template for the read-only DB credentials |

## Retention (GFS)
- 7 daily backups
- 4 weekly backups (Sunday)
- 12 monthly backups (1st of month)

## One-time server setup

```bash
# 1. Place scripts
sudo mkdir -p /opt/bms/backup /var/backups/bms
sudo cp backup.sh restore.sh /opt/bms/backup/
sudo chmod +x /opt/bms/backup/*.sh

# 2. Create read-only DB user
sudo mysql -uroot -p <<'SQL'
CREATE USER 'bms_backup'@'localhost' IDENTIFIED BY 'CHANGE_ME_STRONG';
GRANT SELECT, SHOW VIEW, RELOAD, PROCESS, LOCK TABLES, REPLICATION CLIENT,
      EVENT, TRIGGER ON bms.* TO 'bms_backup'@'localhost';
FLUSH PRIVILEGES;
SQL

# 3. Credentials file
sudo cp .my.cnf.example /root/.my.cnf
sudo nano /root/.my.cnf          # fill in the real password
sudo chmod 600 /root/.my.cnf

# 4. Optional env overrides
sudo tee /etc/default/bms-backup >/dev/null <<'EOF'
DB_NAME=bms
MEDIA_DIR=/var/www/bms/media
# GPG_RECIPIENT=ops@example.com
EOF

# 5. First manual run
sudo /opt/bms/backup/backup.sh

# 6. Cron @ 10:00 daily
echo '0 10 * * *  /opt/bms/backup/backup.sh >> /var/log/bms-backup.log 2>&1' \
  | sudo tee -a /etc/crontab
```

## One-time local-machine setup

1. Add an SSH config block in `~/.ssh/config`:
   ```
   Host bms-prod
       HostName  your.server.ip
       User      bms-ops
       IdentityFile ~/.ssh/bms_backup_ed25519
   ```
2. First manual pull: `./pull-backups.sh` (or `.\pull-backups.ps1` on Windows).
3. Schedule it 30 min after the server cron (10:30):
   - **Linux/macOS:** `30 10 * * *  /path/to/pull-backups.sh >> ~/backups/bms/pull.log 2>&1`
   - **Windows:** Task Scheduler → daily 10:30 → action `powershell.exe -File C:\path\to\pull-backups.ps1`

## Restore

Restore the most recent daily backup:
```bash
cd /opt/bms/backup
LATEST_DB=$(ls -1t /var/backups/bms/daily/bms_*.sql.gz | head -1)
LATEST_MEDIA=$(ls -1t /var/backups/bms/daily/media_*.tar.gz | head -1)
sudo ./restore.sh "$LATEST_DB" "$LATEST_MEDIA"
```

For GPG-encrypted archives, decrypt first:
```bash
gpg -d bms_2026-05-26T10-00-00.sql.gz.gpg > bms_2026-05-26T10-00-00.sql.gz
```

## Disaster recovery playbook

| Scenario | Steps |
|---|---|
| Accidental data loss | `restore.sh` from latest daily on the production server |
| Server compromise / full loss | Provision new server → install MySQL + Django stack → copy latest archive from your **local** mirror → `restore.sh` → cut DNS over |
| Need a snapshot from N days ago | Pick archive from `daily/`, `weekly/`, or `monthly/` on the local mirror |
| Corrupted media only | `tar -xzf media_<ts>.tar.gz -C /var/www/bms/` |

## Security checklist
- `~/.my.cnf` is `chmod 600` and never committed
- `bms_backup` MySQL user has read-only grants (see SQL above)
- `/var/backups/bms` is `chmod 700`
- SSH from local machine uses a dedicated keypair, no password auth
- Set `GPG_RECIPIENT` to encrypt off-server copies at rest
- Every archive has a `sha256` checksum; `pull-backups.sh` verifies on download

## Pre-deploy testing (do this BEFORE production)
1. Run a local MySQL via Docker:
   ```
   docker run --name bms-mysql -e MYSQL_ROOT_PASSWORD=test \
              -e MYSQL_DATABASE=bms -p 3306:3306 -d mysql:8
   ```
2. Set `DB_HOST=127.0.0.1` and run `backup.sh`.
3. Drop the local DB, then run `restore.sh` on the resulting archive.
4. Only when restore round-trip passes, deploy to production.

## Git hygiene
Make sure these are in `.gitignore`:
```
Back-End/backup/.my.cnf
*.sql
*.sql.gz
*.tar.gz
*.sha256
```
