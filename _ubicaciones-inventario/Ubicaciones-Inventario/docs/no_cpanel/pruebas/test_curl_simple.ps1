# Script simple usando curl (más básico)

$email = "luis.useche@adesa.com.do"
$password = "Merida.123"
$appid = "cccdf964-1e69-46e7-5ed0-08de4e33921f"
$company = "7b5f5222-123e-4dc7-a783-2979ea9e6cff"
$role = "Administradores"

# Codificar credenciales
$credenciales = "$email`:$password"
$bytes = [System.Text.Encoding]::ASCII.GetBytes($credenciales)
$encoded = [Convert]::ToBase64String($bytes)

# URL
$url = "https://api.admcloud.net/api/Items/?skip=0&appid=$appid&company=$company&role=$role"

Write-Host "Probando conexion..."
Write-Host ""

# Usar curl (Invoke-WebRequest es el alias de curl en PowerShell)
curl -X GET $url -H "Authorization: Basic $encoded" -H "Accept: application/json"






