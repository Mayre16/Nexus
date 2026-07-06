# Solución al Problema 404: Conflicto WordPress vs Passenger

## 📋 Resumen del Problema

### ¿Qué pasaba?

1. **WordPress en `adesa.com.do`** tiene un `.htaccess` en `/public_html/` con esta regla crítica:
   ```apache
   RewriteRule . /index.php [L]
   ```
   Esta regla captura **TODAS** las peticiones que no son archivos/directorios y las redirige a WordPress.

2. **El subdominio `wms.adesa.com.do`** está ubicado en `/public_html/wms.adesa.com.do/`, por lo que Apache procesa **primero** el `.htaccess` del directorio padre (`public_html`).

3. **Al actualizar plugins de WordPress**, se regeneró el `.htaccess` y esta regla comenzó a interceptar las peticiones del subdominio **antes** de que llegaran a Passenger/Flask.

4. **Resultado**: Todas las peticiones a `wms.adesa.com.do` se redirigían a `index.php` de WordPress, causando **404 Not Found**.

### La Solución Aplicada

Se agregó una **excepción** en el `.htaccess` de WordPress para excluir el subdominio:

```apache
# EXCEPCIÓN: No aplicar reglas de WordPress al subdominio wms.adesa.com.do
RewriteCond %{HTTP_HOST} !^wms\.adesa\.com\.do$ [NC]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
```

Esta condición verifica que el `HTTP_HOST` **NO** sea `wms.adesa.com.do` antes de aplicar la regla de WordPress.

---

## 🔧 Soluciones a Futuro

### Opción 1: Plugin de WordPress (RECOMENDADO) ⭐

He creado un plugin de WordPress (`wordpress-fix-subdomain-exception.php`) que **mantiene automáticamente** la excepción, incluso si WordPress regenera el `.htaccess`.

#### Instalación:

1. **Subir el archivo** `wordpress-fix-subdomain-exception.php` a:
   ```
   /public_html/wp-content/plugins/excepcion-subdominio-wms/
   ```

2. **Activar el plugin** en WordPress:
   - Ve a `Plugins` → `Plugins instalados`
   - Busca "Excepción Subdominio WMS"
   - Haz clic en "Activar"

3. **Verificar** que funciona:
   - Guarda los permalinks en WordPress (esto regenera el `.htaccess`)
   - Verifica que el `.htaccess` aún tiene la excepción

#### Ventajas:
- ✅ Se mantiene automáticamente
- ✅ No requiere intervención manual
- ✅ Funciona incluso cuando WordPress regenera el `.htaccess`

---

### Opción 2: Verificación Manual Periódica

Si prefieres no usar el plugin, verifica manualmente después de:

- ✅ Actualizar plugins de WordPress
- ✅ Cambiar configuración de permalinks
- ✅ Actualizar WordPress core
- ✅ Cualquier acción que regenere el `.htaccess`

**Verificación rápida:**
1. Abre `/public_html/.htaccess`
2. Busca la sección `# BEGIN WordPress`
3. Verifica que existe esta línea:
   ```apache
   RewriteCond %{HTTP_HOST} !^wms\.adesa\.com\.do$ [NC]
   ```
4. Si no existe, agrégala antes de `RewriteCond %{REQUEST_FILENAME} !-f`

---

### Opción 3: Mover el Subdominio Fuera de `public_html`

**Solución permanente** (requiere cambios en cPanel):

1. **Crear el subdominio como dominio separado** en cPanel
2. **Mover los archivos** de `/public_html/wms.adesa.com.do/` a un directorio fuera de `public_html`
3. **Actualizar la configuración** del subdominio en cPanel para apuntar al nuevo directorio

**Ventajas:**
- ✅ No hay conflicto con WordPress
- ✅ Separación completa de aplicaciones
- ✅ Más seguro y organizado

**Desventajas:**
- ⚠️ Requiere migración de archivos
- ⚠️ Requiere actualizar configuraciones

---

## 📝 Archivos Modificados

### Archivos que necesitas subir a cPanel:

1. **`.htaccess`** (en `/public_html/wms.adesa.com.do/`)
   - Configuración de Passenger
   - Ya está actualizado

2. **`app_wms.py`** (limpiado de código de diagnóstico)
   - Código de producción limpio
   - Endpoint `/test` mantenido para diagnóstico futuro

3. **`passenger_wsgi.py`** (simplificado)
   - Logging básico
   - Configuración del entorno virtual

4. **`wordpress-fix-subdomain-exception.php`** (NUEVO - opcional pero recomendado)
   - Plugin para mantener la excepción automáticamente

---

## 🚨 Señales de que el Problema Volvió

Si vuelves a ver **404 Not Found** en `wms.adesa.com.do`, verifica:

1. ✅ ¿Funciona `/test`? → Si da 404, el problema volvió
2. ✅ Revisa el `.htaccess` de WordPress en `/public_html/`
3. ✅ Verifica que la excepción aún existe

---

## 📞 Contacto y Soporte

Si el problema vuelve a aparecer:

1. **Verifica** el `.htaccess` de WordPress
2. **Revisa** los logs de error de Apache/Passenger
3. **Prueba** el endpoint `/test` para diagnóstico
4. **Activa** el plugin de WordPress si no lo has hecho

---

## ✅ Estado Actual

- ✅ Problema resuelto
- ✅ Aplicación Flask funcionando correctamente
- ✅ Endpoint `/test` disponible para diagnóstico
- ✅ Código limpio y listo para producción

**Última actualización**: 2026-01-28




