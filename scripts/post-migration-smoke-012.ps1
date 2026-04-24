<#
.SYNOPSIS
  Post-migration smoke for coordination_outcomes (migration 012).

.DESCRIPTION
  - GET /health
  - GET /api/v1/ops/wallet-coordination/outcomes (requires x-ops-key)
  Passes only when the JSON body has ok=true and degraded=false (table reachable).
  Ops key is read ONLY from environment (OMNI_BOT_OPS_KEY or OPS_KEY) — do not pass secrets on the command line.

  Usage (PowerShell):
    $env:OMNI_BOT_OPS_KEY = '<from-1password-or-vault>'   # never commit or paste into logs
    $env:BACKEND_URL = 'https://<your-railway>.up.railway.app'   # optional override
    powershell -ExecutionPolicy Bypass -File scripts/post-migration-smoke-012.ps1

  Local HTTP:
    powershell -ExecutionPolicy Bypass -File scripts/post-migration-smoke-012.ps1 -AllowHttp -BackendUrl http://127.0.0.1:8787
#>
param(
  [string]$BackendUrl = $(if ($env:BACKEND_URL) { $env:BACKEND_URL } else { "https://sentinel-ledger-backend-production.up.railway.app" }),
  [switch]$AllowHttp
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-JsonGet {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [hashtable]$Headers = @{}
  )
  try {
    $resp = Invoke-WebRequest -Uri $Url -Headers $Headers -Method GET -UseBasicParsing -TimeoutSec 25
    return [pscustomobject]@{
      Ok = ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300)
      StatusCode = $resp.StatusCode
      Body = $resp.Content
      Error = $null
    }
  } catch {
    $status = 0
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    }
    return [pscustomobject]@{
      Ok = $false
      StatusCode = $status
      Body = $null
      Error = $_.Exception.Message
    }
  }
}

$base = $BackendUrl.TrimEnd("/")
$u = [Uri]$base
if (-not $AllowHttp -and $u.Scheme -ne "https") {
  Write-Host "[FAIL] Backend URL must be https (use -AllowHttp for local only)."
  exit 1
}

$opsKey = ""
if ($env:OMNI_BOT_OPS_KEY) { $opsKey = $env:OMNI_BOT_OPS_KEY.Trim() }
elseif ($env:OPS_KEY) { $opsKey = $env:OPS_KEY.Trim() }

if ([string]::IsNullOrWhiteSpace($opsKey)) {
  Write-Host "[FAIL] Set OMNI_BOT_OPS_KEY (or OPS_KEY) in the environment. Do not pass the key as a script argument."
  exit 1
}

Write-Host "post-migration-smoke-012 (coordination_outcomes)"
Write-Host ("Backend: " + $base)
Write-Host "Ops key: present from env (value not printed)"

$fails = New-Object System.Collections.Generic.List[string]

$h = Invoke-JsonGet -Url ($base + "/health")
if ($h.Ok) {
  Write-Host ("[PASS] /health -> " + $h.StatusCode)
} else {
  Write-Host ("[FAIL] /health -> " + $h.StatusCode + " " + $h.Error)
  $fails.Add("health")
}

$coordUrl = $base + "/api/v1/ops/wallet-coordination/outcomes?limit=5"
$c = Invoke-JsonGet -Url $coordUrl -Headers @{ "x-ops-key" = $opsKey }

if (-not $c.Ok) {
  $code = $c.StatusCode
  Write-Host ("[FAIL] coordination outcomes -> HTTP " + $code + " " + $c.Error)
  if ($code -eq 401) { Write-Host "  Hint: ops key mismatch or missing on request." }
  if ($code -eq 503) { Write-Host "  Hint: server may have OMNI_BOT_OPS_KEY unset (ops routes return 503)." }
  $fails.Add("coordination_outcomes_http")
} else {
  try {
    $j = $c.Body | ConvertFrom-Json
  } catch {
    Write-Host "[FAIL] coordination outcomes -> response was not JSON"
    $fails.Add("coordination_outcomes_json")
    $j = $null
  }
  if ($null -ne $j) {
    if (-not $j.ok) {
      Write-Host "[FAIL] coordination outcomes -> body ok=false"
      $fails.Add("coordination_outcomes_ok_false")
    } elseif ($j.degraded) {
      $reason = [string]$j.reason
      Write-Host ("[FAIL] coordination outcomes -> degraded=true reason=" + $reason)
      Write-Host "  Hint: if reason mentions missing relation, apply 012 + 013 (+014 RLS wallet tables) in supabase/migrations/ (or npm run db:ensure-signal-performance --prefix backend) on the correct project. Security Advisor: refresh after 014."
      $fails.Add("coordination_outcomes_degraded")
    } else {
      $n = 0
      if ($j.data) { $n = @($j.data).Count }
      Write-Host ("[PASS] coordination outcomes -> " + $c.StatusCode + ", rows=" + $n + ", degraded=false")
    }
  }
}

if ($fails.Count -gt 0) {
  Write-Host ("Blocking: " + ($fails -join ", "))
  exit 1
}

Write-Host "post-migration-smoke-012 passed."
exit 0
