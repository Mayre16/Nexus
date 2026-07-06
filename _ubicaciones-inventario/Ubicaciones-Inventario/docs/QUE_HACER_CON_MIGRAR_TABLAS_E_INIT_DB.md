# 📋 QUÉ HACER CON: migrar_tablas_nuevas.py e init_db.py

**Fecha:** 2026-01-22

---

## 📌 ARCHIVOS IDENTIFICADOS

1. **`migrar_tablas_nuevas.py`** - Script de migración de base de datos
2. **`init_db.py`** - Script de inicialización de base de datos

---

## ✅ ESTADO ACTUAL

**IMPORTANTE:** La migración **YA FUE EJECUTADA** en la sesión anterior. Las tablas y columnas ya están creadas.

---

## 🎯 QUÉ HACER CON CADA ARCHIVO

### 1. `migrar_tablas_nuevas.py`

#### ¿Qué hace este archivo?

Este script:
- Crea las tablas nuevas: `transferencias_procesadas` y `mapeo_ubicaciones_adm_wms`
- Agrega columnas nuevas a `facturas_procesadas`: `location_id` y `location_name`
- Crea índices necesarios

#### ¿Ya fue ejecutado?

**SÍ**, ya fue ejecutado en la sesión anterior. La salida fue:
```
[OK] Tabla 'transferencias_procesadas' creada/verificada
[OK] Tabla 'mapeo_ubicaciones_adm_wms' creada/verificada
[OK] Columna 'location_id' agregada
[OK] Columna 'location_name' agregada
```

#### ¿Qué debes hacer ahora?

**OPCIÓN A: Verificar que todo está bien (Recomendado)**

1. Ejecuta el script de verificación:
   ```bash
   python verificar_migracion.py
   ```

2. Si dice "[OK] Migración completada correctamente":
   - ✅ No necesitas hacer nada más
   - ✅ Puedes guardar el archivo como referencia
   - ✅ O puedes borrarlo (ya cumplió su función)

3. Si dice "[PENDIENTE] Faltan algunas tablas o columnas":
   - Ejecuta: `python migrar_tablas_nuevas.py`
   - Luego verifica de nuevo

**OPCIÓN B: Guardar como referencia**

- Este script es útil si necesitas migrar otra base de datos
- O si necesitas recrear las tablas en el futuro
- Guárdalo en una carpeta `scripts/` o `migrations/`

**OPCIÓN C: Borrar (si ya no lo necesitas)**

- Si la migración ya está completa y no necesitas migrar otras bases de datos
- Puedes borrarlo sin problemas
- Las tablas ya están creadas, no dependen del script

---

### 2. `init_db.py`

#### ¿Qué hace este archivo?

Este script:
- Crea TODAS las tablas de la base de datos desde cero
- Crea el usuario administrador por defecto (admin@wms.local / admin123)
- Útil para inicializar una base de datos nueva o vacía

#### ¿Cuándo se usa?

**Se usa cuando:**
- Tienes una base de datos nueva/vacía
- Quieres recrear todas las tablas desde cero
- Necesitas crear el usuario administrador inicial

**NO se usa cuando:**
- Ya tienes datos en la base de datos (podría borrarlos)
- Solo quieres agregar tablas nuevas (usa `migrar_tablas_nuevas.py`)

#### ¿Qué debes hacer ahora?

**OPCIÓN A: Guardar para uso futuro (Recomendado)**

- Este script es muy útil para:
  - Inicializar base de datos en producción
  - Recrear base de datos en desarrollo
  - Setup inicial del sistema

- **Guárdalo** en una carpeta `scripts/` o mantenlo en la raíz

**OPCIÓN B: Actualizar si es necesario**

- El archivo ya está actualizado con los nuevos modelos
- Incluye `TransferenciaProcesada` y `MapeoUbicacionADM_WMS`
- No necesitas modificarlo

**OPCIÓN C: Usar solo cuando sea necesario**

- No lo ejecutes si ya tienes datos
- Solo ejecútalo en bases de datos nuevas
- Úsalo para setup inicial o recreación completa

---

## 📋 PASO A PASO RECOMENDADO

### PASO 1: Verificar estado de migración (2 minutos)

```bash
python verificar_migracion.py
```

**Resultado esperado:**
```
[OK] Tabla 'transferencias_procesadas' existe
[OK] Tabla 'mapeo_ubicaciones_adm_wms' existe
[OK] Columna 'location_id' existe
[OK] Columna 'location_name' existe
[OK] Migración completada correctamente
```

### PASO 2: Decidir qué hacer con los archivos

**Si la verificación dice "OK":**

**Para `migrar_tablas_nuevas.py`:**
- ✅ Ya cumplió su función
- Puedes guardarlo como referencia O borrarlo
- No necesitas ejecutarlo de nuevo

**Para `init_db.py`:**
- ✅ Guárdalo para uso futuro
- Útil para inicializar bases de datos nuevas
- No lo ejecutes ahora (ya tienes datos)

**Si la verificación dice "PENDIENTE":**

**Para `migrar_tablas_nuevas.py`:**
- ⚠️ Ejecuta: `python migrar_tablas_nuevas.py`
- Luego verifica de nuevo

**Para `init_db.py`:**
- ⚠️ NO lo ejecutes (podría borrar datos)
- Usa `migrar_tablas_nuevas.py` en su lugar

### PASO 3: Organizar archivos (opcional)

**Crear carpeta de scripts:**
```bash
mkdir scripts
move migrar_tablas_nuevas.py scripts/
move init_db.py scripts/
move verificar_migracion.py scripts/
```

**O mantener en raíz:**
- También está bien dejarlos en la raíz
- Son scripts útiles de referencia

---

## ⚠️ ADVERTENCIAS IMPORTANTES

### ⚠️ NO ejecutes `init_db.py` si:
- Ya tienes datos en la base de datos
- Ya tienes usuarios creados
- Ya tienes facturas, movimientos, etc.

**Razón:** `db.create_all()` puede recrear tablas y perder datos si no tienes cuidado.

### ✅ SÍ ejecuta `migrar_tablas_nuevas.py` si:
- La verificación dice que faltan tablas/columnas
- Necesitas agregar las nuevas tablas sin perder datos

**Razón:** Solo crea lo que falta, no borra nada.

---

## 📝 RESUMEN

### `migrar_tablas_nuevas.py`:
- ✅ **Ya ejecutado** - Migración completa
- 📦 **Guardar como referencia** o borrar
- 🔄 **Ejecutar solo si** falta algo

### `init_db.py`:
- 📦 **Guardar para uso futuro**
- ⚠️ **NO ejecutar ahora** (ya tienes datos)
- 🆕 **Usar solo para** bases de datos nuevas

---

## 🚀 ACCIÓN INMEDIATA

**Ejecuta esto ahora:**

```bash
python verificar_migracion.py
```

**Si dice "OK":**
- No necesitas hacer nada más
- Los archivos ya cumplieron su función
- Guárdalos como referencia o bórralos

**Si dice "PENDIENTE":**
- Ejecuta: `python migrar_tablas_nuevas.py`
- Luego verifica de nuevo

---

**¿Necesitas ayuda con algo más?** Puedo ayudarte a verificar el estado o ejecutar la migración si falta algo.




