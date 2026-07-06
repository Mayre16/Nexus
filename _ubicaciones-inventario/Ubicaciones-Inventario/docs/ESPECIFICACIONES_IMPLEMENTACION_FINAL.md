# ESPECIFICACIONES FINALES: Implementación Staging Cache

**Fecha:** 2026-01-29  
**Versión:** 1.0  
**Estado:** Listo para Implementación

---

## RESUMEN DE CONFIRMACIONES

✅ **Email:** smtplib nativo con SSL, variables de entorno  
✅ **Umbrales:** Crítico (>500% o >100), Alto (>300% o >50)  
✅ **Limpieza:** Últimos 3 runs + current, eliminar >7 días, diaria  
✅ **Implementación:** Todo de una vez (con respaldo)  
✅ **Endpoints:** Solo lectura (en-revision, sync-runs)  
❌ **Rollback manual:** No implementar aún

---

## 1. CONFIGURACIÓN DE EMAIL

### Variables de Entorno (cPanel)

**Nombres exactos:**
```
SMTP_HOST=mail.adesa.com.do
SMTP_PORT=465
SMTP_USER=notificacioneswms@adesa.com.do
SMTP_PASS=<se configurará en cPanel>
```

### Archivo: `utils/email.py`

```python
"""
Módulo de envío de emails usando smtplib nativo
Configuración mediante variables de entorno
"""
import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Optional

logger = logging.getLogger(__name__)

# Configuración desde variables de entorno
SMTP_HOST = os.getenv('SMTP_HOST', 'mail.adesa.com.do')
SMTP_PORT = int(os.getenv('SMTP_PORT', '465'))
SMTP_USER = os.getenv('SMTP_USER', 'notificacioneswms@adesa.com.do')
SMTP_PASS = os.getenv('SMTP_PASS', '')  # DEBE estar en cPanel

# Destinatario por defecto
EMAIL_DESTINATARIO = 'luis.useche@adesa.com.do'


def enviar_email(asunto: str, cuerpo_html: str, cuerpo_texto: Optional[str] = None, 
                 destinatarios: Optional[List[str]] = None) -> bool:
    """
    Envía un email usando SMTP con SSL
    
    Args:
        asunto: Asunto del email
        cuerpo_html: Cuerpo del email en HTML
        cuerpo_texto: Cuerpo del email en texto plano (opcional)
        destinatarios: Lista de destinatarios (por defecto: luis.useche@adesa.com.do)
    
    Returns:
        True si se envió correctamente, False en caso contrario
    """
    if not SMTP_PASS:
        logger.error("SMTP_PASS no configurada. No se puede enviar email.")
        return False
    
    if not destinatarios:
        destinatarios = [EMAIL_DESTINATARIO]
    
    try:
        # Crear mensaje
        mensaje = MIMEMultipart('alternative')
        mensaje['Subject'] = asunto
        mensaje['From'] = SMTP_USER
        mensaje['To'] = ', '.join(destinatarios)
        
        # Agregar cuerpo (texto y HTML)
        if cuerpo_texto:
            parte_texto = MIMEText(cuerpo_texto, 'plain', 'utf-8')
            mensaje.attach(parte_texto)
        
        parte_html = MIMEText(cuerpo_html, 'html', 'utf-8')
        mensaje.attach(parte_html)
        
        # Conectar y enviar
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as servidor:
            servidor.login(SMTP_USER, SMTP_PASS)
            servidor.send_message(mensaje)
        
        logger.info(f"Email enviado exitosamente a {destinatarios}: {asunto}")
        return True
        
    except smtplib.SMTPException as e:
        logger.error(f"Error SMTP al enviar email: {str(e)}", exc_info=True)
        return False
    except Exception as e:
        logger.error(f"Error inesperado al enviar email: {str(e)}", exc_info=True)
        return False


def enviar_resumen_discrepancias(location_name: str, location_id: str, run_id: int, 
                                 total_discrepancias: int, top_discrepancias: List[dict]):
    """
    Envía resumen de discrepancias detectadas en sincronización
    
    Args:
        location_name: Nombre de la ubicación
        location_id: ID de la ubicación
        run_id: ID del run de sincronización
        total_discrepancias: Total de discrepancias detectadas
        top_discrepancias: Lista de top discrepancias (máximo 50)
    """
    # Agrupar por tipo y severidad
    por_tipo = {}
    por_severidad = {'critica': 0, 'alta': 0, 'media': 0, 'baja': 0}
    
    for disc in top_discrepancias:
        tipo = disc.get('tipo', 'desconocido')
        severidad = disc.get('severidad', 'media')
        
        if tipo not in por_tipo:
            por_tipo[tipo] = []
        por_tipo[tipo].append(disc)
        
        por_severidad[severidad] = por_severidad.get(severidad, 0) + 1
    
    # Construir HTML
    html = f"""
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; }}
            .header {{ background-color: #2c3e50; color: white; padding: 15px; }}
            .content {{ padding: 20px; }}
            .summary {{ background-color: #ecf0f1; padding: 15px; margin: 15px 0; }}
            .critica {{ color: #e74c3c; font-weight: bold; }}
            .alta {{ color: #f39c12; font-weight: bold; }}
            .media {{ color: #3498db; }}
            .baja {{ color: #95a5a6; }}
            table {{ border-collapse: collapse; width: 100%; margin: 15px 0; }}
            th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
            th {{ background-color: #34495e; color: white; }}
            .footer {{ background-color: #ecf0f1; padding: 10px; margin-top: 20px; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="header">
            <h2>📊 Resumen de Sincronización: {location_name}</h2>
        </div>
        <div class="content">
            <div class="summary">
                <h3>Resumen General</h3>
                <p><strong>Total discrepancias detectadas:</strong> {total_discrepancias}</p>
                <p><strong>Run ID:</strong> {run_id}</p>
                <p><strong>Por severidad:</strong></p>
                <ul>
                    <li class="critica">Crítica: {por_severidad['critica']}</li>
                    <li class="alta">Alta: {por_severidad['alta']}</li>
                    <li class="media">Media: {por_severidad['media']}</li>
                    <li class="baja">Baja: {por_severidad['baja']}</li>
                </ul>
            </div>
            
            <h3>Top {len(top_discrepancias)} Discrepancias Más Críticas</h3>
    """
    
    # Tabla de discrepancias
    html += """
            <table>
                <thead>
                    <tr>
                        <th>SKU</th>
                        <th>Tipo</th>
                        <th>Severidad</th>
                        <th>Stock OLD</th>
                        <th>Stock NEW</th>
                        <th>Stock Físico</th>
                        <th>Motivo</th>
                    </tr>
                </thead>
                <tbody>
    """
    
    for disc in top_discrepancias[:50]:  # Máximo 50
        severidad_class = disc.get('severidad', 'media')
        html += f"""
                    <tr>
                        <td>{disc.get('sku', 'N/A')}</td>
                        <td>{disc.get('tipo', 'N/A')}</td>
                        <td class="{severidad_class}">{severidad_class.upper()}</td>
                        <td>{disc.get('stock_old', 0)}</td>
                        <td>{disc.get('stock_new', 0)}</td>
                        <td>{disc.get('stock_fisico', 'N/A')}</td>
                        <td>{disc.get('motivo', 'N/A')}</td>
                    </tr>
        """
    
    html += """
                </tbody>
            </table>
    """
    
    if total_discrepancias > len(top_discrepancias):
        html += f"""
            <p><em>... y {total_discrepancias - len(top_discrepancias)} discrepancias más.</em></p>
        """
    
    html += f"""
            <div class="footer">
                <p>Ver todas las discrepancias: <a href="https://wms.adesa.com.do/admin/en-revision?location_id={location_id}&run_id={run_id}">Panel de Administración</a></p>
                <p>Este es un email automático del sistema WMS.</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    asunto = f"WMS: {total_discrepancias} discrepancias detectadas en {location_name}"
    enviar_email(asunto, html)
```

