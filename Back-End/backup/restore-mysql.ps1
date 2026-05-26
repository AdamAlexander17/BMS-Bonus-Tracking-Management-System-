# restore-mysql.ps1 - Restore a MySQL dump created by backup-mysql.ps1.
# Usage:
#   .\restore-mysql.ps1 -Archive ..\bms\backups\daily\bms_2026-05-26T10-00-00.sql.gz
#   .\restore-mysql.ps1 -Archive <db.sql.gz> -MediaArchive <media.zip>

param(
    [Parameter(Mandatory=$true)][string]$Archive,
    [string]$MediaArchive,
    [string]$DbName     = 'bms_db',
    [string]$DbUser     = 'root',
    [string]$DbPassword = 'root',
    [string]$DbHost     = 'localhost',
    [int]$DbPort        = 3306,
    [string]$MediaDir
)

$ErrorActionPreference = 'Stop'

if (-not $MediaDir) { $MediaDir = Join-Path $PSScriptRoot '..\bms\media' }
$Archive = (Resolve-Path -LiteralPath $Archive).Path

Write-Host ">> This will DROP and recreate database '$DbName' on $DbHost"
Write-Host "   from $Archive"
$ans = Read-Host "Type RESTORE to confirm"
if ($ans -cne 'RESTORE') { Write-Host "Aborted."; exit 1 }

$mysql = (Get-Command mysql -ErrorAction Stop).Source

# ---------- 1. Decompress to temp .sql ----------
$tmpSql    = Join-Path $env:TEMP "bms_restore_$([Guid]::NewGuid()).sql"
$inStream  = [System.IO.File]::OpenRead($Archive)
$gzip      = New-Object System.IO.Compression.GzipStream($inStream, [System.IO.Compression.CompressionMode]::Decompress)
$outStream = [System.IO.File]::Create($tmpSql)
$gzip.CopyTo($outStream)
$outStream.Close(); $gzip.Close(); $inStream.Close()
Write-Host ">> Decompressed to $tmpSql ($('{0:N1} KB' -f ((Get-Item $tmpSql).Length / 1KB)))"

$env:MYSQL_PWD = $DbPassword
try {
    # ---------- 2. Drop & recreate DB (pipe SQL via stdin to avoid PS backtick escaping) ----------
    $sql = "DROP DATABASE IF EXISTS ``$DbName``; CREATE DATABASE ``$DbName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    $sql | & $mysql --host=$DbHost --port=$DbPort --user=$DbUser
    if ($LASTEXITCODE -ne 0) { throw "Failed to drop/create $DbName" }
    Write-Host ">> Database $DbName recreated."

    # ---------- 3. Import dump ----------
    # The dump uses --databases so it includes USE statements; pipe via cmd to avoid PS redirection quirks
    cmd /c "`"$mysql`" --host=$DbHost --port=$DbPort --user=$DbUser < `"$tmpSql`""
    if ($LASTEXITCODE -ne 0) { throw "mysql import failed (code $LASTEXITCODE)" }
    Write-Host ">> Dump imported."
} finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
    Remove-Item $tmpSql -ErrorAction SilentlyContinue
}

# ---------- 4. Media (optional) ----------
if ($MediaArchive) {
    $MediaArchive = (Resolve-Path -LiteralPath $MediaArchive).Path
    if (Test-Path $MediaDir) { Remove-Item $MediaDir -Recurse -Force }
    New-Item -ItemType Directory -Force $MediaDir | Out-Null
    Expand-Archive -Path $MediaArchive -DestinationPath $MediaDir -Force
    Write-Host ">> Media restored to $MediaDir"
}

Write-Host ""
Write-Host "Restore complete. Run 'python manage.py migrate' if schema is newer, then restart Django."
