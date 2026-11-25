# One-time setup: save the Supabase secret key on this PC and schedule tools\monthly-update.ps1.
#   powershell -ExecutionPolicy Bypass -File tools\schedule-monthly.ps1
# The key is stored as a Windows user variable on this PC only - never in the repo or the app.

$script = Join-Path $PSScriptRoot 'monthly-update.ps1'

if (-not [Environment]::GetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', 'User')) {
  $sec = Read-Host 'Paste the Supabase secret key (sb_secret_...)' -AsSecureString
  $key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  if (-not $key.StartsWith('sb_secret_')) { Write-Host 'That does not look like a secret key (sb_secret_...). Nothing saved.'; exit 1 }
  [Environment]::SetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', $key, 'User')
  Write-Host 'Key saved for your Windows user.'
} else { Write-Host 'Key already saved.' }

# Every 4 weeks, Sunday 6 PM. Runs late if the PC was off or asleep then. Needs you signed in (it opens a Chrome window).
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-ExecutionPolicy Bypass -NoProfile -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Weekly -WeeksInterval 4 -DaysOfWeek Sunday -At 6pm
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 8) -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
Register-ScheduledTask -TaskName 'FULLCHARGE monthly update' -Action $action -Trigger $trigger -Settings $settings -Description 'Refresh FULLCHARGE home-battery list and NHTSA cut sheets' -Force | Out-Null
Write-Host "Scheduled: 'FULLCHARGE monthly update' - every 4 weeks, Sunday 6 PM (or as soon as the PC is on)."
Write-Host 'Run it now any time:  Start-ScheduledTask -TaskName "FULLCHARGE monthly update"'
