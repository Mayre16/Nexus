# Manual de Procedimiento: Mantenimiento de .htaccess después de Actualizar WordPress

**Sistema:** WMS (Warehouse Management System)  
**Subdominio:** wms.adesa.com.do  
**Dominio Principal:** adesa.com.do (WordPress)  
**Versión:** 1.0  
**Fecha:** 2026-02-06

---

## 📋 Tabla de Contenidos

1. [Introducción](#introducción)
2. [Descripción del Problema](#descripción-del-problema)
3. [Cuándo Aplicar Este Procedimiento](#cuándo-aplicar-este-procedimiento)
4. [Procedimiento Paso a Paso](#procedimiento-paso-a-paso)
5. [Verificación](#verificación)
6. [Checklist de Verificación](#checklist-de-verificación)
7. [Troubleshooting](#troubleshooting)
8. [Notas Importantes](#notas-importantes)
9. [Contacto y Soporte](#contacto-y-soporte)

---

## 1. Introducción

Este manual documenta el procedimiento necesario para mantener la funcionalidad del subdominio `wms.adesa.com.do` después de actualizar WordPress o sus plugins en el dominio principal `adesa.com.do`.

### Objetivo

Garantizar que el subdominio WMS siga funcionando correctamente después de cualquier actualización de WordPress que pueda regenerar el archivo `.htaccess`.

### Alcance

Este procedimiento aplica a:
- Actualizaciones de WordPress core
- Actualizaciones de plugins de WordPress
- Cambios en la configuración de permalinks
- Activación/desactivación de plugins que modifiquen reescritura

---

## 2. Descripción del Problema

### Contexto

El sistema WMS está alojado en el subdominio `wms.adesa.com.do`, mientras que WordPress está en el dominio principal `adesa.com.do`. Ambos comparten el mismo directorio base (`/public_html/`), donde WordPress está en la raíz y el WMS en un subdirectorio.

### Problema

Cuando WordPress se actualiza o se modifican sus plugins, el archivo `.htaccess` puede regenerarse automáticamente. Si esto ocurre, las reglas de reescritura de WordPress pueden interceptar todas las peticiones del subdominio `wms.adesa.com.do`, causando que la aplicación WMS devuelva errores **404 Not Found** en todas sus rutas.

### Síntomas

- ❌ El subdominio `wms.adesa.com.do` devuelve 404
- ❌ Todos los endpoints del WMS devuelven 404
- ❌ La aplicación Flask se inicializa correctamente (según logs)
- ❌ `passenger_wsgi.py` se ejecuta sin errores
- ❌ Las rutas están registradas pero no son accesibles

### Causa Raíz

El archivo `/public_html/.htaccess` de WordPress contiene una regla que captura todas las peticiones que no son archivos o directorios físicos:

```apache
RewriteRule . /index.php [L]
```

Esta regla intercepta las peticiones del subdominio antes de que lleguen a Passenger (el servidor de aplicaciones del WMS).

---

## 3. Cuándo Aplicar Este Procedimiento

**SIEMPRE** aplicar este procedimiento después de:

- ✅ Actualizar WordPress core
- ✅ Actualizar plugins de WordPress
- ✅ Cambiar configuración de permalinks (Ajustes → Enlaces permanentes → Guardar cambios)
- ✅ Activar/desactivar plugins que modifiquen reescritura
- ✅ Cambiar configuración de multisite (si aplica)
- ✅ Cualquier cambio que pueda regenerar el `.htaccess`

---

## 4. Procedimiento Paso a Paso

### Paso 1: Acceder al Archivo .htaccess

**Ubicación del archivo:** `/public_html/.htaccess`

#### Método 1: File Manager de cPanel

1. Inicia sesión en cPanel
2. Navega a **"Administrador de archivos"** (File Manager)
3. Asegúrate de estar en el directorio raíz
4. Busca el archivo `.htaccess` en `public_html`
5. Haz clic derecho en el archivo y selecciona **"Editar"**
6. Si aparece una advertencia, selecciona **"Codificación UTF-8"** y haz clic en **"Editar"**

#### Método 2: FTP/SFTP

1. Conecta al servidor vía FTP/SFTP usando un cliente como FileZilla
2. Navega a `/public_html/`
3. Descarga el archivo `.htaccess` para hacer una copia de seguridad
4. Abre el archivo con un editor de texto

### Paso 2: Localizar la Sección de WordPress

Busca esta sección en el archivo:

```apache
# BEGIN WordPress
# Las directivas (líneas) entre «BEGIN WordPress» y «END WordPress» son
# generadas dinámicamente y solo deberían ser modificadas mediante filtros de WordPress.
# Cualquier cambio en las directivas que hay entre esos marcadores serán sobrescritas.
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

### Paso 3: Verificar si Existe la Excepción

Dentro de la sección `# BEGIN WordPress`, busca estas líneas:

```apache
# EXCEPCIÓN: No aplicar reglas de WordPress al subdominio wms.adesa.com.do
RewriteCond %{HTTP_HOST} !^wms\.adesa\.com\.do$ [NC]
```

**Ubicación correcta:** Debe estar después de `RewriteRule ^index\.php$ - [L]` y antes de `RewriteCond %{REQUEST_FILENAME} !-f`

### Paso 4: Agregar la Excepción (si no existe)

Si **NO** encuentras la excepción, sigue estos pasos:

#### 4.1. Localiza esta sección exacta:

```apache
RewriteRule ^index\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
```

#### 4.2. Agrega estas 2 líneas entre `RewriteRule ^index\.php$ - [L]` y `RewriteCond %{REQUEST_FILENAME} !-f`:

```apache
# EXCEPCIÓN: No aplicar reglas de WordPress al subdominio wms.adesa.com.do
RewriteCond %{HTTP_HOST} !^wms\.adesa\.com\.do$ [NC]
```

#### 4.3. El resultado final debe verse así:

```apache
RewriteRule ^index\.php$ - [L]
# EXCEPCIÓN: No aplicar reglas de WordPress al subdominio wms.adesa.com.do
RewriteCond %{HTTP_HOST} !^wms\.adesa\.com\.do$ [NC]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
```

### Paso 5: Guardar el Archivo

1. **Si usas File Manager de cPanel:**
   - Haz clic en **"Guardar cambios"** o presiona `Ctrl + S`
   - Confirma el guardado

2. **Si usas FTP/SFTP:**
   - Guarda el archivo localmente
   - Sube el archivo modificado al servidor, sobrescribiendo el original
   - Asegúrate de que el archivo tenga permisos 644

### Paso 6: Verificar que el Archivo se Guardó Correctamente

1. Abre nuevamente el archivo `.htaccess`
2. Verifica que las líneas de excepción estén presentes
3. Confirma que no hay errores de sintaxis

---

## 5. Verificación

Después de agregar o verificar la excepción, realiza estas pruebas:

### Prueba 1: Endpoint de Prueba

**URL:** `https://wms.adesa.com.do/test`

**Resultado esperado:**
```json
{
  "success": true,
  "message": "Aplicacion Flask funcionando correctamente",
  "timestamp": "2026-02-06T10:30:00",
  "rutas_registradas": 69
}
```

**Si devuelve 404:** La excepción no está funcionando. Revisa el `.htaccess` nuevamente.

### Prueba 2: Página Principal

**URL:** `https://wms.adesa.com.do/`

**Resultado esperado:** Debe mostrar la página de inicio del WMS (pantalla de login o dashboard según sesión).

**Si devuelve 404:** La excepción no está funcionando. Revisa el `.htaccess` nuevamente.

### Prueba 3: Endpoint de API

**URL:** `https://wms.adesa.com.do/api/ajustes/ubicaciones-adm`

**Resultado esperado:** Debe devolver JSON con las ubicaciones ADM disponibles.

**Si devuelve 404:** La excepción no está funcionando. Revisa el `.htaccess` nuevamente.

### Prueba 4: Verificar WordPress (Opcional)

**URL:** `https://adesa.com.do/`

**Resultado esperado:** WordPress debe funcionar normalmente.

**Si WordPress no funciona:** Revisa que no hayas modificado accidentalmente otras secciones del `.htaccess`.

---

## 6. Checklist de Verificación

Usa este checklist cada vez que actualices WordPress:

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
[ ] 11. Documenté la fecha de la actualización
```

---

## 7. Troubleshooting

### Problema 1: El WMS sigue devolviendo 404 después de agregar la excepción

**Posibles causas:**
- La excepción está en la ubicación incorrecta
- Hay un error de sintaxis en el `.htaccess`
- El archivo no se guardó correctamente
- Hay caché del navegador

**Solución:**
1. Verifica que la excepción esté exactamente después de `RewriteRule ^index\.php$ - [L]`
2. Revisa que no haya errores de sintaxis (espacios, caracteres especiales)
3. Guarda el archivo nuevamente
4. Limpia la caché del navegador (Ctrl + F5)
5. Reinicia la aplicación en cPanel: **WEB APPLICATIONS → wms.adesa.com.do → RESTART**

### Problema 2: WordPress deja de funcionar después de agregar la excepción

**Posibles causas:**
- Se modificó accidentalmente otra sección del `.htaccess`
- Hay un error de sintaxis

**Solución:**
1. Restaura el archivo desde la copia de seguridad
2. Vuelve a agregar la excepción siguiendo el procedimiento exacto
3. Verifica que solo modificaste la sección indicada

### Problema 3: No puedo encontrar la sección # BEGIN WordPress

**Posibles causas:**
- El archivo `.htaccess` tiene una estructura diferente
- WordPress no está instalado correctamente

**Solución:**
1. Verifica que estás editando el archivo correcto (`/public_html/.htaccess`)
2. Busca cualquier sección que contenga `RewriteRule` y `index.php`
3. Si no encuentras la sección, contacta al administrador del sistema

### Problema 4: La excepción desaparece después de guardar

**Posibles causas:**
- WordPress regeneró el archivo automáticamente
- Hay un plugin que modifica el `.htaccess`

**Solución:**
1. Vuelve a agregar la excepción
2. Considera usar un plugin de WordPress que mantenga la excepción automáticamente
3. Documenta qué plugin o acción causó la regeneración

---

## 8. Notas Importantes

### ⚠️ Advertencias

1. **No edites otras secciones del .htaccess:**
   - No modifiques las secciones de LiteSpeed Cache
   - No modifiques las secciones de cPanel
   - Solo modifica la sección de WordPress según este procedimiento

2. **Haz una copia de seguridad:**
   - Siempre haz una copia del `.htaccess` antes de modificarlo
   - Guarda la copia con fecha: `.htaccess.backup.2026-02-06`

3. **Verifica después de cada actualización:**
   - WordPress puede regenerar el `.htaccess` en cualquier momento
   - Siempre verifica después de actualizar

4. **Documenta los cambios:**
   - Registra la fecha de cada actualización
   - Anota si fue necesario agregar la excepción nuevamente

### 📝 Explicación Técnica

La excepción funciona de la siguiente manera:

```apache
RewriteCond %{HTTP_HOST} !^wms\.adesa\.com\.do$ [NC]
```

- `%{HTTP_HOST}`: Verifica el dominio de la petición HTTP
- `!^wms\.adesa\.com\.do$`: Excluye el subdominio (el `!` significa "NO")
- `[NC]`: Case-insensitive (no distingue mayúsculas/minúsculas)

Esta condición hace que la regla siguiente (`RewriteRule . /index.php [L]`) **NO** se aplique cuando el dominio es `wms.adesa.com.do`, permitiendo que las peticiones lleguen a Passenger.

### 🔄 Alternativas Consideradas

1. **Mover el subdominio fuera de public_html:**
   - **Ventaja:** Elimina el conflicto completamente
   - **Desventaja:** Requiere migración y cambios en cPanel

2. **Usar un plugin de WordPress:**
   - **Ventaja:** Mantiene la excepción automáticamente
   - **Desventaja:** Depende de un plugin externo

3. **Configurar Apache directamente:**
   - **Ventaja:** Más control
   - **Desventaja:** Requiere acceso root al servidor

**Decisión:** Se eligió el método manual porque ofrece control total y no depende de plugins externos.

---

## 9. Contacto y Soporte

### Información del Sistema

- **Sistema:** WMS (Warehouse Management System)
- **Subdominio:** wms.adesa.com.do
- **Ubicación del archivo:** /public_html/.htaccess
- **Ubicación del WMS:** /public_html/wms.adesa.com.do/

### Archivos de Referencia

- **Documentación completa:** `docs/INFORME_ERROR_404_WORDPRESS_PASSENGER.md`
- **Guía rápida:** `docs/GUIA_RAPIDA_VERIFICACION_HTACCESS.md`

### En Caso de Problemas

1. **Revisa los logs:**
   - Logs de error de Apache/Passenger
   - Logs de la aplicación Flask

2. **Verifica la configuración de cPanel:**
   - WEB APPLICATIONS → wms.adesa.com.do
   - Application startup file: `passenger_wsgi.py`
   - Application Entry point: `application`

3. **Prueba el endpoint de diagnóstico:**
   - `https://wms.adesa.com.do/test`

---

## Anexo A: Ejemplo Completo de la Sección WordPress

```apache
# BEGIN WordPress
# Las directivas (líneas) entre «BEGIN WordPress» y «END WordPress» son
# generadas dinámicamente y solo deberían ser modificadas mediante filtros de WordPress.
# Cualquier cambio en las directivas que hay entre esos marcadores serán sobrescritas.
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

---

## Anexo B: Comandos Útiles (si tienes acceso SSH)

```bash
# Verificar que el archivo existe
ls -la /home2/adesa/public_html/.htaccess

# Hacer copia de seguridad
cp /home2/adesa/public_html/.htaccess /home2/adesa/public_html/.htaccess.backup.$(date +%Y%m%d)

# Verificar sintaxis del .htaccess (si Apache está configurado para esto)
apachectl -t

# Ver las últimas líneas del archivo
tail -20 /home2/adesa/public_html/.htaccess

# Buscar la excepción
grep -n "wms.adesa.com.do" /home2/adesa/public_html/.htaccess
```

---

**Documento creado:** 2026-02-06  
**Última actualización:** 2026-02-06  
**Versión:** 1.0  
**Autor:** Sistema de Documentación WMS

---

## Control de Versiones

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0 | 2026-02-06 | Versión inicial del manual |

---

**FIN DEL DOCUMENTO**
