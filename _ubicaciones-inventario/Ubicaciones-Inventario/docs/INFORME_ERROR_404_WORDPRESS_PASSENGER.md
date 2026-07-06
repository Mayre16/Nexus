# Informe Técnico: Error 404 en Subdominio WMS después de Actualización de WordPress

**Fecha del Incidente:** 2026-01-27  
**Fecha de Resolución:** 2026-01-28  
**Sistema Afectado:** `wms.adesa.com.do` (Subdominio Flask/Python con Passenger)  
**Causa Raíz:** Conflicto de reglas de reescritura entre WordPress y Passenger

---

## 📋 Resumen Ejecutivo

El subdominio `wms.adesa.com.do` (aplicación Flask con Passenger) comenzó a devolver errores **404 Not Found** después de actualizar plugins de WordPress en el dominio principal `adesa.com.do`. El problema se debió a que las reglas de reescritura de WordPress en el archivo `.htaccess` del directorio padre (`/public_html/`) interceptaban todas las peticiones del subdominio antes de que llegaran a Passenger.

**Impacto:**  
- ❌ Aplicación WMS completamente inaccesible
- ❌ Todos los endpoints devolvían 404
- ⏱️ Tiempo de inactividad: ~24 horas

**Solución Aplicada:**  
- ✅ Agregada excepción en `.htaccess` de WordPress para excluir el subdominio
- ✅ Aplicación restaurada y funcionando correctamente

---

## 🔍 Análisis del Problema

### Arquitectura del Sistema

```
/home2/adesa/
├── public_html/                    # Dominio principal (WordPress)
│   ├── .htaccess                   # ⚠️ Reglas de WordPress (PROBLEMA)
│   ├── wp-admin/
│   ├── wp-content/
│   └── index.php
│
└── wms.adesa.com.do/               # Subdominio (Flask/Passenger)
    ├── .htaccess                   # Configuración de Passenger
    ├── passenger_wsgi.py
    ├── app_wms.py
    └── templates/
```

### Causa Raíz

1. **Ubicación del Subdominio:**
   - El subdominio `wms.adesa.com.do` está ubicado en `/public_html/wms.adesa.com.do/`
   - Apache procesa los archivos `.htaccess` de forma jerárquica: primero el del directorio padre, luego el del subdirectorio

2. **Regla Problemática en WordPress:**
   El archivo `/public_html/.htaccess` contiene esta regla de WordPress:
   ```apache
   # BEGIN WordPress
   <IfModule mod_rewrite.c>
   RewriteEngine On
   RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
   RewriteBase /
   RewriteRule ^index\.php$ - [L]
   RewriteCond %{REQUEST_FILENAME} !-f
   RewriteCond %{REQUEST_FILENAME} !-d
   RewriteRule . /index.php [L]    # ⚠️ ESTA REGLA CAPTURA TODO
   </IfModule>
   # END WordPress
   ```
   
   **Explicación:** Esta regla captura **TODAS** las peticiones que no son archivos o directorios físicos y las redirige a `index.php` de WordPress.

3. **Actualización de Plugins:**
   - Al actualizar plugins de WordPress, el sistema regeneró el archivo `.htaccess`
   - La nueva versión del `.htaccess` no tenía ninguna excepción para el subdominio
   - Las reglas de WordPress comenzaron a interceptar las peticiones del subdominio

4. **Flujo del Error:**
   ```
   Usuario → wms.adesa.com.do/test
        ↓
   Apache procesa /public_html/.htaccess (WordPress)
        ↓
   Regla de WordPress captura la petición
        ↓
   Redirige a /index.php (WordPress)
        ↓
   WordPress no encuentra la ruta
        ↓
   404 Not Found ❌
   ```

### Síntomas Observados

- ✅ La aplicación Flask se inicializaba correctamente (según logs)
- ✅ `passenger_wsgi.py` se ejecutaba sin errores
- ✅ Las rutas estaban registradas (69 rutas detectadas)
- ❌ Todas las peticiones HTTP devolvían 404
- ❌ Tanto `/` como `/test` fallaban con 404

### Diagnóstico Realizado

1. **Verificación de Logs:**
   - Logs de Flask mostraban inicialización correcta
   - No había errores en `passenger_wsgi.py`
   - La aplicación tenía 69 rutas registradas

2. **Prueba de Endpoints:**
   - `https://wms.adesa.com.do/` → 404
   - `https://wms.adesa.com.do/test` → 404

3. **Análisis de Configuración:**
   - Verificación de configuración de Passenger en cPanel
   - Revisión de archivos `.htaccess`
   - Identificación del conflicto con WordPress

---

## ✅ Solución Implementada

### Paso 1: Identificación del Conflicto

Se identificó que el `.htaccess` de WordPress en `/public_html/` estaba capturando todas las peticiones del subdominio.

