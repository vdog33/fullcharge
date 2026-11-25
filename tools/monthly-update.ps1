# FULLCHARGE monthly data update: home batteries (CEC list) + vehicle cut sheets (NHTSA).
# Runs on this PC, by Task Scheduler (see schedule-monthly.ps1) or by hand:
#   powershell -ExecutionPolicy Bypass -File tools\monthly-update.ps1
# Phones pick up the new data on their own next time they open with signal - no app build needed.
# Needs the Supabase secret key saved once as a Windows user variable (see schedule-monthly.ps1).

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ("update-{0:yyyy-MM-dd}.log" -f (Get-Date))
function Say($m) { $line = "{0:HH:mm:ss}  $m" -f (Get-Date); Write-Host $line; Add-Content -Path $log -Value $line }

$env:SUPABASE_URL = 'https://luuqzmvcoguuqcnhiaze.supabase.co'
if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
  $env:SUPABASE_SERVICE_ROLE_KEY = [Environment]::GetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', 'User')
}
if (-not $env:SUPABASE_SERVICE_ROLE_KEY) { Say 'STOPPED: no Supabase secret key saved. Run tools\schedule-monthly.ps1 first.'; exit 1 }

function Step($dir, $name, $cmd) {
  Say "-- $name"
  Push-Location (Join-Path $root $dir)
  cmd /c "$cmd 2>&1" | ForEach-Object { Add-Content -Path $log -Value $_ }
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { Say "   FAILED ($name, exit $code) - see $log"; return $false }
  Say "   ok"; return $true
}

Say '=== FULLCHARGE monthly update ==='
Step '.' 'Get latest tools (git pull)' 'git pull --ff-only' | Out-Null

# Home batteries: ~20 min (280 pages). A Chrome window opens - leave it alone.
$bess = (Step 'tools\bess' 'Batteries: scrape CEC list' 'npm run scrape') -and (Step 'tools\bess' 'Batteries: publish' 'npm run publish')

# Vehicles: only new / changed sheets are downloaded and compressed.
$veh = (Step '.' 'Vehicles: seed catalog' 'npm run seed') -and
       (Step 'tools\nhtsa' 'Vehicles: scrape NHTSA' 'npm run scrape') -and
       (Step 'tools\nhtsa' 'Vehicles: download new sheets' 'npm run download') -and
       (Step 'tools\nhtsa' 'Vehicles: compress' 'npm run compress') -and
       (Step 'tools\nhtsa' 'Vehicles: publish' 'npm run publish')

$summary = "Batteries: $(if ($bess) {'updated'} else {'FAILED'})   Vehicles: $(if ($veh) {'updated'} else {'FAILED'})"
Say "=== Done. $summary ==="
try {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show("$summary`n`nLog: $log", 'FULLCHARGE monthly update') | Out-Null
} catch {}
