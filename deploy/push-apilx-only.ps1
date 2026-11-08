# Tiny upload (~1–3 MB): API LX + casino UI only. Prefer push-complete-slim.ps1 for ALL code.
#   cd deploy
#   .\push-apilx-only.ps1

$ErrorActionPreference = "Stop"
$HostIp = "13.140.189.223"
$User = "root"
$RemoteRoot = "/opt/aurum-gaming-platform"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
& node (Join-Path $ProjectRoot "scripts\merge-apilx-deploy-env.mjs")
if ($LASTEXITCODE -ne 0) { throw "merge-apilx-deploy-env failed" }

$Staging = Join-Path $env:TEMP "aurum-apilx-staging"
$Archive = Join-Path $env:TEMP ("aurum-apilx-" + [guid]::NewGuid().ToString("n").Substring(0, 8) + ".tar.gz")
$DeployKey = Join-Path $PSScriptRoot ".ssh\aurum_deploy_ed25519"
$ScpOpts = @("-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=240", "-o", "TCPKeepAlive=yes", "-o", "IPQoS=throughput")
$SshOpts = $ScpOpts
if (Test-Path $DeployKey) {
  $ScpOpts = @("-i", $DeployKey) + $ScpOpts
  $SshOpts = @("-i", $DeployKey) + $SshOpts
}
$MaxRetries = 12

function Invoke-ScpRetry {
  param([string]$LocalPath, [string]$RemoteDest, [string]$Label)
  for ($i = 1; $i -le $MaxRetries; $i++) {
    Write-Host "[$Label] Upload $i/$MaxRetries ($([math]::Round((Get-Item $LocalPath).Length / 1MB, 2)) MB)..."
    & scp @ScpOpts $LocalPath "${User}@${HostIp}:$RemoteDest"
    if ($LASTEXITCODE -eq 0) { Write-Host "[$Label] 100% OK"; return }
    Write-Host "Retry in 30s..." -ForegroundColor Yellow
    Start-Sleep -Seconds 30
  }
  throw "[$Label] failed after $MaxRetries tries."
}

function Robo-Mirror {
  param([string]$RelativePath)
  $src = Join-Path $ProjectRoot $RelativePath
  $dst = Join-Path $Staging $RelativePath
  if (-not (Test-Path $src)) { throw "Missing: $src" }
  New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force | Out-Null
  & robocopy $src $dst /E /XD node_modules .next /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed: $RelativePath" }
}

Write-Host "Building APILX-only bundle (no media)..."
if (Test-Path $Staging) { Remove-Item $Staging -Recurse -Force }
New-Item -ItemType Directory -Path $Staging | Out-Null

Robo-Mirror "packages"
Robo-Mirror "db"
Robo-Mirror "apps\api\src"
Robo-Mirror "apps\api\scripts"
New-Item -ItemType Directory -Path "$Staging\apps\api" -Force | Out-Null
Copy-Item (Join-Path $ProjectRoot "apps\api\package.json") "$Staging\apps\api\" -Force
Robo-Mirror "apps\web\src"
New-Item -ItemType Directory -Path "$Staging\apps\web" -Force | Out-Null
foreach ($f in @("package.json", "next.config.mjs", "postcss.config.mjs", "tailwind.config.ts", "tsconfig.json")) {
  $p = Join-Path $ProjectRoot "apps\web\$f"
  if (Test-Path $p) { Copy-Item $p "$Staging\apps\web\" -Force }
}
Copy-Item (Join-Path $ProjectRoot "package.json") "$Staging\" -Force
Copy-Item (Join-Path $ProjectRoot "package-lock.json") "$Staging\" -Force
Copy-Item (Join-Path $ProjectRoot "tsconfig.json") "$Staging\" -Force
Copy-Item (Join-Path $ProjectRoot "tsconfig.base.json") "$Staging\" -Force
Copy-Item (Join-Path $ProjectRoot ".dockerignore") "$Staging\" -Force
Copy-Item (Join-Path $ProjectRoot "deploy\Caddyfile") "$Staging\deploy\" -Force
New-Item -ItemType Directory -Path "$Staging\deploy" -Force | Out-Null
Copy-Item (Join-Path $ProjectRoot "deploy\docker-compose.yml") "$Staging\deploy\" -Force
Copy-Item (Join-Path $ProjectRoot "deploy\api-entrypoint.sh") "$Staging\deploy\" -Force
Copy-Item (Join-Path $ProjectRoot "deploy\Dockerfile") "$Staging\deploy\" -Force

Push-Location $Staging
try {
  & tar -czf $Archive .
} finally {
  Pop-Location
}
$mb = [math]::Round((Get-Item $Archive).Length / 1MB, 2)
Write-Host "Archive size: $mb MB"

Invoke-ScpRetry -LocalPath $Archive -RemoteDest "/tmp/aurum-apilx.tar.gz" -Label "apilx"
$DeployEnv = Join-Path $ProjectRoot "deploy\.env"
Invoke-ScpRetry -LocalPath $DeployEnv -RemoteDest "${RemoteRoot}/deploy/.env" -Label "env"

$RemoteScript = @'
set -e
cd __REMOTE_ROOT__
tar -xzf /tmp/aurum-apilx.tar.gz
rm -f /tmp/aurum-apilx.tar.gz
test -f apps/api/src/services/apilx-catalog.ts && echo VERIFY_APILX_OK || (echo VERIFY_APILX_FAIL; exit 1)
test -f db/migrations/0021_apilx_betwin.sql && echo VERIFY_MIGRATION_0021_OK || echo VERIFY_MIGRATION_0021_MISSING
cd deploy
docker compose up -d --build --force-recreate migrate api web caddy || exit 3
sleep 10
docker compose exec -T api npm run apilx:sync-catalog -w @aurum/api 2>&1 | tail -n 6 || echo APILX_SYNC_FAILED
TOTAL=$(curl -sf 'http://127.0.0.1:4000/v1/public/games?limit=1' | sed -n 's/.*"total":\([0-9]*\).*/\1/p' | head -n1)
echo "PUBLIC_GAMES_TOTAL=${TOTAL:-0}"
echo DEPLOY_APILX_DONE
'@ -replace '__REMOTE_ROOT__', $RemoteRoot
$RemoteScript = ($RemoteScript -replace "`r", "") + "`nexit 0`n"

for ($i = 1; $i -le 5; $i++) {
  Write-Host "SSH build $i/5..."
  $RemoteScript | & ssh @SshOpts "${User}@${HostIp}" "bash -s"
  if ($LASTEXITCODE -eq 0) { break }
  if ($i -eq 5) { throw "SSH build failed" }
  Start-Sleep -Seconds 20
}

Write-Host "Done. Friend: https://hanibalgamer.fr/en/casino (Ctrl+F5)" -ForegroundColor Green
