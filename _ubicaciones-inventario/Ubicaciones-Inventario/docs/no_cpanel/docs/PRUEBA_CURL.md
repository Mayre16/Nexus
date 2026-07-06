# Prueba de Conexión con curl (Terminal/Shell)

## 🔧 curl en Windows (PowerShell)

Windows 10/11 ya incluye `curl`. Puedes usarlo directamente desde PowerShell.

---

## 📋 Método 1: Comando curl Simple

### Paso 1: Abre PowerShell

Presiona `Win + X` y selecciona "Windows PowerShell" o "Terminal"

### Paso 2: Prueba Básica

```powershell
# Reemplaza con tus credenciales
$email = "luis.useche@adesa.com.do"
$password = "Merida.123"
$appid = "cccdf964-1e69-46e7-5ed0-08de4e33921f"
$company = "7b5f5222-123e-4dc7-a783-2979ea9e6cff"
$role = "Administradores"

# Codificar credenciales en Base64
$credenciales = "$email`:$password"
$bytes = [System.Text.Encoding]::ASCII.GetBytes($credenciales)
$encoded = [Convert]::ToBase64String($bytes)

# Hacer la petición
curl -X GET "https://api.admcloud.net/api/Items/?skip=0&appid=$appid&company=$company&role=$role" `
  -H "Authorization: Basic $encoded" `
  -H "Accept: application/json"
```

---

## 📋 Método 2: Script PowerShell Completo

Crea un archivo `test_api.ps1` con este contenido:

```powershell
# Configuración
$email = "luis.useche@adesa.com.do"
$password = "Merida.123"
$appid = "cccdf964-1e69-46e7-5ed0-08de4e33921f"
$company = "7b5f5222-123e-4dc7-a783-2979ea9e6cff"
$role = "Administradores"

Write-Host "=" * 60
Write-Host "PRUEBA DE CONEXION - ADM Cloud API"
Write-Host "=" * 60
Write-Host ""

# Codificar credenciales
Write-Host "1. Preparando autenticacion..."
$credenciales = "$email`:$password"
$bytes = [System.Text.Encoding]::ASCII.GetBytes($credenciales)
$encoded = [Convert]::ToBase64String($bytes)
Write-Host "   OK - Credenciales codificadas"
Write-Host ""

# Construir URL
$url = "https://api.admcloud.net/api/Items/?skip=0&appid=$appid&company=$company&role=$role"
Write-Host "2. URL: $url"
Write-Host ""

# Hacer petición
Write-Host "3. Enviando peticion..."
try {
    $response = Invoke-WebRequest -Uri $url `
        -Method GET `
        -Headers @{
            "Authorization" = "Basic $encoded"
            "Accept" = "application/json"
        }
    
    Write-Host "   Status Code: $($response.StatusCode)"
    Write-Host ""
    
    if ($response.StatusCode -eq 200) {
        Write-Host "=" * 60
        Write-Host "EXITO - Conexion exitosa!"
        Write-Host "=" * 60
        Write-Host ""
        Write-Host "Respuesta (primeros 500 caracteres):"
        Write-Host $response.Content.Substring(0, [Math]::Min(500, $response.Content.Length))
    }
} catch {
    Write-Host "=" * 60
    Write-Host "ERROR"
    Write-Host "=" * 60
    Write-Host ""
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)"
    Write-Host "Error: $($_.Exception.Message)"
}
```

### Para ejecutar el script:

```powershell
.\test_api.ps1
```

**Nota**: Si PowerShell bloquea la ejecución de scripts, ejecuta primero:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## 📋 Método 3: curl desde CMD (Command Prompt)

Si prefieres usar CMD en lugar de PowerShell:

```cmd
curl -X GET "https://api.admcloud.net/api/Items/?skip=0&appid=cccdf964-1e69-46e7-5ed0-08de4e33921f&company=7b5f5222-123e-4dc7-a783-2979ea9e6cff&role=Administradores" -H "Authorization: Basic bHVpcy51c2VjaGVAYWRlc2EuY29tLmRvOk1lcmlkYS4xMjM=" -H "Accept: application/json"
```

**Nota**: Necesitarías codificar las credenciales primero (puedes usar un script Python pequeño para eso).

---

## 🌐 Método 4: Desde el Navegador (Limitado)

**No funciona directamente** porque el navegador no puede enviar el header `Authorization: Basic` en peticiones normales.

Pero puedes usar extensiones del navegador como:
- **Postman** (aplicación desktop)
- **REST Client** (extensión VS Code)
- **Thunder Client** (extensión VS Code)

---

## 🧪 Método 5: Usando Python desde Terminal (Más Fácil)

Si ya tienes Python instalado, puedes ejecutar directamente:

```bash
python test_conexion_basica.py
```

---

## 📊 Comparar Resultados

Independientemente del método que uses, deberías ver:

### ✅ Éxito (200):
```json
{
  "success": true,
  "data": [...]
}
```

### ❌ Error 401:
```
(Respuesta vacía o error de autenticación)
```

---

## 💡 Recomendación

**Para Windows, el método más fácil es:**

1. **PowerShell con Invoke-WebRequest** (Método 2)
   - Ya está instalado
   - Fácil de usar
   - Muestra resultados claros

2. **Python** (si ya lo tienes)
   - Más flexible
   - Ya tenemos el script listo

¿Qué método prefieres probar?






