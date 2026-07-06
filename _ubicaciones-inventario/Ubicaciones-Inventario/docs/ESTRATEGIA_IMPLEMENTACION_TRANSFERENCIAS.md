# 📋 ESTRATEGIA DE IMPLEMENTACIÓN: MÓDULO TRANSFERENCIAS DE UBICACIONES

**Fecha:** 2026-01-19  
**Objetivo:** Implementar registro y aplicación de transferencias entre ubicaciones ADM en WMS  
**Estado:** 📝 Plan Técnico (Sin implementación aún)

---

## 🎯 RESUMEN EJECUTIVO

Este documento propone una estrategia **incremental y segura** para implementar el módulo de Transferencias de Ubicaciones, resolviendo el problema de **timing entre sincronización ADM y registro manual en WMS**, evitando duplicaciones y manteniendo la integridad del inventario.

---

## 🔍 ANÁLISIS DEL PROBLEMA

### Situación Actual

1. **Dos sistemas de stock coexisten:**
   - `StockUbicacion`: Stock físico WMS por ubicación física (ej: "A-01-02")
   - `StockProductoADM`: Cache de stock ADM Cloud por ubicación ADM (ej: "ADESA", "Mirador Sur")

2. **Flujo actual de sincronización:**
   - La sincronización actualiza `StockProductoADM` desde ADM Cloud
   - **NO actualiza** `StockUbicacion` directamente
   - `StockUbicacion` solo se actualiza cuando se registran movimientos manuales (RECEIPT, PICK)

3. **Problema de timing identificado:**
   ```
   Escenario Problemático:
   1. ADM transfiere 3 unidades: ADESA → Mirador Sur
   2. Sync ejecuta → Actualiza StockProductoADM (ADESA baja, Mirador Sur sube)
   3. Usuario busca transferencia en WMS → La encuentra
   4. Usuario registra transferencia → ¿Qué pasa con StockUbicacion?
      ❌ Si suma: DUPLICACIÓN (ya reflejado en StockProductoADM)
      ❌ Si no suma: INCONSISTENCIA (StockUbicacion no refleja la transferencia)
   ```

### Riesgos Identificados

- **Duplicación de movimientos:** Si se registra después del sync, podría duplicar el efecto
- **Inconsistencias entre sistemas:** `StockUbicacion` vs `StockProductoADM` desincronizados
- **Pérdida de trazabilidad:** No hay registro claro de cuándo se aplicó la transferencia en WMS
- **Rendimiento:** Procesar miles de productos en cada sync puede causar timeouts

---

## 💡 PROPUESTA DE SOLUCIÓN

### Principios de Diseño

1. **Idempotencia:** Registrar la misma transferencia múltiples veces no debe duplicar efectos
2. **Separación de responsabilidades:** ADM Cloud es la fuente de verdad para stock ADM; WMS es la fuente de verdad para stock físico
3. **Trazabilidad completa:** Todo movimiento debe quedar registrado en `Movimiento` con tipo `TRANSFER`
4. **Eficiencia incremental:** Solo procesar lo necesario, no todo el inventario

---

## 🏗️ ARQUITECTURA PROPUESTA

### 1. Modelo de Datos (Extensión)

#### Nueva Tabla: `TransferenciaProcesada`

```python
class TransferenciaProcesada(db.Model):
    """Control de transferencias procesadas desde ADM Cloud"""
    __tablename__ = 'transferencias_procesadas'
    
    id = db.Column(db.Integer, primary_key=True)
    transferencia_docid = db.Column(db.String(50), nullable=False, index=True)  # DocID: "00000231"
    transferencia_guid = db.Column(db.String(100), unique=True, nullable=False)  # GUID de ADM
    location_id_origen = db.Column(db.String(100), nullable=False)  # GUID ubicación origen
    location_name_origen = db.Column(db.String(200), nullable=False)  # "ADESA"
    location_id_destino = db.Column(db.String(100), nullable=False)  # GUID ubicación destino
    location_name_destino = db.Column(db.String(200), nullable=False)  # "Mirador Sur"
    fecha_transferencia = db.Column(db.DateTime, nullable=True)  # Fecha en ADM
    estado_procesamiento = db.Column(db.String(20), default='PENDIENTE', nullable=False)  
    # PENDIENTE, PROCESADA, ERROR
    
    # Mapeo de ubicaciones físicas WMS
    ubicacion_fisica_origen = db.Column(db.String(50), nullable=True)  # "A-01-02" (si aplica)
    ubicacion_fisica_destino = db.Column(db.String(50), nullable=True)  # "B-03-04" (si aplica)
    
    usuario_procesador = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=True)
    fecha_procesamiento = db.Column(db.DateTime, nullable=True)
    
    # Cache de productos JSON
    productos_json = db.Column(db.Text, nullable=True)  # JSON con productos transferidos
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Índice único para evitar duplicados
    __table_args__ = (db.UniqueConstraint('transferencia_guid', name='uq_transferencia_guid'),)
```

