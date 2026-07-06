# RESPUESTAS TÉCNICAS: Análisis de Implementación Staging Cache

**Fecha:** 2026-01-29  
**Versión:** 1.0

---

## 1. LECTURAS DURANTE LA SINCRONIZACIÓN (Consistencia del LIVE)

### ¿Qué pasaría si la sync está corriendo (NEW llenándose) y un usuario hace búsquedas/transferencias/ajustes?

**Respuesta:** ✅ **LIVE se mantiene estable**. Todas las consultas usan `sync_run_id = current_run_id`, que NO cambia hasta el swap. NEW tiene `sync_run_id = nuevo_run.run_id` (diferente), por lo que nunca se mezclan.

**Implementación:**
```python
# Helper function para obtener stock vigente
def obtener_stock_vigente(producto_id, location_id):
    estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
    if not estado_sync or not estado_sync.current_run_id:
        # Fallback: registros sin sync_run_id (compatibilidad)
        return StockProductoADM.query.filter_by(
            producto_id=producto_id,
            location_id=location_id,
            sync_run_id=None
        ).first()
    
    return StockProductoADM.query.filter_by(
        producto_id=producto_id,
        location_id=location_id,
        sync_run_id=estado_sync.current_run_id  # SIEMPRE LIVE
    ).first()
```

### ¿La UI y las validaciones leen siempre LIVE (current_run_id) y nunca tocan NEW?

**Respuesta:** ✅ **Sí, siempre LIVE**. Todas las consultas deben usar el helper `obtener_stock_vigente()` que filtra por `current_run_id`. NEW solo se consulta durante validación post-sync.

### ¿Qué pasaría si hay endpoints que hoy consultan StockProductoADM sin filtro?

**Respuesta:** ⚠️ **Problema crítico**. Deben migrarse TODOS los endpoints. Estrategia:

1. **Fase 1 (Compatibilidad):** Helper function con fallback:
   ```python
   def obtener_stock_vigente(producto_id, location_id):
       estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
       run_id = estado_sync.current_run_id if estado_sync else None
       
       if run_id:
           return StockProductoADM.query.filter_by(
               producto_id=producto_id,
               location_id=location_id,
               sync_run_id=run_id
           ).first()
       else:
           # Fallback: registros sin sync_run_id (migración gradual)
           return StockProductoADM.query.filter_by(
               producto_id=producto_id,
               location_id=location_id,
               sync_run_id=None
           ).first()
   ```

2. **Fase 2 (Auditoría):** Agregar logging para detectar consultas sin filtro:
   ```python
   # En desarrollo: detectar consultas sin sync_run_id
   if not query.filter_by(sync_run_id=...):
       logger.warning(f"Consulta sin sync_run_id detectada: {traceback.format_stack()}")
   ```

### ¿Cómo garantizas que todo use sync_run_id=current_run_id para no mezclar runs?

**Respuesta:** 
- ✅ **Helper function centralizada:** `obtener_stock_vigente()` en `utils/helpers.py`
- ✅ **Índice único:** `(producto_id, location_id, sync_run_id)` previene duplicados
- ✅ **Validación en tests:** Unit tests que verifican que todas las consultas usan el helper
- ⚠️ **Code review:** Revisar que no haya consultas directas a `StockProductoADM` sin filtro

### ¿Qué pasaría si una sync tarda mucho y la gente sigue operando?

**Respuesta:** ✅ **No hay problema**. LIVE permanece estable con `current_run_id` sin cambios. Los usuarios operan sobre datos estables (pueden estar desactualizados, pero consistentes). Cuando termine la sync y se haga swap, la próxima consulta verá los datos nuevos.

### ¿LIVE se mantiene estable sin "saltos" hasta el swap?

**Respuesta:** ✅ **Sí, completamente estable**. `current_run_id` solo cambia en el swap atómico. No hay "saltos" intermedios.

---

## 2. FALLOS, CAPS, REINTENTOS Y SWAP SEGURO

### ¿Qué pasaría si la sync llega al cap de tiempo/requests/items (partial)?

**Respuesta:** 
- ✅ **NEW se marca como `status='partial'`** en `SyncRun`
- ❌ **NO se hace swap** (LIVE permanece igual)
- ✅ **Se crea registro `EnRevision`** con tipo `'sync_parcial'` para alertar
- ✅ **`SyncLocationStatus.status = 'partial'`** para indicar que necesita re-sync

**Implementación:**
```python
if se_alcanzo_cap:
    nuevo_run.status = 'partial'
    nuevo_run.finished_at = datetime.utcnow()
    # NO actualizar current_run_id
    # Crear EnRevision para alertar
    crear_en_revision({
        'tipo': 'sync_parcial',
        'location_id': location_id,
        'motivo': f'Sync parcial: alcanzó cap (requests: {requests_realizados}, tiempo: {tiempo_transcurrido} min)'
    })
```

### ¿Qué pasaría si la sync falla por timeout a mitad (error 500, desconexión, etc.)?

