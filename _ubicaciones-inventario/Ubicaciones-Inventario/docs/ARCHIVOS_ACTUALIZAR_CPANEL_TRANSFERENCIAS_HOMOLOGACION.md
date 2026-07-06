# Archivos a actualizar en cPanel – Homologación Transferencias

Implementación: **Homologación del módulo Transferencias** con Despacho y Recepciones (estado por producto, registrar por línea, refrescar desde ADM).

---

## Archivos modificados (subir a cPanel)

Sube **estos archivos** desde tu proyecto local al servidor (manteniendo la misma ruta):

| # | Ruta en el proyecto | Acción |
|---|--------------------|--------|
| 1 | `utils/helpers.py` | Reemplazar |
| 2 | `routes/transferencias.py` | Reemplazar |
| 3 | `templates/transferencias.html` | Reemplazar |

---

## Resumen de cambios por archivo

- **utils/helpers.py**  
  - Nuevas funciones: `calcular_cantidad_asignada_transfer`, `calcular_cantidad_restante_transfer` (usadas por estado y registrar-linea).

- **routes/transferencias.py**  
  - Import de `UbicacionFisica`.  
  - `GET /api/transferencias/transferencia/<guid>/estado`: estado de la transferencia y por producto.  
  - `POST /api/transferencias/registrar-linea`: registrar una línea (un SKU) con asignaciones origen/destino.  
  - `POST /api/transferencias/transferencia/<guid>/refrescar`: refrescar datos desde ADM y actualizar productos/estado.  
  - En `buscar_transferencia` ya se actualizaba el estado según movimientos (PENDIENTE → EN_PROCESO → PROCESADA).

- **templates/transferencias.html**  
  - Badge de estado (PENDIENTE / EN_PROCESO / PROCESADA).  
  - Botón «Refrescar desde ADM».  
  - Llamada a la API de estado al cargar la transferencia.  
  - **Patrón expandido por producto (homologado con Recepciones/Despacho):**  
    - Varias filas visibles de **ubicación + cantidad** (origen y/o destino según sea ADESA).  
    - Botón **«+ Agregar otra ubicación origen»** cuando el origen es ADESA.  
    - Botón **«+ Agregar otra ubicación destino»** cuando el destino es ADESA.  
    - Bloque unificado por producto: **Total asignado X / Y**, **Restante**, botón **Registrar** por producto.  
  - Productos reordenados (completados al final).  
  - Validación que permite registro parcial por línea.  
  - IDs seguros en DOM (`skuToSafeId`) y botones con `data-sku` para SKUs con caracteres especiales.

---

## Qué esperar después de actualizar

1. **Al buscar una transferencia por DocID**  
   - Se muestra el **estado** (PENDIENTE / EN_PROCESO / PROCESADA) en cabecera.  
   - Por cada producto: **varias filas** de ubicación + cantidad (origen y/o destino si son ADESA), **Total asignado X / Y**, **Restante**, botón **Registrar** por producto y **«+ Agregar otra ubicación»** (origen y/o destino).

2. **Registrar por línea**  
   - El usuario completa una o varias filas de ubicación + cantidad por producto y pulsa **Registrar** en ese producto.  
   - Se puede completar producto por producto; se permite registro parcial (ej. 5 de 10 unidades).

3. **Refrescar desde ADM**  
   - El botón **«Refrescar desde ADM»** vuelve a traer la transferencia desde ADM Cloud y actualiza lista de productos y estado en pantalla.

4. **Orden de productos**  
   - Los productos con línea **completa** aparecen al final; los pendientes, primero.

---

## Cómo implementar correctamente en cPanel

1. **Backup**  
   - Descarga copia de `utils/helpers.py`, `routes/transferencias.py` y `templates/transferencias.html` desde cPanel (Administrador de archivos o FTP) antes de sobrescribir.

2. **Subir archivos**  
   - Sube los 3 archivos desde tu entorno local a las mismas rutas en el servidor.  
   - Ejemplo típico en cPanel:  
     - `utils/helpers.py`  
     - `routes/transferencias.py`  
     - `templates/transferencias.html`

3. **Permisos**  
   - Mantén los mismos permisos que el resto del proyecto (por ejemplo 644 para archivos).

4. **Probar en producción**  
   - Entra al módulo **Transferencias**.  
   - Busca una transferencia por DocID.  
   - Comprueba: badge de estado, «Total asignado» por producto, botón «Registrar» por línea y botón «Refrescar desde ADM».  
   - Prueba registrar una línea y, si aplica, refrescar.

5. **Si usas caché o CDN**  
   - Limpia caché del navegador (Ctrl+F5) o la caché del sitio en cPanel para que cargue el nuevo `transferencias.html`.

6. **Dependencias**  
   - No se añadieron paquetes nuevos; solo se usan Flask, BD y API ADM ya existentes. No hace falta `pip install` extra si el entorno ya estaba correcto.

---

## Endpoints nuevos (referencia)

- `GET /api/transferencias/transferencia/<transferencia_guid>/estado` – Estado de la transferencia y por producto.  
- `POST /api/transferencias/registrar-linea` – Body: `{ "transferencia_guid", "sku", "asignaciones_origen", "asignaciones_destino" }`.  
- `POST /api/transferencias/transferencia/<transferencia_guid>/refrescar` – Refresca desde ADM (sin body obligatorio).

Sesión autenticada requerida en los tres.
