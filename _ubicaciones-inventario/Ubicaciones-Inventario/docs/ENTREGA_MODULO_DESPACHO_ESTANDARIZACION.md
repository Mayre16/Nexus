# Entrega: Módulo Despacho — Estandarización WMS

**Fecha:** 17 de febrero de 2026  
**Sprint:** Módulo 1 — Despacho  
**Estado:** ✅ Completado

---

## 1. Diagnóstico del módulo actual

### Cómo funciona hoy (backend + frontend)

- **Backend:** `routes/despachos.py`, `routes/despacho.py`
  - Búsqueda por DocID → crea/actualiza `FacturaProcesada`
  - Registro por línea: `POST /api/despacho/registrar` (factura_guid, sku, ubicacion, cantidad)
  - Revertir: `POST /api/despacho/{guid}/revertir` (solo admin)
  - Refrescar: `POST /api/despacho/{guid}/refrescar` (solo admin si hay movimientos)

- **Frontend:** `templates/despacho.html`
  - Buscador → cabecera documento → barra acciones admin → grid de productos
  - Cada producto tiene acción "Registrar" por línea
  - Indicadores: Solicitado / Despachado / Pendiente

### Qué cumple del estándar

| Criterio | Estado |
|----------|--------|
| Persistencia al cargar | ✅ |
| Trabajo por línea | ✅ |
| Múltiples ubicaciones por línea | ✅ |
| Revertir (solo admin) | ✅ |
| Refrescar desde ADM | ✅ |
| Estructura visual (buscador, cabecera, acciones, tarjetas) | ✅ |

### Qué no cumplía (corregido en esta entrega)

| Criterio | Estado anterior | Estado actual |
|----------|-----------------|---------------|
| Reordenar completados al final | ❌ | ✅ |
| Fallback tipo documento (evitar "undefined") | ❌ | ✅ |

---

## 2. Plan de cambios ejecutado

### Cambios backend
- **Ninguno.** Todas las modificaciones son frontend.

### Cambios frontend
1. Reordenar productos en `mostrarProductos()`: pendientes primero, completados al final.
2. Fallback para `tipo_factura` cuando es `undefined` o no está mapeado: mostrar "Documento".
3. Unificar `tipoNombres` en vista historial con los mismos valores que en vista búsqueda.

### Cambios de modelo/BD
- **Ninguno.**

### Lógica eliminada
- **Ninguna.** Solo se añadió lógica nueva.

---

## 3. Implementación detallada

### Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `templates/despacho.html` | 4 ediciones (ver abajo) |

### Cambios concretos

#### 3.1 Reordenar líneas completadas al final

**Ubicación:** `mostrarProductos()` (aprox. líneas 920-935)

**Qué se añadió:**
```javascript
// Reordenar: pendientes primero, completados al final
const productosOrdenados = [...productos].sort((a, b) => {
    const skuA = (a.SKU || a.ItemSKU || '').toUpperCase();
    const skuB = (b.SKU || b.ItemSKU || '').toUpperCase();
    const completoA = estadoProductos[skuA]?.completo ?? false;
    const completoB = estadoProductos[skuB]?.completo ?? false;
    if (completoA === completoB) return 0;
    return completoA ? 1 : -1;
});
```

**Comportamiento:** Antes de renderizar, se ordena la lista de productos: los que tienen `completo: false` van primero, los que tienen `completo: true` al final. El orden se recalcula tras cada pick (porque `mostrarProductos` se llama de nuevo).

#### 3.2 Corregir fallback tipo documento

**Ubicación 1:** `mostrarFactura()` (aprox. línea 827)
```javascript
// Antes
const tipoFactura = tipoNombres[factura.tipo_factura] || factura.tipo_factura;

// Después
const tipoFactura = tipoNombres[factura.tipo_factura] || factura.tipo_factura || 'Documento';
```

**Ubicación 2:** `mostrarDetallesDespacho()` (aprox. línea 577)
```javascript
// Antes
const tipoFactura = tipoNombres[despacho.tipo_factura] || despacho.tipo_factura;

// Después
const tipoFactura = tipoNombres[despacho.tipo_factura] || despacho.tipo_factura || 'Documento';
```

**Además:** Se amplió `tipoNombres` en la vista historial para incluir `CashInvoice`, `CreditInvoice`, `SalesOrder` (igual que en la vista de búsqueda).

**Comportamiento:** Si `tipo_factura` es `undefined`, `null` o no está en el mapa, se muestra "Documento" en lugar de "undefined".

---

## 4. Endpoints

- **Nuevos:** ninguno
- **Modificados:** ninguno
- **Eliminados:** ninguno

---

## 5. Modelos / tablas

- **Modificados:** ninguno
- **Migraciones:** ninguna

---

## 6. Riesgos y efectos secundarios

| Riesgo | Mitigación |
|--------|------------|
| Orden de productos distinto al original del documento | El orden visual es intencional (pendientes arriba). El orden lógico en BD no cambia. |
| `tipo_factura` con valor nuevo no mapeado | Se muestra "Documento" en lugar de "undefined". Si hace falta, se puede ampliar `tipoNombres`. |

**Efectos secundarios:** Ninguno detectado. Los cambios son solo de presentación.

---

## 7. Cómo probarlo

### 7.1 Reordenar completados al final

1. Buscar una factura con varios productos.
2. Registrar uno o más productos (completar líneas).
3. **Esperado:** Las líneas completadas pasan al final del listado.
4. Registrar otro producto.
5. **Esperado:** El reordenamiento se actualiza tras cada registro.

### 7.2 Fallback tipo documento

1. **Caso A:** Factura con `tipo_factura` conocido (CASH, CREDIT, DISPATCH, etc.) → debe mostrarse el nombre correcto (Contado, Crédito, Despacho/Conduce).
2. **Caso B:** Si en algún momento `tipo_factura` llega como `undefined` o valor no mapeado → debe mostrarse "Documento" en lugar de "undefined".
3. **Caso C:** Vista historial (desde `/despachos` con `?guid=...`) → mismo comportamiento.

### 7.3 UX estándar (validación)

1. **Estructura:** Buscador → Cabecera → Barra acciones admin → Grid productos → Acción por línea.
2. **Botones admin:** Refrescar y Revertir visibles cuando `ya_registrada`; Revertir solo para admin.
3. **Indicadores:** Solicitado / Despachado / Pendiente por producto.
4. **Mensajes:** Éxito/error coherentes.

---

## 8. Checklist final del módulo Despacho

| Ítem | Estado |
|------|--------|
| Reordenar completados al final | ✅ Listo |
| Corregir fallback tipo documento (undefined) | ✅ Listo |
| Validar UX estándar (estructura, botones, indicadores) | ✅ Listo |
| Persistencia al cargar | ✅ Ya cumplía |
| Trabajo por línea | ✅ Ya cumplía |
| Múltiples ubicaciones por línea | ✅ Ya cumplía |
| Revertir solo admin | ✅ Ya cumplía |
| Refrescar desde ADM | ✅ Ya cumplía |
| Migraciones BD | ❌ No aplica |
| Cambios en otros módulos | ❌ No aplica |

---

## 9. Resumen de entrega

| Concepto | Detalle |
|----------|---------|
| **Qué se quitó** | Nada |
| **Qué se reemplazó** | Orden de productos (de fijo a dinámico por estado) |
| **Qué se añadió** | Reordenamiento por completado; fallback "Documento" |
| **Impacto** | Solo visual/UX; sin cambios en backend ni BD |
| **Cómo probar** | Ver sección 7 |

---

**Módulo Despacho cerrado.** Listo para siguiente módulo: Recepción.
