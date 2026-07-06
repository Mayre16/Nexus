# Plan Maestro — Módulo 0: Modelo de Datos y Fundamentos
## Rediseño del WMS (versión funcional y consistente)

> **Cómo leer este documento**
>
> Esto es un diseño desde cero del modelo de datos, tomando la *esencia funcional* del WMS
> actual y corrigiendo sus inconsistencias estructurales. No es código todavía: es la base
> sobre la que se apoyan todos los módulos siguientes.
>
> - **`POR CONFIRMAR`** marca todo lo que depende de la API de ADM Cloud o de tu repositorio
>   de endpoints. Eso se valida en tu PC con Claude Code, contra los endpoints reales. Aquí no
>   los tengo, así que no invento su forma exacta.
> - **`DECISIÓN OPERATIVA`** marca lo que necesita tu criterio del almacén, no el mío.
> - Soy un modelo de lenguaje razonando con patrones de WMS, no un ingeniero con años de campo.
>   Donde algo sea criterio y no hecho, lo digo en vez de fingir autoridad.

---

## ⚠️ Restricciones de entorno (cPanel) — condicionan TODO el diseño

El WMS corre en hosting compartido cPanel, no en un servidor con acceso libre. Esto no es un detalle
de despliegue: condiciona el modelo de datos y el diseño de procesos.

- **Runtime:** Python 3.11.15 sobre Passenger (WSGI). Arranque por `passenger_wsgi.py`, entrypoint `application`.
- **Sin consola / sin SSH.** No hay terminal. Todo lo que normalmente se hace por línea de comandos
  —migraciones, seeds, reconstrucción de stock, mantenimiento— debe poder dispararse como un **script `.py`**
  desde la herramienta "Ejecutar script python" de cPanel (acepta rutas tipo `manage.py migrate`).
  **Ningún paso del diseño puede asumir consola.**
- **Timeout de peticiones/scripts:** estimado ~120 s (**POR CONFIRMAR** con el proveedor). Cualquier proceso
  que pueda superarlo se corta a la mitad.
- **Cron incierto.** cPanel suele incluir "Cron Jobs", pero está sin confirmar si está disponible aquí
  (**POR CONFIRMAR**). El diseño **no debe depender** de cron: los procesos largos deben poder empujarse
  también a mano desde el botón.
- **Pooling de MySQL delicado** (origen de los errores "packet sequence wrong" del sistema actual). La capa
  de datos debe tolerar que el servidor cierre conexiones inactivas.

---

## Estrategia: reconstrucción incremental, NO greenfield

Decisión de enfoque (aplica a todos los módulos): **no se parte de una hoja en blanco ignorando el sistema
actual, ni se parchea el sistema actual en su sitio.** Se reconstruye sobre un modelo de datos limpio, pero
**el sistema actual es la especificación**: su código encierra las reglas de negocio reales y los casos límite
ya resueltos (las "Reglas de Oro", el despacho parcial, las facturas multi-ubicación, las discrepancias).
Se reescribe módulo por módulo, migrando datos, aplicando los estándares de `DEVELOPMENT.md` y `SECURITY.md`
al código **nuevo**. El sistema viejo sigue vivo hasta que el nuevo lo reemplaza por partes.

- *Por qué no greenfield puro:* tirar el sistema actual obliga a redescubrir a los golpes los casos límite
  que ya costó años resolver.
- *Por qué no parchear en sitio:* la raíz del problema es el modelo de datos; pulir sobre un cimiento
  agrietado no elimina las inconsistencias.
- *Sobre seguridad:* rehacer no arregla la seguridad por sí solo. Lo que la arregla es aplicar S1–S13 al
  código que se construya. El enfoque y la seguridad son decisiones independientes.

---

## 0. Por qué el modelo de datos va primero

Si rediseñamos la sincronización (o cualquier módulo) sobre el modelo de datos viejo, arrastramos
las inconsistencias que justamente queremos eliminar. El modelo es el cimiento: las reglas de
integridad que definamos aquí son las que harán imposible —a nivel de datos— que el stock quede
negativo, que un documento se procese dos veces, o que el inventario físico y el contable se
confundan. Esas garantías no se pueden "añadir después"; nacen del diseño de las tablas.

---

## 1. Diagnóstico del modelo actual (qué falla y por qué)

El sistema actual tiene 19 tablas. Estos son los problemas estructurales que veo:

