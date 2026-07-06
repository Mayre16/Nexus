# 📋 INSTRUCCIONES CPANEL: PASO A PASO (SQLite)

**Fecha:** 2026-01-22  
**Base de Datos:** SQLite (wms.db)

---

## ⚠️ IMPORTANTE

**Lo ejecutado localmente NO se aplica en cPanel.**  
Debes ejecutar los scripts también en cPanel usando "Execute python script".

---

## 📦 PASO 1: SUBIR ARCHIVOS A CPANEL

### Archivos OBLIGATORIOS (10 archivos):

1. ✅ `database/models.py`
2. ✅ `migrar_tablas_nuevas.py` ⚠️ NUEVO
3. ✅ `verificar_migracion.py` ⚠️ NUEVO
4. ✅ `routes/facturas.py`
5. ✅ `routes/despacho.py`
6. ✅ `routes/transferencias.py`
7. ✅ `utils/helpers.py`
8. ✅ `api/adm_cloud.py`
9. ✅ `app_wms.py`
10. ✅ `routes/__init__.py`

**Ubicación en cPanel:** Misma estructura de carpetas (en `wms.adesa.com.do/`)

---

## 🔧 PASO 2: EJECUTAR MIGRACIÓN EN CPANEL

### En cPanel → "Execute python script":

1. **Agregar archivo:**
   - En el campo "Add another file and press enter"
   - Escribe: `migrar_tablas_nuevas.py`
   - Click en botón "Add" (+)

2. **Ejecutar script:**
   - Verás `migrar_tablas_nuevas.py` en la lista
   - Click en botón "Run Script" (▶️) junto al archivo

3. **Salida esperada:**
   ```
   [*] Creando nuevas tablas...
   [OK] Tabla 'transferencias_procesadas' creada/verificada
   [OK] Tabla 'mapeo_ubicaciones_adm_wms' creada/verificada
   [*] Agregando columna 'location_id' a facturas_procesadas...
   [OK] Columna 'location_id' agregada
   [*] Agregando columna 'location_name' a facturas_procesadas...
   [OK] Columna 'location_name' agregada
   [OK] Indice en location_id creado/verificado
   
   [OK] Migracion completada exitosamente!
   ```

4. **Si hay errores:**
   - Copia el mensaje de error completo
   - Verifica que los archivos estén en la ubicación correcta

---

## ✅ PASO 3: VERIFICAR MIGRACIÓN EN CPANEL

### En cPanel → "Execute python script":

1. **Agregar archivo:**
   - En el campo "Add another file and press enter"
   - Escribe: `verificar_migracion.py`
   - Click en botón "Add" (+)

2. **Ejecutar script:**
   - Verás `verificar_migracion.py` en la lista
   - Click en botón "Run Script" (▶️) junto al archivo

3. **Salida esperada:**
   ```
   ============================================================
   VERIFICACION DE MIGRACION
   ============================================================
   
   [1] Verificando tablas nuevas...
   [OK] Tabla 'transferencias_procesadas' existe
   [OK] Tabla 'mapeo_ubicaciones_adm_wms' existe
   
   [2] Verificando columnas nuevas en facturas_procesadas...
   [OK] Columna 'location_id' existe
   [OK] Columna 'location_name' existe
   
   ============================================================
   RESUMEN
   ============================================================
   [OK] Migracion completada correctamente
   ```

4. **Si dice "[PENDIENTE]":**
   - Ejecuta `migrar_tablas_nuevas.py` de nuevo
   - Verifica que no haya errores
   - Ejecuta `verificar_migracion.py` de nuevo

---

## 📋 CHECKLIST COMPLETO

### Archivos Subidos:
- [ ] `database/models.py`
- [ ] `migrar_tablas_nuevas.py`
- [ ] `verificar_migracion.py`
- [ ] `routes/facturas.py`
- [ ] `routes/despacho.py`
- [ ] `routes/transferencias.py`
- [ ] `utils/helpers.py`
- [ ] `api/adm_cloud.py`
- [ ] `app_wms.py`
- [ ] `routes/__init__.py`

### Scripts Ejecutados:
- [ ] Ejecutado `migrar_tablas_nuevas.py` en cPanel
- [ ] Salida: "[OK] Migración completada exitosamente!"
- [ ] Ejecutado `verificar_migracion.py` en cPanel
- [ ] Salida: "[OK] Migración completada correctamente"

### Verificación Funcional:
- [ ] Probar búsqueda de factura → Debe mostrar ubicación de origen
- [ ] Probar búsqueda de transferencia → Debe mostrar Origen → Destino

---

## ⚠️ IMPORTANTE

### ❌ NO ejecutes `init_db.py` en cPanel

**Razón:** Recrea TODAS las tablas desde cero y puede borrar datos.

**Solo usa:** `migrar_tablas_nuevas.py` (solo agrega, no borra)

---

## 🔍 TROUBLESHOOTING

### Error: "No module named 'app_wms'"
**Solución:** Verifica que `app_wms.py` esté en la raíz del proyecto en cPanel

### Error: "Table already exists"
**Solución:** Normal, el script verifica antes de crear. Ignorar.

### Error: "Column already exists"
**Solución:** Normal si ejecutaste antes. El script verifica antes de agregar.

### Error: "Database is locked"
**Solución:** Espera unos segundos y ejecuta de nuevo

### La verificación sigue diciendo "[PENDIENTE]"
**Solución:**
1. Ejecuta `migrar_tablas_nuevas.py` de nuevo
2. Verifica que no haya errores en la salida
3. Ejecuta `verificar_migracion.py` de nuevo

---

## 📝 RESUMEN EJECUTIVO

### Archivos a Subir: 10 archivos
### Scripts a Ejecutar: 2 scripts
1. `migrar_tablas_nuevas.py` → Crear tablas/columnas
2. `verificar_migracion.py` → Verificar

### Orden:
1. Subir archivos
2. Ejecutar `migrar_tablas_nuevas.py`
3. Ejecutar `verificar_migracion.py`
4. Probar sistema

---

**¿Necesitas ayuda con algún paso?** Puedo ayudarte a resolver errores.




