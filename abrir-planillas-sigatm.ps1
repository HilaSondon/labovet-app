$ErrorActionPreference = 'Stop'
$indexPath = Join-Path $PSScriptRoot 'public\sigatm\index.html'
Start-Process -FilePath $indexPath
