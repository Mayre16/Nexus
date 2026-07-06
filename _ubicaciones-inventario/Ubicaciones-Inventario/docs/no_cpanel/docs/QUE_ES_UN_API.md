# ¿Qué es un API? - Explicación Simple

## 🎯 Concepto Básico

**API = Application Programming Interface (Interfaz de Programación de Aplicaciones)**

Piensa en un API como un **"camarero en un restaurante"**:

```
TÚ (Cliente)                    CAMARERO (API)              COCINA (Sistema)
─────────────────              ────────────────            ────────────────
"Hola, quiero                  Toma tu pedido y            Prepara la comida
 una hamburguesa"  ──────────> lo lleva a la cocina        usando las recetas
                                y regresa con               y devuelve el
                                lo que pediste   <───────── resultado
                                "Aquí tienes tu
                                hamburguesa"
```

**En tu caso:**
```
TU APP (WMS)                    API de ADM Cloud           ADM Cloud (ERP)
─────────────────              ────────────────            ────────────────
"Necesito la lista             Recibe tu solicitud        Busca en su base
 de productos"     ──────────> y la procesa                de datos y
                                según reglas                devuelve la
                                definidas                   información
                                "Aquí tienes la   <────────
                                lista de productos"
```

---

## 🔌 ¿Cómo se Comunica un API?

### 1. **HTTP - El Idioma que Hablan**

Los APIs usan **HTTP** (el mismo protocolo que usa tu navegador para ver páginas web).

**Peticiones HTTP comunes:**
- **GET** = "Dame información" (leer)
- **POST** = "Crea algo nuevo" (crear)
- **PUT** = "Actualiza algo existente" (actualizar)
- **DELETE** = "Borra algo" (eliminar)

### Ejemplo Real:

```
GET https://api.admcloud.net/api/Items
```

Esto significa: "Oye API de ADM Cloud, dame la lista de Items (productos)"

---

## 📋 Partes de una Llamada al API

### 1. **URL (Dirección)**
```
https://api.admcloud.net/api/Items
│       │                │    │
│       │                │    └─ Endpoint (qué quieres)
│       │                └─────── Ruta base del API
│       └──────────────────────── Servidor
└───────────────────────────────── Protocolo (HTTPS)
```

### 2. **Método HTTP**
```
GET /api/Items          ← "Dame información"
POST /api/Items         ← "Crea un nuevo item"
PUT /api/Items/123      ← "Actualiza el item 123"
DELETE /api/Items/123   ← "Borra el item 123"
```

### 3. **Parámetros (Información Adicional)**
```
GET /api/Items?skip=0&take=10&appid=xxx&company=yyy
                      │    │     │         │
                      │    │     │         └─ Empresa
                      │    │     └─────────── ID de integración
                      │    └───────────────── Cuántos quieres
                      └────────────────────── Desde dónde empezar
```

### 4. **Headers (Información de la Petición)**
```
Authorization: Basic dXN1YXJpbzpjbGF2ZQ==
             │              │
             │              └─ Credenciales codificadas
             └──────────────── Tipo de autenticación

Content-Type: application/json
Accept: application/json
```

### 5. **Body (Datos a Enviar - Solo en POST/PUT)**
```json
{
  "SKU": "PROD001",
  "Name": "Producto Nuevo",
  "Price": 100
}
```

---

## 🔐 Autenticación (Quién Eres)

El API necesita saber **quién eres** antes de darte información.

### Basic Authentication (Lo que usa ADM Cloud)

**Concepto:**
- Combinas tu email y contraseña
- Los codificas en Base64
- Los envías en cada petición

**Ejemplo:**
```
Email: luis@ejemplo.com
Password: MiClave123

Se convierte en: luis@ejemplo.com:MiClave123
Luego se codifica: bHVpc0BlamVtcGxvLmNvbTpNaUNsYXZlMTIz
Se envía como: Authorization: Basic bHVpc0BlamVtcGxvLmNvbTpNaUNsYXZlMTIz
```

**En Python:**
```python
import base64

email = "luis@ejemplo.com"
password = "MiClave123"
credenciales = f"{email}:{password}"
codificado = base64.b64encode(credenciales.encode()).decode()
header = f"Basic {codificado}"
```

---

## 📥 Respuesta del API

El API siempre responde, generalmente en formato **JSON**:

### Respuesta Exitosa (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "ID": "123",
      "SKU": "PROD001",
      "Name": "Producto 1",
      "Price": 100
    },
    {
      "ID": "124",
      "SKU": "PROD002",
      "Name": "Producto 2",
      "Price": 200
    }
  ]
}
```

### Respuesta de Error (401 No Autorizado):
```json
{
  "error": "Unauthorized",
  "message": "Invalid credentials"
}
```

### Códigos de Estado HTTP:
- **200** = Todo bien, aquí está la información
- **201** = Creado exitosamente
- **400** = Error en tu petición (datos incorrectos)
- **401** = No autorizado (credenciales incorrectas)
- **404** = No encontrado (el recurso no existe)
- **500** = Error del servidor

---

## 🔄 Flujo Completo: Ejemplo Real

### Escenario: Tu app quiere obtener la lista de productos

```
PASO 1: Tu App prepara la petición
─────────────────────────────────────
URL: https://api.admcloud.net/api/Items/
Método: GET
Headers:
  Authorization: Basic [credenciales codificadas]
  Accept: application/json
