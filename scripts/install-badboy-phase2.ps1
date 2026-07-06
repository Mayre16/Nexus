# Fase de instalación (requiere admin). Asume dist\BadBoy ya compilado.

param(

    [string]$Root = (Split-Path -Parent (Split-Path -Parent $PSCommandPath))

)



$ErrorActionPreference = "Stop"

. (Join-Path (Split-Path -Parent $PSCommandPath) "badboy-common.ps1")



$dist = Join-Path $Root "dist\BadBoy"

$installDir = "$env:ProgramFiles\ADESA\BadBoy"



if (-not (Test-Path (Join-Path $dist "MonitorSuite.Service.exe"))) {

    Write-Host "ERROR: Ejecute primero la compilacion (install-badboy.ps1)." -ForegroundColor Red

    exit 1

}



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



$extSrc = Join-Path $Root "BadBoy_src\BrowserExtension"

if (Test-Path $extSrc) {

    Copy-Item $extSrc (Join-Path $installDir "BrowserExtension") -Recurse -Force

}



$serviceExe = Join-Path $installDir "MonitorSuite.Service.exe"

$adminExe = Join-Path $installDir "MonitorSuite.Admin.exe"



$method = Register-BadBoyAutoStart -ServiceExe $serviceExe -WorkingDirectory $installDir -UseHighestRunLevel

Write-Host "Autostart: $method" -ForegroundColor Gray



Start-BadBoyAgentHidden -ServiceExe $serviceExe -WorkingDirectory $installDir

Wait-BadBoyPipe | Out-Null



$shell = New-Object -ComObject WScript.Shell

$lnk = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "ADESA BadBoy Admin.lnk"))

$lnk.TargetPath = $adminExe

$lnk.WorkingDirectory = $installDir

$lnk.Save()



$startMenu = Join-Path ([Environment]::GetFolderPath("Programs")) "ADESA"

New-Item -ItemType Directory -Force -Path $startMenu | Out-Null

$lnk2 = $shell.CreateShortcut((Join-Path $startMenu "BadBoy Admin.lnk"))

$lnk2.TargetPath = $adminExe

$lnk2.WorkingDirectory = $installDir

$lnk2.Save()



Write-Host "OK instalado en $installDir" -ForegroundColor Green

Start-Process -FilePath $adminExe -WorkingDirectory $installDir

