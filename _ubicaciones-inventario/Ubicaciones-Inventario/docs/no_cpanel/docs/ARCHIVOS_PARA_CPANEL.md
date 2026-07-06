# 📦 Archivos que DEBEN subirse a CPanel

Esta es la lista EXACTA de archivos y carpetas que debes subir a tu servidor CPanel.

---

## ✅ Estructura Completa para CPanel

```
wms.adesa.com.do/
│
├── app_wms.py              ⭐ OBLIGATORIO - Aplicación principal
├── passenger_wsgi.py       ⭐ OBLIGATORIO - Configuración CPanel
├── config.py               ⭐ OBLIGATORIO - Configuración
├── init_db.py              ⭐ OBLIGATORIO - Inicializar BD
├── requirements.txt        ⭐ OBLIGATORIO - Dependencias
│
├── database/               ⭐ OBLIGATORIO - Carpeta completa
│   ├── __init__.py
│   └── models.py
│
├── api/                    ⭐ OBLIGATORIO - Carpeta completa
│   ├── __init__.py
│   └── adm_cloud.py
│
├── routes/                 ⭐ OBLIGATORIO - Carpeta completa
│   ├── __init__.py
│   ├── auth.py
│   ├── facturas.py
│   ├── despacho.py
│   ├── stock.py
│   └── dashboard.py
│
├── utils/                  ⭐ OBLIGATORIO - Carpeta completa
│   ├── __init__.py
│   ├── validaciones.py
│   └── helpers.py
│
└── templates/              ⭐ OBLIGATORIO - Carpeta completa
    └── index.html
```

---

## 📋 Lista de Archivos Individuales

### Archivos en la Raíz (8 archivos):
1. `app_wms.py`
2. `passenger_wsgi.py`
3. `config.py`
4. `init_db.py`
5. `requirements.txt`

### Carpetas (5 carpetas con su contenido):
1. `database/` - 2 archivos
2. `api/` - 2 archivos
3. `routes/` - 6 archivos
4. `utils/` - 3 archivos
5. `templates/` - 1 archivo mínimo

---

## ❌ Archivos que NO deben subirse a CPanel

- ❌ `docs/` - Documentación (solo para referencia)
- ❌ `pruebas/` - Scripts de prueba (no necesarios en producción)
- ❌ `__pycache__/` - Caché de Python (se genera automáticamente)
- ❌ `*.md` - Archivos Markdown de documentación
- ❌ `test_*.py` - Scripts de prueba
- ❌ `*.json` de respuestas de prueba
- ❌ `app.py` - Versión anterior (no usar)

---

## 🚀 Cómo Subir a CPanel

### Opción 1: Subir Todo de Una Vez (Recomendado)
1. Selecciona SOLO estos archivos y carpetas de la lista ✅
2. Comprímelos en un ZIP
3. Sube el ZIP a CPanel
4. Extrae en `/public_html/wms.adesa.com.do/`

### Opción 2: Subir Manualmente
1. Crea la carpeta en CPanel: `/public_html/wms.adesa.com.do/`
2. Sube cada archivo y carpeta uno por uno según la lista ✅

---

## ⚠️ IMPORTANTE

- **NO subas** la carpeta `docs/` (documentación)
- **NO subas** la carpeta `pruebas/` (archivos de prueba)
- **NO subas** `__pycache__/` (caché, se genera solo)
- **NO subas** archivos `.md` (documentación)

**Solo sube los archivos marcados con ⭐ en la lista de arriba.**

---

## 📝 Verificación Post-Subida

Después de subir, verifica que en CPanel tengas:

- [ ] `passenger_wsgi.py` está en la raíz
- [ ] `app_wms.py` está en la raíz
- [ ] Todas las carpetas (`database/`, `api/`, `routes/`, `utils/`, `templates/`) están presentes
- [ ] Cada carpeta tiene sus archivos `.py` correspondientes
- [ ] `requirements.txt` está presente

**Si falta alguno de estos, la aplicación NO funcionará.**