### Paso 2: Agregar Excepción en WordPress

Se modificó el archivo `/public_html/.htaccess` para excluir el subdominio de las reglas de WordPress:

**Antes:**
```apache
# BEGIN WordPress
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
RewriteBase /
RewriteRule ^index\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
</IfModule>
# END WordPress
```

**Después:**
```apache
# BEGIN WordPress
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
RewriteBase /
RewriteRule ^index\.php$ - [L]
# EXCEPCIÓN: No aplicar reglas de WordPress al subdominio wms.adesa.com.do
RewriteCond %{HTTP_HOST} !^wms\.adesa\.com\.do$ [NC]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
</IfModule>
# END WordPress
```

**Línea clave agregada:**
```apache
RewriteCond %{HTTP_HOST} !^wms\.adesa\.com\.do$ [NC]
```

**Explicación:**
- `%{HTTP_HOST}`: Verifica el dominio de la petición
- `!^wms\.adesa\.com\.do$`: Excluye el subdominio (el `!` significa "NO")
- `[NC]`: Case-insensitive (no distingue mayúsculas/minúsculas)

### Paso 3: Verificación

Después de agregar la excepción:
- ✅ `https://wms.adesa.com.do/test` → Funciona correctamente
- ✅ `https://wms.adesa.com.do/` → Funciona correctamente
- ✅ Aplicación completamente restaurada

---

## 🔄 Procedimiento de Mantenimiento a Futuro

### ⚠️ IMPORTANTE: Verificación Requerida Después de Actualizaciones

WordPress puede regenerar automáticamente el archivo `.htaccess` en las siguientes situaciones:

1. ✅ **Actualizar plugins de WordPress**
2. ✅ **Actualizar WordPress core**
3. ✅ **Cambiar configuración de permalinks** (Ajustes → Enlaces permanentes → Guardar cambios)
4. ✅ **Activar/desactivar plugins que modifiquen reescritura**
5. ✅ **Cambiar configuración de multisite** (si aplica)

### 📝 Checklist de Verificación Post-Actualización

Después de realizar cualquiera de las acciones anteriores, **SIEMPRE** verifica:

#### Paso 1: Acceder al Archivo `.htaccess` de WordPress

**Ubicación:** `/public_html/.htaccess`

**Método 1: File Manager de cPanel**
1. Inicia sesión en cPanel
2. Ve a "Administrador de archivos" (File Manager)
3. Navega a `public_html`
4. Abre el archivo `.htaccess`

**Método 2: FTP/SFTP**
1. Conecta al servidor vía FTP/SFTP
2. Navega a `/public_html/`
3. Descarga/edita el archivo `.htaccess`

#### Paso 2: Buscar la Sección de WordPress

Busca esta sección en el archivo:
```apache
# BEGIN WordPress
# Las directivas (líneas) entre «BEGIN WordPress» y «END WordPress» son
# generadas dinámicamente y solo deberían ser modificadas mediante filtros de WordPress.
```

#### Paso 3: Verificar la Excepción

Dentro de la sección `# BEGIN WordPress`, busca estas líneas:

```apache
# EXCEPCIÓN: No aplicar reglas de WordPress al subdominio wms.adesa.com.do
RewriteCond %{HTTP_HOST} !^wms\.adesa\.com\.do$ [NC]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
```

**Debe estar exactamente así:**
- ✅ La línea de comentario `# EXCEPCIÓN: ...`
- ✅ La línea `RewriteCond %{HTTP_HOST} !^wms\.adesa\.com\.do$ [NC]`
- ✅ **ANTES** de `RewriteCond %{REQUEST_FILENAME} !-f`

#### Paso 4: Si la Excepción NO Existe

Si no encuentras la excepción, agrégala manualmente:

1. **Localiza** esta sección en el `.htaccess`:
   ```apache
   RewriteRule ^index\.php$ - [L]
   RewriteCond %{REQUEST_FILENAME} !-f
   RewriteCond %{REQUEST_FILENAME} !-d
   RewriteRule . /index.php [L]
   ```

2. **Agrega** estas líneas entre `RewriteRule ^index\.php$ - [L]` y `RewriteCond %{REQUEST_FILENAME} !-f`:
   ```apache
   # EXCEPCIÓN: No aplicar reglas de WordPress al subdominio wms.adesa.com.do
   RewriteCond %{HTTP_HOST} !^wms\.adesa\.com\.do$ [NC]
   ```

3. **Resultado final** debe verse así:
   ```apache
   RewriteRule ^index\.php$ - [L]
   # EXCEPCIÓN: No aplicar reglas de WordPress al subdominio wms.adesa.com.do
   RewriteCond %{HTTP_HOST} !^wms\.adesa\.com\.do$ [NC]
   RewriteCond %{REQUEST_FILENAME} !-f
   RewriteCond %{REQUEST_FILENAME} !-d
   RewriteRule . /index.php [L]
   ```