**Propósito:**
- Evitar procesar la misma transferencia dos veces (idempotencia)
- Cache de información de la transferencia
- Control de estado de procesamiento

#### Uso de `Movimiento` Existente

El modelo `Movimiento` ya tiene soporte para `TRANSFER`:
- `tipo = "TRANSFER"`
- `ubicacion_origen` y `ubicacion_destino` ya existen
- `factura_guid` puede usarse para `transferencia_guid`

**No requiere cambios en el modelo.**

---

### 2. Estrategia de Procesamiento

#### Opción A: Registro Manual (MVP - Fase 1) ⭐ RECOMENDADA

**Flujo:**
1. Usuario busca transferencia por DocID en WMS
2. Sistema muestra: Origen → Destino y productos
3. Usuario confirma y registra la transferencia
4. Sistema:
   - Verifica si ya fue procesada (`TransferenciaProcesada`)
   - Si no existe, crea registro en `TransferenciaProcesada`
   - Crea movimientos `TRANSFER` en `Movimiento`
   - Actualiza `StockUbicacion` (origen resta, destino suma)
   - Marca como `PROCESADA`

**Ventajas:**
- ✅ Control total del usuario
- ✅ Evita duplicaciones automáticamente
- ✅ No interfiere con sincronización
- ✅ Implementación simple y segura

**Desventajas:**
- ⚠️ Requiere acción manual del usuario
- ⚠️ Si el usuario olvida registrar, hay desincronización

**Idempotencia:**
- Si el usuario intenta registrar dos veces, el sistema detecta `TransferenciaProcesada` existente y rechaza o muestra mensaje informativo.

#### Opción B: Procesamiento Automático en Sync (Fase 2 - Avanzado)

**Flujo:**
1. Durante sincronización de ubicación, detectar transferencias nuevas
2. Comparar `StockProductoADM` antes/después del sync
3. Si hay cambios que sugieren transferencia, buscar en ADM Cloud
4. Procesar automáticamente si no está en `TransferenciaProcesada`

**Ventajas:**
- ✅ Automático, no requiere intervención manual
- ✅ Siempre sincronizado

**Desventajas:**
- ⚠️ Complejidad alta (detectar transferencias desde cambios de stock)
- ⚠️ Riesgo de falsos positivos
- ⚠️ Puede procesar transferencias que el usuario no quiere aplicar aún

**Recomendación:** Implementar en Fase 2, después de validar Fase 1.

---

### 3. Manejo de Ubicaciones Múltiples

#### Problema
ADM Cloud usa ubicaciones lógicas (GUIDs): "ADESA", "Mirador Sur", "401 BIKE"  
WMS usa ubicaciones físicas: "A-01-02", "B-03-04", etc.

#### Solución: Mapeo Flexible

**Estrategia 1: Mapeo Directo (Simple)**
- Si la ubicación ADM tiene equivalente físico directo, mapear automáticamente
- Ejemplo: "ADESA" → "A-01-02" (configuración manual inicial)

**Estrategia 2: Selección Manual (MVP)**
- Al registrar transferencia, usuario selecciona ubicación física destino
- Origen puede ser automático si hay mapeo, o también manual

**Estrategia 3: Múltiples Ubicaciones Físicas (Avanzado)**
- Una ubicación ADM puede mapear a múltiples ubicaciones físicas
- Al registrar, distribuir productos entre ubicaciones físicas

**Recomendación para MVP:**
- **Estrategia 2 (Selección Manual)** - Más flexible y segura
- En el futuro, agregar tabla de mapeo `MapeoUbicacionADM_WMS` para automatizar

---

### 4. Estrategia de Eficiencia

#### Problema
Procesar miles de productos en cada sync puede causar timeouts.

#### Solución: Procesamiento Incremental

**1. Solo Transferencias Nuevas:**
- Mantener checkpoint de última transferencia procesada
- Solo buscar transferencias posteriores a ese checkpoint
- Campo en `SyncLocationStatus`: `last_transfer_processed_date`

**2. Procesamiento por Lotes:**
- Si hay muchas transferencias, procesar en lotes de 10-20
- Usar background threads para no bloquear la UI

**3. Índices de Base de Datos:**
- Índice en `transferencia_guid` (ya propuesto como UNIQUE)
- Índice en `transferencia_docid` para búsquedas rápidas
- Índice en `estado_procesamiento` para filtrar pendientes

