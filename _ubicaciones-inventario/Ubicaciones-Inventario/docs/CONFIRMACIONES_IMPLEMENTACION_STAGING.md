# CONFIRMACIONES TÉCNICAS: Implementación Staging Cache

**Fecha:** 2026-01-29  
**Versión:** 1.0  
**Tipo:** Confirmaciones de Diseño e Implementación

---

## 1. FUENTE DE VERDAD Y LECTURAS DURANTE SYNC (NEW vs LIVE)

### ¿Qué pasaría si la sync está corriendo (NEW llenándose) y un usuario hace una transferencia o un ajuste?

**Respuesta:** ✅ **No hay problema**. El usuario opera sobre **LIVE (current_run_id)**, que permanece estable y no cambia hasta el swap. NEW tiene un `sync_run_id` diferente, por lo que nunca se mezcla.

**Flujo:**
```
Sync corriendo:
  - NEW: sync_run_id = 123 (llenándose)
  - LIVE: sync_run_id = 122 (estable, no cambia)

Usuario hace transferencia:
  - Lee: StockProductoADM WHERE sync_run_id = 122 (LIVE)
  - Valida: stock en LIVE
  - Modifica: StockUbicacion (no StockProductoADM)
  - Commit: independiente de sync
```

### ¿Confirmas que todas las operaciones leen SOLO LIVE (current_run_id) y que NEW jamás se usa para validar?

**Respuesta:** ✅ **SÍ, CONFIRMADO**. 

**Regla absoluta:**
- ✅ **Todas las operaciones** (transferencias, ajustes, búsquedas) usan `obtener_stock_vigente()` que filtra por `current_run_id`
- ❌ **NEW nunca se consulta** en operaciones normales
- ✅ **NEW solo se usa** durante validación post-sync (comparación NEW vs OLD)

**Implementación:**
```python
# utils/helpers.py
def obtener_stock_vigente(producto_id, location_id):
    """
    ÚNICA función para obtener stock en operaciones.
    SIEMPRE retorna LIVE (current_run_id).
    """
    estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
    
    if not estado_sync or not estado_sync.current_run_id:
        # Fallback: registros sin sync_run_id (migración gradual)
        return StockProductoADM.query.filter_by(
            producto_id=producto_id,
            location_id=location_id,
            sync_run_id=None
        ).first()
    
    # SIEMPRE LIVE
    return StockProductoADM.query.filter_by(
        producto_id=producto_id,
        location_id=location_id,
        sync_run_id=estado_sync.current_run_id  # LIVE
    ).first()

# PROHIBIDO: Consultar NEW directamente en operaciones
# PROHIBIDO: StockProductoADM.query.filter_by(...) sin sync_run_id en operaciones
```

### ¿Qué pasaría si un endpoint hoy consulta StockProductoADM sin filtrar por sync_run_id (consulta "directa")?

**Respuesta:** ⚠️ **Problema crítico**. Debe migrarse TODOS los endpoints.

**Estrategia de migración:**

**Fase 1: Detección (Desarrollo)**
```python
# Agregar logging para detectar consultas sin filtro
import logging
logger = logging.getLogger('stock_queries')

# Wrapper para detectar consultas directas
class StockProductoADMQuery:
    @staticmethod
    def filter_by(**kwargs):
        if 'sync_run_id' not in kwargs:
            logger.warning(f"Consulta sin sync_run_id detectada: {traceback.format_stack()}")
        return StockProductoADM.query.filter_by(**kwargs)
```

**Fase 2: Migración gradual**
```python
# Buscar TODOS los usos de StockProductoADM.query
# Reemplazar con obtener_stock_vigente()

# ANTES:
stock = StockProductoADM.query.filter_by(
    producto_id=producto_id,
    location_id=location_id
).first()

# DESPUÉS:
stock = obtener_stock_vigente(producto_id, location_id)
```

**Fase 3: Validación (Tests)**
```python
def test_todas_consultas_usen_helper():
    """Test que verifica que no hay consultas directas"""
    # Mock que detecta consultas sin sync_run_id
    # Falla si encuentra alguna
```

### ¿Cómo vas a asegurar que no se mezclen runs?

**Respuesta:** Múltiples capas de protección:

1. ✅ **Helper function centralizada:** `obtener_stock_vigente()` es la única forma de consultar
2. ✅ **Índice único:** `(producto_id, location_id, sync_run_id)` previene duplicados
3. ✅ **Validación en código:** Code review + tests
4. ✅ **Logging:** Detectar consultas sin filtro

**Implementación:**
```python
# database/models.py
class StockProductoADM(db.Model):
    __table_args__ = (
        db.UniqueConstraint('producto_id', 'location_id', 'sync_run_id', 
                          name='uq_producto_location_run_adm'),
        db.Index('idx_stock_vigente', 'producto_id', 'location_id', 'sync_run_id')
    )
```

### ¿Vas a centralizar todo con un helper obligatorio?

**Respuesta:** ✅ **SÍ, OBLIGATORIO**. 

**Estrategia:**
- ✅ **Helper único:** `obtener_stock_vigente()` en `utils/helpers.py`
- ✅ **Documentación:** Comentar en código que es la única forma
- ✅ **Tests:** Unit tests que fallan si hay consultas directas
- ⚠️ **Code review:** Revisar que no haya `StockProductoADM.query` directo

**Alternativa (más estricta):**
```python
# Crear wrapper que prohíbe consultas directas
class StockProductoADMProxy:
    """Proxy que fuerza uso de helper"""
    @staticmethod
    def query():
        raise RuntimeError("NO usar StockProductoADM.query directamente. Usar obtener_stock_vigente()")
```

### ¿Qué pasaría si la sync se queda "running" por un fallo y nunca hace swap?

**Respuesta:** ⚠️ **Problema de estado zombie**. Requiere limpieza automática.

**Estrategia de limpieza:**

1. **Detección de zombies:**
```python
def detectar_syncs_zombies():
    """Detecta syncs que están 'running' pero no están activas"""
    syncs_running = SyncLocationStatus.query.filter_by(status='running').all()
    zombies = []
    
    for estado in syncs_running:
        if estado.current_run_id:
            run = SyncRun.query.get(estado.current_run_id)
            if run:
                tiempo_transcurrido = (datetime.utcnow() - run.started_at).total_seconds() / 3600
                
                # Si lleva más de 2 horas, probablemente es zombie
                if tiempo_transcurrido > 2:
                    zombies.append((estado, run))
    
    return zombies
```

