# Respuestas al checklist: viabilidad del refactor a script Python

Este documento responde las preguntas preparadas para validar si la estrategia de mover la sync de HTTP/cron a un script Python es viable.

---

## 1) Reutilización de lógica

**Pregunta:** ¿La lógica de sincronización por ubicación está acoplada al endpoint Flask (request, jsonify, decoradores) o se puede extraer a una función/servicio reutilizable sin cambiar la lógica actual?

**Respuesta: SÍ, es extraíble.**

- **Acoplamiento actual:** La función `sincronizar_ubicacion(location_id)` usa `jsonify()` y `return` para respuestas HTTP, pero **no usa** `request`, `session` ni `current_app` en el cuerpo de la lógica.
- **Config:** `get_adm_client()` usa `config` de `get_config()` (import al inicio), no `current_app`.
- **Ya existe lógica interna:** `sincronizar_lote_ubicacion_interno(location_id, estado_sync, adm_client, location_name)` es una función reutilizable que recibe todo por parámetros.
- **Refactor propuesto:** Extraer el bloque principal de `sincronizar_ubicacion` (líneas ~1296–2150) a algo como `run_sync_ubicacion(location_id, triggered_by='manual')` que devuelva un dict con `success`, `message`, `items_synced`, etc. El endpoint Flask solo llamaría a esa función y convertiría el dict en `jsonify()`.

**Confirmaciones:**
- ✅ Se puede mover a `sync_service.py` o similar
- ✅ Endpoint manual y runner de cron llamarían la misma función
- ✅ No se duplicaría lógica

---

## 2) Dependencias de contexto Flask

**Pregunta:** ¿La sync depende de current_app, g, request, session de Flask? Si sí, ¿puedes ejecutarla desde un script con app.app_context() sin romper DB, logs y config?

**Respuesta: Dependencias mínimas; funciona con app_context.**

- **request/session:** Solo se usan en el decorador `@require_admin_or_cron` (auth). El script no pasaría por HTTP, así que no necesita ese decorador.
- **current_app:** Solo en el decorador para `CRON_TOKEN`. La lógica de sync no lo usa.
- **config:** `get_config()` usa `os.environ` y no requiere contexto Flask.
- **DB:** SQLAlchemy necesita que la app esté inicializada (`db.init_app(app)`). Con `with app.app_context():` se resuelve.
- **NotificacionesConfig.get_config():** Hace query a la DB; funciona dentro de `app_context`.
- **utils.email:** Envía correos; no depende de request. Funciona en script.

**Confirmaciones:**
- ✅ El script puede cargar la app con `from app_wms import app` y usar `with app.app_context():`
- ✅ config, SQLAlchemy, mail funcionan fuera de HTTP
- ✅ `passenger_wsgi.py` ya define rutas absolutas y venv; el script puede replicar ese bootstrap

---

## 3) Base de datos y sesiones SQLAlchemy

**Pregunta:** ¿El manejo de db.session está preparado para correr fuera de requests HTTP? ¿Qué cleanup harás al final del script (commit/rollback/remove) para evitar sesiones colgadas o locks?

**Respuesta: Sí, con cleanup explícito.**

- **Estado actual:** La sync usa `db.session.commit()`, `db.session.rollback()` y `db_commit_with_retry()` en puntos concretos. No hay dependencia de `app.teardown_appcontext` para cerrar la sesión.
- **Flujo HTTP:** Flask hace `app.teardown_appcontext` que cierra la sesión al terminar el request. En script no existe ese ciclo.
- **Cleanup necesario:**
  ```python
  try:
      with app.app_context():
          run_sync_ubicacion(location_id)
  finally:
      db.session.remove()  # Cerrar sesión y devolver conexión al pool
  ```
- **NullPool:** Si usas `DB_USE_NULLPOOL=true`, cada request abre/cierra conexión. Con `db.session.remove()` en el script se cierra correctamente.

**Confirmaciones:**
- ✅ No se dañará el manejo de sesiones en cron
- ✅ No dejará conexiones abiertas si se usa `db.session.remove()` en un `finally`
- ✅ Riesgo de "database is locked" o pool: bajo, siempre que no se ejecuten dos scripts simultáneos para la misma ubicación (protegido por `running_run_id`)

