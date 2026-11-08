# Start API then Web (two windows). Run from repo root:
#   powershell -ExecutionPolicy Bypass -File scripts\dev-start.ps1
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path "$root\.env")) {
  Write-Host "Missing .env in repo root (DATABASE_URL, APILX_*, etc.)" -ForegroundColor Red
  exit 1
}

Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "Set-Location '$root'; Write-Host '=== API (port 4000) ===' -ForegroundColor Green; npm run api:dev"
)

Start-Sleep -Seconds 4

Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "Set-Location '$root'; Write-Host '=== Web (port 3000) ===' -ForegroundColor Green; npm run web:dev"
)

Write-Host "Started api:dev + web:dev in new windows. Wait ~15s then open http://localhost:3000/en/casino" -ForegroundColor Cyan
Write-Host "Keep BOTH windows open — closing API makes provider games disappear on refresh." -ForegroundColor Yellow