2. **Limpieza automática:**
```python
def limpiar_syncs_zombies():
    """Limpia syncs zombies y restaura estado"""
    zombies = detectar_syncs_zombies()
    
    for estado, run in zombies:
        logger.warning(f"Sync zombie detectada: {estado.location_name}, run_id={run.run_id}")
        
        # Marcar run como failed
        run.status = 'failed'
        run.finished_at = datetime.utcnow()
        run.errors_count = 1
        
        # Restaurar estado a 'pending' o 'done' (según último run exitoso)
        ultimo_run_exitoso = SyncRun.query.filter_by(
            location_id=estado.location_id,
            status='done'
        ).order_by(SyncRun.finished_at.desc()).first()
        
        if ultimo_run_exitoso:
            estado.current_run_id = ultimo_run_exitoso.run_id
            estado.status = 'done'
        else:
            estado.status = 'pending'
            estado.current_run_id = None
        
        # Limpiar registros NEW del run zombie
        StockProductoADM.query.filter_by(sync_run_id=run.run_id).delete()
        
        db.session.commit()
```

3. **Ejecución periódica:**
```python
# En cron job o tarea programada
@scheduler.task(interval=timedelta(hours=1))
def limpiar_zombies_periodicamente():
    limpiar_syncs_zombies()
```

---

## 2. ESTADO DE SYNC (running/done/partial) Y BLOQUEO DE CONCURRENCIA

### Si ya existe una sync para una ubicación, ¿vas a bloquear iniciar otra?

**Respuesta:** ✅ **SÍ, BLOQUEAR**. 

**Implementación:**
```python
def sincronizar_ubicacion(location_id, forzar=False):
    estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
    
    # Verificar si hay sync en curso
    if estado_sync and estado_sync.status == 'running':
        # Verificar si realmente está corriendo (no zombie)
        if estado_sync.running_run_id:
            run_actual = SyncRun.query.get(estado_sync.running_run_id)
            if run_actual and run_actual.status == 'running':
                tiempo_transcurrido = (datetime.utcnow() - run_actual.started_at).total_seconds() / 60
                
                if tiempo_transcurrido < 60:  # Menos de 1 hora = probablemente activo
                    if not forzar:
                        return jsonify({
                            "success": False,
                            "error": f"Ya hay una sincronización en curso para {estado_sync.location_name}",
                            "run_id": run_actual.run_id,
                            "tiempo_transcurrido_min": tiempo_transcurrido
                        }), 409  # Conflict
                    else:
                        # Forzar: cancelar anterior
                        logger.warning(f"Forzando cancelación de sync anterior: run_id={run_actual.run_id}")
                        run_actual.status = 'cancelled'
                        run_actual.finished_at = datetime.utcnow()
                        # Continuar con nuevo run
```

### ¿Qué pasaría si alguien intenta correr sync dos veces en ADESA al mismo tiempo?

**Respuesta:** ✅ **Bloqueado con error 409 Conflict**. El segundo intento recibe mensaje claro.

### Importante: current_run_id es LIVE. Entonces… ¿Dónde guardarías el running_run_id (run que está ejecutándose)?

**Respuesta:** ✅ **En `SyncLocationStatus.running_run_id`** (nuevo campo).

**Estructura:**
```python
class SyncLocationStatus(db.Model):
    # ... campos existentes ...
    current_run_id = db.Column(db.Integer, nullable=True)  # LIVE (último run exitoso)
    running_run_id = db.Column(db.Integer, nullable=True)   # NUEVO: Run en ejecución
```

**Flujo:**
```python
# Al iniciar sync:
estado_sync.running_run_id = nuevo_run.run_id
estado_sync.status = 'running'
# current_run_id NO cambia (sigue siendo el anterior)

# Al terminar sync (swap):
estado_sync.current_run_id = nuevo_run.run_id  # NEW pasa a LIVE
estado_sync.running_run_id = None
estado_sync.status = 'done'
```

### ¿Qué pasaría si solo guardas current_run_id y lo usas para detectar "running"?

**Respuesta:** ⚠️ **Problema**: No puedes distinguir entre "running" y "done". Necesitas `running_run_id` separado.

**Problema sin running_run_id:**
```
Si current_run_id = 123 y status = 'running':
  - ¿El run 123 está corriendo?
  - ¿O el run 123 ya terminó pero hay otro run 124 corriendo?
```

**Solución con running_run_id:**
```
current_run_id = 122  (LIVE, último exitoso)
running_run_id = 123  (NEW, en ejecución)
status = 'running'
```

### ¿Qué pasaría si el proceso muere justo en el swap?

**Respuesta:** ✅ **Transacción DB garantiza atomicidad**. Si el proceso muere, el commit no se completa y `current_run_id` no cambia.

**Implementación:**
```python
def hacer_swap_atomico(location_id, run_id_new):
    """Swap atómico: o todo o nada"""
    nuevo_run = SyncRun.query.get(run_id_new)
    
    if nuevo_run.status != 'done':
        raise ValueError(f"No se puede hacer swap: run {run_id_new} tiene status '{nuevo_run.status}'")
    
    try:
        estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
        
        # Transacción atómica
        run_id_anterior = estado_sync.current_run_id
        estado_sync.current_run_id = run_id_new  # NEW → LIVE
        estado_sync.running_run_id = None
        estado_sync.status = 'done'
        estado_sync.last_sync_at = datetime.utcnow()
        
        nuevo_run.finished_at = datetime.utcnow()
        
        db.session.commit()  # Atómico: si falla aquí, todo se revierte
        
        logger.info(f"Swap completado: run_id={run_id_new} ahora es LIVE (anterior: {run_id_anterior})")
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error en swap: {e}")
        raise
```

### ¿Cómo garantizas atomicidad?

**Respuesta:** ✅ **Transacción de base de datos**. SQLAlchemy garantiza que `commit()` es atómico.

**Verificación post-crash:**
```python
def verificar_estados_consistentes():
    """Verifica que no hay inconsistencias después de un crash"""
    estados = SyncLocationStatus.query.filter(
        SyncLocationStatus.running_run_id.isnot(None)
    ).all()
    
    for estado in estados:
        run = SyncRun.query.get(estado.running_run_id)
        if run and run.status != 'running':
            # Inconsistencia detectada: run no está running pero estado sí
            logger.warning(f"Inconsistencia detectada: {estado.location_name}, run_id={run.run_id}")
            # Corregir
            estado.running_run_id = None
            if run.status == 'done':
                estado.current_run_id = run.run_id
                estado.status = 'done'
            else:
                estado.status = 'pending'
    
    db.session.commit()
```

### ¿Qué vería el usuario al volver a consultar: LIVE viejo o LIVE nuevo?

**Respuesta:** 
- ✅ **Si swap fue exitoso:** Usuario ve LIVE nuevo (después del commit)
- ✅ **Si swap falló:** Usuario ve LIVE viejo (commit no se completó)

**Garantía:** El usuario **nunca** ve un estado intermedio (mitad viejo, mitad nuevo) porque el swap es atómico.