---

## 4) Concurrencia (manual vs cron)

**Pregunta:** Si un usuario dispara sync manual mientras el cron está corriendo una sync por script, ¿el scheduler_lock y running_run_id evitan conflicto real? ¿Hay alguna ventana de carrera que debamos cerrar?

**Respuesta: Parcialmente protegido; hay que reforzar.**

- **scheduler_lock:** Solo se usa en `auto_tick`. Evita que dos ticks procesen a la vez. Si el cron pasa a ser un script, el tick ya no se ejecuta por HTTP.
- **running_run_id:** En `sincronizar_ubicacion` se comprueba antes de empezar:
  ```python
  if estado_sync.status == 'running' and estado_sync.running_run_id:
      run_actual = SyncRun.query.get(estado_sync.running_run_id)
      if run_actual and run_actual.status == 'running':
          return jsonify(...), 409  # Conflict
  ```
  Esto protege contra dos syncs para la **misma ubicación**.
- **Ventana de carrera:** Entre el `if` y el `estado_sync.status = 'running'` hay un pequeño hueco. Si manual y script arrancan casi al mismo tiempo para la misma ubicación, ambos podrían pasar el check. Mitigación: usar `SELECT ... FOR UPDATE` o un lock en la fila de `SyncLocationStatus` para esa ubicación.
- **Ubicaciones distintas:** Manual en A y script en B pueden coexistir sin problema.

**Confirmaciones:**
- ✅ La app ya protege concurrencia por ubicación
- ✅ No se ejecuta la misma ubicación dos veces a la vez (salvo ventana muy pequeña)
- ⚠️ Para mayor seguridad, conviene un lock explícito por ubicación al inicio de la sync

---

## 5) Heartbeat y zombie cleanup en modo script

**Pregunta:** ¿El heartbeat se sigue actualizando igual cuando la sync corre desde script (no HTTP)? ¿El zombie cleanup actual sigue siendo válido o debemos ajustar el umbral/timestamps?

**Respuesta: Sí, todo funciona igual.**

- **Heartbeat:** Se actualiza en el loop de sync: `estado_sync.last_heartbeat_at = datetime.utcnow()` cada 50 items. Es un `db.session.commit()`; no depende de HTTP.
- **Zombie cleanup:** Se ejecuta en el tick (o en el script equivalente). Comprueba `last_heartbeat_at < now - 15 min`. Si el proceso muere (script o HTTP), el heartbeat deja de actualizarse y se detecta correctamente.
- **Timestamps:** `datetime.utcnow()` se usa en ambos; no hay diferencia de zona horaria.

**Confirmaciones:**
- ✅ El heartbeat no depende de request HTTP
- ✅ El zombie cleanup sigue detectando procesos muertos
- ✅ No marcará como zombie una sync sana si el heartbeat se actualiza cada 50 items

---

## 6) Swap atómico y consistencia NEW/LIVE

**Pregunta:** ¿Mover la ejecución a script cambia algo del flujo staging (NEW) → swap atómico (LIVE)? ¿Hay alguna parte del swap o validaciones que hoy asuma contexto HTTP?

**Respuesta: No cambia nada.**

- **Swap:** `estado_sync.current_run_id = nuevo_run.run_id` y `db.session.commit()`. Es un cambio en la base de datos, sin contexto HTTP.
- **Validaciones:** `validar_cambios_new_vs_old`, `validar_adm_vs_fisico`, `poblar_en_revision` usan `db` y modelos. No usan request.
- **Email:** `enviar_estado_sincronizacion` y `enviar_resumen_discrepancias` son funciones puras que reciben parámetros.

**Confirmaciones:**
- ✅ Staging/swap no se toca
- ✅ El cambio es solo de canal de ejecución (HTTP → script)
- ✅ La consistencia de inventario sigue intacta

---

## 7) Logging y observabilidad

**Pregunta:** ¿Puedes agregar logs estructurados para cron-script (inicio, ubicación, run_id, heartbeat, fin, error, traceback) y diferenciar triggered_by=cron_script vs manual?

**Respuesta: Sí, con cambios mínimos.**