**Respuesta:**
- ✅ **NEW se marca como `status='failed'`**
- ❌ **NO se hace swap** (LIVE permanece igual)
- ✅ **Rollback automático:** Si hay transacción, se revierte
- ✅ **Limpieza:** Eliminar registros de `StockProductoADM` con `sync_run_id = failed_run.run_id`

**Implementación:**
```python
try:
    # ... proceso de sync ...
except Exception as e:
    nuevo_run.status = 'failed'
    nuevo_run.finished_at = datetime.utcnow()
    nuevo_run.errors_count = 1
    # NO hacer swap
    # Limpiar registros NEW (opcional, o dejarlos para debug)
    db.session.rollback()
    raise
```

### ¿Cómo aseguras que LIVE no se contamine con registros NEW incompletos?

**Respuesta:**
- ✅ **Separación física:** NEW tiene `sync_run_id` diferente, nunca se mezcla con LIVE
- ✅ **Swap solo si `status='done'`:** Validación estricta antes de swap
- ✅ **Transacción atómica:** Swap en una sola transacción

**Implementación:**
```python
def hacer_swap_atomico(location_id, run_id_new):
    nuevo_run = SyncRun.query.get(run_id_new)
    
    # Validación estricta
    if nuevo_run.status != 'done':
        raise ValueError(f"No se puede hacer swap: run {run_id_new} tiene status '{nuevo_run.status}'")
    
    # Transacción atómica
    try:
        estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
        estado_sync.current_run_id = run_id_new
        estado_sync.status = 'done'
        estado_sync.last_sync_at = datetime.utcnow()
        
        nuevo_run.finished_at = datetime.utcnow()
        
        db.session.commit()  # Atómico: o todo o nada
    except Exception as e:
        db.session.rollback()
        raise
```

### ¿Qué pasaría si el proceso muere justo en el momento del swap?

**Respuesta:**
- ✅ **Transacción DB garantiza atomicidad:** Si el proceso muere, la transacción se revierte automáticamente
- ✅ **`current_run_id` no cambia** si el commit no se completa
- ✅ **Recuperación:** Al reiniciar, verificar estado y completar swap si es necesario

**Implementación:**
```python
# Verificación al iniciar aplicación
def verificar_estados_pendientes():
    """Verifica si hay runs en estado 'done' pero no son current_run_id"""
    runs_done_no_live = SyncRun.query.join(SyncLocationStatus).filter(
        SyncRun.status == 'done',
        SyncRun.run_id != SyncLocationStatus.current_run_id
    ).all()
    
    for run in runs_done_no_live:
        logger.warning(f"Run {run.run_id} está 'done' pero no es LIVE. Revisar manualmente.")
```

### ¿Qué pasaría si alguien intenta correr otra sync de la misma ubicación mientras hay una running?

**Respuesta:** ⚠️ **Debe bloquearse**. Estrategias:

**Opción 1 (Recomendada): Bloquear con validación**
```python
def sincronizar_ubicacion(location_id):
    estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
    
    # Verificar si hay sync en curso
    if estado_sync and estado_sync.status == 'running':
        # Verificar si el run realmente está corriendo (no quedó zombie)
        run_actual = SyncRun.query.filter_by(
            run_id=estado_sync.current_run_id or 0
        ).first()
        
        if run_actual and run_actual.status == 'running':
            tiempo_transcurrido = (datetime.utcnow() - run_actual.started_at).total_seconds() / 60
            if tiempo_transcurrido < 60:  # Menos de 1 hora = probablemente activo
                return jsonify({
                    "success": False,
                    "error": f"Ya hay una sincronización en curso para {estado_sync.location_name} (run_id: {run_actual.run_id})"
                }), 409  # Conflict
```

**Opción 2: Cancelar anterior**
```python
# Marcar run anterior como 'cancelled'
run_anterior.status = 'cancelled'
run_anterior.finished_at = datetime.utcnow()
# Continuar con nuevo run
```

**Recomendación:** Opción 1 (bloquear) es más segura.

### ¿Qué política usarías para limpieza de runs viejos?

**Respuesta:**
- ✅ **Limpieza automática:** Runs > 30 días que NO son `current_run_id`
- ✅ **Preservar histórico:** Mantener últimos 5 runs por ubicación (para comparaciones)
- ✅ **Validación:** No eliminar si es `current_run_id`

