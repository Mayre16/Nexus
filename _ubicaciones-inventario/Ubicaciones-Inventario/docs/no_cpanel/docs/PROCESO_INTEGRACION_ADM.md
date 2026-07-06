# Proceso de Integración con ADM Cloud API

## 🔑 Información Crítica Encontrada

Según la documentación oficial de ADM Cloud (https://www.admcloud.net/api), el proceso para usar el API requiere **crear una integración primero**.

### Paso 1: Crear Integración en ADM Cloud

**IMPORTANTE**: Antes de usar el API, debes:

1. **Dentro de ADM Cloud**, ir a la pantalla de **"Integraciones con Web Services"**
2. **Crear un código de integración** (este será tu `appid`)
3. Este código de integración es diferente del `appid` que estás usando actualmente

### Paso 2: Usar el API

Una vez creada la integración, el `appid` será el **código de integración** que creaste, no el UUID que estás usando actualmente.

## 🔍 Problema Actual

El error **401 (No autorizado)** que estamos recibiendo probablemente se debe a que:

- El `appid` actual (`cccdf964-1e69-46e7-5ed0-08de4e33921f`) puede no ser un código de integración válido
- O no se ha creado la integración en ADM Cloud

## 📋 Pasos para Resolver

### Opción 1: Crear Integración en ADM Cloud

1. **Accede a ADM Cloud** (tu sistema web)
2. **Busca la sección "Integraciones con Web Services"** o "Web Services Integrations"
3. **Crea una nueva integración**
   - Asigna un nombre (ej: "WMS Ubicaciones")
   - Guarda el código de integración generado
4. **Usa ese código como `appid`** en las llamadas al API

### Opción 2: Verificar Integración Existente

Si ya tienes una integración creada:
1. Ve a "Integraciones con Web Services"
2. Verifica que el código de integración esté activo
3. Usa ese código exacto como `appid`

## 📝 Ejemplo de la Documentación

Según la documentación oficial:

```
GET https://api.admcloud.net/api/details/5af7e7b6-f2a4-48f8-b97f-45ea2c8a13ba?company=demo&role=administradores&appid=378d0208-6942-4bc6-a880-2c9b1229610f
```

Donde:
- `appid=378d0208-6942-4bc6-a880-2c9b1229610f` es el **código de integración creado**
- `company=demo` es tu compañía
- `role=administradores` es tu rol
- Autenticación: **Basic Authentication** con usuario y contraseña

## ✅ Siguiente Paso

**Debes crear la integración en ADM Cloud primero**, o verificar si ya existe y obtener el código correcto.

Una vez que tengas el código de integración correcto, actualizamos el script con ese `appid` y debería funcionar.






