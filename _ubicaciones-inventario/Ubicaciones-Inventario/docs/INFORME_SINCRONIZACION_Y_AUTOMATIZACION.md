# Informe: Módulo de sincronización de productos y propuesta de automatización

## 1. Cómo funciona el módulo de sincronización

### 1.1 Tipos de sincronización

En el sistema hay **tres flujos** distintos:

| Flujo | Endpoint | Qué hace |
|-------|----------|----------|
| **Catálogo** | `POST /api/sincronizar/catalogo` | Actualiza nombres, SKU, código de barras de productos desde ADM. No toca stock. |
| **Stock por ubicación** | `POST /api/sincronizar/ubicacion/<location_id>` | Sincroniza stock de **una** ubicación (ADESA, MIRADOR SUR, etc.) desde ADM en una sola corrida. |
| **Lote / Continuar** | `POST /api/sincronizar/ubicacion/<location_id>/lote` o `/contar` | Conteo de productos o avance por lotes (cuando la ubicación tiene muchos ítems y se usa el flujo “Continuar Lote”). |

El flujo que define “una sincronización de productos” en la práctica es **stock por ubicación**: una llamada por ubicación que puede ser **completa** o **parcial** según límites de tiempo y requests.

### 1.2 Qué hace una sincronización de ubicación (stock)

1. **Comprobar que no haya otra sync en curso para esa ubicación**  
   Si `estado_sync.status == 'running'` y hay `running_run_id` con run en “running” y con menos de 60 minutos, responde **409** y no inicia.

2. **Crear un `SyncRun`** (staging) y marcar la ubicación como `running` con ese `running_run_id`.

3. **Consultar ADM en lotes de 50 ítems** (`/api/Stock` con `ShowNoStock=true`), con **caps por ubicación**:
   - **ADESA:** máx. 800 requests, 25 min, 50 000 ítems.
   - **MIRADOR SUR:** máx. 300 requests, 15 min, 20 000 ítems.

4. **Salida del bucle** cuando:
   - La API devuelve menos de 50 ítems (fin natural), o
   - Se alcanza cap de requests, tiempo o ítems → **sync parcial** (guarda `skip_actual` para “Continuar Lote”).

5. **Solo si la sync fue completa:**
   - Aplica “productos desaparecidos” (stock → 0).
   - Valida NEW vs OLD, discrepancias, EnRevision, emails de discrepancias.

6. **Cerrar run:** `status = 'done'` o `'partial'`, enviar **email de estado** (si está activo), hacer **swap** NEW → LIVE (`current_run_id = nuevo_run.run_id`, `running_run_id = None`).

El bloqueo es **por ubicación**: no puede haber dos syncs a la vez para la **misma** ubicación; sí podría haber una sync de ADESA y otra de MIRADOR SUR en paralelo (cada una con su propio `estado_sync`).

---

## 2. Qué debe hacer el usuario para ejecutar una sincronización

### 2.1 Pasos manuales (hoy)

1. Entrar al **Panel de administración** (usuario admin).
2. Ir a la sección **“Sincronización de productos”** (o equivalente donde se listan ubicaciones).
3. Opcional: **Sincronizar catálogo** (`POST /api/sincronizar/catalogo`) para tener productos/SKU actualizados.
4. Para **cada ubicación** que quiera actualizar:
   - Si está en “Pendiente” o “Pausada” con total conocido: puede usar **“Re-sincronizar”** o **“Continuar Lote”**.
   - Clic en el botón que llama a `POST /api/sincronizar/ubicacion/<location_id>` (o al endpoint de lote).
5. La petición HTTP **permanece abierta** hasta que termina la sync (varios minutos). El frontend muestra “Sincronizando...” y al recibir la respuesta muestra éxito o error y recarga la lista.

### 2.2 Qué debe esperar el usuario

- **Tiempo:** según ubicación y caps, entre unos minutos y ~15–25 minutos por ubicación.
- **Respuesta:** al terminar, el servidor devuelve JSON con `success`, `items_synced`, `items_cero_synced`, `sync_completa`, `status`, etc.
- **Riesgo de timeout en el navegador:** la petición es síncrona y puede durar mucho; el navegador o un proxy pueden cortar por timeout (p. ej. 2–5 min). En ese caso el usuario puede ver error de conexión aunque la sync **sí terminó en el servidor**.
- **Emails:** si está activo el email de estado, al finalizar (o al fallar) recibe un correo con el resumen.
- **Prioridad sugerida en la UI:** ADESA primero, luego MIRADOR SUR, luego el resto (solo orden visual; el backend no encola por prioridad).