**Implementación:**
```python
def limpiar_runs_antiguos(dias=30, mantener_ultimos=5):
    fecha_limite = datetime.utcnow() - timedelta(days=dias)
    
    # Obtener current_run_id por ubicación (NO eliminar estos)
    current_runs = set(
        db.session.query(SyncLocationStatus.current_run_id)
        .filter(SyncLocationStatus.current_run_id.isnot(None))
        .all()
    )
    
    # Por cada ubicación, mantener últimos N runs
    ubicaciones = db.session.query(SyncRun.location_id).distinct().all()
    
    for (location_id,) in ubicaciones:
        # Obtener últimos N runs (ordenados por finished_at DESC)
        ultimos_runs = SyncRun.query.filter_by(
            location_id=location_id
        ).order_by(SyncRun.finished_at.desc()).limit(mantener_ultimos).all()
        
        run_ids_preservar = {r.run_id for r in ultimos_runs} | current_runs
        
        # Eliminar runs antiguos que no están en preservar
        runs_a_eliminar = SyncRun.query.filter(
            SyncRun.location_id == location_id,
            SyncRun.finished_at < fecha_limite,
            ~SyncRun.run_id.in_(run_ids_preservar)
        ).all()
        
        for run in runs_a_eliminar:
            # Eliminar registros de stock asociados
            StockProductoADM.query.filter_by(sync_run_id=run.run_id).delete()
            db.session.delete(run)
    
    db.session.commit()
```

---

## 3. "SYNC COMPLETA" REAL (Evitar Falsos OK)

### ¿Cómo defines técnicamente "sync completa"?

**Respuesta:** Múltiples condiciones:

1. ✅ **Último lote < batch_size:** Indica fin natural de paginación
2. ✅ **Sin errores críticos:** Todos los requests devolvieron 200
3. ✅ **Contadores consistentes:** `items_synced` ≈ `total_items` (con margen del 5%)
4. ✅ **No alcanzó caps:** `requests_realizados < max_requests`, `tiempo_transcurrido < max_minutos`
5. ✅ **ADM no trae total confiable:** No confiar en totales de ADM, solo en paginación

**Implementación:**
```python
def es_sync_completa(items_recibidos, batch_size, requests_realizados, max_requests, 
                     tiempo_transcurrido, max_minutos, items_synced, total_items):
    # Condición 1: Último lote menor que batch_size (fin natural)
    fin_natural = items_recibidos < batch_size
    
    # Condición 2: No alcanzó caps
    sin_caps = (
        requests_realizados < max_requests and
        tiempo_transcurrido < max_minutos
    )
    
    # Condición 3: Contadores consistentes (margen 5%)
    contadores_ok = total_items > 0 and abs(items_synced - total_items) / total_items <= 0.05
    
    return fin_natural and sin_caps and contadores_ok
```

### ¿Qué pasaría si ADM responde 200 pero devuelve pocos items por un fallo silencioso?

**Respuesta:** ⚠️ **Difícil de detectar**. Estrategias:

1. **Comparar con run anterior:**
   ```python
   if run_id_old:
       items_old = SyncRun.query.get(run_id_old).total_items
       if total_items_new < items_old * 0.8:  # 20% menos = sospechoso
           logger.warning(f"Sync sospechosa: {total_items_new} items vs {items_old} anterior")
           # Marcar como 'partial' o 'sospechosa'
   ```

2. **Validar consistencia de paginación:**
   ```python
   # Si recibimos menos items de lo esperado en un lote intermedio
   if items_recibidos < batch_size and skip_actual < total_items_estimado * 0.9:
       # Probablemente hay un problema
       logger.warning(f"Lote incompleto sospechoso: recibidos {items_recibidos}, esperados ~{batch_size}")
   ```

3. **Marcar como 'partial' si hay dudas:**
   ```python
   if hay_sospecha_de_incompleto:
       nuevo_run.status = 'partial'
       nuevo_run.warnings_count += 1
       # NO hacer swap
   ```

---

## 4. DETECCIÓN DE DISCREPANCIAS (Caso Producto123)

### Caso: ADM tenía ADESA=5 y Mirador=3. Transferencia en ADM (ADESA 0, Mirador 8) sin registrar en WMS. Luego sincronizas.

**Respuesta:** Se generan **DOS tipos de discrepancias**:

#### (a) NEW vs OLD (cambio brusco)
```python
# Para ADESA:
discrepancias.append({
    'tipo': 'desaparecido',
    'producto_id': producto.id,
    'location_id': 'ADESA_ID',
    'stock_old': 5,
    'stock_new': 0,
    'motivo': 'Stock desapareció: 5 → 0'
})

# Para Mirador:
discrepancias.append({
    'tipo': 'cambio_brusco',
    'producto_id': producto.id,
    'location_id': 'MIRADOR_ID',
    'stock_old': 3,
    'stock_new': 8,
    'motivo': 'Cambio brusco: 3 → 8 (166.7%)'
})
```

#### (b) ADM (NEW) vs Físico StockUbicacion (solo ADESA)
```python
# Para ADESA:
discrepancias.append({
    'tipo': 'critica_adm_vs_fisico',
    'producto_id': producto.id,
    'sku': producto.sku,
    'location_id': 'ADESA_ID',
    'stock_adm': 0,  # NEW
    'stock_fisico': 5,  # StockUbicacion todavía tiene 5
    'motivo': 'ADM=0 pero Físico=5 (CRÍTICO)'
})
```

### ¿Qué pasaría si el cambio brusco es legítimo (venta masiva/recepción grande)?

**Respuesta:** ⚠️ **Falso positivo inevitable**. Estrategias:

