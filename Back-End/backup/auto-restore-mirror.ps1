# auto-restore-mirror.ps1
# Non-interactive restore of the LATEST daily backup into a SEPARATE mirror
# database (default: bms_mirror). Designed for unattended scheduled execution.
#
# Safety guarantees:
#   * Never touches your working DB (bms_db). It only writes to $MirrorDb.
#   * Verifies SHA-256 checksum (checksums_<ts>.sha256) before restoring.
#   * Verifies gzip integrity by streaming a decompress pass.
#   * If the latest archive fails any check, the script aborts WITHOUT
#     dropping the mirror DB, so the previous good mirror is preserved.
#   * Keeps a rolling log at backup\restore-mirror.log.
#
# Usage:
#   .\auto-restore-mirror.ps1
#   .\auto-restore-mirror.ps1 -MirrorDb bms_mirror -DbUser root -DbPassword root

param(
    [string]$BackupRoot,
    [string]$MirrorDb   = 'bms_mirror',
    [string]$DbUser     = 'root',
    [string]$DbPassword = 'root',
    [string]$DbHost     = 'localhost',
    [int]$DbPort        = 3306
)

$ErrorActionPreference = 'Stop'

if (-not $BackupRoot) { $BackupRoot = Join-Path $PSScriptRoot '..\bms\backups' }
$DailyDir = Join-Path $BackupRoot 'daily'
$LogFile  = Join-Path $PSScriptRoot 'restore-mirror.log'

function Write-Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    $line | Tee-Object -FilePath $LogFile -Append | Out-Host
}

try {
    if (-not (Test-Path $DailyDir)) { throw "Daily backup dir not found: $DailyDir" }

    # ---------- 1. Pick latest daily archive by timestamp in filename ----------
    $stampRegex = '_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.sql\.gz$'
    $candidates = Get-ChildItem $DailyDir -Filter '*.sql.gz' | ForEach-Object {
        if ($_.Name -match $stampRegex) {
            [PSCustomObject]@{ File = $_; Stamp = $Matches[1] }
        }
    }
    if (-not $candidates) { throw "No backup archives matching expected pattern in $DailyDir" }

    $pick   = $candidates | Sort-Object Stamp -Descending | Select-Object -First 1
    $latest = $pick.File
    $stamp  = $pick.Stamp
    Write-Log "Latest archive: $($latest.Name) (stamp $stamp)"

    # ---------- 2. Verify SHA-256 checksum ----------
    $checksumFile = Join-Path $DailyDir "checksums_${stamp}.sha256"
    if (-not (Test-Path $checksumFile)) { throw "Missing checksum file: $checksumFile" }

    $expected = (Get-Content $checksumFile | Where-Object { $_ -match [regex]::Escape($latest.Name) }) -split '\s+' | Select-Object -First 1
    if (-not $expected) { throw "Archive not listed in checksum file" }

    $actual = (Get-FileHash $latest.FullName -Algorithm SHA256).Hash.ToLower()
    if ($actual -ne $expected.ToLower()) {
        throw "Checksum MISMATCH for $($latest.Name). expected=$expected actual=$actual"
    }
    Write-Log "Checksum OK ($actual)"

    # ---------- 3. Verify gzip integrity (full decompress to /dev/null) ----------
    $inStream = [System.IO.File]::OpenRead($latest.FullName)
    $gzip     = New-Object System.IO.Compression.GzipStream($inStream, [System.IO.Compression.CompressionMode]::Decompress)
    $buf      = New-Object byte[] 65536
    $total    = 0L
    while (($read = $gzip.Read($buf, 0, $buf.Length)) -gt 0) { $total += $read }
    $gzip.Close(); $inStream.Close()
    if ($total -lt 1024) { throw "Decompressed dump suspiciously small ($total bytes)" }
    Write-Log "Gzip integrity OK (decompressed $total bytes)"

    # ---------- 4. Decompress to temp .sql ----------
    $tmpSql    = Join-Path $env:TEMP "bms_mirror_${stamp}.sql"
    $inStream  = [System.IO.File]::OpenRead($latest.FullName)
    $gzip      = New-Object System.IO.Compression.GzipStream($inStream, [System.IO.Compression.CompressionMode]::Decompress)
    $outStream = [System.IO.File]::Create($tmpSql)
    $gzip.CopyTo($outStream)
    $outStream.Close(); $gzip.Close(); $inStream.Close()
    Write-Log "Decompressed to $tmpSql"

    # ---------- 5. Drop & recreate MIRROR DB, then import ----------
    # The dump was produced with --databases, so it contains `USE <original_db>;`.
    # We rewrite that to point at the mirror DB so the import lands in $MirrorDb.
    $sqlText = Get-Content $tmpSql -Raw
    $sqlText = [regex]::Replace($sqlText, '(?im)^\s*CREATE\s+DATABASE[^;]+;', '')
    $sqlText = [regex]::Replace($sqlText, '(?im)^\s*USE\s+`[^`]+`;', "USE ``$MirrorDb``;")
    Set-Content -Path $tmpSql -Value $sqlText -Encoding UTF8

    $mysql = (Get-Command mysql -ErrorAction Stop).Source
    $env:MYSQL_PWD = $DbPassword
    try {
        $ddl = "DROP DATABASE IF EXISTS ``$MirrorDb``; CREATE DATABASE ``$MirrorDb`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        $ddl | & $mysql --host=$DbHost --port=$DbPort --user=$DbUser
        if ($LASTEXITCODE -ne 0) { throw "Failed to drop/create $MirrorDb" }
        Write-Log "Mirror DB $MirrorDb recreated"

        cmd /c "`"$mysql`" --host=$DbHost --port=$DbPort --user=$DbUser $MirrorDb < `"$tmpSql`""
        if ($LASTEXITCODE -ne 0) { throw "mysql import failed (code $LASTEXITCODE)" }
        Write-Log "Import OK into $MirrorDb"
    } finally {
        Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
        Remove-Item $tmpSql -ErrorAction SilentlyContinue
    }

    Write-Log "-- Mirror restore $stamp OK --"
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}
