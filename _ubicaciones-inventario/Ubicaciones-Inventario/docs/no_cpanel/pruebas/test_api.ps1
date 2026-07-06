# Script PowerShell para probar conexion a ADM Cloud API

# Configuracion
$email = "luis.useche@adesa.com.do"
$password = "Merida.123"
$appid = "cccdf964-1e69-46e7-5ed0-08de4e33921f"
$company = "7b5f5222-123e-4dc7-a783-2979ea9e6cff"
$role = "Administradores"

Write-Host ("=" * 60)
Write-Host "PRUEBA DE CONEXION - ADM Cloud API"
Write-Host ("=" * 60)
Write-Host ""

# Codificar credenciales
Write-Host "1. Preparando autenticacion..."
$credenciales = "$email`:$password"
$bytes = [System.Text.Encoding]::ASCII.GetBytes($credenciales)
$encoded = [Convert]::ToBase64String($bytes)
Write-Host "   [OK] Credenciales codificadas"
Write-Host ""

# Construir URL
$url = "https://api.admcloud.net/api/Items/?skip=0&appid=$appid&company=$company&role=$role"
Write-Host "2. URL de la peticion:"
Write-Host "   $url"
Write-Host ""

# Hacer peticion
Write-Host "3. Enviando peticion al servidor..."
try {
    $response = Invoke-WebRequest -Uri $url `
        -Method GET `
        -Headers @{
            "Authorization" = "Basic $encoded"
            "Accept" = "application/json"
        }
    
    Write-Host "   [OK] Respuesta recibida"
    Write-Host ""
    Write-Host ("=" * 60)
    Write-Host "RESULTADO"
    Write-Host ("=" * 60)
    Write-Host ""
    Write-Host "Status Code: $($response.StatusCode)"
    Write-Host ""
    
    if ($response.StatusCode -eq 200) {
        Write-Host "[EXITO] Conexion exitosa!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Respuesta recibida (primeros 500 caracteres):"
        Write-Host ""
        $content = $response.Content
        if ($content.Length -gt 500) {
            Write-Host $content.Substring(0, 500) "..."
        } else {
            Write-Host $content
        }
    }
} catch {
    Write-Host ("=" * 60)
    Write-Host "ERROR"
    Write-Host ("=" * 60)
    Write-Host ""
    
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "Status Code: $statusCode" -ForegroundColor Red
        Write-Host ""
        
        if ($statusCode -eq 401) {
            Write-Host "ERROR 401 - No autorizado" -ForegroundColor Red
            Write-Host ""
            Write-Host "Las credenciales no fueron aceptadas."
            Write-Host "Verifica:"
            Write-Host "  - Credenciales correctas"
            Write-Host "  - Integracion activa en ADM Cloud"
            Write-Host "  - Permisos de acceso al API"
        } else {
            Write-Host "Error: $statusCode"
        }
    } else {
        Write-Host "Error de conexion: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Verifica tu conexion a internet."
    }
}

Write-Host ""
Write-Host ("=" * 60)






