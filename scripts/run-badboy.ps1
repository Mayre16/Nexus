# ====================================================================
# Ejecuta MonitorSuite (BadBoy) en modo consola para desarrollo local.
# Requiere: .NET 8+, nexus.json en %PROGRAMDATA%\MonitorSuite\Config\
# ====================================================================
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$serviceDir = Join-Path $root "BadBoy_src\BadBoy\src\MonitorSuite.Service"

Write-Host "[BadBoy] Compilando MonitorSuite.Service..." -ForegroundColor Cyan
dotnet build $serviceDir -c Debug

Write-Host "[BadBoy] Iniciando agente (Ctrl+C para detener)..." -ForegroundColor Green
Write-Host "  Config Nexus: $env:ProgramData\MonitorSuite\Config\nexus.json"
Write-Host "  Admin panel:  BadBoy_src\BadBoy\src\MonitorSuite.Admin\bin\Debug\net8.0-windows\MonitorSuite.Admin.exe"
Write-Host "  Credenciales admin local: admin / ChangeMe!2025"
Write-Host ""

Set-Location $serviceDir
dotnet run --no-build
