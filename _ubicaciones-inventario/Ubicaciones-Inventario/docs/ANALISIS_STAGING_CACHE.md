# ANÁLISIS: Sistema de Staging para Cache (NEW/OLD/LIVE)

**Fecha:** 2026-01-29  
**Versión:** 1.0  
**Tipo:** Análisis de Viabilidad (Sin Implementación)

---

## RESUMEN EJECUTIVO

La propuesta de implementar un sistema de staging (NEW/OLD/LIVE) para `StockProductoADM` es **TÉCNICAMENTE VIABLE** y **NO ROMPE las reglas de oro**. Se recomienda la **Opción B (sync_run_id)** por su simplicidad, menor complejidad operativa y mejor integración con el sistema actual.

---

## COMPARACIÓN: OPCIÓN A vs OPCIÓN B

### OPCIÓN A: Tablas Separadas (staging/live/old)

**Estructura:**
```sql
StockProductoADM_stage  -- NEW (durante sync)
StockProductoADM_live    -- Vigente (consultas)
StockProductoADM_old    -- Snapshot anterior
```

**Ventajas:**
- ✅ Separación física clara
- ✅ Fácil de entender conceptualmente
- ✅ Swap rápido (renombrar tablas)

**Desventajas:**
- ❌ **3 tablas idénticas** = 3x espacio en disco
- ❌ **Migración compleja:** Requiere renombrar tablas en producción
- ❌ **Índices duplicados:** Cada tabla necesita sus propios índices
- ❌ **Consultas más complejas:** Necesita UNION o JOIN entre tablas para comparaciones
- ❌ **Mantenimiento:** 3 tablas que mantener sincronizadas estructuralmente
- ❌ **Riesgo de inconsistencias:** Si falla el swap, quedan tablas desincronizadas

**Complejidad de Implementación:** ⚠️ **ALTA**
- Requiere migración de datos existentes
- Requiere lógica de renombrado de tablas
- Requiere manejo de errores durante swap

---

### OPCIÓN B: Una Tabla con sync_run_id (RECOMENDADA)

**Estructura:**
```sql
StockProductoADM
  - id
  - producto_id
  - location_id
  - location_name
  - stock
  - sync_run_id  -- NUEVO: Identifica a qué "run" pertenece
  - updated_at

SyncRun
  - run_id (PK, auto-increment)
  - location_id
  - status (running, done, failed)
  - started_at
  - finished_at
  - items_synced
  - total_items
  - previous_run_id  -- Para comparar con OLD
```

**Ventajas:**
- ✅ **Una sola tabla:** Menor complejidad, menor espacio
- ✅ **Swap lógico:** Solo cambiar `sync_run_id` en consultas (sin renombrar tablas)
- ✅ **Historial completo:** Todos los runs quedan en BD para auditoría
- ✅ **Comparaciones fáciles:** JOIN simple entre runs
- ✅ **Migración simple:** Agregar columna `sync_run_id` y tabla `SyncRun`
- ✅ **Rollback fácil:** Si algo falla, solo cambiar el `sync_run_id` vigente
- ✅ **Índices optimizados:** Un solo índice compuesto `(producto_id, location_id, sync_run_id)`

**Desventajas:**
- ⚠️ Tabla crece con el tiempo (pero se puede limpiar runs antiguos)
- ⚠️ Consultas requieren filtrar por `sync_run_id` (pero es un índice)

**Complejidad de Implementación:** ✅ **MEDIA**
- Migración simple: agregar columnas
- Lógica de consulta: filtrar por `sync_run_id` vigente
- Swap: actualizar `SyncLocationStatus.current_run_id`

---

## RECOMENDACIÓN: OPCIÓN B

**Razones:**
1. **Menor complejidad operativa:** No requiere renombrar tablas en producción
2. **Mejor integración:** Se integra naturalmente con `SyncLocationStatus`
3. **Historial completo:** Permite comparar múltiples runs históricos
4. **Rollback seguro:** Si algo falla, solo cambiar un ID
5. **Escalabilidad:** Fácil agregar más metadata por run

---

## ARQUITECTURA PROPUESTA (OPCIÓN B)

### 1. Modelos de Base de Datos

