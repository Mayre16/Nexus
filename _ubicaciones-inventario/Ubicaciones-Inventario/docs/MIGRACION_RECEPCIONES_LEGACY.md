# Migración: Recepciones legacy (movimientos antiguos en historial)

**Fecha:** 2026-02-25  
**Problema:** Tras la estandarización del módulo de Recepciones, los movimientos antiguos dejaron de aparecer en el Historial.

---

## 1. ¿Qué pasó?

El **historial de recepciones** se cambió para usar la tabla `RecepcionProcesada` como fuente (igual que Despacho usa `FacturaProcesada`). Esto permite:

- Ver documentos que se buscaron pero aún no están registrados
- Estados PENDIENTE / EN_PROCESO / COMPLETO
- Columna "Solicitado por"

**Problema:** `RecepcionProcesada` solo se llena cuando alguien **busca** una recepción en el módulo. Las recepciones procesadas **antes** de la estandarización:

- Tienen movimientos en `movimientos` (tipo RECEIPT)
- **No** tienen registro en `RecepcionProcesada`

Por eso no aparecen en el historial. No es un bug: es consecuencia de que la nueva tabla estaba vacía y solo se alimenta al buscar.

---

## 2. Solución: script de migración

Se creó el script `scripts/migrar_recepciones_legacy.py`, que:

1. Busca todos los movimientos RECEIPT cuya `factura_guid` **no** está en `RecepcionProcesada`
2. Por cada grupo, crea un registro en `RecepcionProcesada` con datos derivados:
   - GUID, DocID (o primeros 8 del GUID)
   - Tipo (RECEPTION, VEND_REC, CREDIT_NOTE) según notas
   - Fecha del primer movimiento
   - Estado COMPLETO (tienen movimientos = ya se registraron)
   - Usuario procesador del primer movimiento
   - Productos agregados por SKU
   - Ubicación ADM si se puede inferir de notas

3. Tras la migración, esos registros aparecen en el Historial de Recepciones.

---

## 3. Cómo ejecutar

### En local
```bash
python scripts/migrar_recepciones_legacy.py
```

### En cPanel
1. Ir a **Setup Python App** → **Execute Python script**
2. Ruta del script: `scripts/migrar_recepciones_legacy.py` (o la ruta completa según tu entorno)
3. Ejecutar

El script es **idempotente**: solo crea registros para recepciones que aún no están en `RecepcionProcesada`.

---

## 4. Limitaciones de los datos migrados

| Campo | Dato legacy |
|-------|-------------|
| Proveedor/Cliente | Suele ser "N/A" si no estaba en notas |
| Ubicación ADM | Se intenta inferir de notas (ej. "ADESA"); si no, N/A |
| Solicitado por | No disponible (se guarda usuario procesador) |

Los datos críticos (número, fecha, productos, cantidades, ubicaciones físicas, usuario) se obtienen de los movimientos.
