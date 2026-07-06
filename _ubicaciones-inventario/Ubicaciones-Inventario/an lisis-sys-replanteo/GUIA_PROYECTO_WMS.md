# GUIA_PROYECTO_WMS.md — Punto de retorno
## Rediseño del WMS (ADESA ↔ ADM Cloud)

> **Para qué sirve este archivo.** Es el mapa del proyecto para retomarlo sin releer todo.
> Resume qué se decidió, por qué, qué está hecho, qué falta y cómo continuar.
> Cuando avancemos, este archivo se actualiza: es vivo.
>
> Última actualización: inicio del rediseño (Módulo 0 terminado).

---

## 1. Qué estamos haciendo y por qué

Rediseñar desde una base limpia el **WMS** (Sistema de Gestión de Almacenes) que hoy corre en
producción en `wms.adesa.com.do`. El sistema actual funciona pero tiene **inconsistencias de datos**
(stock que no cuadra) y **preocupaciones de seguridad**. La meta: misma funcionalidad, pero con las
fallas vueltas *imposibles por diseño*, no solo "algo que hay que recordar no hacer".

**Qué hace el WMS (su esencia):** ADM Cloud (el ERP) sabe qué se compró/vendió/transfirió; el WMS sabe
**dónde está físicamente cada producto en el almacén** y garantiza que cada movimiento quede trazado con
responsable, fecha y ubicación. Reconcilia el stock contable (ADM) con el físico (WMS) vía discrepancias.

---

## 2. Decisiones ya tomadas (no volver a discutir sin motivo)

| Tema | Decisión | Motivo |
|---|---|---|
| **Enfoque** | Reconstrucción **incremental**, no greenfield ni parche en sitio. El sistema viejo es la *especificación*. | Greenfield tira conocimiento de años; parchear no arregla la raíz (el modelo de datos). |
| **Orden** | Empezar por el **modelo de datos** (Módulo 0), luego sincronización, luego el resto. | Si se construye sobre el modelo viejo, se arrastran las inconsistencias. |
| **Stack** | Quedarse en **Python** (hoy 3.11.15 + Flask/WSGI). FastAPI descartado por el entorno. | La restricción de cPanel pesa más que el framework; los problemas no son del lenguaje. |
| **Formato del plan** | Un archivo `.md` **por módulo**, descargable. | Pedido del usuario; evita forzar todo en una sola tarea. |
| **Seguridad** | Se aplica `SECURITY.md` (S1–S13) al código **nuevo**, independientemente del enfoque. | Rehacer no arregla seguridad por sí solo. |

---

## 3. Restricciones de entorno (cPanel) — mandan sobre el diseño

- **Runtime:** Python 3.11.15, Passenger (WSGI), arranque `passenger_wsgi.py`, entrypoint `application`.
- **Sin consola / sin SSH.** Todo (migraciones, seeds, mantenimiento) debe dispararse como **script `.py`**
  desde "Ejecutar script python" de cPanel. Nada puede asumir terminal.
- **Timeout ~120 s** (POR CONFIRMAR). Procesos largos se cortan si lo superan.
- **Cron incierto** (POR CONFIRMAR si cPanel lo ofrece aquí). El diseño no depende de cron.
- **Pooling MySQL delicado** ("packet sequence wrong"). La capa de datos debe tolerar cierres de conexión.

**Consecuencia de diseño (P9):** todo proceso largo (sync, Excel masivo, reconstrucción de stock) debe ser
**troceable y reanudable** — "procesa el siguiente lote y guarda hasta dónde llegaste" — y funcionar tanto
por cron como a mano.

---

## 4. El sistema de trabajo (el "kit") — ya construido

Estos archivos gobiernan *cómo* se desarrolla, y ya están listos para copiarse al repo del proyecto:

| Archivo | Rol |
|---|---|
| `INICIO.md` | Instalación una sola vez: conecta el ancla a la herramienta, configura git/GitHub. |
| `AGENTS.md` | Ancla corta, siempre activa. Reglas mínimas + checkpoints. Lista dominios D1–D21 y S1–S13. |
| `DEVELOPMENT.md` | Manual de buenas prácticas (dominios D1–D21). Consulta bajo demanda. |
| `SECURITY.md` | Seguridad basada en OWASP (dominios S1–S13). Consulta bajo demanda. |
| `METODOLOGIA.md` | Explica la norma de trabajo (referencia humana). |
| `.gitignore` | Evita subir secretos y basura. |
| `.github/workflows/ci.yml` | CI de calidad: formato, lint, typecheck, pruebas. |
| `.github/workflows/security.yml` | CI de seguridad: secretos, dependencias, SAST. |
| `.github/pull_request_template.md` | Fuerza declarar veredictos de dominio en cada PR. |