Parámetros:
  skip=0
  appid=cccdf964-1e69-46e7-5ed0-08de4e33921f
  company=7b5f5222-123e-4dc7-a783-2979ea9e6cff
  role=Administradores

PASO 2: Tu App envía la petición
─────────────────────────────────────
[Tu código Python/JavaScript/etc. hace la petición]

PASO 3: API de ADM Cloud procesa
─────────────────────────────────────
- Verifica credenciales
- Valida parámetros
- Busca en la base de datos
- Prepara la respuesta

PASO 4: API responde
─────────────────────────────────────
Status: 200 OK
Body:
{
  "success": true,
  "data": [
    { "ID": "...", "SKU": "...", "Name": "..." },
    ...
  ]
}

PASO 5: Tu App recibe y procesa
─────────────────────────────────────
- Lee la respuesta
- Extrae los datos
- Los usa en tu aplicación
```

---

## 💻 Ejemplo en Código Python

```python
import requests
import base64

# 1. Preparar credenciales
email = "luis.useche@adesa.com.do"
password = "Merida.123"
credenciales = f"{email}:{password}"
codificado = base64.b64encode(credenciales.encode()).decode()
auth_header = f"Basic {codificado}"

# 2. Preparar la petición
url = "https://api.admcloud.net/api/Items/"
headers = {
    "Authorization": auth_header,
    "Accept": "application/json"
}
params = {
    "skip": 0,
    "appid": "cccdf964-1e69-46e7-5ed0-08de4e33921f",
    "company": "7b5f5222-123e-4dc7-a783-2979ea9e6cff",
    "role": "Administradores"
}

# 3. Enviar la petición
response = requests.get(url, headers=headers, params=params)

# 4. Procesar la respuesta
if response.status_code == 200:
    datos = response.json()
    productos = datos["data"]
    print(f"Obtuvimos {len(productos)} productos")
else:
    print(f"Error: {response.status_code}")
    print(response.text)
```

---

## 🎯 Conceptos Clave para Tu Proyecto

### 1. **Endpoints** (Puntos de Entrada)
Cada "cosa" que quieres obtener tiene su endpoint:
- `/api/Items` = Productos
- `/api/Stock` = Inventario
- `/api/Locations` = Ubicaciones
- `/api/PurchaseOrders` = Órdenes de Compra

### 2. **Solo Lectura vs Lectura/Escritura**
- **GET** = Solo leer (obtener información)
- **POST/PUT/DELETE** = Modificar (crear/actualizar/borrar)

En tu caso, para el WMS:
- **Solo necesitas GET** para leer información de ADM Cloud
- Tu app mantiene su propia base de datos
- ADM Cloud es la "fuente de verdad" del total
- Tu app es la "fuente de verdad" de la distribución por ubicación

### 3. **Sincronización**
Tu app consultará el API periódicamente:
```
Cada 15-30 minutos:
  1. Tu app pregunta: "¿Qué productos hay?"
  2. API responde: "Aquí está la lista"
  3. Tu app compara: "¿Cambió algo desde la última vez?"
  4. Tu app actualiza: "Ahora tengo la info actualizada"
```

---

## ❓ Preguntas Frecuentes

### ¿Por qué necesita autenticación?
Por seguridad. El API necesita saber que eres tú y que tienes permiso para acceder.

### ¿Qué es Base64?
Una forma de codificar texto. No es encriptación (se puede decodificar fácilmente), solo codificación para enviar caracteres especiales.

### ¿Por qué JSON?
Es un formato fácil de leer tanto para humanos como para computadoras. Similar a XML pero más simple.

### ¿Qué pasa si el API está caído?
Tu app no puede obtener información nueva. Por eso tu app mantiene su propia base de datos (caché) con la última información conocida.

---

## 🎬 Resumen en 3 Puntos

1. **API = Camarero**: Tú pides algo, él lo trae
2. **HTTP = Idioma**: GET, POST, PUT, DELETE son los "verbos"
3. **JSON = Formato**: Cómo se envían y reciben los datos

---

## 📚 Siguiente Paso

Ahora que entiendes cómo funciona un API, podemos continuar con:
- Cómo hacer las peticiones en tu código
- Cómo procesar las respuestas
- Cómo manejar errores
- Cómo sincronizar datos

¿Tienes alguna duda específica sobre cómo funcionan los APIs?






