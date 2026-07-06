# 📋 GUÍA CPANEL: MIGRACIÓN DE TABLAS NUEVAS

**Fecha:** 2026-01-22  
**Objetivo:** Aplicar cambios de base de datos en cPanel

---

## ⚠️ IMPORTANTE

**Lo ejecutado localmente NO se aplica automáticamente en cPanel.**  
Debes ejecutar los scripts también en cPanel usando "Execute python script".

---

## 📦 ARCHIVOS A SUBIR A CPANEL

### Archivos OBLIGATORIOS (modificados):

1. **`database/models.py`** ⚠️ OBLIGATORIO
   - Contiene los nuevos modelos: `TransferenciaProcesada`, `MapeoUbicacionADM_WMS`
   - Contiene campos nuevos en `FacturaProcesada`: `location_id`, `location_name`

2. **`migrar_tablas_nuevas.py`** ⚠️ OBLIGATORIO
   - Script que crea las tablas y columnas nuevas
   - DEBES ejecutarlo en cPanel

3. **`verificar_migracion.py`** ✅ RECOMENDADO
   - Script para verificar que la migración se aplicó correctamente
   - Útil para confirmar que todo está bien

### Archivos OBLIGATORIOS (rutas modificadas):

4. **`routes/facturas.py`** ⚠️ OBLIGATORIO
   - Extrae y guarda `location_id` y `location_name`

5. **`routes/despacho.py`** ⚠️ OBLIGATORIO
   - Usa ubicación correcta (no hardcodeado a "ADESA")

6. **`routes/transferencias.py`** ⚠️ OBLIGATORIO
   - Endpoint `/api/transferencias/registrar` completo

7. **`utils/helpers.py`** ⚠️ OBLIGATORIO
   - Función `obtener_productos_location_transfer()`

8. **`api/adm_cloud.py`** ⚠️ OBLIGATORIO
   - Métodos para LocationTransfers

9. **`app_wms.py`** ⚠️ OBLIGATORIO
   - Ruta `/transferencias` y registro del blueprint

10. **`routes/__init__.py`** ⚠️ OBLIGATORIO
    - Import de `transferencias_bp`

### Archivos OPCIONALES (documentación):

11. **`init_db.py`** (opcional)
    - Solo si quieres recrear la base de datos desde cero
    - NO ejecutar si ya tienes datos

---

## 🔧 PASOS EN CPANEL

### PASO 1: Subir archivos modificados

**Sube estos archivos a cPanel (reemplaza los existentes):**

```
✅ database/models.py
✅ migrar_tablas_nuevas.py
✅ verificar_migracion.py (nuevo)
✅ routes/facturas.py
✅ routes/despacho.py
✅ routes/transferencias.py
✅ utils/helpers.py
✅ api/adm_cloud.py
✅ app_wms.py
✅ routes/__init__.py
```

**Ubicación en cPanel:** Misma estructura de carpetas que localmente.

---

### PASO 2: Ejecutar migración en cPanel

**En cPanel → "Execute python script":**

1. **Agregar archivo:**
   - Click en "Add another file and press enter"
   - Escribe: `migrar_tablas_nuevas.py`
   - Click en "Add"

2. **Ejecutar script:**
   - Click en botón "Run Script" (▶️) junto a `migrar_tablas_nuevas.py`

3. **Verificar salida:**
   - Debe mostrar:
     ```
     [OK] Tabla 'transferencias_procesadas' creada/verificada
     [OK] Tabla 'mapeo_ubicaciones_adm_wms' creada/verificada
     [OK] Columna 'location_id' agregada
     [OK] Columna 'location_name' agregada
     [OK] Migración completada exitosamente!
     ```

4. **Si hay errores:**
   - Revisa el mensaje de error
   - Verifica que los archivos estén en la ubicación correcta
   - Verifica permisos de la base de datos

---

### PASO 3: Verificar migración en cPanel

**En cPanel → "Execute python script":**

1. **Agregar archivo:**
   - Click en "Add another file and press enter"
   - Escribe: `verificar_migracion.py`
   - Click en "Add"

2. **Ejecutar script:**
   - Click en botón "Run Script" (▶️) junto a `verificar_migracion.py`

3. **Verificar salida:**
   - Debe mostrar:
     ```
     [OK] Tabla 'transferencias_procesadas' existe
     [OK] Tabla 'mapeo_ubicaciones_adm_wms' existe
     [OK] Columna 'location_id' existe
     [OK] Columna 'location_name' existe
     [OK] Migración completada correctamente
     ```