---

## 3. DEFINICIÓN DE "SYNC COMPLETA" (Sin Falsos OK)

### ¿Cómo defines "sync completa" sin depender de un total_items que ADM quizá no da confiable?

**Respuesta:** ✅ **Múltiples condiciones independientes**, no solo `total_items`.

**Implementación:**
```python
def es_sync_completa(items_recibidos, batch_size, requests_realizados, max_requests,
                     tiempo_transcurrido, max_minutos, items_synced, total_items,
                     run_id_old=None):
    """
    Define si una sync es completa usando múltiples heurísticas.
    NO depende solo de total_items.
    """
    condiciones = []
    
    # Condición 1: Último lote menor que batch_size (fin natural de paginación)
    fin_natural = items_recibidos < batch_size
    condiciones.append(('fin_natural', fin_natural))
    
    # Condición 2: No alcanzó caps
    sin_caps = (
        requests_realizados < max_requests and
        tiempo_transcurrido < max_minutos
    )
    condiciones.append(('sin_caps', sin_caps))
    
    # Condición 3: Contadores consistentes (margen 5%)
    # Pero NO es condición obligatoria si otras se cumplen
    contadores_ok = total_items > 0 and abs(items_synced - total_items) / total_items <= 0.05
    condiciones.append(('contadores_ok', contadores_ok))
    
    # Condición 4: Comparar con run anterior (si existe)
    if run_id_old:
        run_old = SyncRun.query.get(run_id_old)
        if run_old and run_old.total_items > 0:
            # Si el nuevo total es significativamente menor, es sospechoso
            diferencia_porcentual = abs(total_items - run_old.total_items) / run_old.total_items
            consistente_con_anterior = diferencia_porcentual < 0.2  # 20% de diferencia aceptable
            condiciones.append(('consistente_con_anterior', consistente_con_anterior))
    
    # Sync completa si: fin_natural Y sin_caps Y (contadores_ok O consistente_con_anterior)
    sync_completa = (
        fin_natural and
        sin_caps and
        (contadores_ok or (run_id_old and consistente_con_anterior))
    )
    
    logger.info(f"Evaluación sync completa: {dict(condiciones)}, resultado={sync_completa}")
    
    return sync_completa
```

### ¿Te basas solo en "último lote < batch_size" + no caps + sin errores?

**Respuesta:** ✅ **Sí, principalmente**, pero con validaciones adicionales:

1. ✅ **Último lote < batch_size:** Indica fin natural
2. ✅ **No caps:** No alcanzó límites
3. ✅ **Sin errores:** Todos los requests fueron 200
4. ⚠️ **Comparación con anterior:** Si existe run anterior, comparar totales
5. ⚠️ **Contadores consistentes:** `items_synced ≈ total_items` (margen 5%)

### ¿Qué pasaría si ADM responde 200 pero por un fallo silencioso devuelve menos páginas de las que debería?

**Respuesta:** ⚠️ **Difícil de detectar**. Estrategias:

1. **Comparar con run anterior:**
```python
if run_id_old:
    run_old = SyncRun.query.get(run_id_old)
    if run_old:
        # Si el nuevo total es 20% menor, es sospechoso
        if total_items_new < run_old.total_items * 0.8:
            logger.warning(f"Sync sospechosa: {total_items_new} items vs {run_old.total_items} anterior (-20%)")
            # Marcar como 'partial' o 'sospechosa'
            return False  # NO es completa
```

2. **Validar consistencia de paginación:**
```python
# Si recibimos menos items de lo esperado en un lote intermedio
if items_recibidos < batch_size and skip_actual < total_items_estimado * 0.9:
    # Probablemente hay un problema
    logger.warning(f"Lote incompleto sospechoso: recibidos {items_recibidos}, esperados ~{batch_size}")
    # Marcar como 'partial'
```

3. **Heurística de umbral mínimo:**
```python
# Si el total es muy bajo comparado con el catálogo
total_catalogo = ProductoADM.query.count()
if total_items_new < total_catalogo * 0.5:  # Menos del 50% del catálogo
    logger.warning(f"Sync sospechosa: solo {total_items_new} items de {total_catalogo} en catálogo")
    # Marcar como 'partial'
```

### ¿Qué heurística usarías para marcar esa sync como "sospechosa" y no hacer swap?

**Respuesta:** ✅ **Combinación de heurísticas**:

```python
def es_sync_sospechosa(total_items_new, run_id_old, total_catalogo, items_recibidos, batch_size):
    """Detecta si una sync es sospechosa (incompleta silenciosa)"""
    sospechas = []
    
    # Heurística 1: Comparar con run anterior
    if run_id_old:
        run_old = SyncRun.query.get(run_id_old)
        if run_old and total_items_new < run_old.total_items * 0.8:
            sospechas.append(f"Total 20% menor que anterior ({total_items_new} vs {run_old.total_items})")
    
    # Heurística 2: Comparar con catálogo
    if total_items_new < total_catalogo * 0.5:
        sospechas.append(f"Total muy bajo vs catálogo ({total_items_new} vs {total_catalogo})")
    
    # Heurística 3: Lote incompleto sospechoso
    if items_recibidos < batch_size * 0.5:  # Menos de la mitad del batch
        sospechas.append(f"Último lote muy pequeño ({items_recibidos} vs {batch_size})")
    
    return len(sospechas) > 0, sospechas

# Uso:
es_sospechosa, razones = es_sync_sospechosa(...)
if es_sospechosa:
    nuevo_run.status = 'partial'
    nuevo_run.warnings_count = len(razones)
    nuevo_run.notas = f"Sync sospechosa: {', '.join(razones)}"
    # NO hacer swap
```

---

## 4. DETECCIÓN DE DISCREPANCIAS (Producto123 y Similares)

### Caso Producto123: ADESA=5 y Mirador=3 en WMS, pero en ADM hicieron transferencia y ya está ADESA=0 / Mirador=8. Tras sincronizar, ¿qué discrepancias exactas esperas registrar?

**Respuesta:** ✅ **Dos tipos de discrepancias**:

#### (a) NEW vs OLD (cambio brusco)
```python
# Para ADESA:
{
    'tipo': 'desaparecido',
    'producto_id': producto.id,
    'location_id': 'ADESA_ID',
    'stock_old': 5,
    'stock_new': 0,
    'motivo': 'Stock desapareció: 5 → 0',
    'severidad': 'critica'
}

# Para Mirador:
{
    'tipo': 'cambio_brusco',
    'producto_id': producto.id,
    'location_id': 'MIRADOR_ID',
    'stock_old': 3,
    'stock_new': 8,
    'motivo': 'Cambio brusco: 3 → 8 (166.7%)',
    'severidad': 'alta'
}
```

