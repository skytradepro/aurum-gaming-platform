# Full code update for public server (~3–8 MB total, split uploads). All APILX + UI work.
# Skips only heavy game cover folders (LX uses provider image URLs; originals stay on server).
#   cd deploy
#   .\push-complete-slim.ps1

$ErrorActionPreference = "Stop"
$HostIp = "13.140.189.223"
$User = "root"
$RemoteRoot = "/opt/aurum-gaming-platform"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
& node (Join-Path $ProjectRoot "scripts\merge-apilx-deploy-env.mjs")
if ($LASTEXITCODE -ne 0) { throw "merge-apilx-deploy-env failed" }

$DeployKey = Join-Path $PSScriptRoot ".ssh\aurum_deploy_ed25519"
$ScpOpts = @("-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=240", "-o", "TCPKeepAlive=yes")
$SshOpts = $ScpOpts
if (Test-Path $DeployKey) {
  $ScpOpts = @("-i", $DeployKey) + $ScpOpts
  $SshOpts = @("-i", $DeployKey) + $SshOpts
}
$MaxRetries = 12

function Invoke-ScpRetry {
  param([string]$LocalPath, [string]$RemoteDest, [string]$Label)
  for ($i = 1; $i -le $MaxRetries; $i++) {
    $mb = [math]::Round((Get-Item $LocalPath).Length / 1MB, 2)
    Write-Host "[$Label] Upload $i/$MaxRetries (${mb} MB)..."
    & scp @ScpOpts $LocalPath "${User}@${HostIp}:$RemoteDest"
    if ($LASTEXITCODE -eq 0) { Write-Host "[$Label] 100% OK"; return }
    Write-Host "Retry in 30s..." -ForegroundColor Yellow
    Start-Sleep -Seconds 30
  }
  throw "[$Label] failed after $MaxRetries tries."
}

function New-SlimArchive {
  param([string]$Name, [string[]]$Paths)
  $out = Join-Path $env:TEMP ("aurum-$Name-" + [guid]::NewGuid().ToString("n").Substring(0, 6) + ".tar.gz")
  Push-Location $ProjectRoot
  try {
    $tarArgs = @(
      "-czf", $out,
      "--exclude=node_modules", "--exclude=.next", "--exclude=_backups", "--exclude=storage",
      "--exclude=apps/web/public/media/games/amigomonkeys",
      "--exclude=apps/web/public/media/games/wolves10k",
      "--exclude=apps/web/public/media/games"
    ) + $Paths
    & tar @tarArgs
    if ($LASTEXITCODE -ne 0) { throw "tar failed: $Name" }
  } finally {
    Pop-Location
  }
  $mb = [math]::Round((Get-Item $out).Length / 1MB, 2)
  Write-Host "Packed $Name -> $mb MB"
  return $out
}

Write-Host "Packing slim FULL code (no game media folders)..."

$coreArc = New-SlimArchive "core" @(
  "package.json", "package-lock.json", "tsconfig.json", "tsconfig.base.json", ".dockerignore",
  "packages", "db", "deploy", "scripts\merge-apilx-deploy-env.mjs"
)
$apiArc = New-SlimArchive "api" @("apps\api")
$webArc = New-SlimArchive "web" @("apps\web")

Invoke-ScpRetry -LocalPath $coreArc -RemoteDest "/tmp/aurum-core.tar.gz" -Label "core"
Invoke-ScpRetry -LocalPath $apiArc -RemoteDest "/tmp/aurum-api.tar.gz" -Label "api"
Invoke-ScpRetry -LocalPath $webArc -RemoteDest "/tmp/aurum-web.tar.gz" -Label "web"
Invoke-ScpRetry -LocalPath (Join-Path $ProjectRoot "deploy\.env") -RemoteDest "${RemoteRoot}/deploy/.env" -Label "env"

$RemoteScript = @'
set -e
cd __REMOTE_ROOT__
for f in core api web; do tar -xzf /tmp/aurum-$f.tar.gz; rm -f /tmp/aurum-$f.tar.gz; done
test -f apps/api/src/services/apilx-catalog.ts && echo VERIFY_APILX_OK || (echo VERIFY_APILX_FAIL; exit 1)
test -f apps/web/src/components/CasinoBrowser.tsx && echo VERIFY_CASINO_UI_OK || (echo VERIFY_CASINO_UI_FAIL; exit 1)
test -f db/migrations/0021_apilx_betwin.sql && echo VERIFY_0021_OK || echo VERIFY_0021_MISSING
test -f packages/i18n/messages/en.json && grep -q providerCatalog packages/i18n/messages/en.json && echo VERIFY_I18N_OK || echo VERIFY_I18N_MISSING
cd deploy
MIGRATION_BAD=0
docker compose exec -T db psql -U postgres -d aurum -At -c "select version||' '||checksum from schema_migrations order by version" 2>/dev/null > /tmp/aurum-applied.txt || true
if [ -s /tmp/aurum-applied.txt ]; then
  while read -r v c; do
    f=$(ls ../db/migrations/${v}_*.sql 2>/dev/null | head -n 1)
    [ -z "$f" ] && continue
    s=$(sed 's/\r$//' "$f" | sha256sum | cut -d' ' -f1)
    [ "$s" != "$c" ] && echo "MIGRATION_CHANGED $v" && MIGRATION_BAD=1
  done < /tmp/aurum-applied.txt
fi
if [ "$MIGRATION_BAD" != 0 ]; then echo STOPPED_DATABASE_CHECK; exit 3; fi
docker compose up -d --build --force-recreate migrate api web caddy || exit 3
sleep 12
docker compose exec -T api npm run apilx:sync-catalog -w @aurum/api 2>&1 | tail -n 8 || echo APILX_SYNC_FAILED
TOTAL=$(curl -sf 'http://127.0.0.1:4000/v1/public/games?limit=1' | sed -n 's/.*"total":\([0-9]*\).*/\1/p' | head -n1)
echo "PUBLIC_GAMES_TOTAL=${TOTAL:-0}"
echo DEPLOY_COMPLETE_SLIM_DONE
'@ -replace '__REMOTE_ROOT__', $RemoteRoot
$RemoteScript = ($RemoteScript -replace "`r", "") + "`nexit 0`n"

for ($i = 1; $i -le 5; $i++) {
  Write-Host "SSH build $i/5..."
  $RemoteScript | & ssh @SshOpts "${User}@${HostIp}" "bash -s"
  if ($LASTEXITCODE -eq 0) { break }
  if ($i -eq 5) { throw "SSH build failed" }
  Start-Sleep -Seconds 25
}

Write-Host ""
Write-Host "SUCCESS (full code, slim upload). Friend: https://hanibalgamer.fr/en/casino" -ForegroundColor Green