1. **Tres tablas paralelas para lo mismo.** `facturas_procesadas`, `recepciones_procesadas` y
   `transferencias_procesadas` son el mismo concepto: "un documento de ADM que el WMS procesó",
   con la misma forma (DocID, tipo, estado, fechas). Mantener tres tablas casi idénticas multiplica
   el código y los bugs.

2. **El stock es una tabla mutable independiente del historial.** `stock_por_ubicacion` se actualiza
   "a mano" en cada operación, separada de `movimientos`. Ese es el origen clásico de stock negativo,
   stock que no cuadra con el historial, y discrepancias internas: si una operación actualiza el stock
   pero no el movimiento (o al revés), quedan desincronizados y nadie sabe cuál creer.

3. **Frontera difusa entre el mundo ADM y el mundo WMS.** El stock físico del WMS y el stock "espejo"
   de ADM conviven sin una separación dura. Es fácil confundir cuál es la fuente de verdad de qué.

4. **Tres tablas de "cosas que requieren atención" sin patrón común.** `discrepancias`, `en_revision`
   y `pendientes_ubicacion` resuelven variantes del mismo problema (excepciones que un humano debe
   mirar) con estructuras distintas.

5. **Umbrales de negocio incrustados en código.** Los límites de discrepancia (">500% o >100 unidades")
   viven en la lógica, no en configuración. Cambiarlos exige tocar código y redesplegar.

6. **Bloqueo de sincronización frágil.** `scheduler_lock` no contempla bien el caso de un proceso que
   muere a mitad de sincronización: el lock puede quedar tomado para siempre y bloquear futuras syncs.

7. **Sin nivel de línea en los documentos.** El despacho parcial ("EN_PROCESO") necesita saber cuánto
   de *cada línea* del documento ya se cumplió. Sin una tabla de líneas de documento, ese control es
   frágil.

---

## 2. Principios de diseño del nuevo modelo

Estas son las decisiones de fondo. Todo lo demás se deriva de aquí.

### P1 — El libro mayor de movimientos es la única fuente de verdad del stock físico
`movimientos` es un registro **append-only** (solo se agrega, nunca se edita ni se borra). Cada
RECEIPT, PICK, TRANSFER y ADJUSTMENT es un asiento inmutable. Si algo se corrige, se agrega un
movimiento de corrección, no se modifica el original. Esto da trazabilidad real y hace que el stock
sea siempre reconstruible.

### P2 — El stock por ubicación es DERIVADO, no autoritativo
`stock_ubicacion` es una tabla **materializada** (una caché de saldos para consultar rápido), pero su
verdad vive en el libro mayor. Se actualiza **en la misma transacción** que el movimiento que la causa,
y debe poder **reconstruirse desde cero** sumando los movimientos. Si alguna vez no cuadra con el
libro mayor, el libro mayor gana. Este es el cambio más importante del rediseño.

### P3 — Frontera dura entre "espejo de ADM" y "propiedad del WMS"
Las tablas se separan en dos mundos claramente nombrados:
- **Espejo de ADM (`adm_*`):** caché de solo lectura. El WMS nunca las trata como verdad física;
  son lo que ADM *dice*. Se llenan solo por sincronización.
- **Propiedad del WMS:** la verdad sobre la ubicación física real. El WMS las posee y las modifica.

La reconciliación entre ambos mundos ocurre **solo** a través de la tabla de discrepancias. Nunca se
mezclan en silencio.

### P4 — Un solo modelo de documentos de ADM
Una tabla `documentos_procesados` con un campo `tipo` (RECEPCION, FACTURA, TRANSFERENCIA, NOTA_CREDITO…)
reemplaza las tres tablas paralelas. Su detalle vive en `documento_lineas`.

### P5 — Parámetros operativos en configuración, no en código
Umbrales de discrepancia, tamaños de lote de sincronización, tiempos de espera, etc., viven en una
tabla `config` (o en políticas), no incrustados en la lógica.

### P6 — Bloqueos con expiración (a prueba de procesos caídos)
El lock de sincronización lleva un `expira_en` y un `heartbeat`. Si el proceso muere, el lock caduca
solo y no bloquea para siempre. (Alternativa: lock nativo de MySQL con `GET_LOCK`. **POR CONFIRMAR**
según lo que permita cPanel.)

### P7 — Un patrón único de excepciones
`discrepancias`, `en_revision` y `pendientes_ubicacion` se unifican (o se alinean) bajo un patrón común
"excepción que requiere atención": tipo, severidad, estado (pendiente/revisado/resuelto/ignorado),
SKU/ubicación afectados, y notas. Menos tablas, una sola pantalla mental.

