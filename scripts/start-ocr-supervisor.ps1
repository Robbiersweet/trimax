param([Parameter(Mandatory=$true)][string]$PrivateRoot)
$ErrorActionPreference='Stop'
$runtimeRoot=Split-Path -Parent $PSScriptRoot
$logRoot=Join-Path $PrivateRoot 'ocr-supervisor'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$supervisorArgs=@("`"$(Join-Path $PSScriptRoot 'ocr-worker-supervisor.cjs')`"", "`"$PrivateRoot`"", "`"$logRoot`"")
Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList $supervisorArgs -WorkingDirectory $runtimeRoot -WindowStyle Hidden -Wait
