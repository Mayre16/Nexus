# 🔒 Solución: "database is locked" en SQLite

## 📋 Problema Identificado

El error `(sqlite3.OperationalError) database is locked` ocurre cuando:
1. **Múltiples procesos/threads** intentan acceder a la BD simultáneamente
2. **Transacciones largas** mantienen la BD bloqueada
3. **SQLite tiene limitaciones** de concurrencia (solo una escritura a la vez)

## ✅ Soluciones Implementadas

### 1. **Configuración de Timeout para SQLite**
- Agregado `timeout=30` segundos en la configuración de SQLite
- Permite que las operaciones esperen hasta 30 segundos antes de fallar
- Configurado en `config.py` → `SQLALCHEMY_ENGINE_OPTIONS`

### 2. **Helpers de Retry para Operaciones de BD**
- Creado `utils/db_helpers.py` con funciones:
  - `db_commit_with_retry()`: Reintenta commits en caso de "database is locked"
  - `db_query_with_retry()`: Reintenta queries en caso de "database is locked"
- **Retry exponencial**: Aumenta el delay entre intentos (0.3s → 0.45s → 0.675s)
- **Máximo 3-5 intentos** según la operación

### 3. **Aplicación de Retry en Operaciones Críticas**
- ✅ Commits periódicos durante sincronización (cada 50 items)
- ✅ Commits de lotes (cada 200 items)
- ✅ Swap atómico (NEW → LIVE)
- ✅ Queries de estado de sincronización

## 📝 Archivos Modificados

1. **`config.py`**
   - Agregado `SQLALCHEMY_ENGINE_OPTIONS` con timeout y configuración de pool

2. **`app_wms.py`**
   - Aplicación de `SQLALCHEMY_ENGINE_OPTIONS` al inicializar la BD

3. **`utils/db_helpers.py`** (nuevo)
   - Funciones helper para retry de operaciones de BD

4. **`routes/sincronizar.py`**
   - Uso de `db_commit_with_retry()` en commits críticos
   - Uso de `db_query_with_retry()` en queries de estado

## 🚀 Próximos Pasos

1. **Subir archivos actualizados a cPanel:**
   - `config.py`
   - `app_wms.py`
   - `utils/db_helpers.py`
   - `routes/sincronizar.py`

2. **Reiniciar la aplicación** en cPanel

3. **Monitorear logs** para verificar que los errores de "database is locked" disminuyan

## ⚠️ Notas Importantes

- **SQLite no es ideal para alta concurrencia**: Si el problema persiste, considera migrar a PostgreSQL o MySQL
- **Múltiples instancias**: Verificar que no haya múltiples procesos de la aplicación corriendo simultáneamente
- **Transacciones cortas**: Las transacciones deben ser lo más cortas posible para evitar bloqueos

## 🔍 Verificación

Después de aplicar los cambios, verificar en los logs:
- ✅ No deberían aparecer errores de "database is locked"
- ✅ Si aparecen, deberían resolverse automáticamente con retry
- ✅ Los mensajes de "reintentando" indican que el sistema está manejando el problema


