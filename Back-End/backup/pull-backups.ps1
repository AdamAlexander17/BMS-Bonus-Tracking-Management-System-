# pull-backups.ps1 — Windows alternative for mirroring the server's backups.
# Schedule with Windows Task Scheduler. Requires OpenSSH client (built into Win10+).
param(
    [string]$RemoteHost = 'root@136.244.85.226',
    [string]$RemotePath = '/var/backups/bms',
    [string]$LocalPath,
    [string]$SshKey     = "$HOME\.ssh\bms_backup"
)

$ErrorActionPreference = 'Stop'

if (-not $LocalPath) { $LocalPath = Join-Path $PSScriptRoot '..\bms\backups' }
New-Item -ItemType Directory -Force $LocalPath | Out-Null
$LocalPath = (Resolve-Path -LiteralPath $LocalPath).Path

$LogFile = Join-Path $PSScriptRoot 'pull.log'
function Write-Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    $line | Tee-Object -FilePath $LogFile -Append | Out-Host
}

Write-Log "Mirroring ${RemoteHost}:${RemotePath} -> $LocalPath"

# Prefer rsync if available (Git Bash / WSL); else fall back to scp -r.
$rsync = Get-Command rsync -ErrorAction SilentlyContinue
try {
    if ($rsync) {
        $sshCmd = "ssh -i `"$SshKey`" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes"
        & rsync -avz --partial --append-verify -e $sshCmd `
            "${RemoteHost}:${RemotePath}/" "$LocalPath/"
        if ($LASTEXITCODE -ne 0) { throw "rsync exited $LASTEXITCODE" }
    } else {
        & scp -i $SshKey -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes `
            -r "${RemoteHost}:${RemotePath}/*" "$LocalPath/"
        if ($LASTEXITCODE -ne 0) { throw "scp exited $LASTEXITCODE" }
    }
    Write-Log "Pull complete"
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}
