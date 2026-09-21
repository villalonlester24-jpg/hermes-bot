param(
  [switch]$IncludeEnv
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$zip = Join-Path $root "hermes-panel.zip"

if (Test-Path $zip) { Remove-Item $zip -Force }

$items = @(
  (Join-Path $root "src"),
  (Join-Path $root "package.json"),
  (Join-Path $root "package-lock.json")
)

if ($IncludeEnv) {
  $envFile = Join-Path $root ".env"
  if (-not (Test-Path $envFile)) { throw ".env not found at $envFile" }
  $items += $envFile
}

Compress-Archive -Path $items -DestinationPath $zip -Force

Write-Host "Created: $zip" -ForegroundColor Green
if (-not $IncludeEnv) {
  Write-Host "Note: .env was NOT included (use the panel's environment variables, or re-run with -IncludeEnv)." -ForegroundColor Yellow
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
Write-Host "Contents:"
[System.IO.Compression.ZipFile]::OpenRead($zip).Entries | ForEach-Object { Write-Host ("  " + $_.FullName) }
