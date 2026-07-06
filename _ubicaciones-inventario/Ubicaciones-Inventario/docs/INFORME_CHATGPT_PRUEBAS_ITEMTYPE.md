# Informe para ChatGPT: Pruebas de Detección de ItemType en ADM Cloud

## 📋 CONTEXTO DEL SISTEMA

### ¿Qué es este sistema?

Somos un **Sistema de Gestión de Almacén (WMS)** que se integra con **ADM Cloud** (un ERP). El sistema permite:

1. **Recepciones de Mercancía:**
   - Recibir productos desde ADM Cloud
   - Asignar ubicaciones físicas en el almacén
   - Registrar stock en ubicaciones físicas

2. **Despachos de Mercancía:**
   - Procesar órdenes de despacho desde ADM Cloud
   - Verificar stock disponible en ubicaciones físicas
   - Registrar movimientos de picking (salida de productos)

3. **Gestión de Inventario:**
   - Sincronización de productos y stock desde ADM Cloud
   - Control de ubicaciones físicas en el almacén
   - Movimientos de inventario (transferencias, ajustes)

### Arquitectura Técnica

- **Backend:** Python (Flask)
- **Base de Datos:** MySQL
- **API Externa:** ADM Cloud REST API
- **Frontend:** HTML/JavaScript

---

## 🔍 PROBLEMA ACTUAL

### Situación Identificada

ADM Cloud tiene **3 tipos de productos** diferentes:

1. **Items (Artículos):** Productos físicos que **SÍ manejan stock**
   - Ejemplo: "Bicicleta", "Repuesto", "Accesorio"
   - Endpoint: `GET /api/Items`

2. **Kits:** Conjuntos de productos que **NO manejan stock directamente**
   - Ejemplo: "Kit de mantenimiento" (compuesto por varios items)
   - Endpoint: `GET /api/Kits`

3. **Services (Servicios):** Servicios que **NO manejan stock**
   - Ejemplo: "Instalación", "Mantenimiento mensual", "Servicio técnico"
   - Endpoint: `GET /api/Services`

### Problema Específico

**El sistema actual NO distingue entre estos 3 tipos** cuando procesa documentos (recepciones, despachos, facturas).

**Consecuencias:**

1. **En Recepciones:**
   - El sistema intenta crear stock físico para **todos** los productos
   - Incluyendo servicios y kits que **no deberían tener stock físico**
   - Se crean registros innecesarios en la base de datos

2. **En Despachos:**
   - El sistema verifica stock físico para **todos** los productos
   - Incluyendo servicios que **no requieren verificación de stock**
   - Muestra campos de ubicación física para servicios (que no tienen sentido)

3. **En la Interfaz:**
   - Los usuarios ven campos de "Ubicación Física" para servicios/kits
   - Deben asignar ubicaciones a productos que no las necesitan
   - Proceso confuso e ineficiente

### Evidencia del Problema

**Código Actual (`utils/helpers.py`):**

```python
def obtener_productos_factura(factura_data: dict) -> List[dict]:
    productos = []
    items = factura_data.get("Items", [])
    
    for item in items:
        producto = {
            "RowOrder": item.get("RowOrder"),
            "ItemID": item.get("ItemID"),
            "ItemSKU": item.get("ItemSKU", ""),
            "SKU": item.get("SKU", item.get("ItemSKU", "")),
            "Name": item.get("Name", ""),
            "Quantity": float(item.get("Quantity", 0)),
            "Cost": float(item.get("Cost", 0)),
            "ExtendedCost": float(item.get("ExtendedCost", 0)),
            "UOMName": item.get("UOMName", ""),
        }
        productos.append(producto)
    
    return productos
```

**Observación:** No se extrae ningún campo que indique el tipo de producto (Item, Kit, o Service).

---

## 🎯 SOLUCIÓN PROPUESTA

### Objetivo

**Detectar automáticamente** si un producto en un documento es:
- **Item (I):** Requiere ubicación física y manejo de stock
- **Kit (K):** NO requiere ubicación física
- **Service (S):** NO requiere ubicación física

### Comportamiento Esperado

1. **Si es Item (I):**
   - ✅ Mostrar campos de ubicación física
   - ✅ Verificar/crear stock en ubicaciones físicas
   - ✅ Permitir asignación de ubicación

2. **Si es Kit (K) o Service (S):**
   - ❌ NO mostrar campos de ubicación física
   - ❌ NO verificar/crear stock físico
   - ✅ Permitir registro directo sin asignación de ubicación

---

## 🔬 PRUEBAS NECESARIAS

### Pregunta Clave

**¿Los items dentro de los documentos (Dispatchs, Receptions, Invoices) incluyen el campo `ItemType`?**

### Escenarios Posibles

#### Escenario A: ItemType viene en los documentos (IDEAL)

Si cuando obtenemos un documento completo (ej: `GET /api/Dispatchs/{guid}`), los items dentro incluyen `ItemType`:

```json
{
  "ID": "...",
  "DocID": "00002932",
  "Items": [
    {
      "ItemID": "...",
      "SKU": "ABC123",
      "Name": "Producto Normal",
      "ItemType": "I",  // ← Viene aquí
      "Quantity": 10
    },
    {
      "ItemID": "...",
      "SKU": "100UD",
      "Name": "Servicio Mensual",
      "ItemType": "S",  // ← Viene aquí
      "Quantity": 1
    }
  ]
}
```

**Implementación:** Simple - solo extraer el campo `ItemType` y validar.

#### Escenario B: ItemType NO viene en los documentos (COMPLEJO)

Si los items en documentos NO incluyen `ItemType`, necesitaríamos:

1. Obtener el `ItemID` de cada item
2. Hacer llamadas adicionales a:
   - `GET /api/Items/{id}` (si es Item)
   - `GET /api/Kits/{id}` (si es Kit)
   - `GET /api/Services/{id}` (si es Service)
3. Determinar el tipo según qué endpoint responde

**Implementación:** Más compleja y lenta (múltiples llamadas API).

---

## 📝 COMANDOS DE PRUEBA REQUERIDOS

### Necesitamos Probar:

1. **Obtener un documento completo** (Dispatch o Reception) y ver la estructura de sus Items
2. **Verificar si los Items tienen el campo `ItemType`**
3. **Identificar qué valores puede tener** (`"I"`, `"S"`, `"K"`, etc.)
4. **Probar con un documento que tenga items mixtos** (Item + Kit + Service)

### Información de Conexión ADM Cloud

- **Base URL:** `https://api.admcloud.net/api`
- **Company ID:** `7b5f5222-123e-4dc7-a783-2979ea9e6cff`
- **Role:** `Administradores`
- **AppID:** `cccdf964-1e69-46e7-5ed0-08de4e33921f`

### Endpoints a Probar

1. **`GET /api/Dispatchs/{guid}`** - Obtener despacho completo
2. **`GET /api/Receptions/{guid}`** - Obtener recepción completa
3. **`GET /api/CashInvoices/{guid}`** - Obtener factura completa
4. **`GET /api/Dispatchs`** - Listar despachos (para encontrar un GUID)

---

## 🎯 RESULTADOS ESPERADOS DE LAS PRUEBAS

### Lo que Necesitamos Saber:

1. ✅ **¿Los Items en documentos tienen campo `ItemType`?**
   - Si SÍ → Implementación simple
   - Si NO → Implementación compleja

2. ✅ **¿Qué valores puede tener `ItemType`?**
   - Probablemente: `"I"` (Item), `"S"` (Service), `"K"` (Kit)
   - Necesitamos confirmar los valores exactos

3. ✅ **¿Todos los Items lo tienen o solo algunos?**
   - Si todos lo tienen → Validación simple
   - Si algunos no → Necesitamos valor por defecto

4. ✅ **¿Hay otros campos útiles?**
   - Revisar estructura completa de Items
   - Identificar campos adicionales que puedan ayudar

---

## 📋 INSTRUCCIONES PARA CHATGPT

### Tarea Principal

**Ayudar a crear comandos de PowerShell** para probar la API de ADM Cloud y verificar:

1. Si los Items dentro de documentos incluyen el campo `ItemType`
2. Qué estructura tienen los Items en documentos completos
3. Cómo identificar Items, Kits y Services en documentos

### Comandos Necesarios

1. **Comando para listar Dispatchs** y encontrar uno con GUID
2. **Comando para obtener un Dispatch completo** por GUID
3. **Comando para obtener una Reception completa** por GUID
4. **Comandos para analizar la estructura de Items** dentro de los documentos
5. **Comandos para verificar si existe el campo `ItemType`** en los Items

### Formato de Autenticación

ADM Cloud usa **Basic Authentication** con:
- Email y Password (codificados en Base64)
- O Token (si está disponible)

Los parámetros de query incluyen:
- `company` (GUID)
- `role` (string)
- `appid` (GUID)
- `OnlyActive` (boolean)

### Output Esperado

Necesitamos ver:
- La estructura completa de un documento (Dispatch/Reception)
- La estructura completa de los Items dentro del documento
- Específicamente si los Items tienen el campo `ItemType`
- Los valores posibles de `ItemType` si existe

---

## 🔧 CONTEXTO TÉCNICO ADICIONAL

### Estructura Actual del Código

**Archivo:** `utils/helpers.py`

Funciones que extraen productos:
- `obtener_productos_factura()` - Para facturas/despachos
- `obtener_productos_recepcion()` - Para recepciones
- `obtener_productos_dispatch()` - Para despachos
- `obtener_productos_credit_note()` - Para notas de crédito

**Todas estas funciones** actualmente NO extraen `ItemType`.

### Cambios Planificados (dependiendo de resultados)

**Si ItemType viene en documentos:**

1. Modificar funciones `obtener_productos_*` para extraer `ItemType`
2. Agregar validación en frontend para ocultar campos de ubicación
3. Agregar validación en backend para no crear stock para servicios/kits

**Si ItemType NO viene en documentos:**

1. Crear función para detectar tipo haciendo llamadas adicionales
2. Implementar caché para evitar llamadas repetidas
3. Optimizar para minimizar impacto en performance

---

## 📊 RESUMEN EJECUTIVO PARA CHATGPT

### Situación

- Sistema WMS que procesa documentos de ADM Cloud
- ADM Cloud tiene 3 tipos: Items (con stock), Kits (sin stock), Services (sin stock)
- Sistema actual trata todos igual, causando problemas

### Problema

- No podemos distinguir Items de Kits/Services en documentos
- Necesitamos saber si los Items en documentos tienen campo `ItemType`

### Solución Propuesta

- Detectar tipo automáticamente
- Si es Kit/Service: NO pedir ubicación física, NO crear stock
- Si es Item: Comportamiento normal (con ubicación y stock)

### Necesidad Actual

- **Comandos PowerShell** para probar la API de ADM Cloud
- Verificar estructura de Items en documentos
- Confirmar si existe campo `ItemType` y sus valores

### Resultado Esperado

- Comandos funcionales de PowerShell
- Evidencia clara de si `ItemType` viene en documentos
- Información suficiente para decidir implementación

---

**Fecha:** 2026-01-30
**Estado:** Pendiente de pruebas con PowerShell
**Prioridad:** Alta (mejora importante de UX y lógica de negocio)