**Convención de dominios:** desarrollo usa prefijo **D** (D1–D21, en `DEVELOPMENT.md`); seguridad usa
prefijo **S** (S1–S13, en `SECURITY.md`). Al emitir un veredicto se escribe el prefijo (`S5 APLICA`).

**Pendiente de activación (acción del usuario en GitHub):** para que los CI *bloqueen* el merge hay que
activar la protección de rama y marcar `ci` y `security` como checks obligatorios. Sin eso, solo avisan.

---

## 5. El plan maestro — módulos

Estado: **M0 hecho**, el resto pendiente. Orden sujeto a las decisiones operativas del punto 7.

| Módulo | Contenido | Estado |
|---|---|---|
| **M0 — Modelo de datos y fundamentos** | Esquema nuevo, reglas de integridad, principios P1–P9. | ✅ Hecho (`PLAN_MAESTRO_M0_MODELO_DATOS.md`) |
| **M1 — Sincronización con ADM Cloud** | Llenado de tablas `adm_*`, staging, lock con expiración, reintentos, paginación. Concentra los POR CONFIRMAR. | ⬜ Pendiente |
| **M2 — Recepciones** | Entrada de mercancía, asignación de ubicación. | ⬜ Pendiente |
| **M3 — Despacho / Picking** | Salida por factura, despacho parcial, multi-ubicación. | ⬜ Pendiente |
| **M4 — Transferencias y Ajustes** | Movimientos entre ubicaciones, ajustes (incl. Excel masivo). | ⬜ Pendiente |
| **M5 — Discrepancias y reconciliación** | Detección, severidad configurable, excepciones. | ⬜ Pendiente |
| **M6 — Abastecimiento (mín/máx)** | Políticas, reporte de reposición. | ⬜ Pendiente |
| **M7 — Auth, roles y seguridad** | Usuarios, separación rol/permiso, sesiones, CSRF, rate limiting. | ⬜ Pendiente |
| **M8 — Observabilidad, despliegue y operación** | Logs, healthcheck, operación sin consola, scripts de mantenimiento. | ⬜ Pendiente |

---

## 6. Lo más importante del Módulo 0 (resumen de una mirada)

El cambio central que elimina las inconsistencias:

- **El libro de `movimientos` es la única fuente de verdad del stock físico** (append-only, inmutable).
- **El stock por ubicación es DERIVADO** — se recalcula desde el libro y se actualiza en la misma transacción
  que el movimiento. Si no cuadra, el libro gana.
- **Frontera dura** entre el espejo de ADM (`adm_*`, solo lectura) y la verdad física del WMS.
- **Una sola tabla de documentos** (con tipo + líneas) reemplaza las tres tablas paralelas.
- **Umbrales y parámetros en una tabla `config`**, no en código.
- **Idempotencia:** un documento de ADM no se procesa dos veces.

Detalle completo en `PLAN_MAESTRO_M0_MODELO_DATOS.md`.

---

## 7. Pendientes que bloquean o cambian el diseño

**Decisiones operativas (las define el usuario — pueden cambiar el modelo):**
- ¿El almacén maneja **lotes / fechas de vencimiento / número de serie**? Si sí, el modelo de stock cambia.
- ¿Hay **unidades de medida** más allá de "unidad suelta" (caja, pallet)? Si sí, hace falta una capa de UoM.
- ¿Habrá **multi-almacén** a futuro (más almacenes físicos gestionados por este WMS)?

**Por confirmar contra la API de ADM (en la PC, con Claude Code y el repo de endpoints):**
- Identificador estable de producto en ADM.
- Forma exacta del catálogo y del stock que devuelve ADM.
- Catálogo real de tipos de documento.
- Si ADM expone "última modificación" → habilitaría sincronización incremental (mejora grande).
- Límites de rate/paginación de la API.

**Por confirmar del entorno:**
- Timeout exacto de cPanel.
- Disponibilidad de Cron Jobs.

---

## 8. Cómo retomar (dónde se hace cada cosa)

- **Diseño y plan (aquí, en el chat web):** pensar la arquitectura, escribir los módulos del plan. No hay
  acceso al código ni a la API de ADM, así que esas partes quedan como `POR CONFIRMAR`.
- **Verificación y construcción (Claude Code, en la PC):** ahí se ve el repo real, el código actual como
  especificación, y el repo de endpoints de ADM. Ahí se resuelven los `POR CONFIRMAR` y se escribe el código,
  cada tarea pasando por los checkpoints de `AGENTS.md`.

**Siguiente paso sugerido:** resolver las decisiones operativas del punto 7 (sobre todo lotes y unidad de
medida, porque cambian el modelo) y luego armar el **Módulo 1 — Sincronización con ADM**.

---

> **Recordatorio honesto:** nada de esto está probado todavía en un proyecto real. Es diseño sólido sobre el
> papel. La validación llega cuando se corra en la PC contra el código y la API reales. Las primeras grietas
> aparecerán ahí, y ahí se ajusta.
