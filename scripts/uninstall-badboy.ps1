# Desinstala BadBoy. Requiere contraseña admin local o sesión Microsoft configurada.
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "badboy-common.ps1")

$installDirs = @(
    "$env:ProgramFiles\ADESA\BadBoy",
    (Join-Path $env:LOCALAPPDATA "Programs\ADESA\BadBoy")
)

Write-Host "=== Desinstalar ADESA BadBoy ===" -ForegroundColor Cyan
$pwd = Read-Host "Contraseña admin local (ChangeMe!2025) para confirmar" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pwd))
if ($plain -ne "ChangeMe!2025") {
    Write-Host "Contraseña incorrecta. Desinstalación cancelada." -ForegroundColor Red
    exit 1
}

Stop-Process -Name "MonitorSuite.Service","MonitorSuite.Admin" -Force -ErrorAction SilentlyContinue
Unregister-BadBoyAutoStart

foreach ($installDir in $installDirs) {
    if (Test-Path $installDir) {
        Remove-Item $installDir -Recurse -Force
        Write-Host "Eliminado: $installDir" -ForegroundColor Gray
    }
}

$desktop = [Environment]::GetFolderPath("Desktop")
Remove-Item (Join-Path $desktop "ADESA BadBoy Admin.lnk") -Force -ErrorAction SilentlyContinue

Write-Host "BadBoy desinstalado. Los datos en $env:ProgramData\MonitorSuite se conservan." -ForegroundColor Green
