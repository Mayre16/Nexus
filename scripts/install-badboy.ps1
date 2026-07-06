# ====================================================================
# ADESA BadBoy — Instalador para equipos Windows (producción)
#   - Publica agente + panel Admin (ejecutables self-contained)
#   - Copia a C:\Program Files\ADESA\BadBoy
#   - Registra inicio automático al iniciar sesión en Windows
#   - Acceso directo en Escritorio y Menú Inicio
# ====================================================================
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "badboy-common.ps1")

$root = Split-Path -Parent $PSScriptRoot
$serviceProj = Join-Path $root "BadBoy_src\BadBoy\src\MonitorSuite.Service\MonitorSuite.Service.csproj"
$adminProj = Join-Path $root "BadBoy_src\BadBoy\src\MonitorSuite.Admin\MonitorSuite.Admin.csproj"
$dist = Join-Path $root "dist\BadBoy"
$installDir = "$env:ProgramFiles\ADESA\BadBoy"

Write-Host "=== Instalador ADESA BadBoy ===" -ForegroundColor Cyan

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Sin permisos de administrador." -ForegroundColor Yellow
    Write-Host "Opciones:" -ForegroundColor Yellow
    Write-Host "  A) Clic derecho en PowerShell -> Ejecutar como administrador, luego:" -ForegroundColor Gray
    Write-Host "     .\scripts\install-badboy.ps1" -ForegroundColor White
    Write-Host "  B) Instalar solo para su usuario (sin admin):" -ForegroundColor Gray
    Write-Host "     .\scripts\install-badboy-user.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "Instalando para el usuario actual..." -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "install-badboy-user.ps1") -SkipBuild
    exit $LASTEXITCODE
}

Write-Host "[1/6] Deteniendo instancias previas..." -ForegroundColor Gray
Stop-BadBoyProcesses

Write-Host "[2/6] Compilando ejecutables (Release, self-contained)..." -ForegroundColor Gray
if (Test-Path $dist) {
    Remove-Item $dist -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $dist | Out-Null

dotnet publish $serviceProj -c Release -r win-x64 --self-contained true -o $dist
if ($LASTEXITCODE -ne 0) { throw "Error publicando MonitorSuite.Service" }

dotnet publish $adminProj -c Release -r win-x64 --self-contained true -o $dist
if ($LASTEXITCODE -ne 0) { throw "Error publicando MonitorSuite.Admin" }

$serviceExe = Join-Path $dist "MonitorSuite.Service.exe"
$adminExe = Join-Path $dist "MonitorSuite.Admin.exe"
if (-not (Test-Path $serviceExe)) { throw "No se generó $serviceExe" }
if (-not (Test-Path $adminExe)) { throw "No se generó $adminExe" }

Write-Host "[3/6] Instalando en $installDir ..." -ForegroundColor Gray
Stop-BadBoyProcesses
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item -Path "$dist\*" -Destination $installDir -Recurse -Force

$installedService = Join-Path $installDir "MonitorSuite.Service.exe"
$installedAdmin = Join-Path $installDir "MonitorSuite.Admin.exe"

$configDir = "$env:ProgramData\MonitorSuite\Config"
New-Item -ItemType Directory -Force -Path $configDir | Out-Null

if (-not (Test-Path "$configDir\nexus.json")) {
    @'
{
  "NexusApiUrl": "http://localhost:3000",
  "DeviceUuid": "",
  "ApiSecret": "",
  "Enabled": false,
  "IntervalMinutes": 5
}
'@ | Set-Content "$configDir\nexus.json" -Encoding UTF8
}

if (-not (Test-Path "$configDir\azure_ad.json")) {
    $template = Join-Path $root "scripts\templates\azure_ad.json"
    if (Test-Path $template) {
        Copy-Item $template "$configDir\azure_ad.json"
    }
}

$extSrc = Join-Path $root "BadBoy_src\BrowserExtension"
$extDst = Join-Path $installDir "BrowserExtension"
if (Test-Path $extSrc) {
    Copy-Item $extSrc $extDst -Recurse -Force
}

Write-Host "[4/6] Registrando inicio con Windows (sin ventana CMD)..." -ForegroundColor Gray
$method = Register-BadBoyAutoStart -ServiceExe $installedService -WorkingDirectory $installDir -UseHighestRunLevel
Write-Host "  Método: $method" -ForegroundColor Gray

Write-Host "[5/6] Iniciando agente..." -ForegroundColor Gray
Start-BadBoyAgentHidden -ServiceExe $installedService -WorkingDirectory $installDir
if (-not (Wait-BadBoyPipe)) {
    Write-Host "ADVERTENCIA: el agente no respondió al pipe. Revise el Visor de eventos (MonitorSuite)." -ForegroundColor Yellow
}

Write-Host "[6/6] Creando accesos directos..." -ForegroundColor Gray
$shell = New-Object -ComObject WScript.Shell

$desktop = [Environment]::GetFolderPath("Desktop")
$desktopLnk = Join-Path $desktop "ADESA BadBoy Admin.lnk"
$lnk = $shell.CreateShortcut($desktopLnk)
$lnk.TargetPath = $installedAdmin
$lnk.WorkingDirectory = $installDir
$lnk.Description = "Panel ADESA BadBoy"
$lnk.Save()

$startMenu = Join-Path ([Environment]::GetFolderPath("Programs")) "ADESA"
New-Item -ItemType Directory -Force -Path $startMenu | Out-Null
$startLnk = Join-Path $startMenu "BadBoy Admin.lnk"
$lnk2 = $shell.CreateShortcut($startLnk)
$lnk2.TargetPath = $installedAdmin
$lnk2.WorkingDirectory = $installDir
$lnk2.Description = "Panel ADESA BadBoy"
$lnk2.Save()

Write-Host ""
Write-Host "Instalación completada." -ForegroundColor Green
Write-Host "  Carpeta:   $installDir" -ForegroundColor Gray
Write-Host "  Agente:    $installedService (inicia oculto al iniciar sesión)" -ForegroundColor Gray
Write-Host "  Panel:     $installedAdmin" -ForegroundColor Gray
Write-Host "  Escritorio: ADESA BadBoy Admin" -ForegroundColor Gray
Write-Host "  Login:     admin / ChangeMe!2025" -ForegroundColor Yellow
Write-Host "  Extensión: $extDst  (chrome://extensions -> Modo desarrollador -> Cargar sin compactar)" -ForegroundColor Gray
Write-Host "  Desinstalar: scripts\uninstall-badboy.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "Abriendo panel Admin..." -ForegroundColor Cyan
Start-Process -FilePath $installedAdmin -WorkingDirectory $installDir