4. **Si dice "[PENDIENTE]":**
   - Ejecuta `migrar_tablas_nuevas.py` de nuevo
   - Verifica que no haya errores
   - Ejecuta `verificar_migracion.py` de nuevo

---

## 📋 CHECKLIST COMPLETO PARA CPANEL

### Archivos a Subir:

- [ ] `database/models.py` (modificado)
- [ ] `migrar_tablas_nuevas.py` (nuevo)
- [ ] `verificar_migracion.py` (nuevo)
- [ ] `routes/facturas.py` (modificado)
- [ ] `routes/despacho.py` (modificado)
- [ ] `routes/transferencias.py` (modificado)
- [ ] `utils/helpers.py` (modificado)
- [ ] `api/adm_cloud.py` (modificado)
- [ ] `app_wms.py` (modificado)
- [ ] `routes/__init__.py` (modificado)
- [ ] `templates/transferencias.html` (nuevo, si existe)
- [ ] `templates/index.html` (modificado)

### Scripts a Ejecutar en cPanel:

- [ ] Ejecutar `migrar_tablas_nuevas.py` en "Execute python script"
- [ ] Verificar salida: debe decir "[OK] Migración completada exitosamente!"
- [ ] Ejecutar `verificar_migracion.py` en "Execute python script"
- [ ] Verificar salida: debe decir "[OK] Migración completada correctamente"

### Verificación Final:

- [ ] Probar búsqueda de factura → Debe mostrar ubicación de origen
- [ ] Probar búsqueda de transferencia → Debe mostrar Origen → Destino
- [ ] Verificar que no hay errores en logs

---

## ⚠️ IMPORTANTE SOBRE `init_db.py`

**NO ejecutes `init_db.py` en cPanel si:**
- Ya tienes datos en la base de datos
- Ya tienes usuarios, facturas, movimientos, etc.

**Razón:** `init_db.py` recrea TODAS las tablas desde cero y puede borrar datos.

**Solo usa `migrar_tablas_nuevas.py`** que solo agrega lo que falta sin borrar nada.

---

## 🔍 TROUBLESHOOTING

### Error: "Table already exists"
- **Significado:** La tabla ya existe (normal si ejecutaste antes)
- **Solución:** Ignorar, el script usa `checkfirst=True` que evita errores

### Error: "Column already exists"
- **Significado:** La columna ya existe (normal si ejecutaste antes)
- **Solución:** El script verifica antes de agregar, no debería pasar

### Error: "No module named 'app_wms'"
- **Significado:** El script no encuentra el módulo
- **Solución:** Verifica que `app_wms.py` esté en la raíz del proyecto en cPanel

### Error: "Database is locked"
- **Significado:** La base de datos está en uso
- **Solución:** Espera unos segundos y ejecuta de nuevo

### La verificación sigue diciendo "[PENDIENTE]"
- **Solución 1:** Ejecuta `migrar_tablas_nuevas.py` de nuevo
- **Solución 2:** Verifica que el script se ejecutó sin errores
- **Solución 3:** Verifica permisos de la base de datos en cPanel

---

## 📝 RESUMEN EJECUTIVO

### Archivos a Subir (10 archivos):
1. `database/models.py`
2. `migrar_tablas_nuevas.py` ⚠️ NUEVO
3. `verificar_migracion.py` ⚠️ NUEVO
4. `routes/facturas.py`
5. `routes/despacho.py`
6. `routes/transferencias.py`
7. `utils/helpers.py`
8. `api/adm_cloud.py`
9. `app_wms.py`
10. `routes/__init__.py`

### Scripts a Ejecutar en cPanel (2 scripts):
1. **`migrar_tablas_nuevas.py`** → Crear tablas y columnas
2. **`verificar_migracion.py`** → Verificar que todo está bien

### NO Ejecutar:
- ❌ `init_db.py` (solo para bases de datos nuevas)

---

## ✅ ORDEN DE EJECUCIÓN EN CPANEL

1. **Subir todos los archivos** a cPanel
2. **Ejecutar `migrar_tablas_nuevas.py`** en "Execute python script"
3. **Verificar salida** → Debe decir "[OK] Migración completada exitosamente!"
4. **Ejecutar `verificar_migracion.py`** en "Execute python script"
5. **Verificar salida** → Debe decir "[OK] Migración completada correctamente"
6. **Probar el sistema** → Buscar factura/transferencia y verificar que funciona

---

**¿Necesitas ayuda con algún paso específico?** Puedo ayudarte a verificar los archivos o resolver errores.