- **Estado actual:** La sync usa `logger.info`, `logger.error`, etc. con mensajes descriptivos.
- **triggered_by:** Se puede añadir un parámetro `triggered_by` a `run_sync_ubicacion()` y usarlo en los logs:
  ```python
  logger.info(f"[{triggered_by}] Iniciando sync: {location_name} run_id={run_id}")
  ```
- **Logs estructurados:** Se puede usar un formato tipo:
  ```
  sync_started location_id=... location_name=... run_id=... triggered_by=cron_script
  sync_heartbeat location_id=... run_id=... items=... total=...
  sync_completed location_id=... run_id=... items_synced=... duration_sec=...
  sync_failed location_id=... run_id=... error=... traceback=...
  ```

**Confirmaciones:**
- ✅ Se puede diagnosticar mejor
- ✅ Los errores no quedarán silenciosos
- ✅ Los logs serán útiles en cPanel (stderr.log, stdout.log)

---

## 8) Integración con cPanel (sin consola)

**Pregunta:** Como no tienes consola SSH, ¿puedes preparar el runner para ejecutarse desde cPanel (Cron Jobs / Execute Python Script) con rutas absolutas y sin comandos interactivos?

**Respuesta: Sí.**

- **passenger_wsgi.py** ya define:
  - `project_dir = os.path.dirname(os.path.abspath(__file__))`
  - `venv_path = '/home2/adesa/virtualenv/wms.adesa.com.do/3.11'`
  - `sys.path.insert`, `os.chdir(project_dir)`
- **Cron en cPanel:** Ejecutar:
  ```
  /home2/adesa/virtualenv/wms.adesa.com.do/3.11/bin/python /home2/adesa/wms.adesa.com.do/scripts/run_sync.py --auto
  ```
- **Bootstrap del script:** Replicar la lógica de `passenger_wsgi.py` (venv, path, chdir) al inicio del script.
- **Sin interactividad:** El script no debe usar `input()` ni depender de TTY.

**Confirmaciones:**
- ✅ Se puede entregar algo usable en tu entorno real
- ✅ Usar rutas absolutas (`/home2/...`)
- ✅ No depender de `flask run` ni de shell interactivo

---

## 9) Entorno Python del hosting

**Pregunta:** ¿El script puede ejecutarse con el mismo entorno Python del Passenger (mismas variables de entorno y dependencias)? Si no, ¿qué archivo de bootstrap propones para cargar .env/config correctamente?

**Respuesta: Sí, con el mismo Python y variables.**

- **Cron en cPanel:** Puede ejecutar el mismo Python que usa Passenger. Las variables de entorno se configuran en cPanel (Setup Python App → Variables de entorno).
- **Problema:** Los Cron Jobs pueden no heredar las variables de la app. Si `DATABASE_URL`, `CRON_TOKEN`, etc. no están en el cron, el script fallará.
- **Solución propuesta:** Cargar `.env` desde el directorio del proyecto:
  ```python
  from dotenv import load_dotenv
  load_dotenv(os.path.join(project_dir, '.env'))
  ```
  O usar un archivo de configuración específico para el script.
- **Alternativa:** cPanel permite definir variables de entorno en el Cron Job. Verificar que `DATABASE_URL`, `ADM_*`, `CRON_TOKEN` estén disponibles.

**Confirmaciones:**
- ✅ El script puede usar las mismas credenciales/config
- ⚠️ Hay que asegurar que las variables no falten (cargar .env o configurar en cron)
- ✅ Evitar "funciona web / falla script" con un bootstrap consistente

---

## 10) Cron actual como fallback temporal

**Pregunta:** Mientras refactorizamos a script, ¿puedes ajustar el auto_sync.sh actual como parche (tick 30–60s, sync 240–300s, capturar HTTP status/body) sin cambiar la lógica del backend?

**Respuesta: Sí, con cambios solo en el script.**

- **Cambios en auto_sync.sh:**
  - Tick: `curl -m 30` o `curl -m 60` (en vez de 10)
  - Sync: `curl -m 240` o `curl -m 300` (en vez de 20)
  - Capturar: `-w "%{http_code}"` y guardar body en un archivo temporal para diagnóstico
