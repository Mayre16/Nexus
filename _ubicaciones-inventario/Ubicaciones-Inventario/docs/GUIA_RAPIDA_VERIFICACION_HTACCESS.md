# Guía Rápida: Verificación de .htaccess después de Actualizar WordPress

## ⚠️ CUANDO VERIFICAR

**Siempre verifica el `.htaccess` después de:**
- ✅ Actualizar plugins de WordPress
- ✅ Actualizar WordPress core
- ✅ Cambiar configuración de permalinks
- ✅ Activar/desactivar plugins

---

## 📍 UBICACIÓN DEL ARCHIVO

**Ruta:** `/public_html/.htaccess`

**Acceso:**
- cPanel → File Manager → `public_html` → `.htaccess`
- O vía FTP/SFTP

---

## ✅ QUÉ BUSCAR

Abre el archivo `.htaccess` y busca esta sección:

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

**Línea crítica que DEBE existir:**
```apache
RewriteCond %{HTTP_HOST} !^wms\.adesa\.com\.do$ [NC]
```

**Debe estar ubicada:** Después de `RewriteRule ^index\.php$ - [L]` y antes de `RewriteCond %{REQUEST_FILENAME} !-f`

---

## 🔧 SI LA EXCEPCIÓN NO EXISTE

### Paso 1: Localiza esta sección

```apache
RewriteRule ^index\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
```

### Paso 2: Agrega estas líneas

**Agrega esto entre `RewriteRule ^index\.php$ - [L]` y `RewriteCond %{REQUEST_FILENAME} !-f`:**

```apache
# EXCEPCIÓN: No aplicar reglas de WordPress al subdominio wms.adesa.com.do
RewriteCond %{HTTP_HOST} !^wms\.adesa\.com\.do$ [NC]
```

### Paso 3: Resultado final

Debe quedar así:

```apache
RewriteRule ^index\.php$ - [L]
# EXCEPCIÓN: No aplicar reglas de WordPress al subdominio wms.adesa.com.do
RewriteCond %{HTTP_HOST} !^wms\.adesa\.com\.do$ [NC]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
```

### Paso 4: Guarda el archivo

### Paso 5: Prueba

1. Accede a: `https://wms.adesa.com.do/test`
2. Debe devolver: `{"success": true, ...}`
3. Si devuelve 404, verifica nuevamente el `.htaccess`

---

## 🚨 SEÑALES DE ALERTA

Si `wms.adesa.com.do` devuelve 404, verifica el `.htaccess` inmediatamente.

---

## 📋 CHECKLIST RÁPIDO

```
[ ] Actualicé WordPress / Plugins
[ ] Verifiqué /public_html/.htaccess
[ ] Confirmé que existe: RewriteCond %{HTTP_HOST} !^wms\.adesa\.com\.do$ [NC]
[ ] Si NO existe, la agregué
[ ] Probé: https://wms.adesa.com.do/test
[ ] Funciona correctamente ✅
```

---

**Versión:** 1.0  
**Última actualización:** 2026-01-28




