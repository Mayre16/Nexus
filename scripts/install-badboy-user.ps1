# Instala BadBoy para el usuario actual (sin admin).

# Ubicación: %LOCALAPPDATA%\Programs\ADESA\BadBoy

param(

    [switch]$SkipBuild

)



$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "badboy-common.ps1")



$root = Split-Path -Parent $PSScriptRoot

$serviceProj = Join-Path $root "BadBoy_src\BadBoy\src\MonitorSuite.Service\MonitorSuite.Service.csproj"

$adminProj = Join-Path $root "BadBoy_src\BadBoy\src\MonitorSuite.Admin\MonitorSuite.Admin.csproj"

$dist = Join-Path $root "dist\BadBoy"

$installDir = Join-Path $env:LOCALAPPDATA "Programs\ADESA\BadBoy"



Write-Host "=== Instalador ADESA BadBoy (usuario) ===" -ForegroundColor Cyan



if (-not $SkipBuild) {

    Write-Host "[1/5] Compilando ejecutables..." -ForegroundColor Gray

    Stop-BadBoyProcesses

    if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }

    New-Item -ItemType Directory -Force -Path $dist | Out-Null

    dotnet publish $serviceProj -c Release -r win-x64 --self-contained true -o $dist

    if ($LASTEXITCODE -ne 0) { throw "Error publicando Service" }

    dotnet publish $adminProj -c Release -r win-x64 --self-contained true -o $dist

    if ($LASTEXITCODE -ne 0) { throw "Error publicando Admin" }

} else {

    Write-Host "[1/5] Usando compilacion existente en dist\BadBoy" -ForegroundColor Gray

}



if (-not (Test-Path (Join-Path $dist "MonitorSuite.Service.exe"))) {

    throw "No hay ejecutables en $dist"

}



Write-Host "[2/5] Copiando a $installDir ..." -ForegroundColor Gray

Stop-BadBoyProcesses

New-Item -ItemType Directory -Force -Path $installDir | Out-Null

Copy-Item -Path "$dist\*" -Destination $installDir -Recurse -Force



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



$extSrc = Join-Path $root "BadBoy_src\BrowserExtension"

if (Test-Path $extSrc) {

    Copy-Item $extSrc (Join-Path $installDir "BrowserExtension") -Recurse -Force

}



$serviceExe = Join-Path $installDir "MonitorSuite.Service.exe"

$adminExe = Join-Path $installDir "MonitorSuite.Admin.exe"



Write-Host "[3/5] Registrando inicio al iniciar sesion (sin ventana CMD)..." -ForegroundColor Gray

$method = Register-BadBoyAutoStart -ServiceExe $serviceExe -WorkingDirectory $installDir

Write-Host "  Método: $method" -ForegroundColor Gray



Write-Host "[4/5] Iniciando agente..." -ForegroundColor Gray

Start-BadBoyAgentHidden -ServiceExe $serviceExe -WorkingDirectory $installDir

Wait-BadBoyPipe | Out-Null



Write-Host "[5/5] Accesos directos..." -ForegroundColor Gray

$shell = New-Object -ComObject WScript.Shell

$desktopLnk = Join-Path ([Environment]::GetFolderPath("Desktop")) "ADESA BadBoy Admin.lnk"

$lnk = $shell.CreateShortcut($desktopLnk)

$lnk.TargetPath = $adminExe

$lnk.WorkingDirectory = $installDir

$lnk.Save()



$startMenu = Join-Path ([Environment]::GetFolderPath("Programs")) "ADESA"

New-Item -ItemType Directory -Force -Path $startMenu | Out-Null

$lnk2 = $shell.CreateShortcut((Join-Path $startMenu "BadBoy Admin.lnk"))

$lnk2.TargetPath = $adminExe

$lnk2.WorkingDirectory = $installDir

$lnk2.Save()



Write-Host ""

Write-Host "Instalacion completada." -ForegroundColor Green

Write-Host "  Carpeta:  $installDir" -ForegroundColor Gray

Write-Host "  Agente:   $serviceExe (inicia oculto al iniciar sesion)" -ForegroundColor Gray

Write-Host "  Panel:    $adminExe" -ForegroundColor Gray

Write-Host "  Login:    admin / ChangeMe!2025" -ForegroundColor Yellow

Write-Host "  Pipe OK:  $(Test-BadBoyPipe)" -ForegroundColor Gray

Write-Host ""

Start-Process -FilePath $adminExe -WorkingDirectory $installDir