1. **Umbrales inteligentes:**
   ```python
   def es_cambio_sospechoso(stock_old, stock_new):
       if stock_old == 0:
           return False  # De 0 a X es normal (nuevo stock)
       
       cambio_absoluto = abs(stock_new - stock_old)
       cambio_porcentual = (cambio_absoluto / stock_old) * 100
       
       # Umbral combinado: porcentaje Y absoluto
       if cambio_porcentual > 300 and cambio_absoluto > 10:
           return True  # Sospechoso: >300% Y >10 unidades
       elif cambio_absoluto > 100:
           return True  # Sospechoso: >100 unidades siempre
       
       return False
   ```

2. **Contexto temporal:**
   ```python
   # Si el cambio ocurre después de una recepción/venta grande en ADM, es menos sospechoso
   # (requiere cruzar con movimientos de ADM, complejo)
   ```

3. **Clasificación por severidad:**
   ```python
   if cambio_porcentual > 500:
       tipo = 'critica'
   elif cambio_porcentual > 300:
       tipo = 'alta'
   else:
       tipo = 'media'
   ```

### ¿Cómo diferencias "discrepancia por operación real en ADM" vs "error de la sync" vs "error humano (no registraron en WMS)"?

**Respuesta:** ⚠️ **No se puede diferenciar automáticamente**. Requiere revisión manual. El sistema solo **detecta** la discrepancia, no la **diagnostica**.

**Estrategia:**
- ✅ **Registrar contexto:** Guardar `stock_old`, `stock_new`, `stock_fisico`, `run_id`, `timestamp`
- ✅ **Clasificación manual:** Usuario revisa y marca como "resuelto", "error_sync", "operacion_adm", etc.
- ✅ **Aprendizaje:** Si el mismo patrón se repite, puede ser legítimo (ej: ventas masivas los viernes)

### ¿Qué pasaría si la discrepancia es solo en Mirador (NO-ADESA) donde no hay StockUbicacion?

**Respuesta:** 
- ✅ **Solo se aplica NEW vs OLD** (cambio brusco)
- ✅ **NO se puede cruzar con físico** (no existe StockUbicacion para NO-ADESA)
- ✅ **Se reporta como "cambio brusco"** sin afirmar que está mal

**Implementación:**
```python
# Para NO-ADESA, solo comparar NEW vs OLD
if "ADESA" not in location_name.upper():
    discrepancias = validar_cambios_sospechosos(run_id_new, run_id_old, location_id)
    # NO llamar a validar_adm_vs_fisico()
```

---

## 5. RESOLVER DISCREPANCIAS DESPUÉS (La Pregunta Clave)

### Si detectas discrepancia porque ADM se sincronizó antes de registrar en WMS, cuando el usuario vaya a "resolver" registrando la transferencia en WMS:

**Respuesta:** ✅ **Siempre validar contra LIVE**. El sistema debe:

1. **Validar contra LIVE:**
   ```python
   # En routes/transferencias.py
   def registrar_transferencia():
       # Obtener stock LIVE (current_run_id)
       stock_adm_live = obtener_stock_vigente(producto_id, location_id_origen)
       
       if stock_adm_live and float(stock_adm_live.stock) < cantidad:
           return jsonify({
               "success": False,
               "error": f"Stock insuficiente en ADM Cloud. Stock LIVE: {stock_adm_live.stock}, requerido: {cantidad}",
               "en_revision": True,  # Indicar que hay discrepancia
               "discrepancia_id": obtener_en_revision_id(producto_id, location_id)
           }), 400
   ```

2. **Bloquear si hay discrepancia crítica:**
   ```python
   # Verificar si hay EnRevision pendiente
   en_revision = EnRevision.query.filter_by(
       producto_id=producto_id,
       location_id=location_id_origen,
       estado='pendiente',
       tipo='critica_adm_vs_fisico'
   ).first()
   
   if en_revision:
       return jsonify({
           "success": False,
           "error": "No se puede registrar transferencia: hay discrepancia crítica pendiente de revisión",
           "discrepancia": en_revision.to_dict(),
           "accion_requerida": "Revisar discrepancia primero o sincronizar nuevamente"
       }), 409
   ```

### Si LIVE ya dice Mirador=8 (porque ADM ya transfirió), y el usuario intenta registrar "ADESA→Mirador 5" en WMS:

**Respuesta:** ⚠️ **Bloquear para evitar duplicación**. El sistema debe:

1. **Detectar duplicación potencial:**
   ```python
   # Validar contra LIVE
   stock_destino_live = obtener_stock_vigente(producto_id, location_id_destino)
   
   if stock_destino_live:
       stock_esperado = float(stock_destino_live.stock) + cantidad
       
       # Si el stock esperado excede significativamente el stock ADM, es sospechoso
       if stock_esperado > float(stock_destino_live.stock) * 1.2:  # 20% más
           return jsonify({
               "success": False,
               "error": f"Transferencia puede duplicar stock. Stock ADM actual: {stock_destino_live.stock}, después sería: {stock_esperado}",
               "advertencia": "Esta transferencia puede haber ocurrido ya en ADM Cloud. Verifica antes de continuar."
           }), 400
   ```