#### A) Modificar `StockProductoADM`
```python
class StockProductoADM(db.Model):
    # ... campos existentes ...
    sync_run_id = db.Column(db.Integer, db.ForeignKey('sync_runs.run_id'), nullable=True, index=True)
    
    # Índice único: un producto solo puede tener una entrada por ubicación ADM POR RUN
    __table_args__ = (
        db.UniqueConstraint('producto_id', 'location_id', 'sync_run_id', 
                          name='uq_producto_location_run_adm'),
    )
```

**Nota:** `sync_run_id` puede ser `NULL` para compatibilidad con datos existentes (migración gradual).

#### B) Nueva Tabla `SyncRun`
```python
class SyncRun(db.Model):
    """Registro de cada ejecución de sincronización"""
    __tablename__ = 'sync_runs'
    
    run_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    location_id = db.Column(db.String(100), nullable=False, index=True)
    location_name = db.Column(db.String(200), nullable=False)
    
    status = db.Column(db.String(20), default='running', nullable=False, index=True)
    # running, done, failed, cancelled
    
    started_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    finished_at = db.Column(db.DateTime, nullable=True)
    
    items_synced = db.Column(db.Integer, default=0, nullable=False)
    total_items = db.Column(db.Integer, default=0, nullable=False)
    
    previous_run_id = db.Column(db.Integer, nullable=True)  # Para comparar con OLD
    
    # Metadata adicional
    sync_type = db.Column(db.String(20), default='full', nullable=False)  # full, partial
    errors_count = db.Column(db.Integer, default=0, nullable=False)
    warnings_count = db.Column(db.Integer, default=0, nullable=False)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relación con StockProductoADM
    stock_records = db.relationship('StockProductoADM', backref='sync_run', lazy='dynamic')
```

#### C) Modificar `SyncLocationStatus`
```python
class SyncLocationStatus(db.Model):
    # ... campos existentes ...
    current_run_id = db.Column(db.Integer, db.ForeignKey('sync_runs.run_id'), nullable=True)
    # Identifica qué run_id es el "vigente" (LIVE) para esta ubicación
```

---

### 2. Flujo de Sincronización Modificado

#### Fase 1: Inicialización
```python
def sincronizar_ubicacion(location_id, forzar=False):
    # 1. Crear nuevo SyncRun
    nuevo_run = SyncRun(
        location_id=location_id,
        location_name=location_name,
        status='running',
        started_at=datetime.utcnow()
    )
    db.session.add(nuevo_run)
    db.session.flush()  # Para obtener run_id
    
    # 2. Obtener run_id anterior (si existe)
    estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
    run_id_anterior = estado_sync.current_run_id if estado_sync else None
    
    # 3. Guardar referencia al run anterior
    nuevo_run.previous_run_id = run_id_anterior
    
    # 4. Actualizar SyncLocationStatus (pero NO current_run_id todavía)
    estado_sync.status = 'running'
    estado_sync.updated_at = datetime.utcnow()
```

#### Fase 2: Carga en Staging (NEW)
```python
# Durante el loop de sincronización:
for item in items_adm:
    # ... lógica existente ...
    
    # Crear/actualizar StockProductoADM con sync_run_id = nuevo_run.run_id
    stock_obj = StockProductoADM.query.filter_by(
        producto_id=producto.id,
        location_id=location_id,
        sync_run_id=nuevo_run.run_id  # NUEVO: Filtrar por run_id
    ).first()
    
    if stock_obj:
        stock_obj.stock = stock
        stock_obj.updated_at = datetime.utcnow()
    else:
        stock_obj = StockProductoADM(
            producto_id=producto.id,
            location_id=location_id,
            location_name=location_name,
            stock=stock,
            sync_run_id=nuevo_run.run_id,  # NUEVO
            updated_at=datetime.utcnow()
        )
        db.session.add(stock_obj)
```