---

## 3. Automatización: tu idea vs análisis y propuesta

### 3.1 Tu idea (resumen)

- Que el sistema “note” cuando un proceso inicia y, antes de terminar, deje un “mensaje” para que un cron se active.
- A los 2 minutos el cron inicie **otra** actualización (por ejemplo la siguiente ubicación o la misma si quedó parcial).
- Objetivo: evitar timeout y encadenar syncs sin solapamiento.

### 3.2 Análisis

- **Problema real:**  
  - Timeout: la petición HTTP del usuario puede cortarse; la sync en el servidor sigue hasta el final.  
  - Encadenar: hoy no hay “una sola tarea que recorra todas las ubicaciones”; cada sync se dispara por una llamada a una ubicación.
- **Bloqueo actual:**  
  - Solo se evita **dos syncs simultáneas para la misma ubicación**. No hay bloqueo global “solo una sync en todo el sistema”.
- **“Mensaje para que se active un cron”:**  
  - Implementable por ejemplo con un archivo “flag”, una fila en BD o un job en cola. El cron cada 2 min podría leer “¿hay que lanzar la siguiente?” y, si no hay ninguna sync en curso para la ubicación elegida, lanzar la siguiente.

### 3.3 Opciones de automatización

#### Opción A – Cron único a una hora fija (ej. 2:00)

- **Qué hace:** A una hora fija (p. ej. 2:00), un cron ejecuta un script que:
  - Llama en secuencia a `POST /api/sincronizar/ubicacion/<id1>`, luego `<id2>`, etc., en el orden de prioridad (ADESA, MIRADOR SUR, …).
- **Ventajas:** Muy simple, sin cambios en la app, sin colas. Respeta “una sync por ubicación” porque cada llamada es bloqueante.
- **Desventajas:** Si una ubicación tarda 25 min, la siguiente empieza después; el cron debe poder ejecutar mucho rato (o ser un worker de larga duración). Si el cron tiene límite de tiempo (p. ej. 5 min en cPanel), no sirve tal cual.

#### Opción B – Cron cada N minutos + cola en BD (tu idea refinada)

- **Qué hace:**  
  - Una tabla o config “cola de sync” (ej. “hoy toca: ADESA, MIRADOR SUR”).  
  - Cron cada 2–5 min que:  
    1. Comprueba si hay alguna ubicación en estado `running` (para esa ubicación).  
    2. Si **no** hay sync en curso para la **siguiente** ubicación de la cola, hace **una** llamada HTTP a `POST /api/sincronizar/ubicacion/<siguiente>`.  
    3. No espera a que termine: hace la petición y el cron termina (o espera poco). La sync corre en el servidor web (Passenger, etc.) hasta el final.
- **“Mensaje”:** El “mensaje” es: “la cola dice que sigue ADESA; no hay running para ADESA → disparo ADESA”. Al terminar esa sync (en el servidor), la siguiente vez que el cron pase podría disparar MIRADOR SUR (si la cola está en “siguiente = MIRADOR SUR” y no está running).
- **Ventajas:** No bloqueas el cron mucho tiempo; evitas dos syncs simultáneas para la misma ubicación; puedes priorizar orden (ADESA primero, etc.).  
- **Desventajas:** Hay que definir “siguiente” (p. ej. por orden fijo o por “última completada”) y persistirlo (BD o fichero). Si el cron solo “dispara y sale”, no sabes cuándo terminó la anterior salvo consultando estado (polling a `/api/sincronizar/ubicacion/<id>/estado`).

#### Opción C – Cron que solo dispara la primera; el backend encadena

- **Qué hace:**  
  - Nuevo endpoint interno, p. ej. `POST /api/sincronizar/automatico` (protegido por token o solo localhost).  
  - Ese endpoint:  
    1. Mira si hay **alguna** ubicación en `running` (cualquiera). Si sí, responde “ya hay sync en curso” y no hace nada.  
    2. Si no, elige la “siguiente” (ej. ADESA → MIRADOR SUR → …) y lanza en **background** (thread o tarea asíncrona) la sync de esa ubicación.  
    3. Al terminar esa tarea (callback o al final del thread), si está configurado “encadenar”, vuelve a llamar a sí mismo o escribe en BD “siguiente = MIRADOR SUR” y opcionalmente deja un “flag” para que el cron, a los 2 min, llame de nuevo a `automatico` y dispare MIRADOR SUR.
