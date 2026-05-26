# pull-backups.ps1 — Windows alternative for mirroring the server's backups.
# Schedule with Windows Task Scheduler. Requires OpenSSH client (built into Win10+).
param(
    [string]$RemoteHost = "bms-prod",
    [string]$RemotePath = "/var/backups/bms",
    [string]$LocalPath  = "$HOME\backups\bms",
    [string]$SshKey     = "$HOME\.ssh\bms_backup_ed25519"
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $LocalPath)) { New-Item -ItemType Directory -Force $LocalPath | Out-Null }

Write-Host ">> Mirroring $RemoteHost`:$RemotePath -> $LocalPath"

# Prefer rsync if available (Git Bash / WSL bundles it); else fall back to scp -r.
$rsync = Get-Command rsync -ErrorAction SilentlyContinue
if ($rsync) {
    & rsync -avz --delete-after --partial --append-verify `
        -e "ssh -i $SshKey -o StrictHostKeyChecking=accept-new" `
        "$RemoteHost`:$RemotePath/" "$LocalPath/"
} else {
    & scp -i $SshKey -r "$RemoteHost`:$RemotePath/*" $LocalPath
}

Write-Host ">> Pull complete."
