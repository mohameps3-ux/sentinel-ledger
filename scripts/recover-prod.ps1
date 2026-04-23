[CmdletBinding()]
param(
  [switch]$Redeploy,
  [switch]$SkipFlushDns
)

$ErrorActionPreference = "Stop"

$frontendUrl = "https://sentinel-ledger-ochre.vercel.app"
$tokenTestUrl = "https://sentinel-ledger-ochre.vercel.app/token/So11111111111111111111111111111111111111112"
$backendLiveUrl = "https://sentinel-ledger-backend-production.up.railway.app/health/live"
$backendHealthUrl = "https://sentinel-ledger-backend-production.up.railway.app/health"

function Test-Http200 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url
  )

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 20
    return [PSCustomObject]@{
      Url = $Url
      Ok = ($response.StatusCode -eq 200)
      StatusCode = $response.StatusCode
      Error = $null
    }
  } catch {
    return [PSCustomObject]@{
      Url = $Url
      Ok = $false
      StatusCode = $null
      Error = $_.Exception.Message
    }
  }
}

Write-Host ""
Write-Host "Sentinel Ledger - Recovery Runner" -ForegroundColor Cyan
Write-Host "Workspace: $PSScriptRoot\.." -ForegroundColor DarkGray

if (-not $SkipFlushDns) {
  Write-Host ""
  Write-Host "Flushing local DNS cache..." -ForegroundColor Yellow
  ipconfig /flushdns | Out-Null
  Write-Host "DNS cache flushed." -ForegroundColor Green
}

Write-Host ""
Write-Host "Checking current production health..." -ForegroundColor Yellow
$checks = @(
  Test-Http200 -Url $frontendUrl
  Test-Http200 -Url $tokenTestUrl
  Test-Http200 -Url $backendLiveUrl
)

foreach ($check in $checks) {
  if ($check.Ok) {
    Write-Host "OK 200 - $($check.Url)" -ForegroundColor Green
  } else {
    Write-Host "FAIL - $($check.Url)" -ForegroundColor Red
    Write-Host "      $($check.Error)" -ForegroundColor DarkRed
  }
}

if ($Redeploy) {
  Write-Host ""
  Write-Host "Redeploy mode enabled: forcing new Vercel production build..." -ForegroundColor Yellow

  $vercelCmd = Get-Command vercel -ErrorAction SilentlyContinue
  if (-not $vercelCmd) {
    throw "Vercel CLI not found. Install with: npm install -g vercel"
  }

  try {
    $who = vercel whoami
    Write-Host "Vercel user: $who" -ForegroundColor Green
  } catch {
    throw "Not logged in on Vercel CLI. Run: vercel login"
  }

  # Monorepo: Vercel project must have Root Directory = "frontend" (single segment).
  # Run CLI from REPO ROOT — never from inside frontend/, or Vercel resolves …\frontend\frontend and fails.
  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
  Push-Location $repoRoot
  try {
    vercel deploy --prod --force --yes
  } finally {
    Pop-Location
  }

  Write-Host ""
  Write-Host "Re-checking production after redeploy..." -ForegroundColor Yellow
  $postChecks = @(
    Test-Http200 -Url $frontendUrl
    Test-Http200 -Url $tokenTestUrl
    Test-Http200 -Url $backendLiveUrl
  )

  foreach ($check in $postChecks) {
    if ($check.Ok) {
      Write-Host "OK 200 - $($check.Url)" -ForegroundColor Green
    } else {
      Write-Host "FAIL - $($check.Url)" -ForegroundColor Red
      Write-Host "      $($check.Error)" -ForegroundColor DarkRed
    }
  }
}

Write-Host ""
Write-Host "Done." -ForegroundColor Cyan