#### (b) ADM (NEW) vs Físico StockUbicacion (solo ADESA)
```python
# Para ADESA:
{
    'tipo': 'critica_adm_vs_fisico',
    'producto_id': producto.id,
    'sku': producto.sku,
    'location_id': 'ADESA_ID',
    'stock_adm': 0,  # NEW
    'stock_fisico': 5,  # StockUbicacion todavía tiene 5
    'motivo': 'ADM=0 pero Físico=5 (CRÍTICO)',
    'severidad': 'critica'
}
```

### ¿Cómo las clasificas (crítica/alta/media) para no saturar?

**Respuesta:** ✅ **Clasificación por severidad**:

```python
def clasificar_severidad(tipo, cambio_porcentual, cambio_absoluto, stock_fisico):
    """Clasifica discrepancias por severidad"""
    if tipo == 'critica_adm_vs_fisico':
        return 'critica'  # Siempre crítica
    
    if tipo == 'desaparecido':
        if stock_fisico > 0:
            return 'critica'  # ADM=0 pero Físico>0
        else:
            return 'alta'  # ADM=0 y Físico=0 (menos crítico)
    
    if tipo == 'cambio_brusco':
        if cambio_porcentual > 500 or cambio_absoluto > 100:
            return 'critica'
        elif cambio_porcentual > 300 or cambio_absoluto > 50:
            return 'alta'
        else:
            return 'media'
    
    return 'baja'
```

### ¿Qué pasaría si el cambio brusco es legítimo (venta masiva o recepción grande)?

**Respuesta:** ⚠️ **Falso positivo inevitable**. Estrategias:

1. **Umbrales combinados:**
```python
def es_cambio_sospechoso(stock_old, stock_new):
    """Determina si un cambio es sospechoso"""
    if stock_old == 0:
        return False  # De 0 a X es normal
    
    cambio_absoluto = abs(stock_new - stock_old)
    cambio_porcentual = (cambio_absoluto / stock_old) * 100 if stock_old > 0 else 0
    
    # Umbral combinado: porcentaje Y absoluto
    if cambio_porcentual > 300 and cambio_absoluto > 10:
        return True  # Sospechoso: >300% Y >10 unidades
    elif cambio_absoluto > 100:
        return True  # Sospechoso: >100 unidades siempre
    
    return False
```

2. **Clasificación por severidad:** No todas las discrepancias son críticas
3. **Revisión manual:** Usuario decide si es legítimo o no

### ¿Vas a manejar falsos positivos con umbrales (porcentaje + delta absoluto), o con reglas por tipo de ubicación?

**Respuesta:** ✅ **Ambos: umbrales combinados + reglas por ubicación**.

```python
# Umbrales por ubicación (algunas tienen más movimiento)
UMBRALES_POR_UBICACION = {
    'ADESA': {
        'cambio_porcentual_critico': 500,
        'cambio_absoluto_critico': 100,
        'cambio_porcentual_alta': 300,
        'cambio_absoluto_alta': 50
    },
    'MIRADOR SUR': {
        'cambio_porcentual_critico': 300,  # Más sensible
        'cambio_absoluto_critico': 50,
        'cambio_porcentual_alta': 200,
        'cambio_absoluto_alta': 20
    }
}

def es_cambio_sospechoso_por_ubicacion(stock_old, stock_new, location_name):
    """Umbrales adaptativos por ubicación"""
    umbrales = UMBRALES_POR_UBICACION.get(location_name.upper(), UMBRALES_POR_UBICACION['ADESA'])
    
    cambio_absoluto = abs(stock_new - stock_old)
    cambio_porcentual = (cambio_absoluto / stock_old) * 100 if stock_old > 0 else 0
    
    if cambio_porcentual > umbrales['cambio_porcentual_critico'] and cambio_absoluto > umbrales['cambio_absoluto_critico']:
        return True, 'critica'
    elif cambio_porcentual > umbrales['cambio_porcentual_alta'] and cambio_absoluto > umbrales['cambio_absoluto_alta']:
        return True, 'alta'
    
    return False, None
```

### Para ubicaciones NO-ADESA (sin StockUbicacion), ¿qué harás cuando solo puedes comparar NEW vs OLD?

**Respuesta:** ✅ **Solo NEW vs OLD**, sin cruzar con físico.

```python
# Para NO-ADESA
if "ADESA" not in location_name.upper():
    # Solo comparar NEW vs OLD
    discrepancias = validar_cambios_sospechosos(run_id_new, run_id_old, location_id)
    # NO llamar a validar_adm_vs_fisico() (no existe StockUbicacion)
    
    # Clasificar como "cambio brusco" sin afirmar que está mal
    for disc in discrepancias:
        disc['tipo'] = 'cambio_brusco_no_adesa'
        disc['nota'] = 'Solo comparación ADM vs ADM anterior. No hay stock físico para validar.'
```

### ¿Cómo evitas que el sistema "acuse" cuando en realidad fue una operación válida en ADM?

**Respuesta:** ⚠️ **No se puede evitar completamente**. El sistema solo **detecta** discrepancias, no las **diagnostica**. 

**Estrategia:**
- ✅ **Clasificación por severidad:** No todas son críticas
- ✅ **Revisión manual:** Usuario decide si es legítimo
- ✅ **Aprendizaje:** Si el mismo patrón se repite, puede ser legítimo (marcar como "ignorar automático")

---

## 5. RESOLUCIÓN DE DISCREPANCIAS (Clave para No Duplicar)

### Si detectamos una discrepancia porque ADM se sincronizó antes de registrar la transferencia en WMS… Cuando el usuario intente "resolver" registrando esa transferencia en WMS: ¿debe permitirse o bloquearse?

**Respuesta:** ⚠️ **Bloquear si es crítica, advertir si es alta/media**.

**Implementación:**
```python
def validar_transferencia_con_discrepancia(producto_id, location_id_origen, location_id_destino, cantidad):
    """Valida transferencia considerando discrepancias pendientes"""
    # Verificar si hay EnRevision pendiente
    en_revision = EnRevision.query.filter_by(
        producto_id=producto_id,
        location_id=location_id_origen,
        estado='pendiente'
    ).first()
    
    if en_revision:
        if en_revision.severidad == 'critica':
            # BLOQUEAR
            return {
                "permitir": False,
                "error": "No se puede registrar transferencia: hay discrepancia crítica pendiente de revisión",
                "discrepancia": en_revision.to_dict()
            }
        elif en_revision.severidad in ['alta', 'media']:
            # ADVERTIR pero permitir
            return {
                "permitir": True,
                "advertencia": f"Hay discrepancia {en_revision.severidad} pendiente. Verifica antes de continuar.",
                "discrepancia": en_revision.to_dict()
            }
    
    return {"permitir": True}
```