### Endpoint de Prueba: `GET /api/test-email`

**Archivo:** `routes/admin.py` (nuevo) o agregar a `routes/sincronizar.py`

```python
@sincronizar_bp.route('/api/test-email', methods=['GET'])
@require_admin
def test_email():
    """Endpoint de prueba para verificar configuración de email"""
    try:
        from utils.email import enviar_email
        
        asunto = "Test WMS - Configuración de Email"
        cuerpo_html = """
        <html>
        <body>
            <h2>Test de Email WMS</h2>
            <p>Este es un email de prueba para verificar la configuración SMTP.</p>
            <p>Si recibes este email, la configuración está correcta.</p>
            <p><strong>Fecha:</strong> {}</p>
        </body>
        </html>
        """.format(datetime.utcnow().isoformat())
        
        cuerpo_texto = "Test de Email WMS - Si recibes este email, la configuración está correcta."
        
        resultado = enviar_email(asunto, cuerpo_html, cuerpo_texto)
        
        if resultado:
            return jsonify({
                "success": True,
                "message": "Email de prueba enviado exitosamente",
                "destinatario": "luis.useche@adesa.com.do"
            }), 200
        else:
            return jsonify({
                "success": False,
                "error": "Error al enviar email. Revisa logs para más detalles."
            }), 500
            
    except Exception as e:
        logger.error(f"Error en test-email: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Error inesperado",
            "message": str(e)
        }), 500
```

