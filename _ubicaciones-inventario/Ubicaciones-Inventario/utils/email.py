"""
Módulo de envío de emails usando smtplib nativo
Configuración mediante variables de entorno
"""
import os
import smtplib
import logging
import html as html_module
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Optional
from datetime import datetime

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
    
    _esc = html_module.escape
    for disc in top_discrepancias[:50]:
        severidad_class = disc.get('severidad', 'media')
        html += f"""
                    <tr>
                        <td>{_esc(str(disc.get('sku', 'N/A')))}</td>
                        <td>{_esc(str(disc.get('tipo', 'N/A')))}</td>
                        <td class="{_esc(severidad_class)}">{_esc(severidad_class.upper())}</td>
                        <td>{_esc(str(disc.get('stock_old', 0)))}</td>
                        <td>{_esc(str(disc.get('stock_new', 0)))}</td>
                        <td>{_esc(str(disc.get('stock_fisico', 'N/A')))}</td>
                        <td>{_esc(str(disc.get('motivo', 'N/A')))}</td>
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


def enviar_estado_sincronizacion(location_name: str, location_id: str, run_id: int, 
                                 status: str, items_procesados: int, items_adm: int,
                                 items_con_stock: int, items_sin_stock: int,
                                 is_full_sync: bool, error_message: Optional[str] = None,
                                 duracion_segundos: Optional[float] = None):
    """
    Envía email con el estado de la sincronización
    
    Args:
        location_name: Nombre de la ubicación
        location_id: ID de la ubicación
        run_id: ID del run de sincronización
        status: Estado de la sincronización (done, partial, failed, cancelled)
        items_procesados: Total de items procesados
        items_adm: Total de items que ADM reportó
        items_con_stock: Items con stock > 0
        items_sin_stock: Items con stock = 0
        is_full_sync: Si fue una sincronización completa
        error_message: Mensaje de error (si aplica)
        duracion_segundos: Duración de la sincronización en segundos
    """
    # Mapear status a texto y color
    status_info = {
        'done': {'text': '✅ Completada', 'color': '#2e7d32', 'bg': '#e8f5e9'},
        'partial': {'text': '⏸️ Parcial', 'color': '#f57c00', 'bg': '#fff3e0'},
        'failed': {'text': '❌ Fallida', 'color': '#c62828', 'bg': '#ffebee'},
        'cancelled': {'text': '🚫 Cancelada', 'color': '#616161', 'bg': '#f5f5f5'},
        'running': {'text': '🔄 En Proceso', 'color': '#1976d2', 'bg': '#e3f2fd'}
    }
    
    status_data = status_info.get(status, {'text': status, 'color': '#757575', 'bg': '#f5f5f5'})
    
    # Formatear duración
    if duracion_segundos:
        minutos = int(duracion_segundos // 60)
        segundos = int(duracion_segundos % 60)
        if minutos > 0:
            duracion_texto = f"{minutos} min {segundos} seg"
        else:
            duracion_texto = f"{segundos} seg"
    else:
        duracion_texto = "N/A"
    
    # Construir HTML
    html = f"""
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; margin: 0; padding: 0; }}
            .header {{ background-color: #2c3e50; color: white; padding: 20px; }}
            .content {{ padding: 20px; }}
            .status-box {{
                background-color: {status_data['bg']};
                border-left: 5px solid {status_data['color']};
                padding: 15px;
                margin: 20px 0;
                border-radius: 5px;
            }}
            .status-text {{
                color: {status_data['color']};
                font-size: 24px;
                font-weight: bold;
                margin: 10px 0;
            }}
            .info-grid {{
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 15px;
                margin: 20px 0;
            }}
            .info-card {{
                background-color: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 5px;
                padding: 15px;
            }}
            .info-card h4 {{
                margin: 0 0 10px 0;
                color: #495057;
                font-size: 14px;
                text-transform: uppercase;
            }}
            .info-card .value {{
                font-size: 28px;
                font-weight: bold;
                color: #2c3e50;
            }}
            .error-box {{
                background-color: #ffebee;
                border-left: 5px solid #c62828;
                padding: 15px;
                margin: 20px 0;
                border-radius: 5px;
            }}
            .footer {{
                background-color: #ecf0f1;
                padding: 15px;
                margin-top: 20px;
                font-size: 12px;
                color: #7f8c8d;
            }}
            .sync-type {{
                display: inline-block;
                background-color: #3498db;
                color: white;
                padding: 5px 10px;
                border-radius: 3px;
                font-size: 12px;
                margin-left: 10px;
            }}
        </style>
    </head>
    <body>
        <div class="header">
            <h2>🔄 Estado de Sincronización: {location_name}</h2>
        </div>
        <div class="content">
            <div class="status-box">
                <div class="status-text">{status_data['text']}</div>
                <div style="margin-top: 10px;">
                    <strong>Run ID:</strong> {run_id}
                    <span class="sync-type">{'Sync Completa' if is_full_sync else 'Sync Parcial'}</span>
                </div>
                {f'<div style="margin-top: 10px;"><strong>Duración:</strong> {duracion_texto}</div>' if duracion_segundos else ''}
            </div>
            
            <div class="info-grid">
                <div class="info-card">
                    <h4>📦 Productos Procesados</h4>
                    <div class="value">{items_procesados:,}</div>
                </div>
                <div class="info-card">
                    <h4>📋 Total ADM</h4>
                    <div class="value">{items_adm:,}</div>
                </div>
                <div class="info-card">
                    <h4>✅ Con Stock (>0)</h4>
                    <div class="value">{items_con_stock:,}</div>
                </div>
                <div class="info-card">
                    <h4>0️⃣ Sin Stock (=0)</h4>
                    <div class="value">{items_sin_stock:,}</div>
                </div>
            </div>
            
            {f'''
            <div class="error-box">
                <h3 style="margin-top: 0; color: #c62828;">❌ Error</h3>
                <p style="color: #c62828;">{error_message}</p>
            </div>
            ''' if error_message else ''}
            
            <div style="margin-top: 30px; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
                <h3 style="margin-top: 0;">📊 Campos Sincronizados</h3>
                <ul style="line-height: 1.8;">
                    <li><strong>Stock:</strong> Cantidad disponible en ADM Cloud</li>
                    <li><strong>Location ID:</strong> Identificador de la ubicación</li>
                    <li><strong>Location Name:</strong> Nombre de la ubicación</li>
                    <li><strong>Product ID:</strong> ID del producto en ADM Cloud</li>
                    <li><strong>Updated At:</strong> Fecha/hora de última actualización</li>
                </ul>
            </div>
            
            <div class="footer">
                <p><strong>Ubicación:</strong> {location_name} (ID: {location_id})</p>
                <p><strong>Fecha/Hora:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
                <p>Este es un email automático del sistema WMS.</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    asunto = f"WMS: Sincronización {status_data['text']} - {location_name}"
    logger.info(f"Enviando email de estado de sincronización: {asunto}")
    resultado = enviar_email(asunto, html)
    if resultado:
        logger.info(f"Email de estado de sincronización enviado exitosamente para {location_name}")
    else:
        logger.error(f"Error al enviar email de estado de sincronización para {location_name}")


