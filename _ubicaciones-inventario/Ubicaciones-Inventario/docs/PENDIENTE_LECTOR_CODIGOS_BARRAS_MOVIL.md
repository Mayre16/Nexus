# Lector de códigos de barras para móvil

**Estado:** Implementado en **Productos**, **Ajustes**, **Despacho**, **Recepciones** y **Transferencias** (campos de ubicación física + búsqueda producto donde aplica).  
**Fecha de registro:** 2026-03-13  
**Prioridad:** UX móvil general del WMS

---

## Descripción

Permitir que, desde un teléfono normal con Chrome, el usuario pueda activar la cámara del dispositivo para escanear códigos de barras o códigos de ubicación, insertando automáticamente el valor leído en el campo activo del formulario.

## Caso de uso principal

1. El despachador entra al flujo de despacho, recepción o transferencia.
2. El sistema espera una ubicación origen o destino.
3. El usuario toca el campo correspondiente.
4. Se abre la cámara del teléfono.
5. Se escanea un código (ej: `1L1AN1`).
6. El valor se inserta en el campo activo.
7. El sistema valida si la ubicación corresponde con la esperada.

## Campos candidatos para escaneo

| Módulo | Campos |
|--------|--------|
| Despacho | Ubicación origen por producto |
| Recepciones | Ubicación destino por producto |
| Transferencias | Ubicación origen, ubicación destino |
| Ajustes | Ubicación física, búsqueda por código de barras |
| Productos | Búsqueda por código de barras |

## Evaluación técnica

- **Viabilidad:** Alta — los inputs son HTML estándar, la validación backend ya existe, no hay frameworks de UI que interfieran.
- **Implementación actual:** `static/js/wms-barcode.js` + `html5-qrcode@2.3.8` (CDN), botón 📷 en búsqueda de producto (**Productos**, **Ajustes**) y en filas de **ubicación** (**Despacho**, **Recepciones**, **Transferencias**).
- **UI:** El botón 📷 usa la clase `.wms-btn-scan` y **solo se muestra en pantallas ≤768px** (`wms.css`), para no confundir en escritorio.
- **Despacho / Recepciones / Transferencias:** botón 📷 junto a cada fila de **ubicación**; `abrirEscanerUbicacion('id')` en `wms-common.js` (normaliza a mayúsculas).
- **Requisito crítico:** HTTPS obligatorio para acceso a cámara (excepto localhost).
- **Impacto en arquitectura:** Mínimo — capa adicional sobre los inputs existentes.

## Prerrequisito

**La experiencia móvil del WMS debe estar correctamente optimizada antes de implementar esta funcionalidad.** Los formularios, inputs, botones y flujos deben funcionar cómodamente en teléfono antes de agregar la capa de escaneo.

## Notas

- No se requiere app nativa; Chrome + HTTPS es suficiente.
- Puede servir como fase piloto antes de invertir en equipos handheld industriales.
- Los handhelds industriales con escáner láser también usan Chrome, por lo que el WMS optimizado para móvil beneficia ambos escenarios.
