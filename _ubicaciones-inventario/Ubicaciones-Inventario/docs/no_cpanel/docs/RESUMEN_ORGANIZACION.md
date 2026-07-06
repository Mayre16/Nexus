# Resumen de Organización de Archivos

## ✅ Archivos Listos para CPanel

### En la Raíz del Proyecto (Solo archivos esenciales):

```
✅ ARCHIVOS PRINCIPALES:
├── app_wms.py              → Aplicación Flask principal
├── passenger_wsgi.py       → Configuración para CPanel
├── config.py               → Configuración del sistema
├── init_db.py              → Script para inicializar BD
├── requirements.txt        → Dependencias Python
└── LEEME_PRIMERO.txt       → Guía rápida (NO subir a CPanel)

✅ CARPETAS PRINCIPALES:
├── database/               → Modelos de base de datos
│   ├── __init__.py
│   └── models.py
│
├── api/                    → Cliente API ADM Cloud
│   ├── __init__.py
│   └── adm_cloud.py
│
├── routes/                 → Rutas de la aplicación
│   ├── __init__.py
│   ├── auth.py
│   ├── facturas.py
│   ├── despacho.py
│   ├── stock.py
│   └── dashboard.py
│
├── utils/                  → Utilidades y validaciones
│   ├── __init__.py
│   ├── validaciones.py
│   └── helpers.py
│
└── templates/              → Plantillas HTML
    └── index.html
```

---

## 📁 Archivos Organizados en Carpetas

### `docs/` - Documentación (NO subir a CPanel)
- Toda la documentación del proyecto
- Guías de instalación
- Checklist y pasos a seguir
- Archivos informativos

### `pruebas/` - Scripts de Prueba (NO subir a CPanel)
- Scripts de prueba de API
- Archivos JSON de respuestas de prueba
- Versión anterior de app.py
- Scripts PowerShell de prueba

---

## ⚠️ Notas Importantes

### Archivos que NO deben subirse a CPanel:

1. **`LEEME_PRIMERO.txt`** - Solo referencia local
2. **`database/wms.db`** - Base de datos SQLite de desarrollo (en CPanel usarás MySQL)
3. **`docs/`** - Toda la carpeta
4. **`pruebas/`** - Toda la carpeta
5. **`__pycache__/`** - Caché de Python (se genera automático)
6. **`migrations/`** - Vacía, no necesaria ahora
7. **`static/`** - Vacía ahora, pero puede ser útil más adelante (opcional)

---

## 🎯 Estructura Final en CPanel

Cuando subas a CPanel, debe quedar así:

```
/public_html/wms.adesa.com.do/
├── app_wms.py
├── passenger_wsgi.py
├── config.py
├── init_db.py
├── requirements.txt
├── database/
│   ├── __init__.py
│   └── models.py
├── api/
│   ├── __init__.py
│   └── adm_cloud.py
├── routes/
│   ├── __init__.py
│   ├── auth.py
│   ├── facturas.py
│   ├── despacho.py
│   ├── stock.py
│   └── dashboard.py
├── utils/
│   ├── __init__.py
│   ├── validaciones.py
│   └── helpers.py
└── templates/
    └── index.html
```

**Total: 5 archivos en raíz + 5 carpetas con su contenido**

---

## ✅ Checklist Pre-Subida

Antes de subir a CPanel, verifica:

- [ ] Solo archivos marcados con ✅ en la lista de arriba
- [ ] NO incluir `docs/`
- [ ] NO incluir `pruebas/`
- [ ] NO incluir `LEEME_PRIMERO.txt`
- [ ] NO incluir `database/wms.db` (base de datos local)
- [ ] Todas las carpetas tienen sus archivos `.py`

**Si todo está correcto, puedes comprimir y subir a CPanel.** 🚀