### ¿Cómo evitar que se duplique (ej: Mirador 8 y el usuario intenta sumar 5 más)?

**Respuesta:** ✅ **Validar contra LIVE y detectar duplicación potencial**.

```python
def detectar_duplicacion_potencial(producto_id, location_id_destino, cantidad):
    """Detecta si una transferencia puede duplicar stock"""
    stock_destino_live = obtener_stock_vigente(producto_id, location_id_destino)
    
    if stock_destino_live:
        stock_actual = float(stock_destino_live.stock)
        stock_esperado = stock_actual + cantidad
        
        # Si el stock esperado excede significativamente, es sospechoso
        if stock_esperado > stock_actual * 1.2:  # 20% más
            return {
                "duplicacion_potencial": True,
                "stock_actual": stock_actual,
                "stock_esperado": stock_esperado,
                "mensaje": f"Transferencia puede duplicar stock. Stock ADM actual: {stock_actual}, después sería: {stock_esperado}"
            }
    
    return {"duplicacion_potencial": False}
```

### ¿Qué pasaría si el usuario insiste en registrar "ADESA→Mirador 5" pero LIVE ya muestra Mirador=8?

**Respuesta:** ⚠️ **Bloquear y ofrecer flujo de conciliación**.

```python
def registrar_transferencia():
    # Validar duplicación
    dup = detectar_duplicacion_potencial(producto_id, location_id_destino, cantidad)
    
    if dup["duplicacion_potencial"]:
        return jsonify({
            "success": False,
            "error": dup["mensaje"],
            "accion_requerida": "conciliacion",
            "opciones": [
                "Ajustar stock físico (si la transferencia ya ocurrió físicamente)",
                "Cancelar transferencia (si ya se registró en ADM)",
                "Forzar registro (requiere aprobación de administrador)"
            ]
        }), 409
```

### ¿Tú propones un modo "conciliación" que no toque StockProductoADM y solo ajuste físico/auditoría?

**Respuesta:** ✅ **SÍ, EXACTAMENTE**. 

**Flujo de conciliación:**
```python
def conciliar_transferencia(producto_id, location_id_origen, location_id_destino, cantidad, motivo):
    """
    Modo conciliación: solo ajusta físico/auditoría, NO toca StockProductoADM
    """
    # 1. Ajustar StockUbicacion (si es ADESA)
    if es_adesa(location_id_origen):
        stock_ubic_origen = StockUbicacion.query.filter_by(
            sku=sku,
            ubicacion=ubicacion_origen
        ).first()
        if stock_ubic_origen:
            stock_ubic_origen.cantidad = max(0, float(stock_ubic_origen.cantidad) - cantidad)
    
    if es_adesa(location_id_destino):
        stock_ubic_destino = StockUbicacion.query.filter_by(
            sku=sku,
            ubicacion=ubicacion_destino
        ).first()
        if stock_ubic_destino:
            stock_ubic_destino.cantidad = float(stock_ubic_destino.cantidad) + cantidad
    
    # 2. Crear movimiento de auditoría (tipo especial)
    movimiento = Movimiento(
        tipo="TRANSFER",
        # ... campos normales ...
        notas=f"CONCILIACIÓN: {motivo}. StockProductoADM ya refleja este cambio (no modificado)."
    )
    
    # 3. NO modificar StockProductoADM (ya está correcto en LIVE)
    
    # 4. Marcar discrepancia como resuelta
    en_revision = EnRevision.query.filter_by(
        producto_id=producto_id,
        location_id=location_id_origen,
        estado='pendiente'
    ).first()
    if en_revision:
        en_revision.estado = 'resuelto'
        en_revision.resuelto_por = usuario_id
        en_revision.fecha_resolucion = datetime.utcnow()
        en_revision.notas = f"Resuelto por conciliación: {motivo}"
```

### Aquí entra tu módulo de ajustes: ¿El módulo de ajustes sirve como "conciliación"?

**Respuesta:** ✅ **SÍ, PARCIALMENTE**. El módulo de ajustes puede usarse para conciliación, pero necesita modificación.

**Casos:**

1. **Ajuste de ubicación física (ADESA):**
   - ✅ Modifica `StockUbicacion`
   - ✅ NO modifica `StockProductoADM` (ya está correcto en LIVE)
   - ✅ Crea `Movimiento` de auditoría

2. **Ajuste de ubicación ADM (NO-ADESA):**
   - ⚠️ Actualmente modifica `StockProductoADM` (temporal)
   - ⚠️ Debe modificarse para NO modificar si hay discrepancia pendiente

**Modificación propuesta:**
```python
def registrar_ajuste():
    # Verificar si hay discrepancia pendiente
    en_revision = EnRevision.query.filter_by(
        producto_id=producto_id,
        location_id=location_id,
        estado='pendiente'
    ).first()
    
    if en_revision and en_revision.tipo == 'critica_adm_vs_fisico':
        # Modo conciliación: solo ajustar físico, NO tocar StockProductoADM
        if es_ubicacion_fisica:
            # Ajustar StockUbicacion
            stock_ubic.cantidad = cantidad_nueva
        # NO modificar StockProductoADM (ya está correcto en LIVE)
    else:
        # Ajuste normal: modificar según tipo de ubicación
        # ... lógica actual ...
```

### ¿En qué casos un ajuste debe modificar StockUbicacion (físico) y en cuáles NO debe tocar StockProductoADM porque el LIVE ya refleja ADM?

**Respuesta:** 

**Regla:**
- ✅ **Ajuste físico (ADESA):** Modifica `StockUbicacion`, NO toca `StockProductoADM`
- ✅ **Ajuste ADM (NO-ADESA) con discrepancia:** NO modifica `StockProductoADM` (LIVE ya refleja ADM), solo crea movimiento de auditoría
- ✅ **Ajuste ADM (NO-ADESA) sin discrepancia:** Modifica `StockProductoADM` temporalmente (será sobrescrito en próxima sync)

### ¿Qué criterio objetivo define "resuelto"?

**Respuesta:** ✅ **Dos criterios**:

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
        
        stock_fisico = StockUbicacion.query.filter_by(sku=disc.sku).all()
        stock_fisico_total = sum(float(s.cantidad) for s in stock_fisico)
        
        # Si ya no hay discrepancia, marcar como resuelto
        if disc.tipo == 'critica_adm_vs_fisico':
            if (stock_new and float(stock_new.stock) > 0) or stock_fisico_total == 0:
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

### ¿Se resuelve automáticamente en la próxima sync si ya no aparece la diferencia?

**Respuesta:** ✅ **SÍ, automáticamente** si la discrepancia ya no existe.

### ¿O requiere confirmación manual con evidencia (nota, usuario, motivo)?