2. **Flujo de conciliación:**
   ```python
   # Si el usuario confirma que es correcto, permitir pero crear movimiento especial
   movimiento = Movimiento(
       tipo="TRANSFER",
       # ... campos normales ...
       notas=f"Transferencia registrada después de sincronización. Stock ADM ya reflejaba este cambio. {notas_adicionales}"
   )
   # NO modificar StockProductoADM (ya está correcto en LIVE)
   # Solo modificar StockUbicacion (si es ADESA)
   ```

### ¿Cómo se resuelve correctamente?

**Respuesta:** Depende del caso:

#### Caso 1: Transferencia física ya ocurrió, falta registro en WMS
- ✅ **Solo ajustar StockUbicacion:** Bajar ADESA físico de 5 a 0, subir destino si es ADESA
- ✅ **NO tocar StockProductoADM:** Ya está correcto en LIVE (ADM ya lo reflejó)

#### Caso 2: Transferencia NO ocurrió físicamente, ADM está mal
- ✅ **Ajuste en ADM:** Usar módulo de ajustes para corregir ADM
- ✅ **Sincronizar nuevamente:** Para actualizar LIVE

#### Caso 3: Transferencia ocurrió pero falta putaway/picking
- ✅ **Registrar movimiento físico interno:** Solo modificar StockUbicacion
- ✅ **Marcar discrepancia como resuelta:** Cuando StockUbicacion coincida con ADM

### Para cerrar un item en EnRevision: ¿cuál es el criterio objetivo?

**Respuesta:** **Dos criterios**:

1. **Automático (siguiente sync):**
   ```python
   def revalidar_en_revision(location_id, run_id_new):
       """Revalida discrepancias pendientes después de nueva sync"""
       discrepancias_pendientes = EnRevision.query.filter_by(
           location_id=location_id,
           estado='pendiente'
       ).all()
       
       for disc in discrepancias_pendientes:
           # Obtener stock NEW
           stock_new = StockProductoADM.query.filter_by(
               producto_id=disc.producto_id,
               location_id=location_id,
               sync_run_id=run_id_new
           ).first()
           
           stock_fisico = StockUbicacion.query.filter_by(
               sku=disc.sku
           ).all()
           stock_fisico_total = sum(float(s.cantidad) for s in stock_fisico)
           
           # Si ya no hay discrepancia, marcar como resuelto
           if disc.tipo == 'critica_adm_vs_fisico':
               if stock_new and float(stock_new.stock) > 0 or stock_fisico_total == 0:
                   disc.estado = 'resuelto'
                   disc.fecha_resolucion = datetime.utcnow()
                   disc.notas = f"Resuelto automáticamente en run {run_id_new}"
   ```

2. **Manual:**
   ```python
   # Usuario marca como "resuelto" con nota y usuario
   disc.estado = 'resuelto'
   disc.resuelto_por = usuario_id
   disc.fecha_resolucion = datetime.utcnow()
   disc.notas = notas_usuario
   ```

---

## 6. "TODAS LAS UBICACIONES" (Escala sin Timeouts)

### ¿Esto lo implementas como "un run por ubicación" o como un run global?

**Respuesta:** ✅ **Un run por ubicación** (recomendado). Razones:

1. ✅ **Escalabilidad:** Cada ubicación se sincroniza independientemente
2. ✅ **Paralelización:** Múltiples ubicaciones pueden sincronizarse en paralelo
3. ✅ **Granularidad:** Errores en una ubicación no afectan otras
4. ✅ **Caps independientes:** Cada ubicación tiene sus propios límites

### ¿Cómo generas un resumen global sin hacer un mega-join de millones?

**Respuesta:** 
- ✅ **Agregación por ubicación:** Consultar `SyncRun` agrupado por `location_id`
- ✅ **Vista materializada:** Crear vista que agregue estadísticas por ubicación
- ✅ **Cache en memoria:** Calcular resumen una vez y cachear

**Implementación:**
```python
def obtener_resumen_global():
    """Obtiene resumen de todas las ubicaciones sin mega-join"""
    # Consultar SyncRun agrupado (mucho más eficiente)
    resumen = db.session.query(
        SyncRun.location_id,
        SyncRun.location_name,
        func.max(SyncRun.finished_at).label('ultima_sync'),
        func.count(SyncRun.run_id).label('total_runs'),
        func.sum(case([(SyncRun.status == 'done', 1)], else_=0)).label('runs_exitosos')
    ).group_by(
        SyncRun.location_id,
        SyncRun.location_name
    ).all()
    
    # Para cada ubicación, obtener current_run_id
    for item in resumen:
        estado = SyncLocationStatus.query.filter_by(location_id=item.location_id).first()
        item.current_run_id = estado.current_run_id if estado else None
    
    return resumen
```