---

## 2. UMBRALES DE DISCREPANCIAS

### Configuración: `config.py`

```python
# Umbrales para detección de discrepancias
DISCREPANCIAS_UMBRALES = {
    'critico': {
        'cambio_porcentual': 500,  # >500%
        'cambio_absoluto': 100     # >100 unidades
    },
    'alto': {
        'cambio_porcentual': 300,  # >300%
        'cambio_absoluto': 50      # >50 unidades
    }
}
```

### Función de Clasificación: `utils/discrepancias.py`

```python
def clasificar_severidad_discrepancia(tipo: str, stock_old: float, stock_new: float, 
                                     stock_fisico: float = None) -> str:
    """
    Clasifica discrepancia por severidad según umbrales
    
    Args:
        tipo: Tipo de discrepancia (desaparecido, cambio_brusco, critica_adm_vs_fisico, etc.)
        stock_old: Stock anterior (OLD)
        stock_new: Stock nuevo (NEW)
        stock_fisico: Stock físico (opcional, solo para ADESA)
    
    Returns:
        Severidad: 'critica', 'alta', 'media', 'baja'
    """
    from config import get_config
    config = get_config()
    umbrales = config.DISCREPANCIAS_UMBRALES
    
    # Discrepancia ADM vs Físico siempre es crítica
    if tipo == 'critica_adm_vs_fisico':
        return 'critica'
    
    # Desaparecido: crítico si hay stock físico, alto si no
    if tipo == 'desaparecido':
        if stock_fisico and stock_fisico > 0:
            return 'critica'
        return 'alta'
    
    # Cambio brusco: calcular porcentaje y absoluto
    if tipo == 'cambio_brusco':
        if stock_old == 0:
            return 'media'  # De 0 a X es menos crítico
        
        cambio_absoluto = abs(stock_new - stock_old)
        cambio_porcentual = (cambio_absoluto / stock_old) * 100 if stock_old > 0 else 0
        
        # Crítico: >500% Y >100 unidades
        if cambio_porcentual > umbrales['critico']['cambio_porcentual'] and \
           cambio_absoluto > umbrales['critico']['cambio_absoluto']:
            return 'critica'
        
        # Alto: >300% Y >50 unidades
        if cambio_porcentual > umbrales['alto']['cambio_porcentual'] and \
           cambio_absoluto > umbrales['alto']['cambio_absoluto']:
            return 'alta'
        
        # Media: cambio significativo pero dentro de umbrales
        if cambio_porcentual > 100 or cambio_absoluto > 10:
            return 'media'
        
        return 'baja'
    
    return 'media'  # Por defecto
```

---

## 3. POLÍTICA DE LIMPIEZA

### Función de Limpieza: `utils/limpieza.py`

