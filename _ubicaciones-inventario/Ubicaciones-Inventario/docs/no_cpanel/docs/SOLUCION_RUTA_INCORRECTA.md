# 🔧 Solución: Archivos en Ruta Incorrecta

## 🔴 Problema Identificado

**Python App espera archivos en:**
```
/home2/adesa/wms.adesa.com.do/
```

**Pero los archivos están en:**
```
/home2/adesa/public_html/wms.adesa.com.do/
```

Por eso CPanel no encuentra `requirements.txt` cuando intentas "Run Pip Install".

---

## ✅ SOLUCIÓN: Mover Archivos a la Ruta Correcta

### Paso 1: Verificar Ruta Actual

En File Manager:
1. Ve a `/public_html/wms.adesa.com.do/`
2. Verifica que todos los archivos estén ahí:
   - `app_wms.py`
   - `passenger_wsgi.py`
   - `config.py`
   - `requirements.txt`
   - `init_db.py`
   - Carpetas: `api/`, `routes/`, `database/`, `templates/`, `utils/`

### Paso 2: Crear/Mover a la Ruta Correcta

**Opción A: Copiar (Recomendado - mantiene backup)**

1. En File Manager, navega a: `/home2/adesa/`
2. Verifica si existe la carpeta `wms.adesa.com.do/`:
   - **Si NO existe**: Créala (botón "+ Carpeta")
   - **Si SÍ existe**: Vacíala o elimínala y créala de nuevo
3. Ve a `/public_html/wms.adesa.com.do/`
4. Selecciona **TODOS** los archivos y carpetas:
   - Selecciona: `app_wms.py`, `passenger_wsgi.py`, `config.py`, `requirements.txt`, `init_db.py`
   - Selecciona carpetas: `api/`, `routes/`, `database/`, `templates/`, `utils/`
5. Haz clic en **"Copiar"** (Copy)
6. En el campo de destino, escribe:
   ```
   /home2/adesa/wms.adesa.com.do
   ```
7. Haz clic en **"Copiar Archivos"**

**Opción B: Mover (Si prefieres no tener duplicados)**

1. Selecciona todos los archivos y carpetas (como en Opción A)
2. Haz clic en **"Mover"** (Move)
3. Destino: `/home2/adesa/wms.adesa.com.do`
4. Haz clic en **"Mover Archivos"**

### Paso 3: Verificar que los Archivos Estén en la Ruta Correcta

1. Ve a `/home2/adesa/wms.adesa.com.do/`
2. Verifica que veas:
   - `app_wms.py` ✅
   - `passenger_wsgi.py` ✅
   - `config.py` ✅
   - `requirements.txt` ✅
   - `init_db.py` ✅
   - Carpetas: `api/`, `routes/`, `database/`, `templates/`, `utils/` ✅

### Paso 4: Actualizar Configuración de Python App (Si es Necesario)

1. En Python App, verifica que **Application root** sea:
   ```
   wms.adesa.com.do
   ```
   (Debería estar así, pero verifica)

### Paso 5: Instalar Dependencias

Ahora que los archivos están en la ruta correcta:

1. En Python App, sección "Configuration files"
2. Si `requirements.txt` aparece listado, verifica que esté correcto
3. Haz clic en **"Run Pip Install"**
4. **¡Debería funcionar sin errores!** ✅

### Paso 6: Inicializar Base de Datos

1. En Python App, sección "Execute python script"
2. En "Enter the path to the script file", escribe:
   ```
   init_db.py
   ```
3. Haz clic en **"Run Script"**
4. Deberías ver mensajes de éxito

### Paso 7: Reiniciar Aplicación

1. En Python App, haz clic en **"Restart"** o **"GUARDAR"**
2. Espera a que reinicie

### Paso 8: Probar la Aplicación

1. Abre en el navegador: `https://wms.adesa.com.do/`
2. Debería cargar la aplicación

---

## ⚠️ IMPORTANTE

### Configuración del Dominio

Si después de mover los archivos, el dominio no carga:

**Opción 1: Cambiar Application Root**
- En Python App, cambia **Application root** a:
  ```
  public_html/wms.adesa.com.do
  ```
- Guarda y reinicia

**Opción 2: Crear Symbolic Link (Avanzado)**
- Si tu hosting lo permite, crea un enlace simbólico
- Pero mejor usar la Opción 1

---

## ✅ Checklist Post-Movimiento

- [ ] Archivos copiados/movidos a `/home2/adesa/wms.adesa.com.do/`
- [ ] `requirements.txt` está en la ruta correcta
- [ ] "Run Pip Install" funciona sin errores
- [ ] `init_db.py` ejecutado exitosamente
- [ ] Aplicación reiniciada
- [ ] Dominio `wms.adesa.com.do` carga correctamente

---

## 🎯 Resultado Esperado

Después de estos pasos:

1. ✅ "Run Pip Install" funcionará (sin error de archivo no encontrado)
2. ✅ Dependencias instaladas correctamente
3. ✅ Base de datos inicializada
4. ✅ Aplicación corriendo en `https://wms.adesa.com.do/`

---

## 📝 Nota sobre Public HTML

Si prefieres mantener los archivos en `public_html`:

Puedes cambiar el **Application root** en Python App a:
```
public_html/wms.adesa.com.do
```

Pero es más simple mover los archivos a donde CPanel los espera (`/home2/adesa/wms.adesa.com.do/`).


