# Migración: Cron+HTTP → Cron+Script Python

## Resumen

La sync automática pasa de `curl` (HTTP) a un script Python que ejecuta la lógica directamente, evitando timeouts y abort por desconexión de LiteSpeed.

---

## 1. Archivos modificados/creados

| Archivo | Acción |
|---------|--------|
| `routes/sincronizar.py` | Modificado: `run_sync_ubicacion()`, `run_tick_internal()`, endpoint `sincronizar_ubicacion` como wrapper |
| `scripts/run_sync.py` | **Creado**: runner para cron con `--auto` y `--location-id` |
| `scripts/auto_sync.sh` | Modificado: timeouts 60s/300s, logs HTTP, comentario FALLBACK |
| `docs/INSTRUCCIONES_MIGRACION_CRON_SCRIPT.md` | **Creado**: este documento |

---

## 2. Comando del cron nuevo (cPanel)

**Reemplazar** el cron actual por:

```bash
*/5 * * * * /home2/adesa/virtualenv/wms.adesa.com.do/3.11/bin/python /home2/adesa/wms.adesa.com.do/scripts/run_sync.py --auto >> /home2/adesa/wms.adesa.com.do/logs/Sync-wms/run_sync.log 2>&1
```

### Variantes

- **Python del venv:** si tu venv está en otra ruta, ajusta `/home2/adesa/virtualenv/wms.adesa.com.do/3.11/bin/python`
- **Proyecto en otra ruta:** ajusta `/home2/adesa/wms.adesa.com.do/scripts/run_sync.py`
- **Logs:** se crean en `/home2/adesa/wms.adesa.com.do/logs/Sync-wms/run_sync_YYYYMMDD.log` (además del redirect arriba)

---

## 3. Pasos después de subir los cambios

### Paso 1: Crear carpeta de logs

En cPanel File Manager o por FTP:

```
/home2/adesa/wms.adesa.com.do/logs/Sync-wms/
```

Si no existe, el script la crea al ejecutarse.

### Paso 2: Variables de entorno

En **Setup Python App** → Variables de entorno, asegúrate de tener:

- `DATABASE_URL`
- `ADM_API_BASE`, `ADM_EMAIL`, `ADM_PASSWORD`, `ADM_APPID`, `ADM_COMPANY`, `ADM_ROLE`
- `CRON_TOKEN` (opcional para el script; el tick usa el token solo para HTTP)

Si el cron no hereda las variables de la app:

- Crea `.env` en la raíz del proyecto con las mismas variables, o
- Añade `python-dotenv` a `requirements.txt` y ejecuta `pip install python-dotenv`

### Paso 3: Probar con `--location-id`

En cPanel → **Execute Python Script** (o Terminal si existe):

```bash
/home2/adesa/virtualenv/wms.adesa.com.do/3.11/bin/python /home2/adesa/wms.adesa.com.do/scripts/run_sync.py --location-id <UN_LOCATION_ID_DE_PRUEBA>
```

Ejemplo:

```bash
/home2/adesa/virtualenv/wms.adesa.com.do/3.11/bin/python /home2/adesa/wms.adesa.com.do/scripts/run_sync.py --location-id f1999d1f-f44b-4750-2d38-08dd2b32c7be
```

Si termina correctamente, el script debería completar la sync en 2–3 minutos.

### Paso 4: Cambiar el cron

1. cPanel → **Cron Jobs**
2. Editar o crear el cron que ejecuta cada 5 minutos
3. Sustituir el comando por:

   ```
   /home2/adesa/virtualenv/wms.adesa.com.do/3.11/bin/python /home2/adesa/wms.adesa.com.do/scripts/run_sync.py --auto >> /home2/adesa/wms.adesa.com.do/logs/Sync-wms/run_sync.log 2>&1
   ```

4. Guardar

### Paso 5: Comprobar el primer ciclo

- Esperar 5–10 minutos
- Revisar logs en `/home2/adesa/wms.adesa.com.do/logs/Sync-wms/`
- Verificar en el panel UI que las ubicaciones aparecen como SINCRONIZADAS

---

## 4. Qué esperar si todo funciona bien

### UI

- Ubicaciones en estado **SINCRONIZADA** (verde)
- Progreso 100% (ej: `5810 de 5810 productos`)
- Sin errores tipo "zombie cleanup"

### Logs

En `logs/Sync-wms/run_sync_YYYYMMDD.log`:

```
2026-02-XX XX:XX:XX INFO run_sync [cron_script] run_tick_internal...
2026-02-XX XX:XX:XX INFO run_sync [cron_script] tick status=ready
2026-02-XX XX:XX:XX INFO run_sync [cron_script] Sincronizando: JUAMER MOTORS (f1999d1f-...)
2026-02-XX XX:XX:XX INFO run_sync [cron_script] Iniciando sync: JUAMER MOTORS ...
...
2026-02-XX XX:XX:XX INFO run_sync [cron_script] Sync OK: Sincronización completada para JUAMER MOTORS
```

### Sync manual

- Desde el panel sigue funcionando igual
- Misma lógica y resultados

---

## 5. Plan de rollback

Si algo falla y quieres volver al cron HTTP:

### Paso 1: Restaurar el cron anterior

En cPanel → Cron Jobs, sustituir:

```bash
*/5 * * * * /home2/adesa/wms.adesa.com.do/scripts/auto_sync.sh "https://wms.adesa.com.do" "TU_CRON_TOKEN" >> /home2/adesa/wms.adesa.com.do/logs/Sync-wms/auto_sync_fallback.log 2>&1
```

### Paso 2: Código

- El endpoint manual sigue funcionando igual
- `auto_sync.sh` está actualizado con timeouts más largos (60s tick, 300s sync)
- No hace falta revertir cambios en `routes/sincronizar.py`; el endpoint sigue operativo

### Paso 3: Si falla el script

- Revisar `logs/Sync-wms/run_sync_YYYYMMDD.log`
- Si hay errores de import: comprobar venv, path y variables de entorno
- Si hay errores de DB: comprobar `DATABASE_URL` y permisos

---

## 6. Dependencias opcionales

- **python-dotenv:** para cargar `.env` si el cron no hereda variables. Si no está instalado, el script ignora `.env` y usa las variables del entorno.
- **Ubicación del venv:** si difiere de `/home2/adesa/virtualenv/wms.adesa.com.do/3.11`, ajusta el comando del cron.