### ¿Qué pasaría si ADESA se sincroniza hoy pero Mirador mañana?

**Respuesta:** ✅ **No hay problema**. Cada ubicación tiene su propio `current_run_id` independiente. Los reportes globales deben indicar claramente la fecha de última sync por ubicación.

### ¿Dónde guardas el "estado vigente" por ubicación (current_run_id)?

**Respuesta:** ✅ **En `SyncLocationStatus.current_run_id`** (una fila por ubicación).

**Uso en frontend:**
```javascript
// Al cargar ubicaciones, obtener current_run_id
fetch('/api/sincronizar/ubicaciones')
  .then(res => res.json())
  .then(data => {
    data.ubicaciones.forEach(ubic => {
      console.log(`${ubic.location_name}: current_run_id=${ubic.current_run_id}`);
    });
  });
```

### ¿Qué pasa si una ubicación nunca se ha sincronizado (current_run_id null)?

**Respuesta:** 
- ✅ **Fallback a registros sin sync_run_id:** Helper function maneja esto
- ✅ **Primera sync crea run:** Al sincronizar por primera vez, se crea `SyncRun` y se actualiza `current_run_id`

---

## 7. ANTI-TIMEOUT: Comparación NEW vs OLD Eficiente

### ¿Cómo harás la comparación NEW vs OLD sin cargar todo en memoria?

**Respuesta:** ✅ **SQL eficiente con JOINs y agregaciones**. No cargar todo en memoria.

**Implementación:**
```python
def validar_cambios_sospechosos_eficiente(run_id_new, run_id_old, location_id):
    """Compara NEW vs OLD usando SQL eficiente"""
    if not run_id_old:
        return []
    
    # Query que devuelve solo diferencias (no carga todo)
    discrepancias_sql = db.session.query(
        StockProductoADM.producto_id,
        StockProductoADM.location_id,
        func.coalesce(old.stock, 0).label('stock_old'),
        func.coalesce(new.stock, 0).label('stock_new'),
        case([
            (func.coalesce(old.stock, 0) > 0 and func.coalesce(new.stock, 0) == 0, 'desaparecido'),
            (func.coalesce(old.stock, 0) == 0 and func.coalesce(new.stock, 0) > 0, 'nuevo'),
            (abs(func.coalesce(new.stock, 0) - func.coalesce(old.stock, 0)) / 
             func.nullif(func.coalesce(old.stock, 0), 0) > 3.0, 'cambio_brusco')
        ], else_='normal').label('tipo')
    ).outerjoin(
        # Alias para NEW
        StockProductoADM.alias('new').filter_by(sync_run_id=run_id_new),
        and_(
            StockProductoADM.producto_id == 'new'.producto_id,
            StockProductoADM.location_id == 'new'.location_id
        )
    ).outerjoin(
        # Alias para OLD
        StockProductoADM.alias('old').filter_by(sync_run_id=run_id_old),
        and_(
            StockProductoADM.producto_id == 'old'.producto_id,
            StockProductoADM.location_id == 'old'.location_id
        )
    ).filter(
        # Solo diferencias
        or_(
            func.coalesce(new.stock, 0) != func.coalesce(old.stock, 0),
            new.stock.is_(None),
            old.stock.is_(None)
        )
    ).limit(1000).all()  # Limitar a top 1000 discrepancias
    
    return discrepancias_sql
```

### ¿Qué índices crearías exactamente?

**Respuesta:**
```sql
-- Índice principal (obligatorio)
CREATE INDEX idx_stock_producto_run ON stock_productos_adm(producto_id, location_id, sync_run_id);

-- Índice para búsquedas por run_id
CREATE INDEX idx_stock_run_id ON stock_productos_adm(sync_run_id);

-- Índice para comparaciones (NEW vs OLD)
CREATE INDEX idx_stock_location_run ON stock_productos_adm(location_id, sync_run_id);
```

### ¿Qué pasaría si el diff toma demasiado tiempo?

**Respuesta:** 
- ✅ **Límite de tiempo:** Máximo 5 minutos para validación
- ✅ **Top N discrepancias:** Limitar a 1000 discrepancias más críticas
- ✅ **Swap igual:** Hacer swap aunque validación esté incompleta, pero marcar como "validación incompleta"

**Implementación:**
```python
def validar_con_timeout(run_id_new, run_id_old, location_id, timeout_segundos=300):
    start_time = time.time()
    discrepancias = []
    
    try:
        # Validar con límite de tiempo
        while time.time() - start_time < timeout_segundos:
            batch = obtener_siguiente_batch_discrepancias(...)
            if not batch:
                break
            discrepancias.extend(batch)
            
            if len(discrepancias) >= 1000:  # Top 1000
                break
    except TimeoutError:
        logger.warning(f"Validación timeout para run {run_id_new}")
    
    return discrepancias, len(discrepancias) < 1000  # Indica si está completo
```

---

## 8. NO ROMPER REGLAS DE ORO ACTUALES