**Respuesta:** ⚠️ **Depende del tipo**:
- ✅ **Automático:** Si la discrepancia desaparece (ADM y físico coinciden)
- ⚠️ **Manual:** Si la discrepancia persiste pero el usuario la resuelve manualmente (ajuste, conciliación)

---

## 6. TRANSFERENCIAS Y VALIDACIONES (Evitar Errores por Sync Desactualizada)

### Hoy dijimos que NO-ADESA no valida stock. ¿Qué pasaría si Mirador está desactualizado y alguien hace Mirador→ADESA?

**Respuesta:** ⚠️ **Advertir pero permitir** (como ahora, pero mejorado).

**Implementación:**
```python
def validar_transferencia_no_adesa(location_id_origen, cantidad):
    """Valida transferencia desde NO-ADESA"""
    estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id_origen).first()
    
    if estado_sync and estado_sync.last_sync_at:
        horas_desde_sync = (datetime.utcnow() - estado_sync.last_sync_at).total_seconds() / 3600
        
        if horas_desde_sync > 2:
            # ADVERTIR pero permitir
            return {
                "permitir": True,
                "advertencia": f"Última sincronización de {estado_sync.location_name} hace {horas_desde_sync:.1f} horas. Los datos pueden estar desactualizados.",
                "recomendacion": "Sincroniza antes de transferir para evitar inconsistencias."
            }
    
    return {"permitir": True}
```

### Para transferencias desde ADESA: ¿Vas a hacer validación dual (StockUbicacion + StockProductoADM LIVE) para evitar registrar algo que ADM ya movió?

**Respuesta:** ✅ **SÍ, VALIDACIÓN DUAL**.

**Implementación:**
```python
def validar_transferencia_desde_adesa(sku, ubicacion_origen, cantidad, location_id_origen):
    """Validación dual: StockUbicacion + StockProductoADM LIVE"""
    # Validación 1: StockUbicacion (físico)
    stock_ubic = StockUbicacion.query.filter_by(
        sku=sku,
        ubicacion=ubicacion_origen
    ).first()
    
    if not stock_ubic or float(stock_ubic.cantidad) < cantidad:
        return {
            "permitir": False,
            "error": f"Stock insuficiente en ubicación física {ubicacion_origen}"
        }
    
    # Validación 2: StockProductoADM LIVE (ADM)
    producto_db = ProductoADM.query.filter_by(sku=sku).first()
    if producto_db:
        stock_adm_live = obtener_stock_vigente(producto_db.id, location_id_origen)
        
        if stock_adm_live and float(stock_adm_live.stock) < cantidad:
            return {
                "permitir": False,
                "error": f"Stock insuficiente en ADM Cloud. Stock LIVE: {stock_adm_live.stock}, requerido: {cantidad}",
                "advertencia": "ADM Cloud ya procesó esta transferencia. Sincroniza antes de transferir."
            }
    
    return {"permitir": True}
```

### ¿Qué pasaría si StockUbicacion dice 5 pero StockProductoADM LIVE (ADESA) dice 0?

**Respuesta:** ⚠️ **BLOQUEAR y ofrecer conciliación**.

```python
if float(stock_ubic.cantidad) >= cantidad and stock_adm_live and float(stock_adm_live.stock) < cantidad:
    # Discrepancia: físico tiene stock pero ADM no
    return {
        "permitir": False,
        "error": f"Discrepancia detectada: Stock físico={stock_ubic.cantidad}, Stock ADM={stock_adm_live.stock}",
        "accion_requerida": "conciliacion",
        "opciones": [
            "Ajustar stock físico a 0 (si la transferencia ya ocurrió en ADM)",
            "Sincronizar ADESA para actualizar datos",
            "Contactar administrador"
        ]
    }
```

### ¿Bloqueas la transferencia y obligas a conciliación?

**Respuesta:** ✅ **SÍ, si es crítica**. Si es alta/media, advertir pero permitir.

---

## 7. "EN REVISIÓN" + NOTIFICACIONES (Sin Spam y Sin Timeouts)

### ¿Cómo vas a poblar la tabla EnRevision sin hacer queries gigantes?

**Respuesta:** ✅ **Por batches SQL eficientes**, limitando top N por severidad.

**Implementación:**
```python
def poblar_en_revision_eficiente(discrepancias, run_id, location_id, limite=1000):
    """Pobla EnRevision de forma eficiente, limitando a top N"""
    # Ordenar por severidad (crítica > alta > media > baja)
    orden_severidad = {'critica': 4, 'alta': 3, 'media': 2, 'baja': 1}
    discrepancias_ordenadas = sorted(
        discrepancias,
        key=lambda x: orden_severidad.get(x.get('severidad', 'baja'), 0),
        reverse=True
    )[:limite]  # Top 1000
    
    # Insertar en batch
    en_revision_list = []
    for disc in discrepancias_ordenadas:
        en_revision = EnRevision(
            producto_id=disc['producto_id'],
            sku=disc.get('sku', ''),
            location_id=location_id,
            motivo=disc['motivo'],
            tipo=disc['tipo'],
            severidad=disc.get('severidad', 'media'),
            run_detectado=run_id,
            stock_old=disc.get('stock_old'),
            stock_new=disc.get('stock_new'),
            stock_fisico=disc.get('stock_fisico')
        )
        en_revision_list.append(en_revision)
    
    # Bulk insert
    db.session.bulk_save_objects(en_revision_list)
    db.session.commit()
    
    logger.info(f"Pobladas {len(en_revision_list)} discrepancias en EnRevision (de {len(discrepancias)} totales)")
```

### ¿Qué pasaría si hay 20,000 discrepancias?

**Respuesta:** ✅ **Limitar a top 1000 más críticas**, registrar el resto en log.

```python
if len(discrepancias) > 1000:
    logger.warning(f"Se detectaron {len(discrepancias)} discrepancias, limitando a top 1000 más críticas")
    # Poblar solo top 1000
    poblar_en_revision_eficiente(discrepancias, run_id, location_id, limite=1000)
else:
    # Poblar todas
    poblar_en_revision_eficiente(discrepancias, run_id, location_id, limite=len(discrepancias))
```

### ¿Cómo evitas correos gigantes (top 50 + link, agrupación por tipo)?

**Respuesta:** ✅ **Top 50 + link + agrupación**.