**4. Cache de Productos:**
- Guardar `productos_json` en `TransferenciaProcesada` para evitar re-consultas a ADM

---

## 📅 PLAN DE IMPLEMENTACIÓN POR FASES

### FASE 1: MVP - Registro Manual (2-3 días) ⭐ PRIORITARIA

**Objetivo:** Permitir al usuario buscar y registrar transferencias manualmente.

**Tareas:**
1. ✅ Crear tabla `TransferenciaProcesada` (migración)
2. ✅ Extender endpoint `/api/transferencias/buscar` para incluir estado de procesamiento
3. ✅ Crear endpoint `/api/transferencias/registrar`:
   - Validar que no esté ya procesada
   - Crear `TransferenciaProcesada`
   - Crear movimientos `TRANSFER` en `Movimiento`
   - Actualizar `StockUbicacion` (origen resta, destino suma)
4. ✅ Actualizar UI `transferencias.html`:
   - Botón "Registrar Transferencia"
   - Mostrar estado (Pendiente/Procesada)
   - Formulario para seleccionar ubicación física destino (si aplica)

**Criterios de Éxito:**
- Usuario puede buscar transferencia por DocID
- Usuario puede registrar transferencia
- Sistema previene duplicaciones
- `StockUbicacion` se actualiza correctamente
- Movimientos quedan registrados en `Movimiento`

**Riesgos Mitigados:**
- ✅ Duplicación: Controlado por `TransferenciaProcesada`
- ✅ Timing: No hay conflicto con sync (procesamiento manual)
- ✅ Eficiencia: Solo procesa cuando usuario lo solicita

---

### FASE 2: Mejoras de UX (1-2 días)

**Objetivo:** Mejorar la experiencia de usuario y automatizar mapeos simples.

**Tareas:**
1. Crear tabla `MapeoUbicacionADM_WMS`:
   - `location_id_adm` → `ubicacion_fisica_wms`
   - Configuración manual desde Panel Admin
2. Auto-mapeo en registro:
   - Si existe mapeo, pre-seleccionar ubicación física
   - Usuario puede cambiar si es necesario
3. Vista de historial:
   - Listar transferencias procesadas
   - Filtrar por fecha, ubicación, estado
4. Validaciones mejoradas:
   - Verificar stock suficiente en origen antes de registrar
   - Alertas si hay discrepancias

**Criterios de Éxito:**
- Mapeo automático funciona para ubicaciones configuradas
- Usuario puede ver historial de transferencias
- Validaciones previenen errores

---

### FASE 3: Detección Automática (Opcional - Avanzado)

**Objetivo:** Detectar y sugerir transferencias automáticamente durante sync.

**Tareas:**
1. Durante sync, comparar `StockProductoADM` antes/después
2. Detectar cambios que sugieren transferencia:
   - Mismo producto, misma cantidad, ubicaciones diferentes
   - Cambio ocurre en ventana de tiempo reciente
3. Buscar transferencias en ADM Cloud que coincidan
4. Crear sugerencias en `TransferenciaProcesada` con estado `SUGERIDA`
5. UI muestra sugerencias para aprobación manual

**Criterios de Éxito:**
- Sistema detecta transferencias nuevas automáticamente
- Usuario puede aprobar/rechazar sugerencias
- No procesa automáticamente sin aprobación

**Riesgos:**
- ⚠️ Falsos positivos (cambios de stock por otras razones)
- ⚠️ Complejidad alta

**Recomendación:** Implementar solo si Fase 1 y 2 funcionan bien y hay demanda.

---

## 🔒 GARANTÍAS DE INTEGRIDAD

### 1. Prevención de Duplicaciones

**Mecanismo:**
- `TransferenciaProcesada.transferencia_guid` es UNIQUE
- Antes de procesar, verificar existencia
- Si existe y está `PROCESADA`, rechazar o mostrar mensaje informativo

**Código Pseudocódigo:**
```python
def registrar_transferencia(transferencia_guid):
    # Verificar si ya existe
    transferencia_existente = TransferenciaProcesada.query.filter_by(
        transferencia_guid=transferencia_guid
    ).first()
    
    if transferencia_existente and transferencia_existente.estado_procesamiento == 'PROCESADA':
        return {"error": "Esta transferencia ya fue procesada anteriormente"}
    
    # Procesar...
```

### 2. Transacciones Atómicas

**Mecanismo:**
- Todo el proceso de registro en una transacción de BD
- Si falla cualquier paso, rollback completo
- No se crea `Movimiento` si falla actualización de `StockUbicacion`