#### Fase 3: Validación Post-Sync (Comparación NEW vs OLD)
```python
def validar_cambios_sospechosos(run_id_new, run_id_old, location_id):
    """Compara NEW vs OLD y detecta discrepancias"""
    discrepancias = []
    
    if not run_id_old:
        # Primera sync, no hay OLD para comparar
        return discrepancias
    
    # Obtener stock NEW
    stock_new = StockProductoADM.query.filter_by(
        sync_run_id=run_id_new
    ).all()
    
    # Obtener stock OLD
    stock_old = StockProductoADM.query.filter_by(
        sync_run_id=run_id_old
    ).all()
    
    # Crear diccionarios para comparación rápida
    dict_new = {(s.producto_id, s.location_id): s for s in stock_new}
    dict_old = {(s.producto_id, s.location_id): s for s in stock_old}
    
    # Comparar cambios
    for key, stock_n in dict_new.items():
        stock_o = dict_old.get(key)
        
        if stock_o:
            # Cambio brusco (ej: de 5 a 0, o +300%)
            cambio_porcentual = abs((float(stock_n.stock) - float(stock_o.stock)) / float(stock_o.stock)) * 100 if float(stock_o.stock) > 0 else 0
            
            if float(stock_o.stock) > 0 and float(stock_n.stock) == 0:
                # Desapareció (crítico)
                discrepancias.append({
                    'tipo': 'desaparecido',
                    'producto_id': stock_n.producto_id,
                    'location_id': location_id,
                    'stock_old': float(stock_o.stock),
                    'stock_new': 0,
                    'motivo': f'Stock desapareció: {stock_o.stock} → 0'
                })
            elif cambio_porcentual > 300:
                # Cambio brusco (sospechoso)
                discrepancias.append({
                    'tipo': 'cambio_brusco',
                    'producto_id': stock_n.producto_id,
                    'location_id': location_id,
                    'stock_old': float(stock_o.stock),
                    'stock_new': float(stock_n.stock),
                    'motivo': f'Cambio brusco: {stock_o.stock} → {stock_n.stock} ({cambio_porcentual:.1f}%)'
                })
        else:
            # Nuevo producto (no crítico, pero registrar)
            discrepancias.append({
                'tipo': 'nuevo',
                'producto_id': stock_n.producto_id,
                'location_id': location_id,
                'stock_old': 0,
                'stock_new': float(stock_n.stock),
                'motivo': f'Nuevo producto con stock: {stock_n.stock}'
            })
    
    # Verificar productos que desaparecieron completamente
    for key, stock_o in dict_old.items():
        if key not in dict_new:
            discrepancias.append({
                'tipo': 'desaparecido_completo',
                'producto_id': stock_o.producto_id,
                'location_id': location_id,
                'stock_old': float(stock_o.stock),
                'stock_new': 0,
                'motivo': f'Producto desapareció completamente de ADM'
            })
    
    return discrepancias
```

#### Fase 4: Validación ADM vs Físico (Solo para ADESA)
```python
def validar_adm_vs_fisico(run_id_new, location_id, location_name):
    """Cruza ADM NEW vs StockUbicacion físico (solo para ADESA)"""
    discrepancias = []
    
    if "ADESA" not in location_name.upper():
        return discrepancias  # Solo para ADESA
    
    # Obtener stock ADM (NEW)
    stock_adm = StockProductoADM.query.filter_by(
        sync_run_id=run_id_new,
        location_id=location_id
    ).all()
    
    for stock_a in stock_adm:
        producto = stock_a.producto
        stock_adm_valor = float(stock_a.stock)
        
        # Obtener stock físico
        stock_fisico = StockUbicacion.query.filter_by(
            sku=producto.sku
        ).all()
        stock_fisico_total = sum(float(s.cantidad) for s in stock_fisico)
        
        # Discrepancia crítica: ADM=0 pero Físico>0
        if stock_adm_valor == 0 and stock_fisico_total > 0:
            discrepancias.append({
                'tipo': 'critica_adm_vs_fisico',
                'producto_id': producto.id,
                'sku': producto.sku,
                'location_id': location_id,
                'stock_adm': 0,
                'stock_fisico': stock_fisico_total,
                'motivo': f'ADM=0 pero Físico={stock_fisico_total} (CRÍTICO)'
            })
        # Discrepancia alta: diferencia > 20%
        elif stock_fisico_total > 0:
            diferencia = abs(stock_adm_valor - stock_fisico_total)
            porcentaje = (diferencia / stock_fisico_total) * 100 if stock_fisico_total > 0 else 0
            
            if porcentaje > 20:
                discrepancias.append({
                    'tipo': 'alta_diferencia',
                    'producto_id': producto.id,
                    'sku': producto.sku,
                    'location_id': location_id,
                    'stock_adm': stock_adm_valor,
                    'stock_fisico': stock_fisico_total,
                    'motivo': f'Diferencia {porcentaje:.1f}%: ADM={stock_adm_valor}, Físico={stock_fisico_total}'
                })
    
    return discrepancias
```

