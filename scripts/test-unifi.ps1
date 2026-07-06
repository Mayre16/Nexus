# Prueba conexión UniFi Site Manager (lee config/.env)
Set-Location $PSScriptRoot\..

Write-Host "[UniFi] Probando Site Manager API..." -ForegroundColor Cyan
node scripts/test-unifi.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "[UniFi] OK" -ForegroundColor Green
