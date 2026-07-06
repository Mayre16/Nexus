# ====================================================================
# ADESA Nexus - Lanzador de desarrollo (Windows / PowerShell)
# Levanta TODO con un solo comando:
#   1) Arranca Docker Desktop si no está corriendo
#   2) Levanta MariaDB + Adminer (docker compose)
#   3) Inicia el backend (que sirve también el frontend)
#
# Uso:   ./dev.ps1
# ====================================================================

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "[Nexus] Verificando Docker..." -ForegroundColor Cyan
docker info --format "{{.ServerVersion}}" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "[Nexus] Docker no responde. Iniciando Docker Desktop..." -ForegroundColor Yellow
  $paths = @("$env:ProgramFiles\Docker\Docker\Docker Desktop.exe", "$env:LOCALAPPDATA\Docker\Docker Desktop.exe")
  $exe = $paths | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($exe) { Start-Process $exe }
  for ($i = 0; $i -lt 40; $i++) {
    docker info --format "{{.ServerVersion}}" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 3
  }
}
Write-Host "[Nexus] Docker listo." -ForegroundColor Green

Write-Host "[Nexus] Levantando base de datos (MariaDB + Adminer)..." -ForegroundColor Cyan
docker compose up -d | Out-Null

Write-Host "[Nexus] Esperando a que MariaDB este saludable..." -ForegroundColor Cyan
for ($i = 0; $i -lt 30; $i++) {
  $h = docker inspect --format "{{.State.Health.Status}}" nexus_mariadb 2>$null
  if ($h -eq "healthy") { break }
  Start-Sleep -Seconds 2
}
Write-Host "[Nexus] Base de datos lista." -ForegroundColor Green

Write-Host "[Nexus] Iniciando backend en http://localhost:3000 ..." -ForegroundColor Cyan
Write-Host "        Frontend:  http://localhost:3000" -ForegroundColor Gray
Write-Host "        Adminer:   http://localhost:8080" -ForegroundColor Gray
node backend/server.js
