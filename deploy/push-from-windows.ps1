# Upload apps + packages + deploy to Hannibal VPS, then rebuild Docker.
# Bad internet: retries + smaller files + SSH keepalive.
#   cd C:\Users\PC\Desktop\aurum-gaming-platform\deploy
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   .\push-from-windows.ps1

$ErrorActionPreference = "Stop"
$HostIp = "13.140.189.223"
$User = "root"
$RemoteRoot = "/opt/aurum-gaming-platform"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ScpOpts = @(
  "-o", "ServerAliveInterval=30",
  "-o", "ServerAliveCountMax=120",
  "-o", "TCPKeepAlive=yes"
)
$SshOpts = @(
  "-o", "ServerAliveInterval=30",
  "-o", "ServerAliveCountMax=120",
  "-o", "TCPKeepAlive=yes"
)
$MaxRetries = 5

function Invoke-ScpRetry {
  param([string]$LocalPath, [string]$RemoteDest, [string]$Label)
  for ($i = 1; $i -le $MaxRetries; $i++) {
    Write-Host ""
    Write-Host "[$Label] Upload attempt $i of $MaxRetries (password if asked)..."
    & scp @ScpOpts $LocalPath "${User}@${HostIp}:$RemoteDest"
    if ($LASTEXITCODE -eq 0) {
      Write-Host "[$Label] Upload OK."
      return
    }
    Write-Host "[$Label] Failed (connection reset?). Wait 10s and retry..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
  }
  throw "[$Label] Upload failed after $MaxRetries attempts. Use WinSCP or try again later."
}

function New-PartArchive {
  param([string]$Name, [string[]]$Folders)
  $out = Join-Path $env:TEMP "aurum-$Name.tar.gz"
  if (Test-Path $out) { Remove-Item $out -Force }
  Push-Location $ProjectRoot
  try {
    $args = @("-czf", $out, "--exclude=node_modules", "--exclude=.next", "--exclude=storage", "--exclude=_backups") + $Folders
    & tar @args
    if ($LASTEXITCODE -ne 0) { throw "tar failed for $Name" }
  } finally {
    Pop-Location
  }
  $mb = [math]::Round((Get-Item $out).Length / 1MB, 1)
  Write-Host "Packed $Name -> $mb MB"
  return $out
}

Write-Host "Project: $ProjectRoot"
Write-Host "Server:  ${User}@${HostIp} ($RemoteRoot)"
Write-Host ""

$appsArc = New-PartArchive "apps" @("apps")
$pkgArc = New-PartArchive "packages" @("packages")
$depArc = New-PartArchive "deploy" @("deploy")

Invoke-ScpRetry -LocalPath $appsArc -RemoteDest "/tmp/aurum-apps.tar.gz" -Label "apps"
Invoke-ScpRetry -LocalPath $pkgArc -RemoteDest "/tmp/aurum-packages.tar.gz" -Label "packages"
Invoke-ScpRetry -LocalPath $depArc -RemoteDest "/tmp/aurum-deploy.tar.gz" -Label "deploy"

Write-Host ""
Write-Host "Extract + verify + docker build (password if asked)..."
$RemoteCmd = @"
set -e
cd $RemoteRoot
tar -xzf /tmp/aurum-apps.tar.gz
tar -xzf /tmp/aurum-packages.tar.gz
tar -xzf /tmp/aurum-deploy.tar.gz
rm -f /tmp/aurum-apps.tar.gz /tmp/aurum-packages.tar.gz /tmp/aurum-deploy.tar.gz
test -f apps/web/src/app/[locale]/casino/cherryparty/page.tsx && echo VERIFY_OK || (echo VERIFY_FAIL; exit 1)
cd deploy
docker compose up -d --build
echo DEPLOY_DONE
"@

for ($i = 1; $i -le $MaxRetries; $i++) {
  Write-Host "SSH attempt $i of $MaxRetries..."
  & ssh @SshOpts "${User}@${HostIp}" $RemoteCmd
  if ($LASTEXITCODE -eq 0) { break }
  if ($i -eq $MaxRetries) { throw "SSH / docker step failed after $MaxRetries attempts." }
  Start-Sleep -Seconds 10
}

Write-Host ""
Write-Host "SUCCESS. Open in browser (Ctrl+F5):" -ForegroundColor Green
Write-Host "  https://hanibalgamer.fr/fr/casino/cherryparty"