### P8 — Tiempo en UTC e identidad estable de producto
Todo timestamp se guarda en UTC (se convierte solo al mostrar). Cada producto tiene una **clave interna
estable** del WMS; SKU, EAN y código de barras son atributos, no la llave primaria, porque pueden cambiar
o venir duplicados desde ADM. **POR CONFIRMAR:** qué identificador usa ADM como estable.

### P9 — Todo proceso largo debe ser troceable y reanudable
Por el timeout de cPanel, ningún proceso puede asumir que correrá hasta el final de una sola vez. En lugar
de "sincroniza los 5.000 productos", el diseño es "procesa el siguiente lote de N y guarda hasta dónde
llegaste". Cada invocación hace un trozo que cabe **holgado** dentro del timeout (~120 s POR CONFIRMAR),
registra su progreso (en `sync_runs` u homólogo), y la siguiente invocación retoma desde ahí. Aplica a:
sincronización con ADM, ajustes masivos por Excel, y reconstrucción del stock derivado. Debe funcionar
empujado por cron **o** a mano, indistintamente, ya que cron no está garantizado.

---

## 3. Cambios concretos: del modelo actual al nuevo

| Tablas actuales | En el nuevo modelo | Cambio |
|---|---|---|
| `facturas_procesadas`, `recepciones_procesadas`, `transferencias_procesadas` | `documentos_procesados` + `documento_lineas` | Se unifican en una con discriminador de tipo, y se añade nivel de línea para despacho parcial. |
| `movimientos` | `movimientos` (append-only) | Pasa a ser el libro mayor inmutable y única fuente de verdad. |
| `stock_por_ubicacion` | `stock_ubicacion` (derivado) | Deja de ser autoritativo; se recalcula desde el libro mayor. |
| `discrepancias`, `en_revision`, `pendientes_ubicacion` | `excepciones` (con `tipo`) | Se unifican bajo un patrón común de atención. |
| `productos_adm`, `stock_productos_adm`, `sync_locations_status` | `adm_productos`, `adm_stock`, `adm_sync_ubicacion` | Se renombran con prefijo `adm_` para marcar que son espejo de solo lectura. |
| `scheduler_lock` | `locks` (con expiración + heartbeat) | A prueba de procesos caídos. |
| `abastecimiento_politica` | `politicas_abastecimiento` | Igual en esencia; se le quitan los umbrales que ahora van a `config`. |
| `mapeo_ubicaciones_adm_wms` | `mapeo_ubicaciones` | Se mantiene; relación ADM↔WMS. |
| `notificaciones_config` | `notificaciones_config` | Se mantiene. |
| `audit_log` | `audit_log` (append-only) | Se mantiene; se refuerza como inmutable. |
| (no existe) | `config` | Nueva: parámetros operativos antes incrustados en código. |
| `usuarios` | `usuarios` + `roles` / `permisos` | Se separa rol de permiso para control fino (ver Módulo 7). |

---

## 4. Modelo de entidades propuesto

Agrupado por mundo. Para cada tabla: propósito y campos clave (el DDL completo va en su módulo).

### A. Núcleo WMS — la verdad física

**`movimientos`** *(libro mayor, append-only)*
Propósito: cada cambio de stock físico, inmutable.
Campos clave: `id`, `tipo` (RECEIPT/PICK/TRANSFER/ADJUSTMENT/CORRECTION), `producto_id`,
`ubicacion_origen_id` (nullable), `ubicacion_destino_id` (nullable), `cantidad`, `documento_id` (nullable),
`usuario_id`, `motivo`, `creado_en` (UTC). Sin columnas que se actualicen.

**`stock_ubicacion`** *(derivado/materializado)*
Propósito: saldo actual por producto+ubicación, para consulta rápida.
Campos clave: `producto_id`, `ubicacion_id`, `cantidad`, `actualizado_en`. PK compuesta
(`producto_id`, `ubicacion_id`). Regla: `cantidad >= 0` (CHECK). Se actualiza en la misma transacción
que el movimiento.

**`ubicaciones_fisicas`**
Propósito: catálogo de ubicaciones reales del almacén; fuente de validación de todo movimiento.
Campos clave: `id`, `codigo` (ej. A-01-02), `nombre`, `tipo` (pasillo/estante/zona…), `activa`.

**`productos`**
Propósito: identidad estable del producto en el WMS.
Campos clave: `id` (interno), `sku`, `ean`, `codigo_barras`, `nombre`, `activo`,
`adm_ref` (**POR CONFIRMAR:** el identificador con que ADM lo referencia).

