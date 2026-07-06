# 🔧 SOLUCIÓN: Error 405 Method Not Allowed en Login

**Fecha:** 2026-01-22  
**Error:** `405 Method Not Allowed: The method is not allowed for the requested URL`

---

## 🔍 DIAGNÓSTICO

El error 405 indica que la ruta existe pero el método HTTP no está permitido. Esto puede deberse a:

1. **Blueprint de auth no registrado correctamente**
2. **Problema con la importación de blueprints**
3. **Archivo `app_wms.py` corrupto o incompleto en cPanel**

---

## ✅ SOLUCIÓN

### Paso 1: Verificar que `app_wms.py` tenga estas líneas

**Importación de blueprints (línea ~26):**
```python
from routes import auth_bp, facturas_bp, despacho_bp, despachos_bp, recepciones_bp, transferencias_bp, stock_bp, dashboard_bp, consulta_bp, ajustes_bp, productos_bp, sincronizar_bp, ubicaciones_fisicas_bp, historiales_bp
from routes.auth import require_auth
```

**Registro de blueprints (línea ~88):**
```python
# Registrar blueprints (rutas)
# IMPORTANTE: auth_bp debe registrarse PRIMERO para evitar conflictos
app.register_blueprint(auth_bp)
app.register_blueprint(facturas_bp)
app.register_blueprint(despacho_bp)
app.register_blueprint(despachos_bp)
app.register_blueprint(recepciones_bp)
app.register_blueprint(transferencias_bp)
app.register_blueprint(stock_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(consulta_bp)
app.register_blueprint(ajustes_bp)
app.register_blueprint(productos_bp)
app.register_blueprint(sincronizar_bp)
app.register_blueprint(ubicaciones_fisicas_bp)
app.register_blueprint(historiales_bp)
```

### Paso 2: Verificar que `routes/__init__.py` tenga:

```python
from routes.auth import auth_bp
from routes.historiales import historiales_bp

__all__ = ['auth_bp', ..., 'historiales_bp']
```

### Paso 3: Verificar que `routes/auth.py` exista y tenga:

```python
@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    # ... código del login
```

---

## 🚀 PASOS PARA CORREGIR EN CPANEL

1. **Subir archivo `app_wms.py` actualizado** (con el manejo de error 405 agregado)

2. **Verificar que `routes/auth.py` esté presente**

3. **Verificar que `routes/__init__.py` tenga la importación de `auth_bp`**

4. **Ejecutar script de verificación:**
   ```bash
   python verificar_rutas_auth.py
   ```

5. **Reiniciar la aplicación en cPanel:**
   - Si usas Passenger, toca el archivo `tmp/restart.txt` o reinicia desde el panel

---

## 📋 ARCHIVOS A VERIFICAR/SUBIR

1. ✅ `app_wms.py` - Debe tener `app.register_blueprint(auth_bp)` ANTES de otros blueprints
2. ✅ `routes/auth.py` - Debe existir y tener las rutas correctas
3. ✅ `routes/__init__.py` - Debe importar `auth_bp`
4. ✅ `verificar_rutas_auth.py` - Script de diagnóstico (nuevo)

---

## 🔍 VERIFICACIÓN MANUAL

Si el problema persiste, verifica en los logs de cPanel:

1. **Error de importación:** Busca "Error al importar blueprints" en los logs
2. **Error de sintaxis:** Busca "SyntaxError" o "IndentationError"
3. **Blueprint no registrado:** Verifica que `auth_bp` esté en la lista de blueprints registrados

---

## ⚠️ POSIBLES CAUSAS ADICIONALES

1. **Cache de Passenger:** Limpia el cache de Passenger
2. **Archivo corrupto:** Re-sube `app_wms.py` completo
3. **Permisos:** Verifica que los archivos tengan permisos correctos (644 para archivos, 755 para directorios)

---

**¿Necesitas ayuda?** Ejecuta `verificar_rutas_auth.py` y comparte el resultado.




