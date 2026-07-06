# ====================================================================

# ADESA BadBoy — Arranque local con verificación del agente

# ====================================================================

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "badboy-common.ps1")



$root = Split-Path -Parent $PSScriptRoot

$sln = Join-Path $root "BadBoy_src\BadBoy\MonitorSuite.sln"

$serviceDir = Join-Path $root "BadBoy_src\BadBoy\src\MonitorSuite.Service"

$serviceExe = Join-Path $serviceDir "bin\Debug\net8.0\win-x64\MonitorSuite.Service.exe"

$adminExe = Join-Path $root "BadBoy_src\BadBoy\src\MonitorSuite.Admin\bin\Debug\net8.0-windows\MonitorSuite.Admin.exe"



function Start-BadBoyAgentLocal {

    if (Test-Path $serviceExe) {

        Start-BadBoyAgentHidden -ServiceExe $serviceExe -WorkingDirectory (Split-Path $serviceExe)

    } else {

        Start-Process -FilePath "dotnet" -ArgumentList "run","--no-build","-c","Debug" -WorkingDirectory $serviceDir -WindowStyle Hidden

    }

    for ($i = 0; $i -lt 24; $i++) {

        Start-Sleep -Milliseconds 500

        if (Test-BadBoyPipe) { return $true }

    }

    return $false

}



Write-Host "[BadBoy] Deteniendo procesos previos..." -ForegroundColor Gray

Stop-BadBoyProcesses



Write-Host "[BadBoy] Compilando..." -ForegroundColor Cyan

dotnet build $sln -c Debug

if ($LASTEXITCODE -ne 0) {

    Write-Host "[BadBoy] ERROR: compilacion fallida. Corrija errores antes de continuar." -ForegroundColor Red

    exit 1

}



Write-Host "[BadBoy] Reiniciando agente..." -ForegroundColor Gray



if (-not (Start-BadBoyAgentLocal)) {

    Write-Host "[BadBoy] ERROR: agente no levantó el pipe. Revise %TEMP%\badboy-err.txt" -ForegroundColor Red

    exit 1

}



Write-Host "[BadBoy] Agente OK." -ForegroundColor Green

Write-Host "[BadBoy] Abriendo panel Admin..." -ForegroundColor Green

Write-Host "  Login: admin / ChangeMe!2025" -ForegroundColor Yellow

Write-Host "  Tras entrar pulse 'Actualizar' (no carga sola para evitar congelar)." -ForegroundColor Gray

Start-Process $adminExe



Write-Host "[BadBoy] Listo. Si se congela: .\scripts\restart-badboy.ps1" -ForegroundColor Green

