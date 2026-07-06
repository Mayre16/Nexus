# 📋 Requisitos para Prueba de Conexión Básica

## ✅ Checklist Mínimo

### 1. **Credenciales de ADM Cloud**
```
□ Email de usuario
□ Contraseña
□ Código de integración (appid) - Debe estar creado en ADM Cloud
□ Company (ID de compañía)
□ Role (Rol del usuario, ej: "Administradores")
```

### 2. **Software Instalado**
```
□ Python 3.7 o superior
□ Biblioteca `requests` (se instala con: pip install requests)
```

### 3. **Acceso a Internet**
```
□ Conexión a internet activa
□ Permisos de firewall (si aplica)
□ Acceso a: https://api.admcloud.net
```

---

## 🔑 Datos Necesarios (Lo que Ya Tienes)

Basándome en lo que vimos anteriormente:

```python
email = "luis.useche@adesa.com.do"
password = "Merida.123"
appid = "cccdf964-1e69-46e7-5ed0-08de4e33921f"  # Código de integración WSM
company = "7b5f5222-123e-4dc7-a783-2979ea9e6cff"  # Nombre de Base de Datos
role = "Administradores"
```

---

## 🧪 Prueba Mínima: "¿Funciona la Conexión?"

### Lo que vamos a probar:

1. **¿Puedo conectarme al servidor?**
2. **¿Mis credenciales son aceptadas?**
3. **¿Puedo obtener al menos un dato?**

### Endpoint más simple para probar:

**`/api/Items`** - Lista de productos (solo lectura, no modifica nada)

---

## 📝 Script Mínimo de Prueba

```python
import requests
import base64

# 1. Credenciales
email = "luis.useche@adesa.com.do"
password = "Merida.123"
appid = "cccdf964-1e69-46e7-5ed0-08de4e33921f"
company = "7b5f5222-123e-4dc7-a783-2979ea9e6cff"
role = "Administradores"

# 2. Preparar autenticación
credenciales = f"{email}:{password}"
codificado = base64.b64encode(credenciales.encode()).decode()
auth_header = f"Basic {codificado}"

# 3. Preparar petición
url = "https://api.admcloud.net/api/Items/"
headers = {"Authorization": auth_header, "Accept": "application/json"}
params = {"skip": 0, "appid": appid, "company": company, "role": role}

# 4. Hacer la petición
try:
    response = requests.get(url, headers=headers, params=params)
    
    # 5. Ver resultado
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        print("✅ ¡CONEXIÓN EXITOSA!")
        datos = response.json()
        print(f"Respuesta recibida: {len(str(datos))} caracteres")
    else:
        print(f"❌ Error: {response.status_code}")
        print(f"Respuesta: {response.text[:200]}")
        
except Exception as e:
    print(f"❌ Error de conexión: {str(e)}")
```

---

## 🎯 Resultados Posibles

### ✅ Éxito (200 OK)
```
Status Code: 200
✅ ¡CONEXIÓN EXITOSA!
Respuesta recibida: [número] caracteres
```
**Significado:** Todo funciona, puedes continuar.

### ❌ Error 401 (No Autorizado)
```
Status Code: 401
❌ Error: 401
```
**Posibles causas:**
- Credenciales incorrectas
- Integración no activa o mal configurada
- Permisos insuficientes

**Qué verificar:**
- ¿El código de integración existe en ADM Cloud?
- ¿La integración está activa?
- ¿Las credenciales son correctas?

### ❌ Error de Conexión
```
❌ Error de conexión: [mensaje]
```
**Posibles causas:**
- Sin conexión a internet
- Firewall bloqueando
- Servidor no disponible

---

## 📦 Instalación Rápida

### Si no tienes Python:
1. Descarga Python desde: https://www.python.org/downloads/
2. Instala (marca la opción "Add Python to PATH")
3. Verifica: Abre terminal y escribe `python --version`

### Si ya tienes Python:
```bash
pip install requests
```

---

## 🚀 Próximo Paso Después de la Prueba

Una vez que la conexión básica funcione:

1. **Probar otros endpoints:**
   - Stock (inventario)
   - Locations (ubicaciones)
   - PurchaseOrders (compras)

2. **Analizar las respuestas:**
   - ¿Qué estructura tienen?
   - ¿Qué campos traen?
   - ¿Stock incluye location_id?

3. **Planear la sincronización:**
   - ¿Cada cuánto consultar?
   - ¿Cómo detectar cambios?
   - ¿Cómo almacenar los datos?

---

## 💡 Resumen: Lo Mínimo Necesario

1. ✅ **5 datos**: email, password, appid, company, role
2. ✅ **Python** instalado
3. ✅ **requests** instalado (`pip install requests`)
4. ✅ **Conexión a internet**
5. ✅ **Script de prueba** (te lo doy)

**Eso es todo para una prueba básica.**

¿Quieres que preparemos el script de prueba mínimo ahora?






