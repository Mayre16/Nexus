# 📊 ANÁLISIS: Sincronización por Lotes y Sincronización Incremental

**Fecha:** 2026-01-22  
**Objetivo:** Evaluar viabilidad de sincronización por lotes de 1000 y sincronización incremental

---

## 🎯 OPCIÓN 1: SINCRONIZACIÓN POR LOTES DE 1000

### ✅ VIABLE - SÍ ES POSIBLE

**Cómo funcionaría:**

1. **Fase 1: Contar productos totales**
   - Hacer peticiones de 50 en 50 hasta que no haya más
   - Contar total de items con stock > 0
   - Ejemplo: "Total encontrado: 4583 productos"

2. **Fase 2: Sincronizar lote 1 (0-1000)**
   - Sincronizar items 0-1000 (20 peticiones de 50)
   - Guardar progreso: `skip_actual = 1000`
   - Estado: "Sincronizado 1000 de 4583"
   - Pausar y esperar confirmación

3. **Fase 3: Continuar lote 2 (1001-2000)**
   - Leer `skip_actual` desde BD
   - Continuar desde 1001 hasta 2000
   - Guardar progreso: `skip_actual = 2000`
   - Estado: "Sincronizado 2000 de 4583"
   - Pausar y esperar confirmación

4. **Repetir hasta completar**

**Implementación necesaria:**

1. **Nuevo campo en `SyncLocationStatus`:**
   ```python
   skip_actual = db.Column(db.Integer, default=0)  # Skip actual
   total_items = db.Column(db.Integer, default=0)    # Total de items encontrados
   ```

2. **Nuevo endpoint:**
   ```python
   POST /api/sincronizar/ubicacion/<location_id>/continuar
   # Continúa desde skip_actual
   ```

3. **Modificar endpoint actual:**
   ```python
   POST /api/sincronizar/ubicacion/<location_id>
   # Opción: "contar" o "sincronizar"
   # Si es "contar", solo cuenta y guarda total_items
   # Si es "sincronizar", sincroniza lote de 1000
   ```

**Ventajas:**
- ✅ Evita timeout (cada lote de 1000 toma ~1-2 minutos)
- ✅ Permite pausar y continuar
- ✅ Muestra progreso claro
- ✅ No pierde datos si hay timeout

**Desventajas:**
- ⚠️ Requiere intervención manual para continuar
- ⚠️ Más complejo de implementar

---

## 🔄 OPCIÓN 2: SINCRONIZACIÓN INCREMENTAL (Solo cambios)

### ❓ POSIBLE PERO LIMITADO

**Análisis de ADM Cloud API:**

Del código actual, `obtener_stock` solo acepta:
- `location_id` (opcional)
- `skip` (paginación)
- `take` (cantidad)

**NO acepta:**
- ❌ Filtro por fecha de modificación
- ❌ Filtro por "última actualización"
- ❌ Filtro por "cambios desde fecha X"

**Opciones posibles:**

### Opción A: Comparar en WMS (parcial)
1. Obtener TODOS los items de ADM (como ahora)
2. Comparar con stock en BD
3. Solo actualizar los que cambiaron

**Problema:** 
- ❌ Sigue trayendo TODOS los items (mismo tiempo)
- ✅ Solo actualiza los que cambiaron (más rápido en BD)

**No resuelve el timeout**

### Opción B: Verificar si ADM tiene endpoint de cambios
- Necesitaríamos documentación de ADM Cloud API
- O probar endpoints como:
  - `/api/Stock/Changes?since=2026-01-22`
  - `/api/Stock/Modified?date=2026-01-22`

**Probabilidad:** Baja (ADM Cloud no parece tener esto)

### Opción C: Sincronización inteligente (híbrida)
1. Primera vez: Sincronizar todo
2. Siguientes veces:
   - Comparar `last_sync_at` con fecha actual
   - Si pasaron < 24 horas: Sincronizar solo items con stock > 0 (más rápido)
   - Si pasaron > 24 horas: Sincronización completa

**Ventaja:** 
- ✅ Más rápido en sincronizaciones frecuentes
- ⚠️ No resuelve timeout en primera sync

---

## 💡 RECOMENDACIÓN

### Implementar OPCIÓN 1 (Lotes de 1000)

**Razones:**
1. ✅ Resuelve el problema de timeout de ADESA
2. ✅ Permite control manual del proceso
3. ✅ Muestra progreso claro
4. ✅ No depende de funcionalidades de ADM que no existen

**Implementación sugerida:**

1. **Modificar `SyncLocationStatus`:**
   ```python
   skip_actual = db.Column(db.Integer, default=0)
   total_items = db.Column(db.Integer, default=0)
   lote_actual = db.Column(db.Integer, default=0)  # Lote actual (1, 2, 3...)
   ```

2. **Nuevo endpoint:**
   ```python
   POST /api/sincronizar/ubicacion/<location_id>/contar
   # Solo cuenta y guarda total_items
   
   POST /api/sincronizar/ubicacion/<location_id>/lote
   # Sincroniza lote de 1000 desde skip_actual
   # Guarda skip_actual y lote_actual
   ```

3. **Modificar UI:**
   - Botón "Contar productos"
   - Botón "Sincronizar lote siguiente"
   - Mostrar: "Sincronizado X de Y productos"

---

## 📋 RESUMEN

| Opción | Viable | Resuelve Timeout | Complejidad |
|--------|--------|------------------|-------------|
| **Lotes de 1000** | ✅ SÍ | ✅ SÍ | Media |
| **Incremental (ADM)** | ❌ NO | ❌ NO | Alta |
| **Incremental (WMS)** | ⚠️ Parcial | ❌ NO | Baja |

---

**¿Quieres que implemente la sincronización por lotes de 1000?**