- **Ventajas:** Un solo punto de lógica; el servidor puede encadenar sin depender de que el cron “adivine” cuándo terminó.  
- **Desventajas:** Requiere cambios en la app (nuevo endpoint, posiblemente ejecutar sync en thread o worker) y en hosting (que permita procesos en background o tareas largas).

### 3.4 Recomendación (qué es más viable)

- **Más viable con poco cambio:**  
  **Opción A** si el entorno permite un **script de cron de larga duración** (p. ej. 1–2 horas) que hace en secuencia:
  - `POST .../ubicacion/ADESA`
  - esperar respuesta (o hacer polling a `/api/sincronizar/ubicacion/<id>/estado` hasta `done` o `error`),
  - luego `POST .../ubicacion/MIRADOR_SUR`,
  - etc.  
  Así no tocas la app; solo cron + script que llama a los endpoints existentes.

- **Si el cron no puede correr más de 5–10 minutos:**  
  **Opción B**: cron cada 5 min que:
  1. Lee “siguiente ubicación” (config o BD).
  2. Comprueba si esa ubicación está `running` (GET estado).
  3. Si no está running, hace **una** petición POST a esa ubicación y sale (no espera el fin).  
  4. “Siguiente” se actualiza cuando alguien (otro cron o un job al terminar la sync) marca “esta ubicación terminó → siguiente = la otra”.  
  El “mensaje” que comentas puede ser: al terminar la sync (en el servidor), actualizar en BD “última_completada = ADESA” y “siguiente_en_cola = MIRADOR SUR”. El cron solo lee “siguiente” y “running” y dispara.

- **Más limpio a medio plazo:**  
  **Opción C** con endpoint `POST /api/sincronizar/automatico` que:
  - Comprueba bloqueo global (ninguna ubicación en `running`).
  - Elige siguiente por prioridad (ADESA, MIRADOR SUR, …).
  - Lanza la sync (en el mismo proceso o en background según lo que permita el hosting).
  - Opcional: al terminar, si hay más ubicaciones en la cola, vuelve a llamar a la lógica de “siguiente” o deja listo para que el cron en 2 min vuelva a llamar a `automatico`.  
  Así el “mensaje” es interno (estado en BD + posible flag); el cron solo hace “cada día a las 2:00” (y quizá cada 5 min hasta que no quede nada por hacer) una llamada a `automatico`.

### 3.5 Resumen de prioridades y timeouts

- **Timeouts:** Se evitan en el usuario si la sync **no** se dispara desde el navegador sino desde cron/script: la conexión larga es servidor↔ADM, no navegador↔servidor.
- **Prioridades:** Se respetan definiendo un orden fijo (ej. ADESA, MIRADOR SUR, …) y haciendo que el automático solo inicie la **siguiente** cuando la actual no esté `running`.
- **“No puede haber otro hasta que termine”:** Ya está garantizado **por ubicación**. Para “solo una sync en todo el sistema” haría falta comprobar, antes de iniciar cualquier sync automática, que **ninguna** ubicación tenga `status == 'running'` (bloqueo global opcional).

---

## 4. Resumen ejecutivo

| Tema | Resumen |
|------|--------|
| **Qué es “sincronización de productos”** | Sobre todo: sync de **stock por ubicación** (`POST /api/sincronizar/ubicacion/<id>`), con catálogo opcional por separado. |
| **Qué hace el usuario** | Entra al admin, abre sincronización, opcionalmente sync catálogo, luego por cada ubicación hace clic en Re-sincronizar (o Continuar Lote). La petición queda abierta hasta que termina. |
| **Qué esperar** | Varios minutos por ubicación; posible timeout en el navegador; email al final si está activo. |
| **Automatización más simple** | Cron a las 2:00 que ejecute un script que llame en secuencia a cada ubicación (prioridad ADESA → MIRADOR SUR → …), si el cron puede correr 1–2 h. |
| **Automatización si cron no puede durar mucho** | Cron cada 5 min que lea “siguiente ubicación” y estado; si no está `running`, dispare **una** sync y salga; “siguiente” se actualiza cuando termina cada sync (mensaje/flag en BD). |
| **Tu idea** | Viable como “cron cada 2 min que revisa y, si no hay sync en curso para la siguiente, dispara una actualización”; el “mensaje” puede ser guardar en BD la “siguiente ubicación” y el estado al terminar cada sync. |

Si indicas si en cPanel el cron puede ejecutar scripts largos (≥ 1 h) o solo cortos (≤ 5 min), se puede bajar esto a pasos concretos (ej. script bash + orden de ubicaciones y llamadas curl).
