# Endpoints de ADM Cloud para Probar ItemType

## 📋 Endpoints que Devuelven Documentos Completos con Items

Estos son los endpoints que el sistema **ya utiliza** y que devuelven documentos completos con sus Items. Debes probar estos para verificar si los Items incluyen el campo `ItemType`.

---

## 🚚 DESPACHOS

### 1. `GET /api/Dispatchs/{guid}`
- **Uso actual:** Obtener despacho completo para procesar picking
- **Ubicación en código:** `api/adm_cloud.py` línea 310
- **Método:** `obtener_dispatch_por_guid()`
- **Contiene Items:** ✅ SÍ
- **Prioridad:** 🔴 ALTA (más usado en despachos)

---

## 📦 RECEPCIONES

### 2. `GET /api/Receptions/{guid}`
- **Uso actual:** Obtener recepción completa para registrar recepción
- **Ubicación en código:** `api/adm_cloud.py` línea 398
- **Método:** `obtener_recepcion_por_guid()`
- **Contiene Items:** ✅ SÍ
- **Prioridad:** 🔴 ALTA (más usado en recepciones)

### 3. `GET /api/VendorReceptions/{guid}`
- **Uso actual:** Obtener compra con recepción (proveedor) completa
- **Ubicación en código:** `api/adm_cloud.py` línea 498
- **Método:** `obtener_vendor_recepcion_por_guid()`
- **Contiene Items:** ✅ SÍ
- **Prioridad:** 🟡 MEDIA (tipo específico de recepción)

### 4. `GET /api/CustomerCreditNotes/{guid}`
- **Uso actual:** Obtener nota de crédito (devolución cliente) completa
- **Ubicación en código:** `api/adm_cloud.py` línea 855
- **Método:** `obtener_credit_note_por_guid()`
- **Contiene Items:** ✅ SÍ
- **Prioridad:** 🟡 MEDIA (tipo específico de recepción)

---

## 💰 FACTURAS

### 5. `GET /api/CashInvoices/{guid}`
- **Uso actual:** Obtener factura de contado completa
- **Ubicación en código:** `api/adm_cloud.py` línea 655
- **Método:** `obtener_factura_por_guid()` (cuando tipo es 'CASH')
- **Contiene Items:** ✅ SÍ
- **Prioridad:** 🟢 BAJA (menos usado, principalmente para despachos)

### 6. `GET /api/CreditInvoices/{guid}`
- **Uso actual:** Obtener factura a crédito completa
- **Ubicación en código:** `api/adm_cloud.py` línea 657
- **Método:** `obtener_factura_por_guid()` (cuando tipo es 'CREDIT')
- **Contiene Items:** ✅ SÍ
- **Prioridad:** 🟢 BAJA (menos usado, principalmente para despachos)

### 7. `GET /api/SalesOrders/{guid}`
- **Uso actual:** Obtener pedido de venta completo
- **Ubicación en código:** `api/adm_cloud.py` línea 659
- **Método:** `obtener_factura_por_guid()` (cuando tipo es 'ORDER')
- **Contiene Items:** ✅ SÍ
- **Prioridad:** 🟢 BAJA (menos usado, principalmente para despachos)

---

## 🔄 TRANSFERENCIAS

### 8. `GET /api/LocationTransfers/{guid}`
- **Uso actual:** Obtener transferencia entre ubicaciones completa
- **Ubicación en código:** `api/adm_cloud.py` línea 583
- **Método:** `obtener_location_transfer_por_guid()`
- **Contiene Items:** ✅ SÍ
- **Prioridad:** 🟢 BAJA (módulo de transferencias)

---

## 📊 RESUMEN

### Endpoints Prioritarios (Probar Primero)

1. ✅ `GET /api/Dispatchs/{guid}` - **MÁS IMPORTANTE**
2. ✅ `GET /api/Receptions/{guid}` - **MÁS IMPORTANTE**
3. ✅ `GET /api/VendorReceptions/{guid}`
4. ✅ `GET /api/CustomerCreditNotes/{guid}`

### Endpoints Secundarios (Probar Después)

5. `GET /api/CashInvoices/{guid}`
6. `GET /api/CreditInvoices/{guid}`
7. `GET /api/SalesOrders/{guid}`
8. `GET /api/LocationTransfers/{guid}`

---

## 🎯 QUÉ VERIFICAR EN CADA ENDPOINT

Para cada endpoint, verificar:

1. ✅ **¿Los Items dentro del documento tienen campo `ItemType`?**
2. ✅ **¿Qué valores puede tener?** (probablemente "I", "S", "K")
3. ✅ **¿Todos los Items lo tienen o solo algunos?**
4. ✅ **¿Hay Items mixtos?** (Item + Kit + Service en el mismo documento)

---

## 📝 NOTA IMPORTANTE

Los endpoints de **listado** (como `GET /api/Dispatchs/`, `GET /api/Receptions/`) probablemente **NO incluyen los Items completos**, solo el resumen del documento. Por eso debes usar los endpoints con `/{guid}` que devuelven el documento completo.

---

**Fecha:** 2026-01-30
**Estado:** Lista para pruebas