#### Fase 5: Crear Registros "En Revisión"
```python
def crear_registros_en_revision(discrepancias, run_id):
    """Crea registros en tabla EnRevision para seguimiento"""
    for disc in discrepancias:
        # Verificar si ya existe registro pendiente
        existente = EnRevision.query.filter_by(
            producto_id=disc['producto_id'],
            location_id=disc['location_id'],
            estado='pendiente'
        ).first()
        
        if not existente:
            en_revision = EnRevision(
                producto_id=disc['producto_id'],
                sku=disc.get('sku', ''),
                location_id=disc['location_id'],
                motivo=disc['motivo'],
                tipo=disc['tipo'],
                run_detectado=run_id,
                estado='pendiente',
                stock_old=disc.get('stock_old', 0),
                stock_new=disc.get('stock_new', 0),
                stock_fisico=disc.get('stock_fisico', 0)
            )
            db.session.add(en_revision)
        else:
            # Actualizar existente
            existente.motivo = disc['motivo']
            existente.run_detectado = run_id
            existente.stock_old = disc.get('stock_old', 0)
            existente.stock_new = disc.get('stock_new', 0)
            existente.stock_fisico = disc.get('stock_fisico', 0)
```

#### Fase 6: Swap Atómico (NEW → LIVE)
```python
def hacer_swap_atomico(location_id, run_id_new):
    """Hace el swap: NEW pasa a ser LIVE"""
    estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
    
    # Actualizar current_run_id (esto hace que NEW sea LIVE)
    estado_sync.current_run_id = run_id_new
    estado_sync.status = 'done'
    estado_sync.last_sync_at = datetime.utcnow()
    
    # Actualizar SyncRun
    nuevo_run = SyncRun.query.get(run_id_new)
    nuevo_run.status = 'done'
    nuevo_run.finished_at = datetime.utcnow()
    
    db.session.commit()
    
    logger.info(f"Swap completado: run_id={run_id_new} ahora es LIVE para {location_id}")
```

---

### 3. Modificación de Consultas Existentes

#### A) Búsqueda de Productos (`routes/productos.py`)
```python
# ANTES:
stock_ubicaciones_adm = StockProductoADM.query.filter_by(
    producto_id=producto_db.id
).all()

# DESPUÉS:
# Obtener run_id vigente para todas las ubicaciones
estados_sync = SyncLocationStatus.query.filter(
    SyncLocationStatus.current_run_id.isnot(None)
).all()
run_ids_vigentes = {e.location_id: e.current_run_id for e in estados_sync}

# Consultar solo registros con run_id vigente
stock_ubicaciones_adm = StockProductoADM.query.filter(
    StockProductoADM.producto_id == producto_db.id,
    StockProductoADM.sync_run_id.in_(run_ids_vigentes.values())
).all()
```

**Optimización:** Crear vista materializada o función helper:
```python
def obtener_stock_vigente(producto_id, location_id=None):
    """Obtiene stock vigente (LIVE) para un producto"""
    if location_id:
        estado_sync = SyncLocationStatus.query.filter_by(
            location_id=location_id
        ).first()
        if estado_sync and estado_sync.current_run_id:
            return StockProductoADM.query.filter_by(
                producto_id=producto_id,
                location_id=location_id,
                sync_run_id=estado_sync.current_run_id
            ).first()
    else:
        # Para todas las ubicaciones
        estados_sync = SyncLocationStatus.query.filter(
            SyncLocationStatus.current_run_id.isnot(None)
        ).all()
        run_ids = [e.current_run_id for e in estados_sync]
        
        return StockProductoADM.query.filter(
            StockProductoADM.producto_id == producto_id,
            StockProductoADM.sync_run_id.in_(run_ids)
        ).all()
```

#### B) Transferencias (`routes/transferencias.py`)
```python
# ANTES:
stock_adm_origen = StockProductoADM.query.filter_by(
    producto_id=producto_db.id,
    location_id=location_id_origen
).first()

# DESPUÉS:
estado_sync = SyncLocationStatus.query.filter_by(
    location_id=location_id_origen
).first()
run_id_vigente = estado_sync.current_run_id if estado_sync else None

stock_adm_origen = StockProductoADM.query.filter_by(
    producto_id=producto_db.id,
    location_id=location_id_origen,
    sync_run_id=run_id_vigente
).first()
```