```python
def limpiar_runs_antiguos(dias=7, mantener_ultimos=3):
    """
    Limpia runs antiguos preservando últimos N y current_run_id
    
    Args:
        dias: Días de antigüedad para eliminar (default: 7)
        mantener_ultimos: Cantidad de runs a mantener por ubicación (default: 3)
    """
    from database import db
    from database.models import SyncRun, SyncLocationStatus, StockProductoADM
    from datetime import datetime, timedelta
    
    fecha_limite = datetime.utcnow() - timedelta(days=dias)
    
    # Obtener current_run_id por ubicación (NO eliminar estos)
    current_runs = set(
        db.session.query(SyncLocationStatus.current_run_id)
        .filter(SyncLocationStatus.current_run_id.isnot(None))
        .scalar_all()
    )
    
    # Por cada ubicación, mantener últimos N runs
    ubicaciones = db.session.query(SyncRun.location_id).distinct().all()
    total_eliminados = 0
    
    for (location_id,) in ubicaciones:
        # Obtener últimos N runs (ordenados por finished_at DESC)
        ultimos_runs = SyncRun.query.filter_by(
            location_id=location_id
        ).filter(
            SyncRun.finished_at.isnot(None)
        ).order_by(SyncRun.finished_at.desc()).limit(mantener_ultimos).all()
        
        run_ids_preservar = {r.run_id for r in ultimos_runs} | current_runs
        
        # Eliminar runs antiguos que no están en preservar
        runs_a_eliminar = SyncRun.query.filter(
            SyncRun.location_id == location_id,
            SyncRun.finished_at < fecha_limite,
            ~SyncRun.run_id.in_(run_ids_preservar) if run_ids_preservar else True
        ).all()
        
        for run in runs_a_eliminar:
            # Eliminar registros de stock asociados
            registros_eliminados = StockProductoADM.query.filter_by(
                sync_run_id=run.run_id
            ).delete()
            
            # Eliminar run
            db.session.delete(run)
            total_eliminados += 1
            
            logger.info(f"Eliminado run {run.run_id} de {run.location_name} "
                       f"(registros stock: {registros_eliminados})")
    
    db.session.commit()
    logger.info(f"Limpieza completada: {total_eliminados} runs eliminados")
    return total_eliminados
```

### Tarea Programada (cPanel Cron)

**Comando:**
```bash
cd /home2/adesa/wms.adesa.com.do && python -c "from utils.limpieza import limpiar_runs_antiguos; limpiar_runs_antiguos()"
```

**Frecuencia:** Diaria (una vez al día)

---

## 4. ENDPOINTS DE LECTURA

### GET /api/en-revision

**Archivo:** `routes/admin.py` (nuevo)

```python
@admin_bp.route('/api/en-revision', methods=['GET'])
@require_admin
def listar_en_revision():
    """
    Lista discrepancias en revisión (solo lectura, paginado)
    
    Query params:
        location_id: Filtrar por ubicación
        severidad: Filtrar por severidad (critica, alta, media, baja)
        tipo: Filtrar por tipo
        estado: Filtrar por estado (pendiente, resuelto, ignorado)
        sku: Buscar por SKU (búsqueda parcial)
        page: Número de página (default: 1)
        per_page: Items por página (default: 50, max: 100)
    """
    from database.models import EnRevision
    from database import db
    
    # Parámetros de paginación
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 50, type=int), 100)  # Máximo 100
    
    # Filtros
    query = EnRevision.query
    
    location_id = request.args.get('location_id')
    if location_id:
        query = query.filter_by(location_id=location_id)
    
    severidad = request.args.get('severidad')
    if severidad:
        query = query.filter_by(severidad=severidad)
    
    tipo = request.args.get('tipo')
    if tipo:
        query = query.filter_by(tipo=tipo)
    
    estado = request.args.get('estado', 'pendiente')
    if estado:
        query = query.filter_by(estado=estado)
    
    sku = request.args.get('sku')
    if sku:
        query = query.filter(EnRevision.sku.ilike(f'%{sku}%'))
    
    # Ordenar por severidad + fecha detección
    orden_severidad = case(
        (EnRevision.severidad == 'critica', 4),
        (EnRevision.severidad == 'alta', 3),
        (EnRevision.severidad == 'media', 2),
        else_=1
    )
    query = query.order_by(orden_severidad.desc(), EnRevision.fecha_deteccion.desc())
    
    # Paginación
    paginacion = query.paginate(page=page, per_page=per_page, error_out=False)
    
    return jsonify({
        "success": True,
        "data": [item.to_dict() for item in paginacion.items],
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": paginacion.total,
            "pages": paginacion.pages
        }
    })
```

### GET /api/sync-runs

**Archivo:** `routes/admin.py`