- **Backend:** No cambia. El problema de LiteSpeed sigue siendo el abort al cerrar la conexión; más timeout solo retrasa el cierre. El parche ayuda si `noabort` está activo y la sync tarda más de 20s.

**Confirmaciones:**
- ✅ Se puede tener mejora inmediata
- ✅ No se queda parado mientras se hace el refactor
- ⚠️ Si `noabort` no funciona, el parche no resolverá el abort por desconexión

---

## 11) Pregunta extra: ¿Tick + ejecución en una sola llamada interna?

**Pregunta:** ¿Puedes crear un runner que haga internamente: cleanup_zombies → pick_next_location → run_sync_location, sin pasar por HTTP?

**Respuesta: Sí, es exactamente lo que se propone.**

- **Flujo actual del tick:** `_try_acquire_scheduler_lock` → zombie cleanup → check running → obtener ubicaciones ADM → pick next → return.
- **Flujo propuesto del script:**
  1. Acquire scheduler_lock (o equivalente)
  2. Zombie cleanup (misma lógica que en tick)
  3. Check si hay sync viva (running con heartbeat reciente)
  4. Si hay viva → salir (no hacer nada)
  5. Si no → pick next location (misma lógica que tick)
  6. Release lock (o mantenerlo durante la sync si se quiere evitar que otro proceso intente)
  7. Llamar a `run_sync_ubicacion(location_id, triggered_by='cron_script')`
  8. Al terminar, salir

- **Ventaja:** Todo en un solo proceso, sin HTTP, sin LiteSpeed, sin abort por desconexión.

---

## 12) Pregunta extra: ¿Modos --auto y --location-id?

**Pregunta:** ¿Puedes soportar dos modos en el script?
- `--auto` (elige ubicación automáticamente)
- `--location-id <id>` (forzar una ubicación para pruebas)

**Respuesta: Sí.**

```python
# Ejemplo de interfaz
if args.auto:
    location_id = pick_next_location()  # Lógica del tick
    if not location_id:
        sys.exit(0)  # Nada que hacer
elif args.location_id:
    location_id = args.location_id
    # Validar que existe en ADM
else:
    print("Usar --auto o --location-id <id>")
    sys.exit(1)

run_sync_ubicacion(location_id, triggered_by='cron_script' if args.auto else 'manual_test')
```

**Confirmaciones:**
- ✅ Modo `--auto` para producción
- ✅ Modo `--location-id` para pruebas sin tocar producción

---

## 13) Pregunta extra: Manejo de errores (tracebacks)

**Pregunta:** Si la sync falla en script, ¿puedes guardar last_error con mensaje corto y además escribir traceback completo al log?

**Respuesta: Sí.**

- **last_error:** Ya se guarda en `estado_sync.last_error` en el bloque `except` de `sincronizar_ubicacion`. Mensaje corto: `str(e)`.
- **Traceback en log:**
  ```python
  except Exception as e:
      logger.error(f"Sync fallida para {location_name}: {e}", exc_info=True)
      # exc_info=True escribe el traceback completo al log
  ```
- **Resultado:** UI con mensaje corto, log con detalle técnico.

---

## Resumen ejecutivo

| # | Pregunta | Viabilidad |
|---|----------|------------|
| 1 | Reutilización de lógica | ✅ Extraíble a servicio |
| 2 | Dependencias Flask | ✅ Funciona con app_context |
| 3 | DB y sesiones | ✅ Con db.session.remove() en finally |
| 4 | Concurrencia | ✅ Protegido; opcional reforzar con lock |
| 5 | Heartbeat/zombie | ✅ Sin cambios |
| 6 | Swap atómico | ✅ Sin cambios |
| 7 | Logging | ✅ Añadir triggered_by y formato |
| 8 | cPanel | ✅ Rutas absolutas, sin interactivo |
| 9 | Entorno Python | ✅ Mismo; cargar .env si hace falta |
| 10 | Parche cron | ✅ Aumentar timeouts en script |
| 11 | Tick + sync interna | ✅ Flujo propuesto |
| 12 | --auto / --location-id | ✅ Soportable |
| 13 | Tracebacks | ✅ exc_info=True |

**Conclusión: El refactor a script Python es viable.** El proyecto aguanta el cambio con refactors acotados y sin alterar la lógica de negocio.
