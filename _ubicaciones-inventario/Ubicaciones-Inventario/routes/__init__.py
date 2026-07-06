"""
Rutas del sistema WMS
"""
from routes.auth import auth_bp
from routes.despacho import despacho_bp
from routes.despachos import despachos_bp
from routes.facturas import facturas_bp
from routes.recepciones import recepciones_bp
from routes.transferencias import transferencias_bp
from routes.stock import stock_bp
from routes.dashboard import dashboard_bp
from routes.consulta import consulta_bp
from routes.ajustes import ajustes_bp
from routes.productos import productos_bp
from routes.sincronizar import sincronizar_bp
from routes.ubicaciones_fisicas import ubicaciones_fisicas_bp
from routes.historiales import historiales_bp
from routes.detalles import detalles_bp
from routes.admin import admin_bp
from routes.usuarios import usuarios_bp
from routes.abastecimiento import abastecimiento_bp

__all__ = ['auth_bp', 'despacho_bp', 'despachos_bp', 'facturas_bp', 'recepciones_bp', 'transferencias_bp', 'stock_bp', 'dashboard_bp', 'consulta_bp', 'ajustes_bp', 'productos_bp', 'sincronizar_bp', 'ubicaciones_fisicas_bp', 'historiales_bp', 'detalles_bp', 'admin_bp', 'usuarios_bp', 'abastecimiento_bp']