**Implementación:**
```python
def enviar_resumen_sincronizacion(location_id, run_id, total_discrepancias):
    """Envía email con resumen, limitando a top 50"""
    # Obtener top 50 más críticas
    top_criticas = EnRevision.query.filter_by(
        run_detectado=run_id,
        location_id=location_id
    ).order_by(
        case(
            (EnRevision.severidad == 'critica', 4),
            (EnRevision.severidad == 'alta', 3),
            (EnRevision.severidad == 'media', 2),
            else_=1
        ).desc()
    ).limit(50).all()
    
    # Agrupar por tipo
    por_tipo = {}
    for disc in top_criticas:
        tipo = disc.tipo
        if tipo not in por_tipo:
            por_tipo[tipo] = []
        por_tipo[tipo].append(disc)
    
    cuerpo = f"""
    Sincronización completada: {location_name}
    
    Total discrepancias: {total_discrepancias}
    Mostrando top 50 más críticas:
    
    """
    
    for tipo, items in por_tipo.items():
        cuerpo += f"\n{tipo.upper()}: {len(items)} items\n"
        for item in items[:10]:  # Top 10 por tipo
            cuerpo += f"  - SKU: {item.sku}, {item.motivo}\n"
        if len(items) > 10:
            cuerpo += f"  ... y {len(items) - 10} más\n"
    
    cuerpo += f"\nVer todas: https://wms.adesa.com.do/admin/en-revision?location_id={location_id}&run_id={run_id}"
    
    send_email(asunto, cuerpo)
```

### ¿Qué guardas en EnRevision para que sea accionable?

**Respuesta:** ✅ **Campos esenciales**:

```python
class EnRevision(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    producto_id = db.Column(db.Integer, nullable=False, index=True)
    sku = db.Column(db.String(100), nullable=False, index=True)
    location_id = db.Column(db.String(100), nullable=False, index=True)
    location_name = db.Column(db.String(200), nullable=True)
    
    motivo = db.Column(db.Text, nullable=False)  # Descripción legible
    tipo = db.Column(db.String(50), nullable=False, index=True)
    severidad = db.Column(db.String(20), default='media', index=True)
    
    run_detectado = db.Column(db.Integer, nullable=False, index=True)
    estado = db.Column(db.String(20), default='pendiente', index=True)
    
    # Valores para contexto (accionable)
    stock_old = db.Column(db.Numeric(10, 2), nullable=True)
    stock_new = db.Column(db.Numeric(10, 2), nullable=True)
    stock_fisico = db.Column(db.Numeric(10, 2), nullable=True)
    
    # Timestamps
    fecha_deteccion = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    fecha_resolucion = db.Column(db.DateTime, nullable=True)
    
    # Resolución manual
    resuelto_por = db.Column(db.Integer, nullable=True)
    notas = db.Column(db.Text, nullable=True)
    
    # Contador de repeticiones
    veces_detectado = db.Column(db.Integer, default=1)
```

### Si el mismo SKU cae en revisión todos los días, ¿lo marcas como "crónico" y cambias severidad / notificas diferente?

**Respuesta:** ✅ **SÍ, con contador y auto-ignorar**.

**Implementación:**
```python
def crear_en_revision(discrepancia):
    """Crea o actualiza EnRevision, manejando casos crónicos"""
    existente = EnRevision.query.filter_by(
        producto_id=discrepancia['producto_id'],
        location_id=discrepancia['location_id'],
        estado='pendiente'
    ).first()
    
    if existente:
        existente.veces_detectado += 1
        existente.run_detectado = discrepancia['run_id']
        
        if existente.veces_detectado >= 5:
            # Caso crónico: auto-ignorar
            existente.estado = 'ignorado_automatico'
            existente.severidad = 'baja'  # Bajar severidad
            existente.notas = f"Casos crónicos detectados {existente.veces_detectado} veces. Auto-ignorado."
            
            # Notificar administrador
            notificar_cronico(existente)
    else:
        # Crear nuevo
        en_revision = EnRevision(...)
        db.session.add(en_revision)
```

---

## 8. PERFORMANCE Y ANTI-TIMEOUT (Lo Más Importante)

### Comparar NEW vs OLD para 5k–10k SKUs por ubicación: ¿Cómo lo harás sin cargar todo a memoria?

**Respuesta:** ✅ **SQL eficiente con JOINs y agregaciones**, procesando por batches.

**Implementación:**
```python
def comparar_new_vs_old_eficiente(run_id_new, run_id_old, location_id, batch_size=1000):
    """Compara NEW vs OLD usando SQL eficiente, por batches"""
    discrepancias = []
    offset = 0
    
    while True:
        # Query que devuelve solo diferencias (no carga todo)
        diferencias = db.session.query(
            func.coalesce(new.producto_id, old.producto_id).label('producto_id'),
            func.coalesce(new.location_id, old.location_id).label('location_id'),
            func.coalesce(old.stock, 0).label('stock_old'),
            func.coalesce(new.stock, 0).label('stock_new'),
            case([
                (func.coalesce(old.stock, 0) > 0 and func.coalesce(new.stock, 0) == 0, 'desaparecido'),
                (func.coalesce(old.stock, 0) == 0 and func.coalesce(new.stock, 0) > 0, 'nuevo'),
                (abs(func.coalesce(new.stock, 0) - func.coalesce(old.stock, 0)) / 
                 func.nullif(func.coalesce(old.stock, 0), 0) > 3.0, 'cambio_brusco')
            ], else_='normal').label('tipo')
        ).outerjoin(
            StockProductoADM.alias('new').filter_by(sync_run_id=run_id_new),
            and_(
                func.coalesce(new.producto_id, old.producto_id) == 'new'.producto_id,
                func.coalesce(new.location_id, old.location_id) == 'new'.location_id
            )
        ).outerjoin(
            StockProductoADM.alias('old').filter_by(sync_run_id=run_id_old),
            and_(
                func.coalesce(new.producto_id, old.producto_id) == 'old'.producto_id,
                func.coalesce(new.location_id, old.location_id) == 'old'.location_id
            )
        ).filter(
            or_(
                func.coalesce(new.stock, 0) != func.coalesce(old.stock, 0),
                new.stock.is_(None),
                old.stock.is_(None)
            )
        ).offset(offset).limit(batch_size).all()
        
        if not diferencias:
            break
        
        for diff in diferencias:
            discrepancias.append({
                'producto_id': diff.producto_id,
                'location_id': diff.location_id,
                'stock_old': float(diff.stock_old),
                'stock_new': float(diff.stock_new),
                'tipo': diff.tipo
            })
        
        offset += batch_size
        
        # Timeout: máximo 5 minutos
        if time.time() - start_time > 300:
            logger.warning(f"Comparación timeout después de {len(discrepancias)} discrepancias")
            break
    
    return discrepancias
```

### ¿Qué índices exactos propones?

**Respuesta:**
```sql
-- Índice principal (obligatorio)
CREATE INDEX idx_stock_producto_run ON stock_productos_adm(producto_id, location_id, sync_run_id);

-- Índice para búsquedas por run_id
CREATE INDEX idx_stock_run_id ON stock_productos_adm(sync_run_id);

-- Índice para comparaciones (NEW vs OLD)
CREATE INDEX idx_stock_location_run ON stock_productos_adm(location_id, sync_run_id);

-- Índice compuesto para JOINs eficientes
CREATE INDEX idx_stock_run_producto ON stock_productos_adm(sync_run_id, producto_id, location_id);
```

