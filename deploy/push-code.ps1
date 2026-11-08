# Code-only upload (smallest, for slow internet): code, translations and database files only.
# Pictures, game images, banners and the football cache are NOT sent: the server already has them.
# Only new pictures listed in $NewMedia are sent.
#   cd C:\Users\PC\Desktop\aurum-gaming-platform\deploy
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   .\push-code.ps1

$ErrorActionPreference = "Stop"
$HostIp = "13.140.189.223"
$User = "root"
$RemoteRoot = "/opt/aurum-gaming-platform"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Staging = Join-Path $env:TEMP "aurum-code-staging"
$Archive = Join-Path $env:TEMP "aurum-code.tar.gz"
$ScpOpts = @("-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=120", "-o", "TCPKeepAlive=yes")
$SshOpts = $ScpOpts
$MaxRetries = 8
$GameIds = @("cherryparty", "luckybell", "powerhot", "goldencoins", "extracrown", "hannibal", "amigomonkeys", "wolves10k", "rush10kx", "nights10001", "superhot100", "supericy100", "wonders10k", "olympus1000", "winning10kn", "moongirls1000", "rush1000x", "artofgold100", "reelfish100", "winning1kn", "burningbrilliants", "dragonpearls15", "spins1001", "geniefortune1001", "burninghotbb", "artofgolddice", "goldencoinsdice", "sugarhannibal", "glossy10", "jester10", "wild2", "fruitata30", "ways2", "kings2", "mafia", "hunter3021", "crazytime", "thunderroulette", "chilliheat", "ultimatestriker", "bigbass")

