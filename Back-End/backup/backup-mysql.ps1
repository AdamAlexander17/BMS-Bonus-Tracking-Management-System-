# backup-mysql.ps1 - Windows MySQL backup matching backup.sh production logic.
# Default daily / Sunday weekly / 1st-of-month monthly rotation.
#
# Usage:
#   .\backup-mysql.ps1
#   .\backup-mysql.ps1 -DbName bms_db -DbUser root -DbPassword root
#
# Schedule via Task Scheduler (10 AM daily):
#   schtasks /Create /SC DAILY /ST 10:00 /TN BMS-Daily-Backup /TR `
#     "powershell -ExecutionPolicy Bypass -File C:\path\to\backup-mysql.ps1"

param(
    [string]$DbName     = 'bms_db',
    [string]$DbUser     = 'root',
    [string]$DbPassword = 'root',
    [string]$DbHost     = 'localhost',
    [int]$DbPort        = 3306,
    [string]$BackupRoot,
    [string]$MediaDir,
    [int]$RetainDaily   = 7,
    [int]$RetainWeekly  = 4,
    [int]$RetainMonthly = 12
)

$ErrorActionPreference = 'Stop'

if (-not $BackupRoot) { $BackupRoot = Join-Path $PSScriptRoot '..\bms\backups' }
if (-not $MediaDir)   { $MediaDir   = Join-Path $PSScriptRoot '..\bms\media' }

$LogFile = Join-Path $PSScriptRoot 'backup.log'

function Write-Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    $line | Tee-Object -FilePath $LogFile -Append | Out-Host
}

# ---------- Tier (daily / weekly / monthly) ----------
$now = Get-Date
$tier =
    if ($now.Day -eq 1)                  { 'monthly' }
    elseif ($now.DayOfWeek -eq 'Sunday') { 'weekly'  }
    else                                  { 'daily'   }

$ts   = $now.ToString('yyyy-MM-ddTHH-mm-ss')
$dest = Join-Path $BackupRoot $tier
New-Item -ItemType Directory -Force $dest | Out-Null

$dbArchive    = Join-Path $dest "bms_${ts}.sql.gz"
$mediaArchive = Join-Path $dest "media_${ts}.zip"

Write-Log "-- Starting $tier backup ($ts) --"

# ---------- 1. mysqldump -> temp .sql ----------
$mysqldump = (Get-Command mysqldump -ErrorAction Stop).Source
$tmpSql    = Join-Path $env:TEMP "bms_${ts}.sql"

# Pass password via env var to avoid 'insecure' warning on stderr
$env:MYSQL_PWD = $DbPassword
try {
    & $mysqldump `
        --host=$DbHost --port=$DbPort --user=$DbUser `
        --single-transaction --routines --triggers --events `
        --default-character-set=utf8mb4 `
        --databases $DbName `
        --result-file=$tmpSql
    if ($LASTEXITCODE -ne 0) { throw "mysqldump exited with code $LASTEXITCODE" }
} finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
}
Write-Log "Dumped $DbName to temp file ($('{0:N1} KB' -f ((Get-Item $tmpSql).Length / 1KB)))"

# ---------- 2. Gzip via .NET ----------
$inStream  = [System.IO.File]::OpenRead($tmpSql)
$outStream = [System.IO.File]::Create($dbArchive)
$gzip      = New-Object System.IO.Compression.GzipStream($outStream, [System.IO.Compression.CompressionLevel]::Optimal)
$inStream.CopyTo($gzip)
$gzip.Close(); $outStream.Close(); $inStream.Close()
Remove-Item $tmpSql

$dbSize = '{0:N1} KB' -f ((Get-Item $dbArchive).Length / 1KB)
Write-Log "DB archive: $dbArchive ($dbSize)"

# ---------- 3. Media (optional) ----------
if (Test-Path $MediaDir) {
    Compress-Archive -Path "$MediaDir\*" -DestinationPath $mediaArchive -Force
    $medSize = '{0:N1} KB' -f ((Get-Item $mediaArchive).Length / 1KB)
    Write-Log "Media archive: $mediaArchive ($medSize)"
} else {
    Write-Log "Media dir $MediaDir not found - skipping."
}

# ---------- 4. SHA-256 checksums ----------
$checksumFile = Join-Path $dest "checksums_${ts}.sha256"
Get-ChildItem $dest -Filter "*_${ts}.*" | ForEach-Object {
    "{0}  {1}" -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $_.Name
} | Set-Content -Encoding ASCII $checksumFile
Write-Log "Checksums: $checksumFile"

# ---------- 5. GFS retention pruning ----------
$tiers = @{ daily = $RetainDaily; weekly = $RetainWeekly; monthly = $RetainMonthly }
foreach ($t in $tiers.Keys) {
    $tDir = Join-Path $BackupRoot $t
    if (-not (Test-Path $tDir)) { continue }
    $stamps = Get-ChildItem $tDir -Filter 'bms_*.sql.gz' |
              Sort-Object LastWriteTime -Descending |
              Select-Object -Skip $tiers[$t]
    foreach ($old in $stamps) {
        $stamp = ($old.BaseName -replace '^bms_','') -replace '\.sql$',''
        Get-ChildItem $tDir -Filter "*_${stamp}.*" | Remove-Item -Force
        Write-Log "Rotated out ${t}: $stamp"
    }
}

Write-Log "-- Backup $ts OK --"
Write-Host ""
Write-Host "Backup ready under: $dest"
Write-Host ""
