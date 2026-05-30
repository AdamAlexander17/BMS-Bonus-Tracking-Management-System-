# install-automation.ps1
# Registers two Windows Scheduled Tasks so the entire backup + mirror-restore
# pipeline runs unattended every day:
#
#   1. BMS-Daily-Backup           - 10:00 AM  -> backup-mysql.ps1
#   2. BMS-Daily-Mirror-Restore   - 10:15 AM  -> auto-restore-mirror.ps1
#
# Re-running this script safely overwrites the existing tasks.
#
# REQUIRES: an elevated PowerShell (Run as Administrator).
#
# Usage:
#   .\install-automation.ps1
#   .\install-automation.ps1 -BackupTime 02:00 -RestoreTime 02:15
#   .\install-automation.ps1 -Uninstall

param(
    [string]$PullTime    = '10:30',
    [string]$RestoreTime = '10:45',
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

# Must run elevated to register tasks under the current user
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$pr = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Please run this script in an ELEVATED PowerShell (Run as Administrator)."
}

$PullScript    = Join-Path $PSScriptRoot 'pull-backups.ps1'
$RestoreScript = Join-Path $PSScriptRoot 'auto-restore-mirror.ps1'

# Also clean up old local-only task name if it exists from a previous install
$legacyTask = 'BMS-Daily-Backup'
if (Get-ScheduledTask -TaskName $legacyTask -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $legacyTask -Confirm:$false
    Write-Host "Removed legacy task: $legacyTask"
}

$tasks = @(
    @{ Name = 'BMS-Pull-Backups';          Script = $PullScript;    Time = $PullTime    },
    @{ Name = 'BMS-Daily-Mirror-Restore';  Script = $RestoreScript; Time = $RestoreTime }
)

if ($Uninstall) {
    foreach ($t in $tasks) {
        if (Get-ScheduledTask -TaskName $t.Name -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $t.Name -Confirm:$false
            Write-Host "Removed task: $($t.Name)"
        }
    }
    return
}

foreach ($t in $tasks) {
    if (-not (Test-Path $t.Script)) { throw "Script not found: $($t.Script)" }

    $action    = New-ScheduledTaskAction -Execute 'powershell.exe' `
                    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$($t.Script)`""
    $trigger   = New-ScheduledTaskTrigger -Daily -At $t.Time
    $settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
                    -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
    $principal = New-ScheduledTaskPrincipal -UserId $id.Name -LogonType S4U -RunLevel Highest

    if (Get-ScheduledTask -TaskName $t.Name -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $t.Name -Confirm:$false
    }

    Register-ScheduledTask -TaskName $t.Name -Action $action -Trigger $trigger `
        -Settings $settings -Principal $principal `
        -Description "BMS automated $($t.Name)" | Out-Null

    Write-Host "Registered: $($t.Name)  (daily at $($t.Time))"
}

Write-Host ""
Write-Host "Done. Inspect tasks with:  Get-ScheduledTask -TaskName 'BMS-*'"
Write-Host "Run on demand with:        Start-ScheduledTask -TaskName 'BMS-Daily-Backup'"
