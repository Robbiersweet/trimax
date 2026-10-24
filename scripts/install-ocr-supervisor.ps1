param(
 [Parameter(Mandatory=$true)][string]$RuntimeRoot,
 [Parameter(Mandatory=$true)][string]$PrivateRoot
)
$ErrorActionPreference='Stop'
$resolvedRuntime=(Resolve-Path -LiteralPath $RuntimeRoot).Path
$resolvedPrivate=(Resolve-Path -LiteralPath $PrivateRoot).Path
if (-not (Test-Path -LiteralPath "$resolvedRuntime/scripts/ocr-worker-supervisor.cjs")) { throw 'Sealed supervisor source is required' }
foreach ($folder in @('ocr-legacy-worker','ocr-shadow-worker')) {
 if (-not (Test-Path -LiteralPath "$resolvedPrivate/$folder/worker.json")) { throw 'Existing restricted worker configurations are required' }
}
# No credentials in task arguments. The operating system owns process lifetime;
# the named-pipe mutex makes minute/logon triggers idempotent.
$launcherPath=Join-Path $resolvedRuntime 'scripts/start-ocr-supervisor.ps1'
$action=New-ScheduledTaskAction -Execute (Get-Command powershell.exe).Source -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -File `"$launcherPath`" -PrivateRoot `"$resolvedPrivate`"" -WorkingDirectory $resolvedRuntime
$startup=New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
$repeat=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal=New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'Trimax OCR Supervisor' -Action $action -Trigger @($startup,$repeat) -Settings $settings -Principal $principal -Description 'Runs the sealed restricted OCR workers; database watchdog handles host downtime.' -Force | Out-Null
$startedAt=(Get-Date).ToUniversalTime()
Start-ScheduledTask -TaskName 'Trimax OCR Supervisor'
$healthPath=Join-Path $resolvedPrivate 'ocr-supervisor/supervisor-health.json'
for ($poll=0; $poll -lt 30; $poll++) {
 Start-Sleep -Seconds 1
 $info=Get-ScheduledTaskInfo -TaskName 'Trimax OCR Supervisor'
 if ($info.LastRunTime.ToUniversalTime() -ge $startedAt.AddSeconds(-1) -and $info.LastTaskResult -notin @(0,267009)) {
  Disable-ScheduledTask -TaskName 'Trimax OCR Supervisor' | Out-Null
  throw "Native scheduler launch failed ($($info.LastTaskResult)); task disabled. Verify the native host can access the sealed checkout and private paths."
 }
 if (Test-Path -LiteralPath $healthPath) {
  try {
   $health=Get-Content -LiteralPath $healthPath -Raw | ConvertFrom-Json
   if ([DateTime]::Parse($health.observedAt).ToUniversalTime() -ge $startedAt -and $health.workers.Count -eq 2 -and @($health.workers | Where-Object { -not $_.pid -or -not $_.validated }).Count -eq 0) {
    Get-ScheduledTask -TaskName 'Trimax OCR Supervisor' | Select-Object TaskName,State
    return
   }
  } catch { Write-Verbose 'Waiting for a complete supervisor observation' }
 }
}
Disable-ScheduledTask -TaskName 'Trimax OCR Supervisor' | Out-Null
throw 'Fresh native supervisor evidence unavailable; task disabled. Registration alone is not installation acceptance.'