### Regla #1 (desaparecido=>0): ¿aplica contra NEW solamente y solo si el run fue full?

**Respuesta:** ✅ **Sí, exactamente**. Solo se aplica si:
1. `sync_completa == True` (run fue completo)
2. Se aplica contra NEW (antes del swap)
3. Solo productos que NO están en `item_ids_en_sync`

**Implementación:**
```python
if sync_completa and nuevo_run.status == 'done':
    # Aplicar REGLA #1 contra NEW
    stock_existentes = StockProductoADM.query.filter_by(
        sync_run_id=run_id_old,  # OLD
        stock__gt=0
    ).all()
    
    for stock_existente in stock_existentes:
        if stock_existente.item_id not in item_ids_en_sync:
            # Actualizar en NEW (no en LIVE todavía)
            stock_new = StockProductoADM.query.filter_by(
                producto_id=stock_existente.producto_id,
                location_id=location_id,
                sync_run_id=run_id_new  # NEW
            ).first()
            
            if stock_new:
                stock_new.stock = 0.0
            else:
                # Crear registro con stock=0 en NEW
                stock_new = StockProductoADM(
                    producto_id=stock_existente.producto_id,
                    location_id=location_id,
                    sync_run_id=run_id_new,
                    stock=0.0
                )
                db.session.add(stock_new)
```

### Regla #2 (sync sobrescribe cache): ¿ahora sobrescribe pero dentro de NEW?

**Respuesta:** ✅ **Sí, exactamente**. La sync sobrescribe, pero dentro de NEW. LIVE no se toca hasta el swap.

### Regla #3 (ADM=0 pero físico>0): ¿la evalúas contra NEW?

**Respuesta:** ✅ **Sí, contra NEW**. Se evalúa después de cargar NEW pero antes del swap. Si se detecta, se crea `Discrepancia` y `EnRevision`.

**Implementación:**
```python
# Después de cargar NEW, antes del swap
if "ADESA" in location_name.upper():
    discrepancias_fisico = validar_adm_vs_fisico(run_id_new, location_id, location_name)
    
    for disc in discrepancias_fisico:
        # Crear Discrepancia (tabla existente)
        crear_discrepancia(disc)
        
        # Crear EnRevision
        crear_en_revision(disc)
```

### Transferencias desde NO-ADESA: ¿con runs te mantienes igual o lo reconsideras?

**Respuesta:** ✅ **Se mantiene igual** (no validar stock). Pero se puede mejorar:

**Opción 1 (Actual):** No validar, solo actualizar `StockProductoADM`
**Opción 2 (Mejorada):** Validar contra LIVE y advertir si stock es insuficiente, pero no bloquear

**Recomendación:** Opción 2 (advertir pero no bloquear) para NO-ADESA.

---

## 9. NOTIFICACIONES Y "EN REVISIÓN"

### ¿Cuándo mandas el correo: por ubicación al terminar cada sync, o uno global al final de todas?

**Respuesta:** ✅ **Por ubicación al terminar cada sync**. Razones:
- ✅ **Inmediatez:** Alerta inmediata cuando se detecta problema
- ✅ **Granularidad:** Cada ubicación tiene su propio contexto
- ✅ **No esperar:** No hay que esperar a que todas las ubicaciones terminen

### ¿Cómo evitas correos gigantes (miles de SKUs)?

**Respuesta:**
- ✅ **Top N:** Solo top 50 discrepancias más críticas
- ✅ **Resumen:** Total de discrepancias + link a lista completa
- ✅ **Agrupación:** Agrupar por tipo de discrepancia

**Implementación:**
```python
def enviar_resumen_sincronizacion(location_id, run_id, discrepancias):
    # Agrupar por tipo
    por_tipo = {}
    for disc in discrepancias:
        tipo = disc['tipo']
        if tipo not in por_tipo:
            por_tipo[tipo] = []
        por_tipo[tipo].append(disc)
    
    # Top 50 más críticos
    top_criticos = sorted(
        [d for d in discrepancias if d['tipo'] in ['critica_adm_vs_fisico', 'desaparecido']],
        key=lambda x: x.get('stock_fisico', 0),
        reverse=True
    )[:50]
    
    cuerpo = f"""
    Sincronización completada: {location_name}
    
    Total discrepancias: {len(discrepancias)}
    
    TOP 50 CRÍTICAS:
    {formatear_discrepancias(top_criticos)}
    
    Ver todas: https://wms.adesa.com.do/admin/en-revision?location_id={location_id}
    """
    
    send_email(asunto, cuerpo)
```

### ¿Qué campos guardarías en EnRevision?

