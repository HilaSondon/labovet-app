$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$jdk = Get-ChildItem -LiteralPath (Join-Path $root ".tools") -Directory -Filter "jdk-*" |
  Sort-Object Name -Descending |
  Select-Object -First 1

if (-not $jdk) {
  Write-Error "No se encontró Java local en .tools. Descargá Microsoft OpenJDK 21 antes de iniciar los emuladores."
}

$env:JAVA_HOME = $jdk.FullName
$env:Path = "$(Join-Path $jdk.FullName 'bin');$env:Path"
Set-Location -LiteralPath $root

& npx firebase emulators:start --only auth,firestore --import=.firebase-emulator-data --export-on-exit=.firebase-emulator-data
exit $LASTEXITCODE
