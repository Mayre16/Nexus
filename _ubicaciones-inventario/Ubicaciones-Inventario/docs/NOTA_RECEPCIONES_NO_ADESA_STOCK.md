# Recepciones NO-ADESA: ¿Dónde va el stock?

**Contexto:** Recepciones en ubicaciones como Mirador Sur (NO-ADESA) solicitan "ubicación" al registrar. El usuario escribe "Mirador Sur" o el nombre ADM.

---

## 1. ¿A dónde va ese stock?

Para recepciones **NO-ADESA**:

1. **Se crea un registro de auditoría** en la tabla `movimientos` (tipo RECEIPT):
   - `ubicacion_destino` = nombre de la ubicación ADM (ej: "MIRADOR SUR")
   - Sirve para trazabilidad y reportes

2. **NO se actualiza `StockUbicacion`** (inventario físico del WMS):
   - Por la Regla de Oro #4: solo se modifica `StockUbicacion` cuando ADESA está involucrado
   - El inventario real sigue en **ADM Cloud**, no en el WMS local

**En resumen:** El registro sirve como auditoría; el stock físico sigue en ADM.

---

## 2. Errores corregidos

| Problema | Causa | Corrección |
|----------|-------|------------|
| Error en consola con SKU tipo `4195033-L/XL` | El `/` en el ID rompe `querySelector` | Uso de IDs seguros (`skuToSafeId`) en elementos del DOM |
| "Ya asignado: 2.0" al registrar | Doble clic / doble envío | Bloqueo `registrandoLinea` mientras se procesa |
| Productos que "desaparecen" | Reorden al completar (completados al final) | Sin cambio; el comportamiento es esperado |
| Mensaje "Error de conexión" a pesar de guardar | Posible doble request o error en UI | El bloqueo de doble envío reduce las peticiones duplicadas |

---

## 3. Mensaje mejorado en la UI

Para recepciones NO-ADESA ahora se muestra:

> ℹ️ NO-ADESA: use el nombre de ubicación ADM (ej: Mirador Sur). Se guarda como auditoría; el inventario real sigue en ADM Cloud.