function Invoke-ScpRetry {
  param([string]$LocalPath, [string]$RemoteDest, [string]$Label)
  for ($i = 1; $i -le $MaxRetries; $i++) {
    Write-Host "[$Label] Upload $i/$MaxRetries..."
    & scp @ScpOpts $LocalPath "${User}@${HostIp}:$RemoteDest"
    if ($LASTEXITCODE -eq 0) { Write-Host "[$Label] 100% OK"; return }
    Write-Host "Retry in 15s..." -ForegroundColor Yellow
    Start-Sleep -Seconds 15
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

Write-Host "Building CODE-ONLY bundle (no pictures)..."
if (Test-Path $Staging) { Remove-Item $Staging -Recurse -Force }
New-Item -ItemType Directory -Path $Staging | Out-Null

Robo-Mirror "packages"
Robo-Mirror "db"
New-Item -ItemType Directory -Path "$Staging\deploy" -Force | Out-Null
Copy-Item (Join-Path $ProjectRoot "deploy\docker-compose.yml") "$Staging\deploy\" -Force
Copy-Item (Join-Path $ProjectRoot "deploy\api-entrypoint.sh") "$Staging\deploy\" -Force
Copy-Item (Join-Path $ProjectRoot ".dockerignore") "$Staging\" -Force
Robo-Mirror "apps\api\src"
New-Item -ItemType Directory -Path "$Staging\apps\api" -Force | Out-Null
Copy-Item (Join-Path $ProjectRoot "apps\api\package.json") "$Staging\apps\api\" -Force

Robo-Mirror "apps\web\src"
New-Item -ItemType Directory -Path "$Staging\apps\web" -Force | Out-Null
foreach ($f in @("package.json", "next.config.mjs", "postcss.config.mjs", "tailwind.config.ts", "tsconfig.json")) {
  $p = Join-Path $ProjectRoot "apps\web\$f"
  if (Test-Path $p) { Copy-Item $p "$Staging\apps\web\" -Force }
}

# New pictures only (everything else is already on the server)
$NewMedia = @('apps\web\public\media\games\table-blackjack.jpg')
foreach ($rel in $NewMedia) {
  $p = Join-Path $ProjectRoot $rel
  if (-not (Test-Path $p)) { throw "Missing new picture: $p" }
  $dst = Join-Path $Staging $rel
  New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force | Out-Null
  Copy-Item $p $dst -Force
}

if (Test-Path $Archive) { Remove-Item $Archive -Force }
Push-Location $Staging
try {
  & tar -czf $Archive .
} finally {
  Pop-Location
}

$mb = [math]::Round((Get-Item $Archive).Length / 1MB, 2)
Write-Host "Archive size: $mb MB (must reach 100% on upload)"
Write-Host ""

Invoke-ScpRetry -LocalPath $Archive -RemoteDest "/tmp/aurum-code.tar.gz" -Label "code"

# Bash script only — must not use PowerShell double-quoted strings (breaks on $(...) and /dev/null).
$RemoteScript = @'
set -e
cd __REMOTE_ROOT__
tar -xzf /tmp/aurum-code.tar.gz
rm -f /tmp/aurum-code.tar.gz
test -f apps/web/src/app/[locale]/casino/cherryparty/page.tsx && echo VERIFY_GAMES_OK || (echo VERIFY_GAMES_FAIL; exit 1)
test -f apps/web/src/app/[locale]/casino/[gameId]/page.tsx && echo VERIFY_BATCH21_ROUTE_OK || echo VERIFY_BATCH21_ROUTE_MISSING
test -f apps/web/public/media/games/superhot100-cover.jpg && echo VERIFY_BATCH21_COVER_OK || echo VERIFY_BATCH21_COVER_MISSING
test -f apps/web/public/media/games/hannibal-cover.jpg && echo VERIFY_TRIUMPH_COVER_OK || echo VERIFY_TRIUMPH_COVER_MISSING
test -f apps/web/public/media/games/hannibal/A.svg && test -f apps/web/public/media/games/hannibal/lion.svg && echo VERIFY_TRIUMPH_SYMBOLS_OK || echo VERIFY_TRIUMPH_SYMBOLS_FAIL
test -f apps/web/public/media/games/bigbass/underwater.svg && test -f apps/web/public/media/games/bigbass/fish.svg && test -f apps/web/public/media/games/bigbass-cover.jpg && echo VERIFY_BIGBASS_OK || echo VERIFY_BIGBASS_FAIL
test -f apps/web/public/media/games/crazytime/wheel.jpg && test -f apps/web/public/media/games/crazytime-cover.jpg && echo VERIFY_CRAZYTIME_OK || echo VERIFY_CRAZYTIME_FAIL
test -f apps/web/public/media/games/thunderroulette-cover.jpg && echo VERIFY_THUNDERROULETTE_OK || echo VERIFY_THUNDERROULETTE_FAIL
test -f apps/web/public/media/games/table-roulette.jpg && echo VERIFY_TABLE_ROULETTE_COVER_OK || echo VERIFY_TABLE_ROULETTE_COVER_MISSING
test -f apps/web/public/media/games/table-blackjack.jpg && echo VERIFY_BLACKJACK_COVER_OK || echo VERIFY_BLACKJACK_COVER_MISSING
test -f db/migrations/0013_withdrawal_approvals.sql && test -f db/migrations/0014_simple_registration.sql && echo VERIFY_MIGRATION_FILES_OK || (echo VERIFY_MIGRATION_FILES_MISSING; exit 3)
cd deploy
# Safety: every migration already applied on the server must be unchanged, otherwise stop before restarting anything.
docker compose exec -T db psql -U postgres -d aurum -At -c "select version||' '||checksum from schema_migrations order by version" < /dev/null > /tmp/aurum-applied.txt
MIGRATION_BAD=0
while read -r v c; do
  f=$(ls ../db/migrations/${v}_*.sql 2>/dev/null | head -n 1)
  if [ -z "$f" ]; then echo "MIGRATION_FILE_MISSING $v"; MIGRATION_BAD=1; continue; fi
  s=$(sed 's/\r$//' "$f" | sha256sum | cut -d' ' -f1)
  if [ "$s" != "$c" ]; then echo "MIGRATION_CHANGED $v"; MIGRATION_BAD=1; fi
done < /tmp/aurum-applied.txt
if [ "$MIGRATION_BAD" != 0 ]; then echo "STOPPED_DATABASE_CHECK: nothing was restarted"; exit 3; fi
# Football with the Ultra plan: fresher live data and more matches with prices (only these two lines of .env change).
for kv in FOOTBALL_LIVE_CACHE_SECONDS=20 FOOTBALL_ODDS_MAX_PAGES=30; do k=${kv%%=*}; if [ -f .env ] && grep -q "^$k=" .env; then sed -i "s/^$k=.*/$kv/" .env; echo "SET_$kv"; fi; done
echo "VERIFY_DATABASE_OK ($(wc -l < /tmp/aurum-applied.txt) migrations already on server)"
docker compose up -d --build --force-recreate migrate api web caddy || { echo "BUILD_OR_START_FAILED: see the error above"; exit 3; }
sleep 8
docker compose logs --no-log-prefix migrate | tail -n 4
curl -sf 'http://127.0.0.1:4000/v1/public/football/fixtures?date=2026-10-30' | head -c 120 || echo FOOTBALL_API_CHECK_FAILED
echo DEPLOY_DONE
'@ -replace '__REMOTE_ROOT__', $RemoteRoot
# The file uses Windows line ends (CRLF): bash needs plain LF, and "exit 0" stops it before the line end PowerShell adds.
$RemoteScript = ($RemoteScript -replace "`r", "") + "`nexit 0`n"

for ($i = 1; $i -le $MaxRetries; $i++) {
  Write-Host "SSH + build $i/$MaxRetries (password if asked)..."
  $RemoteScript | & ssh @SshOpts "${User}@${HostIp}" "bash -s"
  if ($LASTEXITCODE -eq 0) { break }
  if ($LASTEXITCODE -eq 3) { throw "Stopped: see the server lines above (database check or build error). No retry." }
  if ($i -eq $MaxRetries) { throw "SSH/build failed." }
  Start-Sleep -Seconds 15
}

Write-Host ""
Write-Host "SUCCESS. Check server lines above for VERIFY_* and football JSON." -ForegroundColor Green
Write-Host "Browser Ctrl+F5:"
Write-Host "  https://hanibalgamer.fr/en/sports"
Write-Host "  https://hanibalgamer.fr/en (Triumph tile)"
Write-Host "  https://hanibalgamer.fr/fr/casino/cherryparty"
Write-Host "  https://hanibalgamer.fr/fr/casino/superhot100"
Write-Host "  https://hanibalgamer.fr/en/casino/bigbass (Ctrl+F5)"
Write-Host "  https://hanibalgamer.fr/en/casino/thunderroulette (Ctrl+F5)"
Write-Host "  https://hanibalgamer.fr/en/casino/blackjack (Ctrl+F5)"
Write-Host "  https://hanibalgamer.fr/en/live-casino (Ctrl+F5)"