4. **Guarda** el archivo

5. **Verifica** que la aplicación funciona:
   - Accede a: `https://wms.adesa.com.do/test`
   - Debe devolver: `{"success": true, "message": "Aplicacion Flask funcionando correctamente", ...}`

#### Paso 5: Prueba Rápida

Después de agregar/verificar la excepción, prueba estos endpoints:

1. **Endpoint de prueba:**
   ```
   https://wms.adesa.com.do/test
   ```
   **Resultado esperado:** JSON con `"success": true`

2. **Página principal:**
   ```
   https://wms.adesa.com.do/
   ```
   **Resultado esperado:** Página de inicio del WMS

3. **Si alguno devuelve 404:**
   - Verifica nuevamente el `.htaccess`
   - Reinicia la aplicación en cPanel (WEB APPLICATIONS → RESTART)
   - Revisa los logs de error

---

## 📋 Resumen de Comandos y Ubicaciones

### Archivos Importantes

| Archivo | Ubicación | Propósito |
|---------|-----------|-----------|
| `.htaccess` (WordPress) | `/public_html/.htaccess` | Reglas de reescritura de WordPress |
| `.htaccess` (WMS) | `/public_html/wms.adesa.com.do/.htaccess` | Configuración de Passenger |
| `passenger_wsgi.py` | `/public_html/wms.adesa.com.do/passenger_wsgi.py` | Entry point de Passenger |
| `app_wms.py` | `/public_html/wms.adesa.com.do/app_wms.py` | Aplicación Flask |

### Línea Crítica a Verificar

```apache
RewriteCond %{HTTP_HOST} !^wms\.adesa\.com\.do$ [NC]
```

**Debe estar ubicada:** Dentro de la sección `# BEGIN WordPress`, después de `RewriteRule ^index\.php$ - [L]` y antes de `RewriteCond %{REQUEST_FILENAME} !-f`

---

## 🚨 Señales de Alerta

Si observas alguno de estos síntomas, **verifica inmediatamente** el `.htaccess`:

- ❌ `wms.adesa.com.do` devuelve 404
- ❌ El endpoint `/test` devuelve 404
- ❌ Todas las rutas de la aplicación devuelven 404
- ✅ Los logs muestran que Flask se inicializa correctamente
- ✅ `passenger_wsgi.py` se ejecuta sin errores

**Esto indica que WordPress está interceptando las peticiones nuevamente.**

---

## 📞 Contacto y Soporte

Si el problema persiste después de verificar el `.htaccess`:

1. **Revisa los logs:**
   - Logs de error de Apache/Passenger
   - Logs de la aplicación Flask

2. **Verifica la configuración de cPanel:**
   - WEB APPLICATIONS → `wms.adesa.com.do`
   - Application startup file: `passenger_wsgi.py`
   - Application Entry point: `application`

3. **Prueba el endpoint de diagnóstico:**
   - `https://wms.adesa.com.do/test`

---

## 📝 Notas Adicionales

### ¿Por qué WordPress regenera el `.htaccess`?

WordPress regenera automáticamente el archivo `.htaccess` cuando:
- Se guardan cambios en la configuración de permalinks
- Se actualiza WordPress core
- Algunos plugins modifican las reglas de reescritura
- Se activa/desactiva la funcionalidad de multisite

### ¿Por qué no usar un plugin?

Aunque existe un plugin que mantiene automáticamente la excepción, se prefiere el método manual porque:
- ✅ Control total sobre los cambios
- ✅ No depende de plugins externos
- ✅ Más fácil de auditar y verificar
- ✅ No agrega complejidad adicional al sistema

### Alternativa: Mover el Subdominio

Una solución permanente sería mover el subdominio fuera de `public_html`:
- **Ventaja:** No hay conflicto con WordPress
- **Desventaja:** Requiere migración y cambios en cPanel

---

## ✅ Checklist de Verificación Rápida

Copia y usa este checklist cada vez que actualices WordPress:

```
[ ] 1. Actualicé WordPress / Plugins
[ ] 2. Accedí a /public_html/.htaccess
[ ] 3. Busqué la sección # BEGIN WordPress
[ ] 4. Verifiqué que existe: RewriteCond %{HTTP_HOST} !^wms\.adesa\.com\.do$ [NC]
[ ] 5. Si NO existe, la agregué manualmente
[ ] 6. Guardé el archivo
[ ] 7. Probé: https://wms.adesa.com.do/test
[ ] 8. Verifiqué que devuelve JSON con "success": true
[ ] 9. Probé: https://wms.adesa.com.do/
[ ] 10. Verifiqué que muestra la página principal
```

---

**Documento creado:** 2026-01-28  
**Última actualización:** 2026-01-28  
**Versión:** 1.0