### ¿Qué pasaría si el diff (validación post-sync) se tarda demasiado?

**Respuesta:** ✅ **Hacer swap igual y marcar "validación incompleta"**.

**Implementación:**
```python
def validar_con_timeout(run_id_new, run_id_old, location_id, timeout_segundos=300):
    """Valida con límite de tiempo"""
    start_time = time.time()
    discrepancias = []
    validacion_completa = True
    
    try:
        discrepancias = comparar_new_vs_old_eficiente(run_id_new, run_id_old, location_id)
        
        if time.time() - start_time > timeout_segundos:
            validacion_completa = False
            logger.warning(f"Validación timeout para run {run_id_new}")
    except Exception as e:
        validacion_completa = False
        logger.error(f"Error en validación: {e}")
    
    # Hacer swap igual (LIVE se actualiza)
    hacer_swap_atomico(location_id, run_id_new)
    
    # Marcar validación como incompleta
    if not validacion_completa:
        nuevo_run = SyncRun.query.get(run_id_new)
        nuevo_run.warnings_count += 1
        nuevo_run.notas = f"Validación incompleta (timeout). {len(discrepancias)} discrepancias detectadas."
    
    return discrepancias, validacion_completa
```

### ¿O no haces swap hasta validar (riesgo de que LIVE quede viejo)?

**Respuesta:** ❌ **NO, siempre hacer swap**. El riesgo de LIVE viejo es mayor que el riesgo de validación incompleta.

**Razón:** LIVE debe actualizarse para que los usuarios vean datos actuales. La validación es secundaria (solo para detectar discrepancias).

### ¿Qué pasaría si se hace swap, pero luego detectas que la sync fue incompleta?

**Respuesta:** ⚠️ **Rollback a run anterior** (solo cambiar `current_run_id`).

**Implementación:**
```python
def rollback_a_run_anterior(location_id, run_id_actual):
    """Rollback: vuelve a run anterior"""
    run_actual = SyncRun.query.get(run_id_actual)
    if not run_actual:
        return
    
    # Obtener run anterior
    run_anterior = SyncRun.query.filter_by(
        location_id=run_actual.location_id,
        status='done'
    ).order_by(SyncRun.finished_at.desc()).offset(1).first()
    
    if run_anterior:
        estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
        estado_sync.current_run_id = run_anterior.run_id
        estado_sync.status = 'done'
        
        # Marcar run actual como failed
        run_actual.status = 'failed'
        run_actual.finished_at = datetime.utcnow()
        run_actual.notas = f"Rollback: sync incompleta detectada después del swap"
        
        db.session.commit()
        
        logger.warning(f"Rollback ejecutado: run_id={run_id_actual} → {run_anterior.run_id}")
```

### ¿Rollback a run anterior es solo cambiar current_run_id?

**Respuesta:** ✅ **SÍ, EXACTAMENTE**. Solo cambiar `current_run_id` a `previous_run_id`. No se eliminan registros (quedan para auditoría).

---

## 9. DISEÑO DE DATOS (Para que No Se Rompa el Sistema Actual)

### ¿Vas a implementar staging con 3 tablas (NEW/OLD/LIVE) o con sync_run_id (recomendado)?

**Respuesta:** ✅ **sync_run_id (RECOMENDADO)**.

**Razones:**
- ✅ Una sola tabla (más simple)
- ✅ Historial completo (todos los runs)
- ✅ Swap lógico (solo cambiar ID)
- ✅ Migración gradual más fácil

### Si es con sync_run_id, ¿cómo harás la migración gradual para no romper endpoints existentes?

**Respuesta:** ✅ **Migración en 3 fases**:

**Fase 1: Preparación (Sin cambios en operaciones)**
```python
# 1. Agregar columnas (nullable)
ALTER TABLE stock_productos_adm ADD COLUMN sync_run_id INTEGER;
ALTER TABLE sync_locations_status ADD COLUMN current_run_id INTEGER;
ALTER TABLE sync_locations_status ADD COLUMN running_run_id INTEGER;

# 2. Crear tabla SyncRun
CREATE TABLE sync_runs (...);

# 3. Crear tabla EnRevision
CREATE TABLE en_revision (...);

# 4. Crear índices
CREATE INDEX idx_stock_run_id ON stock_productos_adm(sync_run_id);
```

**Fase 2: Compatibilidad Dual (Operaciones siguen funcionando)**
```python
# Helper function con fallback
def obtener_stock_vigente(producto_id, location_id):
    estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
    
    if estado_sync and estado_sync.current_run_id:
        # Nuevo sistema: usar sync_run_id
        return StockProductoADM.query.filter_by(
            producto_id=producto_id,
            location_id=location_id,
            sync_run_id=estado_sync.current_run_id
        ).first()
    else:
        # Fallback: registros sin sync_run_id (compatibilidad)
        return StockProductoADM.query.filter_by(
            producto_id=producto_id,
            location_id=location_id,
            sync_run_id=None
        ).first()
```

**Fase 3: Migración Completa (Todos usan nuevo sistema)**
```python
# 1. Migrar todas las consultas a usar helper
# 2. Eliminar fallback (opcional, mantener para seguridad)
# 3. Marcar registros sin sync_run_id como "legacy"
```

### ¿Qué política usarás para limpiar runs viejos y no explotar el disco?

**Respuesta:** ✅ **Limpieza automática: últimos N runs + >30 días**.

**Implementación:**
```python
def limpiar_runs_antiguos(dias=30, mantener_ultimos=5):
    """Limpia runs antiguos preservando últimos N y current_run_id"""
    fecha_limite = datetime.utcnow() - timedelta(days=dias)
    
    # Obtener current_run_id por ubicación (NO eliminar)
    current_runs = set(
        db.session.query(SyncLocationStatus.current_run_id)
        .filter(SyncLocationStatus.current_run_id.isnot(None))
        .scalar_all()
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
            # Eliminar run
            db.session.delete(run)
    
    db.session.commit()
    
    logger.info(f"Limpieza completada: {len(runs_a_eliminar)} runs eliminados")
```

### ¿Mantener últimos N runs por ubicación + borrar >30 días?

**Respuesta:** ✅ **SÍ, EXACTAMENTE**. 

**Política:**
- ✅ Mantener últimos 5 runs por ubicación
- ✅ Mantener `current_run_id` (nunca eliminar)
- ✅ Eliminar runs >30 días que no están en preservar
- ✅ Ejecutar limpieza semanalmente (cron job)

---

**Fin del Documento**



