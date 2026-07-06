# Solución: Sync vía cron matada por LiteSpeed (client disconnect)

## Problema

- **Cron**: La sync se inicia pero el proceso es matado (SIGTERM) tras ~20–90 segundos.
- **Panel manual**: La misma sync se completa sin problema (ej: JUAMER MOTORS 5810/5810).
- **Diferencia**: Cómo llega la petición HTTP.

## Causa raíz

1. El **cron** usa `curl -m 20`: espera máximo 20 segundos y cierra la conexión.
2. Al cerrar la conexión, **LiteSpeed** interpreta que el cliente se desconectó.
3. Por defecto, **LiteSpeed aborta la petición** cuando el cliente se desconecta:
   > "When a user closes a connection, LSWS will abort processing by killing the process."
4. Resultado: el worker que ejecuta la sync recibe SIGTERM y se mata.
5. Cuando ejecutas desde el Panel, el navegador mantiene la conexión hasta recibir la respuesta, así que no hay abort.

## Solución: `noabort` para los endpoints de sync

Configurar LiteSpeed para **no abortar** las peticiones a los endpoints de sincronización cuando el cliente se desconecte.

### Opción 1: `.htaccess` (recomendada)

Añadir al `.htaccess` del proyecto (dentro de `IfModule Litespeed`):

```apache
<IfModule Litespeed>
    RewriteEngine On
    # No abortar cuando el cliente (curl del cron) cierra la conexión tras 20s
    RewriteRule ^api/sincronizar/ubicacion - [E=noabort:1, E=noconntimeout:1]
</IfModule>
```

Esto aplica a:
- `POST /api/sincronizar/ubicacion/<id>` (sync completa)
- `POST /api/sincronizar/ubicacion/<id>/lote` (sync por lotes)

### Opción 2: WebAdmin LiteSpeed (si tienes acceso)

1. WebAdmin → Configuration → Server → General
2. **External Application Abort** = `No Abort`  

**Advertencia**: afecta a todas las apps; solo usar si lo requiere el entorno.

## Referencia

- [LiteSpeed: PHP Without Timeout / Long-Run Script](https://docs.litespeedtech.com/lsws/cp/cpanel/long-run-script/)
- [LiteSpeed: Abort request processing](https://www.litespeedtech.com/support/forum/threads/abort-request-processing.17506/)