#### C) Ajustes (`routes/ajustes.py`)
```python
# Similar a transferencias: usar run_id vigente
```

---

### 4. Nueva Tabla: EnRevision

```python
class EnRevision(db.Model):
    """SKUs que requieren revisión después de sincronización"""
    __tablename__ = 'en_revision'
    
    id = db.Column(db.Integer, primary_key=True)
    producto_id = db.Column(db.Integer, db.ForeignKey('productos_adm.id'), nullable=False, index=True)
    sku = db.Column(db.String(100), nullable=False, index=True)
    location_id = db.Column(db.String(100), nullable=False, index=True)
    
    motivo = db.Column(db.Text, nullable=False)  # Descripción del problema
    tipo = db.Column(db.String(50), nullable=False)  # desaparecido, cambio_brusco, critica_adm_vs_fisico, etc.
    
    run_detectado = db.Column(db.Integer, db.ForeignKey('sync_runs.run_id'), nullable=False)
    estado = db.Column(db.String(20), default='pendiente', nullable=False, index=True)
    # pendiente, resuelto, ignorado
    
    stock_old = db.Column(db.Numeric(10, 2), nullable=True)
    stock_new = db.Column(db.Numeric(10, 2), nullable=True)
    stock_fisico = db.Column(db.Numeric(10, 2), nullable=True)
    
    fecha_deteccion = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    fecha_resolucion = db.Column(db.DateTime, nullable=True)
    resuelto_por = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=True)
    notas = db.Column(db.Text, nullable=True)
    
    # Relaciones
    producto = db.relationship('ProductoADM', backref='en_revision')
    sync_run = db.relationship('SyncRun', backref='en_revision')
```

---

### 5. Sistema de Notificaciones (Email)

```python
def enviar_resumen_sincronizacion(location_id, run_id, discrepancias):
    """Envía email con resumen de sincronización y discrepancias"""
    estado_sync = SyncLocationStatus.query.filter_by(location_id=location_id).first()
    run = SyncRun.query.get(run_id)
    
    # Agrupar discrepancias por tipo
    por_tipo = {}
    for disc in discrepancias:
        tipo = disc['tipo']
        if tipo not in por_tipo:
            por_tipo[tipo] = []
        por_tipo[tipo].append(disc)
    
    # Preparar email
    asunto = f"Sincronización {estado_sync.location_name}: {len(discrepancias)} discrepancias detectadas"
    
    cuerpo = f"""
    Sincronización completada para {estado_sync.location_name}
    
    Run ID: {run_id}
    Items sincronizados: {run.items_synced}/{run.total_items}
    Fecha: {run.finished_at}
    
    DISCREPANCIAS DETECTADAS: {len(discrepancias)}
    
    """
    
    for tipo, items in por_tipo.items():
        cuerpo += f"\n{tipo.upper()}: {len(items)} items\n"
        for item in items[:10]:  # Top 10
            cuerpo += f"  - SKU: {item.get('sku', 'N/A')}, {item['motivo']}\n"
        if len(items) > 10:
            cuerpo += f"  ... y {len(items) - 10} más\n"
    
    # Enviar email (usar Flask-Mail o similar)
    # send_email(asunto, cuerpo, destinatarios=['admin@example.com'])
```

---

## IMPACTO EN EL SISTEMA ACTUAL

### ✅ Compatibilidad con Reglas de Oro

| Regla | Impacto | Estado |
|-------|---------|--------|
| **REGLA #1:** Desaparecido => 0 | ✅ Se mantiene | Compatible |
| **REGLA #2:** Sync sobrescribe cache | ✅ Se mantiene (pero en staging) | Compatible |
| **REGLA #3:** Discrepancia ADM=0 vs Físico>0 | ✅ Se mejora (detección automática) | Mejorado |
| **REGLA #4:** ADESA vs NO-ADESA | ✅ No se toca | Compatible |
| **REGLA #5:** Movimientos de auditoría | ✅ No se toca | Compatible |

### ⚠️ Cambios Requeridos en Código

1. **Consultas a `StockProductoADM`:**
   - **Archivos afectados:** `routes/productos.py`, `routes/transferencias.py`, `routes/ajustes.py`
   - **Cambio:** Agregar filtro `sync_run_id = current_run_id`
   - **Complejidad:** Media (requiere helper function)

