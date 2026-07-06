# 🗑️ Archivos que Puedes Borrar en cPanel

## ✅ Archivos NECESARIOS (NO BORRAR)

Estos archivos son esenciales para que la aplicación funcione:

- ✅ `.htaccess` - Configuración Apache (necesario)
- ✅ `app_wms.py` - Aplicación principal Flask (NECESARIO)
- ✅ `config.py` - Configuración del sistema (NECESARIO)
- ✅ `passenger_wsgi.py` - Entry point para Passenger (NECESARIO)
- ✅ Todas las carpetas: `database/`, `routes/`, `templates/`, `static/`, `utils/`, `api/`

---

## 🗑️ Archivos TEMPORALES (PUEDES BORRAR)

Estos son scripts de migración/instalación que ya cumplieron su función:

### Scripts de Instalación (ya ejecutados):
- ❌ `instalar_pymysql.py` - Ya instalaste PyMySQL ✅
- ❌ `instalar_openpyxl.py` - Ya instalaste openpyxl ✅
- ❌ `install_dateutil.py` - Ya instalaste dateutil ✅

### Scripts de Migración (ya ejecutados):
- ❌ `migrar_sqlite_a_mysql_simple.py` - Migración completada ✅
- ❌ `migrar_campo_usuario_solicitante.py` - Migración específica (ya ejecutado)
- ❌ `migrar_tablas.py` - Migración de tablas (ya ejecutado)
- ❌ `crear_indices.py` - Índices creados ✅

### Scripts de Inicialización (ya no necesarios):
- ❌ `init_db.py` - Inicialización de BD (ya no necesario con MySQL)
- ❌ `desbloquear_sincronizacion.py` - Script temporal de desbloqueo

### Scripts de Verificación Temporal:
- ❌ `verificar_rutas_auth.py` - Verificación temporal (ya no necesario)

### Scripts de Limpieza (opcional mantener):
- ⚠️ `limpiar_registros_legacy.py` - Ya no necesario (solo era para SQLite)
- ⚠️ `limpiar_bd_mysql.py` - ÚTIL mantener (para limpiar BD cuando quieras)

### Logs (se regeneran):
- ❌ `stderr.log` - Log de errores (se regenera automáticamente, puedes borrarlo)

---

## 📋 Archivos ÚTILES (OPCIONAL mantener)

Estos pueden ser útiles en el futuro:

- ⚠️ `verificar_bd_sync.py` - Útil para verificar estado de sincronización
- ⚠️ `limpiar_bd_mysql.py` - Útil para limpiar BD cuando quieras empezar de cero
- ⚠️ `migrar_sqlite_a_mysql.py` - Versión completa (por si necesitas migrar datos históricos después)

---

## 🎯 Resumen: Archivos a BORRAR

**Puedes borrar estos 9 archivos de forma segura:**

1. `instalar_pymysql.py`
2. `instalar_openpyxl.py`
3. `install_dateutil.py`
4. `migrar_sqlite_a_mysql_simple.py`
5. `migrar_campo_usuario_solicitante.py`
6. `migrar_tablas.py`
7. `crear_indices.py`
8. `init_db.py`
9. `desbloquear_sincronizacion.py`
10. `verificar_rutas_auth.py`
11. `limpiar_registros_legacy.py`
12. `stderr.log` (se regenera)

**Total: ~12 archivos que puedes borrar**

---

## ⚠️ IMPORTANTE

- **NO borres** ningún archivo de las carpetas `routes/`, `templates/`, `static/`, `utils/`, `api/`, `database/`
- **NO borres** `app_wms.py`, `config.py`, `passenger_wsgi.py`, `.htaccess`
- Los logs (`stderr.log`, `stdout.log`) se regeneran automáticamente, puedes borrarlos

---

## 💡 Recomendación

**Mantener:**
- `verificar_bd_sync.py` - Útil para diagnóstico
- `limpiar_bd_mysql.py` - Útil para pruebas

**Borrar todo lo demás** de la lista de temporales.


