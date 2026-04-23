param(
  [string]$BackendUrl = $(if ($env:BACKEND_URL) { $env:BACKEND_URL } else { "https://sentinel-ledger-backend-production.up.railway.app" }),
  [string]$FrontendUrl = $(if ($env:FRONTEND_URL) { $env:FRONTEND_URL } else { "https://sentinel-ledger-ochre.vercel.app" }),
  [string]$OpsKey = $(if ($env:OMNI_BOT_OPS_KEY) { $env:OMNI_BOT_OPS_KEY } elseif ($env:OPS_KEY) { $env:OPS_KEY } else { "" })
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Section($title) {
  Write-Host ""
  Write-Host ("=== " + $title + " ===")
}

function Invoke-JsonGet {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [hashtable]$Headers = @{}
  )
  try {
    $resp = Invoke-WebRequest -Uri $Url -Headers $Headers -Method GET -UseBasicParsing -TimeoutSec 20
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

$fails = New-Object System.Collections.Generic.List[string]
$warns = New-Object System.Collections.Generic.List[string]

Write-Host "Mini Release Checklist v1.1"
Write-Host ("Backend:  " + $BackendUrl)
Write-Host ("Frontend: " + $FrontendUrl)

Write-Section "1) Git hygiene"
$gitStatus = git status --porcelain
if ([string]::IsNullOrWhiteSpace(($gitStatus -join ""))) {
  Write-Host "[PASS] Working tree clean."
} else {
  Write-Host "[WARN] Working tree has local changes:"
  $gitStatus | ForEach-Object { Write-Host ("  " + $_) }
  $warns.Add("working_tree_not_clean")
}

Write-Section "2) Core smoke"
$health = Invoke-JsonGet -Url ($BackendUrl.TrimEnd("/") + "/health")
if ($health.Ok) { Write-Host ("[PASS] /health -> " + $health.StatusCode) } else {
  Write-Host ("[FAIL] /health -> " + $health.StatusCode + " " + $health.Error)
  $fails.Add("backend_health")
}

$signals = Invoke-JsonGet -Url ($BackendUrl.TrimEnd("/") + "/api/v1/signals/latest?limit=1")
if ($signals.Ok) { Write-Host ("[PASS] /api/v1/signals/latest?limit=1 -> " + $signals.StatusCode) } else {
  Write-Host ("[FAIL] /api/v1/signals/latest?limit=1 -> " + $signals.StatusCode + " " + $signals.Error)
  $fails.Add("signals_latest")
}

if ([string]::IsNullOrWhiteSpace($OpsKey)) {
  Write-Host "[WARN] Ops key not provided; skipping /api/v1/ops/data-freshness and /ops/wallet-coordination/outcomes."
  $warns.Add("ops_key_missing")
} else {
  $ops = Invoke-JsonGet -Url ($BackendUrl.TrimEnd("/") + "/api/v1/ops/data-freshness") -Headers @{ "x-ops-key" = $OpsKey.Trim() }
  if ($ops.Ok) { Write-Host ("[PASS] /api/v1/ops/data-freshness -> " + $ops.StatusCode) } else {
    Write-Host ("[FAIL] /api/v1/ops/data-freshness -> " + $ops.StatusCode + " " + $ops.Error)
    $fails.Add("ops_data_freshness")
  }

  $coordUrl = ($BackendUrl.TrimEnd("/") + "/api/v1/ops/wallet-coordination/outcomes?limit=3")
  $coord = Invoke-JsonGet -Url $coordUrl -Headers @{ "x-ops-key" = $OpsKey.Trim() }
  if (-not $coord.Ok) {
    Write-Host ("[FAIL] /api/v1/ops/wallet-coordination/outcomes -> " + $coord.StatusCode + " " + $coord.Error)
    $fails.Add("coordination_outcomes")
  } else {
    try {
      $cj = $coord.Body | ConvertFrom-Json
      if (-not $cj.ok) {
        Write-Host "[FAIL] /api/v1/ops/wallet-coordination/outcomes -> body ok=false"
        $fails.Add("coordination_outcomes_body")
      } elseif ($cj.degraded) {
        Write-Host ("[FAIL] /api/v1/ops/wallet-coordination/outcomes -> degraded reason=" + [string]$cj.reason)
        $fails.Add("coordination_outcomes_degraded")
      } else {
        Write-Host ("[PASS] /api/v1/ops/wallet-coordination/outcomes -> " + $coord.StatusCode + " (not degraded)")
      }
    } catch {
      Write-Host "[FAIL] /api/v1/ops/wallet-coordination/outcomes -> invalid JSON"
      $fails.Add("coordination_outcomes_json")
    }
  }
}

$front = Invoke-JsonGet -Url ($FrontendUrl.TrimEnd("/") + "/")
if ($front.Ok) { Write-Host ("[PASS] Frontend / -> " + $front.StatusCode) } else {
  Write-Host ("[FAIL] Frontend / -> " + $front.StatusCode + " " + $front.Error)
  $fails.Add("frontend_home")
}

Write-Section "3) Security sanity reminders"
Write-Host "- Supabase: verify Security Advisor has no unexpected critical findings."
Write-Host "- If secrets appeared in terminal history, rotate and redeploy."
Write-Host "- Ensure RLS lockdown script is applied when needed."

Write-Section "4) Deploy alignment reminders"
Write-Host "- Railway: backend revision should match latest commit intended for release."
Write-Host "- Vercel: deploy from linked project root to avoid frontend/frontend path issues."

Write-Section "5) Handoff update template"
Write-Host "Paste into HANDOFF.md (example):"
Write-Host "  - release: <date>"
Write-Host "  - commits: <hashes>"
Write-Host "  - smoke: /health=<code>, /signals/latest=<code>, /ops/data-freshness=<code>, /ops/wallet-coordination/outcomes=<code>"
Write-Host "  - security: RLS advisor=<status>, secrets_rotated=<yes/no>"

Write-Host ""
Write-Host "Summary:"
Write-Host ("  FAIL: " + $fails.Count)
Write-Host ("  WARN: " + $warns.Count)
if ($warns.Count -gt 0) { Write-Host ("  Warn codes: " + ($warns -join ", ")) }

if ($fails.Count -gt 0) {
  Write-Host ("Blocking checks failed: " + ($fails -join ", "))
  exit 1
}

Write-Host "Release checklist v1.1 passed."
exit 0
