# 🔴 Solución: Error "Unable to find app venv folder"

## 🚨 Problema

Error:
```
No such application or it's broken. Unable to find app venv folder by this path: 
'/home2/adesa/virtualenv/wms.adesa.com.do'
```

**Causa:** Cambiaste el Application root a `public_html/wms.adesa.com.do`, pero CPanel creó el virtualenv con la ruta original `wms.adesa.com.do` (sin public_html).

---

## ✅ SOLUCIÓN: Volver Application Root a la Ruta Original

CPanel ya creó el virtualenv en `/home2/adesa/virtualenv/wms.adesa.com.do/` cuando creaste la app inicialmente. Necesitamos que el Application root coincida.

### Paso 1: Cambiar Application Root de Vuelta

1. **En Python App**, busca el campo **"Application root"**
2. **Cámbialo de:** `public_html/wms.adesa.com.do`
   **A:** `wms.adesa.com.do`
3. Haz clic en **"GUARDAR"** (arriba a la derecha)
4. **Espera** unos segundos (el error debería desaparecer)

### Paso 2: Mover Archivos de Vuelta (Si es Necesario)

**Verifica primero dónde están los archivos ahora:**

1. En File Manager, verifica:
   - ¿Están en `/home2/adesa/public_html/wms.adesa.com.do/`?
   - ¿O ya están en `/home2/adesa/wms.adesa.com.do/`?

**Si están en `public_html/`, muévelos:**

1. En File Manager, ve a `/home2/adesa/public_html/wms.adesa.com.do/`
2. Selecciona **TODOS** los archivos y carpetas del proyecto:
   - `app_wms.py`
   - `passenger_wsgi.py`
   - `config.py`
   - `init_db.py`
   - `requirements.txt`
   - `install_deps.py`
   - `test_deps.py`
   - Carpetas: `api/`, `database/`, `routes/`, `templates/`, `utils/`
   - **NO muevas:** `.htaccess` (si existe, puede quedarse o eliminarse)
3. Haz clic en **"Mover"**
4. Destino: `/home2/adesa/wms.adesa.com.do`
5. Confirma el movimiento

### Paso 3: Verificar Estructura Final

En `/home2/adesa/wms.adesa.com.do/` deberías tener:

```
wms.adesa.com.do/
├── public/              (creado por CPanel)
├── tmp/                 (creado por CPanel)
├── app_wms.py           ✅
├── passenger_wsgi.py    ✅
├── config.py            ✅
├── init_db.py           ✅
├── requirements.txt     ✅
├── database/            ✅
├── api/                 ✅
├── routes/              ✅
├── utils/               ✅
└── templates/           ✅
```

### Paso 4: Reiniciar la Aplicación

1. En Python App, haz clic en **"RESTART"**
2. **Espera 30 segundos**
3. El error debería desaparecer

### Paso 5: Probar

1. Haz clic en **"OPEN"** (junto a Application URL)
2. O abre en el navegador: `https://wms.adesa.com.do/`
3. Debería funcionar ahora

---

## ⚠️ Por Qué Pasó Esto

Cuando creas una Python App:
- CPanel crea automáticamente el virtualenv en: `/home2/adesa/virtualenv/{Application Root}/`
- Si creaste la app con Application root `wms.adesa.com.do`, el venv está en `/home2/adesa/virtualenv/wms.adesa.com.do/`
- Si cambias el Application root después, CPanel no mueve el venv automáticamente
- Por eso busca el venv en una ruta que no existe

**Solución:** Mantener el Application root igual al que usaste cuando creaste la app, O destruir y recrear la app con la nueva ruta.

---

## 🎯 Resumen Rápido

1. **Cambiar Application root a:** `wms.adesa.com.do` (sin public_html)
2. **Mover archivos a:** `/home2/adesa/wms.adesa.com.do/` (si están en public_html)
3. **Guardar y Reiniciar**
4. **Probar**

---

**¡Con esto debería solucionarse el error!** ✅