```python
@admin_bp.route('/api/sync-runs', methods=['GET'])
@require_admin
def listar_sync_runs():
    """
    Lista historial de runs de sincronización (solo lectura, paginado)
    
    Query params:
        location_id: Filtrar por ubicación
        status: Filtrar por status (running, done, partial, failed)
        page: Número de página (default: 1)
        per_page: Items por página (default: 50, max: 100)
    """
    from database.models import SyncRun
    from database import db
    
    # Parámetros de paginación
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 50, type=int), 100)
    
    # Filtros
    query = SyncRun.query
    
    location_id = request.args.get('location_id')
    if location_id:
        query = query.filter_by(location_id=location_id)
    
    status = request.args.get('status')
    if status:
        query = query.filter_by(status=status)
    
    # Ordenar por fecha (más recientes primero)
    query = query.order_by(SyncRun.started_at.desc())
    
    # Paginación
    paginacion = query.paginate(page=page, per_page=per_page, error_out=False)
    
    return jsonify({
        "success": True,
        "data": [item.to_dict() for item in paginacion.items],
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": paginacion.total,
            "pages": paginacion.pages
        }
    })
```

---

## 5. ÍNDICES PARA PERFORMANCE

### Migración de Base de Datos

```sql
-- Índices para StockProductoADM
CREATE INDEX IF NOT EXISTS idx_stock_producto_run 
ON stock_productos_adm(producto_id, location_id, sync_run_id);

CREATE INDEX IF NOT EXISTS idx_stock_run_id 
ON stock_productos_adm(sync_run_id);

CREATE INDEX IF NOT EXISTS idx_stock_location_run 
ON stock_productos_adm(location_id, sync_run_id);

-- Índices para EnRevision
CREATE INDEX IF NOT EXISTS idx_en_revision_location 
ON en_revision(location_id, estado, severidad);

CREATE INDEX IF NOT EXISTS idx_en_revision_sku 
ON en_revision(sku);

CREATE INDEX IF NOT EXISTS idx_en_revision_fecha 
ON en_revision(fecha_deteccion DESC);

-- Índices para SyncRun
CREATE INDEX IF NOT EXISTS idx_sync_run_location_status 
ON sync_runs(location_id, status, started_at DESC);
```

---

## 6. CHECKLIST DE IMPLEMENTACIÓN

### Fase 1: Modelos y Migración
- [ ] Agregar `sync_run_id` a `StockProductoADM`
- [ ] Crear modelo `SyncRun`
- [ ] Crear modelo `EnRevision`
- [ ] Agregar `current_run_id` y `running_run_id` a `SyncLocationStatus`
- [ ] Crear índices
- [ ] Migración de datos existentes (marcar como legacy)

### Fase 2: Helpers y Utilidades
- [ ] Crear `utils/email.py` con smtplib
- [ ] Crear `utils/discrepancias.py` con clasificación
- [ ] Crear `utils/limpieza.py` con limpieza de runs
- [ ] Crear `obtener_stock_vigente()` en `utils/helpers.py`
- [ ] Migrar consultas existentes a usar helper

### Fase 3: Lógica de Sincronización
- [ ] Modificar `sincronizar_ubicacion()` para staging
- [ ] Implementar creación de `SyncRun`
- [ ] Implementar carga en staging (NEW)
- [ ] Implementar validación post-sync
- [ ] Implementar swap atómico
- [ ] Integrar detección de discrepancias
- [ ] Integrar envío de emails

### Fase 4: Endpoints
- [ ] Crear `routes/admin.py`
- [ ] Implementar `GET /api/test-email`
- [ ] Implementar `GET /api/en-revision`
- [ ] Implementar `GET /api/sync-runs`

### Fase 5: Validaciones Mejoradas
- [ ] Validación dual para ADESA en transferencias
- [ ] Advertencias para NO-ADESA con sync vieja
- [ ] Detección de duplicación potencial

### Fase 6: Limpieza Automática
- [ ] Configurar cron job en cPanel
- [ ] Probar limpieza manualmente

---

## 7. VARIABLES DE ENTORNO (cPanel)

**Configurar en Setup Python App → Environment Variables:**

```
SMTP_HOST=mail.adesa.com.do
SMTP_PORT=465
SMTP_USER=notificacioneswms@adesa.com.do
SMTP_PASS=<contraseña del email>
```

**Nota:** `SMTP_PASS` debe configurarse manualmente en cPanel, NO va en el código.

---

## 8. NOTAS IMPORTANTES

1. **Anti-timeout obligatorio:** Todos los endpoints usan paginación (máximo 100 items por página)
2. **Índices:** Crear todos los índices antes de usar los endpoints
3. **Logs:** Todos los errores se registran en logs (sin imprimir contraseñas)
4. **Respaldo:** Hacer respaldo de BD antes de implementar
5. **Pruebas:** Probar email primero con `/api/test-email`

---

**Fin del Documento**



