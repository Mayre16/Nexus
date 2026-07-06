# Corrige el inicio automático en equipos ya instalados (sin ventana CMD).
# Recompila el agente WinExe, lo copia sobre la instalación existente y
# registra tarea programada en lugar del acceso directo en Registro Run.
param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "badboy-common.ps1")

$root = Split-Path -Parent $PSScriptRoot
$serviceProj = Join-Path $root "BadBoy_src\BadBoy\src\MonitorSuite.Service\MonitorSuite.Service.csproj"
$dist = Join-Path $root "dist\BadBoy"
$installDir = Resolve-BadBoyInstallDir

if (-not $installDir) {
    Write-Host "No se encontró BadBoy instalado. Ejecute install-badboy-user.ps1 o install-badboy.ps1." -ForegroundColor Red
    exit 1
}

$serviceExe = Join-Path $installDir "MonitorSuite.Service.exe"
Write-Host "=== Corregir autostart BadBoy ===" -ForegroundColor Cyan
Write-Host "  Instalación: $installDir" -ForegroundColor Gray

Stop-BadBoyProcesses

if (-not $SkipBuild) {
    Write-Host "[1/3] Compilando agente (WinExe, sin consola)..." -ForegroundColor Gray
    if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $dist | Out-Null
    dotnet publish $serviceProj -c Release -r win-x64 --self-contained true -o $dist
    if ($LASTEXITCODE -ne 0) { throw "Error publicando MonitorSuite.Service" }
    Copy-Item -Path (Join-Path $dist "MonitorSuite.Service.exe") -Destination $serviceExe -Force
    Copy-Item -Path (Join-Path $dist "MonitorSuite.Service.dll") -Destination $installDir -Force -ErrorAction SilentlyContinue
    Copy-Item -Path (Join-Path $dist "MonitorSuite.Service.runtimeconfig.json") -Destination $installDir -Force -ErrorAction SilentlyContinue
    Copy-Item -Path (Join-Path $dist "MonitorSuite.Service.deps.json") -Destination $installDir -Force -ErrorAction SilentlyContinue
    Get-ChildItem $dist -Filter "MonitorSuite.*.dll" | Copy-Item -Destination $installDir -Force -ErrorAction SilentlyContinue
} else {
    Write-Host "[1/3] Omitiendo compilación (-SkipBuild)." -ForegroundColor Gray
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host "[2/3] Registrando inicio oculto..." -ForegroundColor Gray
$method = Register-BadBoyAutoStart -ServiceExe $serviceExe -WorkingDirectory $installDir -UseHighestRunLevel:$isAdmin
Write-Host "  Método: $method" -ForegroundColor Gray

Write-Host "[3/3] Reiniciando agente..." -ForegroundColor Gray
Start-BadBoyAgentHidden -ServiceExe $serviceExe -WorkingDirectory $installDir
if (Wait-BadBoyPipe) {
    Write-Host "Listo. Agente corriendo sin ventana CMD." -ForegroundColor Green
} else {
    Write-Host "ADVERTENCIA: el agente no respondió al pipe. Revise el Visor de eventos (MonitorSuite)." -ForegroundColor Yellow
}