**Código Pseudocódigo:**
```python
try:
    db.session.begin()
    
    # 1. Crear TransferenciaProcesada
    # 2. Crear Movimientos
    # 3. Actualizar StockUbicacion
    
    db.session.commit()
except:
    db.session.rollback()
    raise
```

### 3. Validación de Stock

**Mecanismo:**
- Antes de registrar, verificar stock suficiente en origen
- Si no hay stock suficiente, rechazar con mensaje claro
- Opcional: Permitir registrar con stock negativo (ajuste) si usuario confirma

### 4. Sincronización con ADM

**Mecanismo:**
- `StockProductoADM` se actualiza desde sync (no desde registro manual)
- `StockUbicacion` se actualiza desde registro manual (no desde sync)
- Son sistemas independientes que coexisten

**No hay conflicto porque:**
- Sync actualiza cache ADM (`StockProductoADM`)
- Registro manual actualiza stock físico WMS (`StockUbicacion`)
- Ambos pueden estar desincronizados temporalmente (normal)

---

## 📊 FLUJO DE DATOS PROPUESTO

### Escenario: Transferencia ADESA → Mirador Sur (3 unidades de SKU "ABC-123")

```
1. ADM Cloud:
   - Transferencia creada: DocID "00000231"
   - LocationID (ADESA) → ReceptionLocationID (Mirador Sur)
   - Items: [{"ItemSKU": "ABC-123", "Quantity": 3}]

2. Sync ADM → WMS (automático, periódico):
   - Actualiza StockProductoADM:
     * ADESA: Stock baja 3 unidades
     * Mirador Sur: Stock sube 3 unidades
   - NO toca StockUbicacion (stock físico WMS)

3. Usuario busca en WMS:
   - GET /api/transferencias/buscar?docid=00000231
   - Sistema muestra: "ADESA → Mirador Sur, 3 unidades ABC-123"
   - Estado: PENDIENTE (no procesada aún)

4. Usuario registra en WMS:
   - POST /api/transferencias/registrar
   - Sistema:
     a. Verifica que no esté procesada (idempotencia)
     b. Crea TransferenciaProcesada (estado: PROCESADA)
     c. Crea Movimiento tipo TRANSFER:
        * ubicacion_origen: "ADESA" (o ubicación física mapeada)
        * ubicacion_destino: "Mirador Sur" (o ubicación física mapeada)
        * cantidad: 3
     d. Actualiza StockUbicacion:
        * Origen: resta 3
        * Destino: suma 3
     e. Retorna éxito

5. Resultado:
   - StockProductoADM: Ya reflejaba el cambio (desde sync)
   - StockUbicacion: Ahora refleja el cambio (desde registro manual)
   - Movimiento: Queda registrado para trazabilidad
   - TransferenciaProcesada: Previene duplicaciones futuras
```

---

## 🎯 RECOMENDACIONES FINALES

### Implementación Inmediata (Fase 1 - MVP)

1. **Tabla `TransferenciaProcesada`** - Control de idempotencia
2. **Endpoint `/api/transferencias/registrar`** - Procesamiento manual
3. **Actualización de `StockUbicacion`** - Aplicar transferencia en stock físico
4. **UI de registro** - Botón y formulario en `transferencias.html`

### Consideraciones Importantes

1. **No modificar sync existente:** El sync debe seguir funcionando igual, solo actualizando `StockProductoADM`
2. **Separación clara:** `StockProductoADM` (cache ADM) vs `StockUbicacion` (stock físico WMS)
3. **Trazabilidad completa:** Todo movimiento debe quedar en `Movimiento` con tipo `TRANSFER`
4. **Validaciones robustas:** Verificar stock, prevenir duplicaciones, manejar errores

### Próximos Pasos

1. ✅ Revisar y aprobar este plan
2. ✅ Crear migración de BD para `TransferenciaProcesada`
3. ✅ Implementar Fase 1 (MVP)
4. ✅ Probar con transferencias reales
5. ✅ Iterar según feedback

---

## ❓ PREGUNTAS A RESOLVER

1. **Mapeo de ubicaciones:** ¿Las ubicaciones ADM tienen equivalente físico directo o siempre será manual?
2. **Stock negativo:** ¿Permitir registrar transferencias aunque el origen no tenga stock suficiente?
3. **Notificaciones:** ¿Alertar al usuario si hay transferencias pendientes de procesar?
4. **Historial:** ¿Qué información debe mostrar el historial de transferencias procesadas?

---

**Documento preparado por:** Sistema de Análisis Técnico  
**Fecha:** 2026-01-19  
**Versión:** 1.0




