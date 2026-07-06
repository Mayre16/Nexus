# CÓMO VERIFICAR LOS ENDPOINTS NUEVOS

## Requisitos Previos

1. **Debes estar autenticado como administrador** en la aplicación
2. Tener acceso al navegador o herramienta para hacer peticiones HTTP

---

## MÉTODO 1: Usando el Navegador (Más Fácil)

### Paso 1: Iniciar Sesión

1. Abre tu navegador
2. Ve a: `https://wms.adesa.com.do` (o tu URL)
3. Inicia sesión con una cuenta de **administrador**

### Paso 2: Verificar Endpoint `/api/test-email`

1. En la barra de direcciones del navegador, escribe:
   ```
   https://wms.adesa.com.do/api/test-email
   ```
2. Presiona Enter
3. **Deberías ver** una respuesta JSON como:
   ```json
   {
     "success": true,
     "message": "Email de prueba enviado exitosamente",
     "destinatario": "luis.useche@adesa.com.do"
   }
   ```
4. **Verifica tu email** - Deberías recibir un correo de prueba

### Paso 3: Verificar Endpoint `/api/en-revision`

1. En la barra de direcciones, escribe:
   ```
   https://wms.adesa.com.do/api/en-revision
   ```
2. Presiona Enter
3. **Deberías ver** una respuesta JSON con:
   ```json
   {
     "success": true,
     "data": [],
     "pagination": {
       "page": 1,
       "per_page": 50,
       "total": 0,
       "pages": 0
     }
   }
   ```
   - Si no hay discrepancias, `data` estará vacío (esto es normal)
   - Si hay discrepancias, verás una lista de objetos

### Paso 4: Verificar Endpoint `/api/sync-runs`

1. En la barra de direcciones, escribe:
   ```
   https://wms.adesa.com.do/api/sync-runs
   ```
2. Presiona Enter
3. **Deberías ver** una respuesta JSON con:
   ```json
   {
     "success": true,
     "data": [],
     "pagination": {
       "page": 1,
       "per_page": 50,
       "total": 0,
       "pages": 0
     }
   }
   ```
   - Si no has sincronizado aún, `data` estará vacío (esto es normal)
   - Después de sincronizar, verás el historial de runs

---

## MÉTODO 2: Usando la Consola del Navegador (Más Avanzado)

### Paso 1: Abrir las Herramientas de Desarrollador

1. En el navegador, presiona `F12` o `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
2. Ve a la pestaña **"Console"** (Consola)

### Paso 2: Hacer Peticiones con JavaScript

Pega estos comandos en la consola (uno por uno):

```javascript
// 1. Probar /api/test-email
fetch('/api/test-email')
  .then(r => r.json())
  .then(data => console.log('Test Email:', data))
  .catch(e => console.error('Error:', e));

// 2. Probar /api/en-revision
fetch('/api/en-revision')
  .then(r => r.json())
  .then(data => console.log('En Revisión:', data))
  .catch(e => console.error('Error:', e));

// 3. Probar /api/sync-runs
fetch('/api/sync-runs')
  .then(r => r.json())
  .then(data => console.log('Sync Runs:', data))
  .catch(e => console.error('Error:', e));
```

**Verás las respuestas** en la consola del navegador.

---

## MÉTODO 3: Usando curl (Terminal/SSH)

Si tienes acceso a Terminal o SSH:

```bash
# 1. Test Email
curl -X GET "https://wms.adesa.com.do/api/test-email" \
  -H "Cookie: session=TU_SESSION_ID" \
  -H "Content-Type: application/json"

# 2. En Revisión
curl -X GET "https://wms.adesa.com.do/api/en-revision" \
  -H "Cookie: session=TU_SESSION_ID" \
  -H "Content-Type: application/json"

# 3. Sync Runs
curl -X GET "https://wms.adesa.com.do/api/sync-runs" \
  -H "Cookie: session=TU_SESSION_ID" \
  -H "Content-Type: application/json"
```

**Nota:** Necesitas reemplazar `TU_SESSION_ID` con el ID de sesión real (obtenido después de iniciar sesión).

---

## MÉTODO 4: Desde el Panel de Administración (Recomendado)

### Integrar en el Panel Admin

Los endpoints están listos, pero puedes agregarlos visualmente al panel de administración:

1. **Para `/api/en-revision`**: Crear una sección "Discrepancias en Revisión"
2. **Para `/api/sync-runs`**: Mostrar historial de sincronizaciones

**Por ahora**, puedes probarlos directamente desde el navegador usando el **MÉTODO 1**.

---

## Qué Esperar en las Respuestas

### ✅ Respuesta Exitosa (200 OK):
```json
{
  "success": true,
  "data": [...],
  "pagination": {...}
}
```

### ❌ Error de Autenticación (401):
```json
{
  "success": false,
  "error": "Autenticación requerida"
}
```

### ❌ Error de Permisos (403):
```json
{
  "success": false,
  "error": "Acceso denegado. Se requiere rol de administrador"
}
```

---

## Prueba Completa Recomendada

1. ✅ **Test Email**: Verificar que el email llegue
2. ✅ **Sincronizar una ubicación**: Para generar datos de prueba
3. ✅ **Verificar `/api/sync-runs`**: Debería mostrar el run creado
4. ✅ **Si hay discrepancias**: Verificar `/api/en-revision`

---

**¿Necesitas ayuda con algún método específico?**



