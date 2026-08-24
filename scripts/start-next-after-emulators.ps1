$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Write-Host "Esperando que Firebase local esté listo..."

do {
  Start-Sleep -Milliseconds 400
  $firestore = Test-NetConnection -ComputerName 127.0.0.1 -Port 8080 -InformationLevel Quiet -WarningAction SilentlyContinue
  $auth = Test-NetConnection -ComputerName 127.0.0.1 -Port 9099 -InformationLevel Quiet -WarningAction SilentlyContinue
} until ($firestore -and $auth)

Set-Location -LiteralPath $root
& npm run dev
exit $LASTEXITCODE
