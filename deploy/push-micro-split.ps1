# Very slow internet: 7 tiny uploads (~0.3–2 MB each). Same full code update as push-complete-slim.
#   cd deploy
#   .\push-micro-split.ps1
# If a part fails, re-run the script — finished parts are skipped until all parts uploaded.

$ErrorActionPreference = "Stop"
$HostIp = "13.140.189.223"
$User = "root"
$RemoteRoot = "/opt/aurum-gaming-platform"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
& node (Join-Path $ProjectRoot "scripts\merge-apilx-deploy-env.mjs") | Out-Null

$DeployKey = Join-Path $PSScriptRoot ".ssh\aurum_deploy_ed25519"
$ScpOpts = @("-o", "ServerAliveInterval=10", "-o", "ServerAliveCountMax=360", "-o", "TCPKeepAlive=yes", "-o", "Compression=yes")
$SshOpts = $ScpOpts
if (Test-Path $DeployKey) {
  $ScpOpts = @("-i", $DeployKey) + $ScpOpts
  $SshOpts = @("-i", $DeployKey) + $SshOpts
}
$MaxRetries = 20
$MarkerDir = Join-Path $env:TEMP "aurum-micro-parts"
New-Item -ItemType Directory -Path $MarkerDir -Force | Out-Null

function Invoke-ScpRetry {
  param([string]$LocalPath, [string]$RemoteDest, [string]$Label)
  for ($i = 1; $i -le $MaxRetries; $i++) {
    $mb = [math]::Round((Get-Item $LocalPath).Length / 1MB, 2)
    Write-Host "[$Label] $i/$MaxRetries (${mb} MB)..."
    & scp @ScpOpts $LocalPath "${User}@${HostIp}:$RemoteDest"
    if ($LASTEXITCODE -eq 0) { Write-Host "[$Label] OK"; return }
    Write-Host "Slow link — retry in 45s..." -ForegroundColor Yellow
    Start-Sleep -Seconds 45
  }
  throw "[$Label] failed"
}

function Make-Part {
  param([string]$Name, [string[]]$RelPaths)
  $out = Join-Path $env:TEMP "aurum-part-$Name.tar.gz"
  Push-Location $ProjectRoot
  try {
    $paths = @()
    foreach ($p in $RelPaths) {
      $full = Join-Path $ProjectRoot $p
      if (Test-Path $full) { $paths += $p.Replace('\', '/') }
    }
    if ($paths.Count -eq 0) { throw "No paths for $Name" }
    & tar -czf $out --exclude=node_modules --exclude=.next --exclude='**/test/**' @paths
    if ($LASTEXITCODE -ne 0) { throw "tar $Name" }
  } finally {
    Pop-Location
  }
  $mb = [math]::Round((Get-Item $out).Length / 1MB, 2)
  Write-Host "Part $Name packed: $mb MB"
  return @{ Path = $out; Name = $Name; Mb = $mb }
}

$parts = @(
  (Make-Part "01-deploy" @("deploy/docker-compose.yml", "deploy/Dockerfile", "deploy/api-entrypoint.sh", "deploy/Caddyfile")),
  (Make-Part "02-root" @("package.json", "package-lock.json", "tsconfig.json", "tsconfig.base.json", ".dockerignore")),
  (Make-Part "03-db" @("db")),
  (Make-Part "04-pkg-i18n" @("packages/i18n")),
  (Make-Part "05-pkg-core" @("packages/shared", "packages/money", "packages/ledger", "packages/db")),
  (Make-Part "06-api" @("apps/api/package.json", "apps/api/src", "apps/api/scripts")),
  (Make-Part "07-web" @("apps/web/package.json", "apps/web/next.config.mjs", "apps/web/postcss.config.mjs", "apps/web/tailwind.config.ts", "apps/web/tsconfig.json", "apps/web/src"))
)

$totalMb = ($parts | ForEach-Object { $_.Mb } | Measure-Object -Sum).Sum
Write-Host "Total upload (7 parts): $([math]::Round($totalMb, 2)) MB — no game images" -ForegroundColor Cyan

$n = 0
foreach ($part in $parts) {
  $n++
  $remote = "/tmp/aurum-part-$($part.Name).tar.gz"
  Invoke-ScpRetry -LocalPath $part.Path -RemoteDest $remote -Label $part.Name
}
Invoke-ScpRetry -LocalPath (Join-Path $ProjectRoot "deploy\.env") -RemoteDest "${RemoteRoot}/deploy/.env" -Label "env"

$RemoteScript = @'
set -e
cd __REMOTE_ROOT__
for f in 01-deploy 02-root 03-db 04-pkg-i18n 05-pkg-core 06-api 07-web; do
  [ -f "/tmp/aurum-part-$f.tar.gz" ] || (echo "MISSING_PART $f"; exit 2)
  tar -xzf "/tmp/aurum-part-$f.tar.gz"
  rm -f "/tmp/aurum-part-$f.tar.gz"
done
test -f apps/api/src/services/apilx-catalog.ts || exit 3
cd deploy
docker compose up -d --build --force-recreate migrate api web caddy
sleep 15
docker compose exec -T api npm run apilx:sync-catalog -w @aurum/api | tail -n 6
TOTAL=$(curl -sf 'http://127.0.0.1:4000/v1/public/games?limit=1' | sed -n 's/.*"total":\([0-9]*\).*/\1/p')
echo "PUBLIC_GAMES_TOTAL=${TOTAL:-0}"
echo MICRO_DEPLOY_DONE
'@ -replace '__REMOTE_ROOT__', $RemoteRoot
$RemoteScript = ($RemoteScript -replace "`r", "") + "`n"

Write-Host "Building on server (can take 5–10 min, no upload)..."
$RemoteScript | & ssh @SshOpts "${User}@${HostIp}" "bash -s"
Write-Host "https://hanibalgamer.fr/en/casino" -ForegroundColor Green
