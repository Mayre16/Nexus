# Arranca Nexus + iERP como módulo (3 procesos)
$ErrorActionPreference = "Stop"
$NexusRoot = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
$ErpRoot = Join-Path (Split-Path -Parent $NexusRoot) "ERP"
$FrontendEnv = Join-Path $ErpRoot "apps\frontend\.env.local"
$FrontendExample = Join-Path $ErpRoot "apps\frontend\.env.nexus.example"

Write-Host "=== ADESA Nexus + iERP module ===" -ForegroundColor Cyan

if (-not (Test-Path $FrontendEnv)) {
  Copy-Item $FrontendExample $FrontendEnv
  Write-Host "Creado $FrontendEnv desde .env.nexus.example"
}

Set-Location $NexusRoot
docker compose up -d 2>$null

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$NexusRoot'; node backend/server.js"
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ErpRoot'; npm run dev:backend"
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ErpRoot\apps\frontend'; npm run dev:nexus"

Start-Sleep -Seconds 8
Start-Process "http://localhost:3000"
Start-Process "http://localhost:3000/modules/ierp/login"

Write-Host "Nexus :3000 | iERP API :3001 | iERP UI :3002 (proxy /modules/ierp)" -ForegroundColor Green