**Respuesta:**
```python
class EnRevision(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    producto_id = db.Column(db.Integer, nullable=False, index=True)
    sku = db.Column(db.String(100), nullable=False, index=True)
    location_id = db.Column(db.String(100), nullable=False, index=True)
    location_name = db.Column(db.String(200), nullable=True)
    
    motivo = db.Column(db.Text, nullable=False)  # Descripción legible
    tipo = db.Column(db.String(50), nullable=False, index=True)  # desaparecido, cambio_brusco, etc.
    severidad = db.Column(db.String(20), default='media')  # critica, alta, media, baja
    
    run_detectado = db.Column(db.Integer, nullable=False, index=True)
    estado = db.Column(db.String(20), default='pendiente', index=True)
    
    # Valores para contexto
    stock_old = db.Column(db.Numeric(10, 2), nullable=True)
    stock_new = db.Column(db.Numeric(10, 2), nullable=True)
    stock_fisico = db.Column(db.Numeric(10, 2), nullable=True)
    
    # Timestamps
    fecha_deteccion = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    fecha_resolucion = db.Column(db.DateTime, nullable=True)
    
    # Resolución manual
    resuelto_por = db.Column(db.Integer, nullable=True)
    notas = db.Column(db.Text, nullable=True)
    
    # Contador de repeticiones (para casos crónicos)
    veces_detectado = db.Column(db.Integer, default=1)
```

### ¿Qué pasa si el mismo SKU cae en revisión todos los días?

**Respuesta:**
- ✅ **Contador de repeticiones:** Campo `veces_detectado` se incrementa
- ✅ **Auto-ignorar después de N veces:** Si `veces_detectado >= 5`, marcar como "ignorado_automatico"
- ✅ **Notificación especial:** Si es crónico, enviar email al administrador

**Implementación:**
```python
def crear_en_revision(discrepancia):
    existente = EnRevision.query.filter_by(
        producto_id=discrepancia['producto_id'],
        location_id=discrepancia['location_id'],
        estado='pendiente'
    ).first()
    
    if existente:
        existente.veces_detectado += 1
        existente.run_detectado = discrepancia['run_id']
        
        if existente.veces_detectado >= 5:
            existente.estado = 'ignorado_automatico'
            # Notificar administrador
            notificar_cronico(existente)
    else:
        # Crear nuevo
        en_revision = EnRevision(...)
        db.session.add(en_revision)
```

---

## 10. SEGURIDAD / CONCURRENCIA / INTEGRIDAD

### ¿Qué pasaría si dos usuarios hacen ajustes/transferencias simultáneos mientras sync está corriendo?

**Respuesta:** ✅ **No hay problema**. Cada operación:
1. Lee LIVE (estable)
2. Valida contra LIVE
3. Modifica `StockUbicacion` o `Movimiento` (no `StockProductoADM` durante sync)
4. Commit independiente

**Locks:**
- ✅ **Locks de DB:** SQLAlchemy maneja locks a nivel de fila automáticamente
- ✅ **No se necesita lock explícito** para operaciones normales

### ¿Qué pasaría si el usuario registra una transferencia en WMS pero ADM todavía no está sincronizado (LIVE viejo)?

**Respuesta:** 
- ⚠️ **Permitir pero advertir**. El sistema debe:
  1. **Advertir:** Mostrar mensaje "Última sincronización hace X horas"
  2. **Permitir:** No bloquear (puede ser legítimo)
  3. **Auditar:** Registrar en `Movimiento` con nota especial

**Implementación:**
```python
def registrar_transferencia():
    estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id_origen).first()
    
    if estado_sync and estado_sync.last_sync_at:
        horas_desde_sync = (datetime.utcnow() - estado_sync.last_sync_at).total_seconds() / 3600
        
        if horas_desde_sync > 2:
            # Advertir pero permitir
            advertencia = f"Última sincronización hace {horas_desde_sync:.1f} horas. Los datos pueden estar desactualizados."
            # Continuar con registro, pero incluir advertencia en respuesta
```

---

## PREGUNTA FINAL (La Más Importante)

### ¿Confirmas que la operación debe basarse siempre en LIVE (current_run_id) y que OLD/NEW no deben usarse para decisiones operativas?

**Respuesta:** ✅ **SÍ, CONFIRMADO**. 

**Regla fundamental:**
- ✅ **LIVE (current_run_id) = Única fuente de verdad para operaciones**
- ✅ **OLD = Solo para comparación y detección de discrepancias**
- ✅ **NEW = Solo staging, no se consulta hasta que sea LIVE**

**Implementación:**
```python
# SIEMPRE usar este helper para operaciones
def obtener_stock_vigente(producto_id, location_id):
    """ÚNICA función para obtener stock en operaciones"""
    estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
    run_id_vigente = estado_sync.current_run_id if estado_sync else None
    
    return StockProductoADM.query.filter_by(
        producto_id=producto_id,
        location_id=location_id,
        sync_run_id=run_id_vigente  # SIEMPRE LIVE
    ).first()

# NUNCA consultar NEW directamente en operaciones
# NUNCA consultar OLD directamente en operaciones
```

**Excepciones (solo para auditoría/detección):**
- ✅ Validación post-sync: Compara NEW vs OLD
- ✅ Reportes históricos: Consulta runs anteriores
- ✅ Detección de discrepancias: Compara NEW vs OLD vs Físico

---

**Fin del Análisis**