### B. Espejo de ADM — caché de solo lectura

**`adm_productos`** — catálogo tal como ADM lo reporta. **POR CONFIRMAR** campos exactos.
**`adm_stock`** — stock por ubicación *contable* según ADM. **POR CONFIRMAR** forma.
**`adm_sync_ubicacion`** — estado de sincronización por ubicación ADM.

> Estas tablas nunca se editan a mano ni se usan como verdad física. Solo las llena la sincronización.

### C. Procesamiento de documentos

**`documentos_procesados`**
Propósito: control de cada documento de ADM que el WMS procesa (unifica las 3 tablas viejas).
Campos clave: `id`, `tipo` (RECEPCION/FACTURA/TRANSFERENCIA/NOTA_CREDITO/VENDOR_RECEPTION),
`adm_docid`, `estado` (PENDIENTE/EN_PROCESO/COMPLETO), `ubicacion_adm`, `afecta_stock_wms` (bool),
`creado_en`, `completado_en`.
Regla de idempotencia: **único por (`tipo`, `adm_docid`)** — no se procesa el mismo documento dos veces.

**`documento_lineas`**
Propósito: el detalle por producto, con control de cumplimiento parcial.
Campos clave: `id`, `documento_id`, `producto_id`, `cantidad_documento`, `cantidad_procesada`,
`ubicacion_fisica_id` (nullable hasta asignar). Habilita despacho/recepción parcial limpio.

### D. Reconciliación y excepciones

**`discrepancias`**
Propósito: diferencia entre stock ADM (espejo) y stock físico WMS.
Campos clave: `id`, `producto_id`, `ubicacion`, `stock_adm`, `stock_wms`, `severidad`
(derivada de `config`, no hardcodeada), `estado`, `detectada_en`, `resuelta_en`.

**`excepciones`** *(unifica `en_revision` + `pendientes_ubicacion`)*
Propósito: cualquier cosa que requiere atención humana y no es una discrepancia pura.
Campos clave: `id`, `tipo` (SIN_UBICACION/CAMBIO_ANOMALO/PRODUCTO_DESAPARECIDO…), `producto_id`,
`ubicacion` (nullable), `estado`, `nota`, `creada_en`.

### E. Sincronización (control)

**`sync_runs`** — historial de cada ejecución (estado, conteos, errores, inicio/fin). Se mantiene,
con el patrón de *staging* (run nuevo en área separada, se activa solo al completar).
**`locks`** — bloqueo con `nombre`, `tomado_por`, `tomado_en`, `expira_en`, `heartbeat`.

### F. Abastecimiento y mapeo

**`politicas_abastecimiento`** — mínimo/máximo por producto+ubicación; marca de "base de abastecimiento".
**`mapeo_ubicaciones`** — relación ADM (lógica) ↔ WMS (física), 1-a-muchos.

### G. Configuración

**`config`** *(nueva)*
Propósito: parámetros operativos antes incrustados en código.
Campos clave: `clave`, `valor`, `tipo` (int/float/bool/string), `descripcion`.
Ejemplos: `discrepancia_critica_pct=500`, `discrepancia_critica_unidades=100`,
`sync_lote_tamano=50`, `sync_reintentos_max`, `lock_expira_segundos`.

**`notificaciones_config`** — configuración de alertas por email. Se mantiene.

### H. Seguridad e identidad

**`usuarios`** — credenciales (hash bcrypt), estado, flag "forzar cambio de contraseña".
**`roles`** / **`permisos`** — separados, para control fino (el detalle en Módulo 7, S1).
**`audit_log`** *(append-only)* — acciones sensibles: quién, qué, cuándo, sobre qué.

---

## 5. Reglas de integridad (a nivel de datos y de transacción)

Estas son las garantías que el modelo debe imponer, no solo "recordar":

1. **Stock nunca negativo.** `CHECK (cantidad >= 0)` en `stock_ubicacion`, **más** validación dentro de
   la transacción antes de confirmar una salida. El CHECK es la última red.
2. **Movimiento y saldo en la misma transacción.** Insertar en `movimientos` y actualizar
   `stock_ubicacion` ocurren juntos o no ocurren. Nunca uno sin el otro.
3. **Append-only real.** `movimientos` y `audit_log` no permiten UPDATE ni DELETE (por convención y,
   si el motor lo permite, por permisos/trigger). Las correcciones son nuevos asientos.
