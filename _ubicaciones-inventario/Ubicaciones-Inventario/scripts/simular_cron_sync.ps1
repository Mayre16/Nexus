# Simula el cron de auto-sincronización WMS desde PowerShell
#
# USO:
#   .\simular_cron_sync.ps1 -BaseUrl "https://wms.adesa.com.do" -Token "TU_CRON_TOKEN"
#
# UNA SOLA EJECUCION (como cuando corre el cron):
#   .\simular_cron_sync.ps1 -BaseUrl "https://wms.adesa.com.do" -Token "tu-token"
#
# REPETIR CADA 5 MINUTOS (simular cron):
#   .\simular_cron_sync.ps1 -BaseUrl "https://wms.adesa.com.do" -Token "tu-token" -IntervaloSegundos 300
#
# GUARDAR LOG EN ARCHIVO:
#   .\simular_cron_sync.ps1 -BaseUrl "https://wms.adesa.com.do" -Token "tu-token" -LogFile "C:\temp\cron_sync.log"
#
# PARA VERIFICAR CARGA EN CPANEL:
#   1. Ejecuta este script
#   2. En el mismo momento, abre el Panel Admin en el navegador
#   3. Revisa los logs del servidor en cPanel y correlaciona los timestamps

param(
    [Parameter(Mandatory=$true)]
    [string]$BaseUrl,

    [Parameter(Mandatory=$true)]
    [string]$Token,

    [int]$IntervaloSegundos = 0,  # 0 = ejecutar una vez. >0 = repetir cada N segundos (simular cron cada 5 min = 300)
    [string]$LogFile = ""         # Vacío = solo consola. Si pones ruta, guarda en archivo
)

$TICK_URL = "$BaseUrl/api/sincronizar/auto/tick"
$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Msg)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $Msg"
    Write-Host $line
    if ($LogFile) {
        Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
    }
}

function Invoke-Tick {
    Write-Log "=== TICK ==="
    Write-Log "POST $TICK_URL"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $headers = @{
            "Content-Type" = "application/json"
            "X-CRON-TOKEN" = $Token
        }
        $resp = Invoke-RestMethod -Uri $TICK_URL -Method POST -Headers $headers -TimeoutSec 15
        $sw.Stop()
        Write-Log "Tick OK en $($sw.ElapsedMilliseconds) ms | status=$($resp.status) | location_id=$($resp.location_id) | target=$($resp.target)"
        return $resp
    } catch {
        $sw.Stop()
        Write-Log "Tick ERROR en $($sw.ElapsedMilliseconds) ms: $_"
        return $null
    }
}

function Invoke-Sync {
    param([string]$LocationId, [string]$Target)
    if ($Target -eq "lote") {
        $url = "$BaseUrl/api/sincronizar/ubicacion/$LocationId/lote"
    } else {
        $url = "$BaseUrl/api/sincronizar/ubicacion/$LocationId"
    }
    Write-Log "=== SYNC (fire and forget, timeout 25s como cron) ==="
    Write-Log "POST $url (target=$Target)"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $headers = @{
            "Content-Type" = "application/json"
            "X-CRON-TOKEN" = $Token
        }
        # Timeout 25s: igual que curl -m 20 del cron. Si la sync tarda mas, da timeout (esperado)
        $resp = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -TimeoutSec 25
        $sw.Stop()
        Write-Log "Sync respuesta en $($sw.ElapsedMilliseconds) ms: success=$($resp.success) message=$($resp.message)"
    } catch {
        $sw.Stop()
        $exc = $_.Exception
        if ($exc.Message -match "timed out|timeout|Timeout") {
            Write-Log "Sync DISPARADA. Timeout a los $($sw.ElapsedMilliseconds) ms - el proceso sigue en el servidor (comportamiento normal)"
        } else {
            Write-Log "Sync ERROR en $($sw.ElapsedMilliseconds) ms: $($exc.Message)"
        }
    }
}

# --- Main ---
Write-Log "=========================================="
Write-Log "SIMULACION CRON SYNC - BaseUrl=$BaseUrl"
Write-Log "=========================================="

$iteracion = 0
do {
    $iteracion++
    if ($IntervaloSegundos -gt 0) {
        Write-Log "--- Iteracion $iteracion ---"
    }

    $tick = Invoke-Tick

    if ($tick -and $tick.status -eq "ready" -and $tick.location_id) {
        $target = if ($tick.target) { $tick.target } else { "full" }
        Invoke-Sync -LocationId $tick.location_id -Target $target
    } else {
        $status = if ($tick) { $tick.status } else { "error" }
        Write-Log "No action: status=$status"
    }

    if ($IntervaloSegundos -gt 0) {
        Write-Log "Esperando $IntervaloSegundos segundos..."
        Start-Sleep -Seconds $IntervaloSegundos
    } else {
        break
    }
} while ($true)

Write-Log "=========================================="
Write-Log "Fin simulacion"