2. **Lógica de sincronización:**
   - **Archivo afectado:** `routes/sincronizar.py`
   - **Cambio:** Crear `SyncRun`, cargar en staging, validar, swap
   - **Complejidad:** Alta (requiere refactorización)

3. **Nuevas tablas:**
   - `SyncRun`: Nueva tabla
   - `EnRevision`: Nueva tabla
   - Migración de `StockProductoADM`: Agregar columna `sync_run_id`

### 📊 Impacto en Performance

**Consultas:**
- **Antes:** `SELECT * FROM stock_productos_adm WHERE producto_id = ?`
- **Después:** `SELECT * FROM stock_productos_adm WHERE producto_id = ? AND sync_run_id = ?`
- **Impacto:** ✅ **Positivo** (índice compuesto `(producto_id, location_id, sync_run_id)` es más eficiente)

**Espacio en disco:**
- **Antes:** Solo registros vigentes
- **Después:** Registros vigentes + históricos (runs anteriores)
- **Impacto:** ⚠️ **Aumenta** (pero se puede limpiar runs antiguos)

**Recomendación:** Implementar limpieza automática de runs antiguos (> 30 días):
```python
def limpiar_runs_antiguos(dias=30):
    """Elimina runs y registros de stock antiguos"""
    fecha_limite = datetime.utcnow() - timedelta(days=dias)
    
    runs_antiguos = SyncRun.query.filter(
        SyncRun.finished_at < fecha_limite,
        SyncRun.run_id.notin_(
            # No eliminar runs que son current_run_id
            db.session.query(SyncLocationStatus.current_run_id)
        )
    ).all()
    
    for run in runs_antiguos:
        # Eliminar registros de stock asociados
        StockProductoADM.query.filter_by(sync_run_id=run.run_id).delete()
        # Eliminar run
        db.session.delete(run)
    
    db.session.commit()
```

---

## PLAN DE IMPLEMENTACIÓN SUGERIDO

### Fase 1: Preparación (Sin cambios en producción)
1. Crear modelos `SyncRun` y `EnRevision`
2. Agregar columna `sync_run_id` a `StockProductoADM` (nullable)
3. Agregar columna `current_run_id` a `SyncLocationStatus` (nullable)
4. Crear migración de base de datos

### Fase 2: Compatibilidad Dual (Migración gradual)
1. Modificar consultas para usar `sync_run_id` si existe, sino usar registros sin `sync_run_id` (compatibilidad hacia atrás)
2. Modificar sincronización para crear `SyncRun` y cargar en staging
3. **NO hacer swap todavía** (solo cargar en staging)

### Fase 3: Swap y Validación
1. Implementar validación post-sync (comparación NEW vs OLD)
2. Implementar validación ADM vs Físico (solo ADESA)
3. Implementar creación de registros `EnRevision`
4. Implementar swap atómico (NEW → LIVE)

### Fase 4: Notificaciones
1. Implementar sistema de email
2. Crear endpoint para consultar `EnRevision`
3. Crear UI para revisar discrepancias

### Fase 5: Limpieza
1. Implementar limpieza automática de runs antiguos
2. Monitorear performance y ajustar índices

---

## RIESGOS Y MITIGACIONES

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| **Consultas lentas** | Media | Alto | Índices compuestos optimizados |
| **Espacio en disco** | Alta | Medio | Limpieza automática de runs antiguos |
| **Errores durante swap** | Baja | Alto | Transacciones atómicas, rollback automático |
| **Compatibilidad con código existente** | Media | Medio | Migración gradual, compatibilidad hacia atrás |

---

## CONCLUSIÓN

La propuesta es **VIABLE** y **RECOMENDADA**. La **Opción B (sync_run_id)** es la mejor opción por:

1. ✅ **No rompe reglas de oro**
2. ✅ **Menor complejidad operativa**
3. ✅ **Mejor integración con sistema actual**
4. ✅ **Historial completo para auditoría**
5. ✅ **Swap seguro y reversible**

**Próximos pasos sugeridos:**
1. Revisar este análisis
2. Aprobar arquitectura propuesta
3. Crear plan de implementación detallado
4. Implementar en fases (migración gradual)

---

**Fin del Análisis**