4. **Idempotencia de documentos.** Único por (`tipo`, `adm_docid`). Reprocesar el mismo documento no
   duplica stock.
5. **Integridad referencial.** Ningún movimiento ni línea apunta a una ubicación o producto inexistente
   (FK). Ninguna ubicación inventada (P de la "Regla de Oro" actual, ahora a nivel de datos).
6. **El stock derivado debe ser reconstruible.** Existe un proceso que recalcula `stock_ubicacion`
   sumando `movimientos`; el resultado debe coincidir. Si no coincide, es un bug a investigar, no a parchear.
7. **Reconciliación solo vía discrepancias.** El espejo `adm_*` y el stock WMS nunca se igualan en
   silencio; la diferencia se registra como discrepancia.

---

## 6. POR CONFIRMAR (contra tu repo de endpoints ADM, en tu PC)

- Identificador estable de producto en ADM (¿SKU? ¿ID interno? ¿ambos?) → define `productos.adm_ref`.
- Forma exacta del catálogo y del stock que devuelve ADM → define `adm_productos`, `adm_stock`.
- Catálogo de tipos de documento de ADM y sus nombres reales → valida el enum de `documentos_procesados.tipo`.
- Cómo identifica ADM sus ubicaciones contables → valida `mapeo_ubicaciones`.
- Si la API de ADM expone alguna marca de "última modificación" → permitiría sincronización incremental
  (no bajar todo cada vez). Hoy se baja el catálogo completo; esto podría ser una mejora grande.
- Límites reales de rate/paginación de la API → confirman `config.sync_lote_tamano` y la estrategia de reintentos.
- **Timeout real de cPanel** (¿120 s? ¿menos?) → define el tamaño de trozo de todos los procesos largos (P9).
- **Disponibilidad de Cron Jobs en cPanel** → si existe, los procesos largos se empujan solos; si no, hay
  que dispararlos a mano. El diseño soporta ambos, pero confirmarlo cambia la operación diaria.

---

## 7. Decisiones que necesitan tu criterio operativo

- **Unidad de medida.** El análisis no menciona UoM (unidad/caja/pallet). ¿El almacén maneja un producto
  en varias unidades, o siempre "unidades sueltas"? Si hay multi-UoM, el modelo necesita una capa más.
  `DECISIÓN OPERATIVA`.
- **Lotes / vencimiento / serie.** No aparece en el análisis. ¿Se rastrea caducidad o número de lote
  (alimentos, farmacia, etc.)? Si sí, `movimientos` y `stock_ubicacion` necesitan dimensión de lote.
  Esto cambia bastante el modelo, por eso pregunto temprano. `DECISIÓN OPERATIVA`.
- **Multi-almacén a futuro.** Hoy el WMS gestiona ADESA. ¿Habrá más almacenes físicos gestionados por
  este WMS? Si sí, conviene prever una dimensión `almacen` desde ahora. `DECISIÓN OPERATIVA`.
- **¿Stock derivado materializado o calculado al vuelo?** Recomiendo materializado (más rápido para el
  dashboard y consultas), pero implica el proceso de reconstrucción. Para un catálogo grande, vale la pena.

---

## 8. Cómo encaja con el kit (dominios que dispara este módulo)

- **D8 (Datos/Persistencia):** es el corazón de este módulo. Esquema, constraints, transacciones.
- **D13 (Estado/Concurrencia):** el lock con expiración, el staging de sync, la atomicidad movimiento↔saldo.
- **D20 (Configuración):** la tabla `config` y sacar los umbrales del código.
- **D21 (Tiempo):** todo en UTC.
- **S1 (Control de Acceso):** separación rol/permiso, qué rol puede disparar sync vs gestionar usuarios.
- **S5 (Datos sensibles):** hash de contraseñas, credenciales ADM en entorno.
- **S13 (Migraciones):** este modelo se materializa en migraciones versionadas con plan de rollback.

Al implementar cada tabla, el agente debe emitir el veredicto de los dominios que toque, según `AGENTS.md`.

---

## 9. Qué sigue

**Módulo 1 — Sincronización con ADM Cloud**, construido sobre este modelo: cómo se llenan las tablas
`adm_*`, el staging de `sync_runs`, el lock con expiración, la estrategia de reintentos y paginación, y
todos los `POR CONFIRMAR` resueltos contra tu repo de endpoints en la PC.

> **Principio del rediseño:** misma funcionalidad, pero con un modelo donde las inconsistencias del
> sistema viejo se vuelven *imposibles por diseño*, no "algo que hay que recordar no hacer".
