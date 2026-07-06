# Análisis del Ejemplo de URL del API

## 🔍 URL del Ejemplo

```
https://api.admcloud.net/api/details/5af7e7b6-f2a4-48f8-b97f-45ea2c8a13ba?company=demo&role=administradores&appid=378d0208-6942-4bc6-a880-2c9b1229610f
```

## 📋 Desglose de la URL

### Estructura:

```
https://api.admcloud.net/api/details/5af7e7b6-f2a4-48f8-b97f-45ea2c8a13ba?company=demo&role=administradores&appid=378d0208-6942-4bc6-a880-2c9b1229610f
│       │                │    │       │                                    │
│       │                │    │       │                                    └─ Parámetros (Query String)
│       │                │    │       └─ ID específico del recurso
│       │                │    └─ Endpoint "details"
│       │                └─ Ruta base "/api"
│       └─ Servidor
└─ Protocolo
```

### Partes:

1. **Base URL**: `https://api.admcloud.net/api`
2. **Endpoint**: `/details/`
3. **ID del recurso**: `5af7e7b6-f2a4-48f8-b97f-45ea2c8a13ba`
4. **Parámetros**:
   - `company=demo`
   - `role=administradores`
   - `appid=378d0208-6942-4bc6-a880-2c9b1229610f`

---

## 🆚 Diferencia con lo que Estamos Usando

### Ejemplo de la Documentación:
```
GET /api/details/5af7e7b6-f2a4-48f8-b97f-45ea2c8a13ba
```
- Endpoint: `/details/`
- **Requiere un ID específico** del recurso
- Obtiene **detalles de un recurso específico**

### Lo que Estamos Usando:
```
GET /api/Items/
```
- Endpoint: `/Items/`
- **No requiere ID** (o lo puede tener como parámetro opcional)
- Obtiene **lista de items** (múltiples recursos)

---

## 📚 Tipos de Endpoints

### 1. **Lista de Recursos** (Lo que necesitamos)
```
GET /api/Items/
GET /api/Stock/
GET /api/Locations/
GET /api/PurchaseOrders/
```
- **Propósito**: Obtener múltiples elementos
- **Parámetros**: `skip`, `take`, filtros, etc.
- **Respuesta**: Array de objetos

### 2. **Detalle de un Recurso Específico**
```
GET /api/details/5af7e7b6-f2a4-48f8-b97f-45ea2c8a13ba
GET /api/Items/5af7e7b6-f2a4-48f8-b97f-45ea2c8a13ba
```
- **Propósito**: Obtener un elemento específico
- **Requiere**: ID del recurso
- **Respuesta**: Un solo objeto

### 3. **Crear/Actualizar**
```
POST /api/Items/
PUT /api/Items/5af7e7b6-f2a4-48f8-b97f-45ea2c8a13ba
```
- **Propósito**: Crear o modificar recursos
- **Requiere**: Datos en el Body de la petición

---

## 🎯 Para Tu Proyecto WMS

### Endpoints que Necesitarás:

#### ✅ Para Sincronización (Listas):
```python
# Obtener lista de productos
GET /api/Items/?skip=0&appid=xxx&company=yyy&role=zzz

# Obtener stock
GET /api/Stock/?skip=0&appid=xxx&company=yyy&role=zzz

# Obtener ubicaciones
GET /api/Locations/?skip=0&appid=xxx&company=yyy&role=zzz

# Obtener compras
GET /api/PurchaseOrders/?skip=0&appid=xxx&company=yyy&role=zzz
```

#### 🔍 Para Detalles Específicos (Opcional):
```python
# Si necesitas detalles de un producto específico
GET /api/Items/5af7e7b6-f2a4-48f8-b97f-45ea2c8a13ba?appid=xxx&company=yyy&role=zzz
```

---

## 📝 Formato Correcto de Parámetros

### En el Query String:
```
?company=demo&role=administradores&appid=378d0208-6942-4bc6-a880-2c9b1229610f
│          │    │                  │
│          │    │                  └─ Valor: código de integración
│          │    └─ Nombre: role
│          └─ Valor: nombre o ID de la compañía
└─ Nombre: company
```

### Separación:
- `?` = Inicio de parámetros
- `&` = Separador entre parámetros
- `=` = Asignación (nombre=valor)

### En Python (usando `requests`):
```python
params = {
    "company": "demo",
    "role": "administradores",
    "appid": "378d0208-6942-4bc6-a880-2c9b1229610f"
}

# requests automáticamente lo convierte a:
# ?company=demo&role=administradores&appid=378d0208-6942-4bc6-a880-2c9b1229610f
```

---

## 🔄 Comparación: Ejemplo vs Tu Caso

### Ejemplo de Documentación:
```python
# Obtener detalles de algo específico (necesitas conocer el ID)
url = "https://api.admcloud.net/api/details/5af7e7b6-f2a4-48f8-b97f-45ea2c8a13ba"
params = {
    "company": "demo",
    "role": "administradores",
    "appid": "378d0208-6942-4bc6-a880-2c9b1229610f"
}
```

### Tu Caso (Lista de Items):
```python
# Obtener lista de productos (no necesitas ID específico)
url = "https://api.admcloud.net/api/Items/"
params = {
    "skip": 0,
    "company": "7b5f5222-123e-4dc7-a783-2979ea9e6cff",
    "role": "Administradores",
    "appid": "cccdf964-1e69-46e7-5ed0-08de4e33921f"
}
```

---

## 💡 Puntos Clave

1. **El formato es correcto**: Tu código usa el formato correcto de parámetros
2. **Diferentes endpoints, mismo formato**: Todos usan query string para parámetros
3. **El ejemplo muestra `/details/`**: Pero tú necesitas `/Items/`, `/Stock/`, etc.
4. **Los parámetros siempre van igual**: `company`, `role`, `appid` siempre se requieren

---

## ✅ Tu Código Está Correcto

El script que tenemos (`test_conexion_basica.py`) usa el formato correcto:

```python
url = "https://api.admcloud.net/api/Items/"  # ✅ Correcto
params = {
    "skip": 0,                              # ✅ Correcto
    "appid": APPID,                         # ✅ Correcto
    "company": COMPANY,                     # ✅ Correcto
    "role": ROLE                            # ✅ Correcto
}
```

El formato es idéntico al ejemplo, solo cambia el endpoint (lo cual es correcto).

---

## 🎯 Conclusión

El ejemplo que viste es para obtener **detalles de un recurso específico**.

Para tu WMS necesitas obtener **listas** (Items, Stock, Locations), que es exactamente lo que estamos haciendo.

**Tu código está bien formado, el problema del 401 es de autenticación/configuración, no de formato.**






