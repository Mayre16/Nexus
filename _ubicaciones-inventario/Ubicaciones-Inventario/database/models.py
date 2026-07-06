"""
Modelos de base de datos para el sistema WMS
"""
from datetime import datetime
from database import db

class Usuario(db.Model):
    """Modelo de usuarios del sistema"""
    __tablename__ = 'usuarios'
    
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    rol = db.Column(db.String(50), nullable=False, default='despachador')  # despachador, almacenista, administrador
    activo = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    # Campos añadidos por migración 001
    updated_at = db.Column(db.DateTime, nullable=True, onupdate=datetime.utcnow)
    last_login_at = db.Column(db.DateTime, nullable=True)
    must_change_password = db.Column(db.Boolean, default=False, nullable=True)
    password_updated_at = db.Column(db.DateTime, nullable=True)
    
    # Relaciones
    movimientos = db.relationship('Movimiento', backref='usuario', lazy=True)
    facturas_procesadas = db.relationship('FacturaProcesada', foreign_keys='FacturaProcesada.usuario_despachador', backref='usuario_despachador_rel', lazy=True)
    facturas_solicitadas = db.relationship('FacturaProcesada', foreign_keys='FacturaProcesada.usuario_solicitante', backref='usuario_solicitante_rel', lazy=True)
    
    def __repr__(self):
        return f'<Usuario {self.email}>'
    
    def to_dict(self):
        """Convierte el usuario a diccionario (sin password)"""
        d = {
            'id': self.id,
            'nombre': self.nombre,
            'email': self.email,
            'rol': self.rol,
            'activo': self.activo,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        # Campos opcionales (migración 001) - getattr por compatibilidad
        if hasattr(self, 'last_login_at') and self.last_login_at:
            d['last_login_at'] = self.last_login_at.isoformat()
        if hasattr(self, 'must_change_password'):
            d['must_change_password'] = bool(self.must_change_password)
        if hasattr(self, 'updated_at') and self.updated_at:
            d['updated_at'] = self.updated_at.isoformat()
        if hasattr(self, 'password_updated_at') and self.password_updated_at:
            d['password_updated_at'] = self.password_updated_at.isoformat()
        return d


class StockUbicacion(db.Model):
    """Stock de productos por ubicación"""
    __tablename__ = 'stock_por_ubicacion'
    
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.String(100), nullable=False)  # ItemID de ADM Cloud
    sku = db.Column(db.String(100), nullable=False, index=True)
    ubicacion = db.Column(db.String(50), nullable=False, index=True)
    cantidad = db.Column(db.Numeric(10, 2), default=0, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Índice único: un producto solo puede tener una entrada por ubicación
    __table_args__ = (db.UniqueConstraint('product_id', 'ubicacion', name='uq_producto_ubicacion'),)
    
    def __repr__(self):
        return f'<StockUbicacion {self.sku} en {self.ubicacion}: {self.cantidad}>'
    
    def to_dict(self):
        """Convierte a diccionario"""
        return {
            'id': self.id,
            'product_id': self.product_id,
            'sku': self.sku,
            'ubicacion': self.ubicacion,
            'cantidad': float(self.cantidad) if self.cantidad else 0.0,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class Movimiento(db.Model):
    """Movimientos de inventario (recepciones, picks, transferencias, ajustes)"""
    __tablename__ = 'movimientos'
    
    id = db.Column(db.Integer, primary_key=True)
    tipo = db.Column(db.String(20), nullable=False, index=True)  # RECEIPT, PICK, TRANSFER, ADJUSTMENT
    product_id = db.Column(db.String(100), nullable=False)
    sku = db.Column(db.String(100), nullable=False, index=True)
    ubicacion_origen = db.Column(db.String(200), nullable=True)  # Ampliado de 50 a 200 para LocationName ADM
    ubicacion_destino = db.Column(db.String(200), nullable=True)  # Ampliado de 50 a 200 para LocationName ADM
    cantidad = db.Column(db.Numeric(10, 2), nullable=False)
    factura_id = db.Column(db.String(100), nullable=True, index=True)  # DocID o GUID de ADM
    factura_guid = db.Column(db.String(100), nullable=True, index=True)  # GUID completo de ADM
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    notas = db.Column(db.Text, nullable=True)
    
    def __repr__(self):
        return f'<Movimiento {self.tipo} {self.sku} {self.cantidad}>'
    
    def to_dict(self):
        """Convierte a diccionario"""
        return {
            'id': self.id,
            'tipo': self.tipo,
            'product_id': self.product_id,
            'sku': self.sku,
            'ubicacion_origen': self.ubicacion_origen,
            'ubicacion_destino': self.ubicacion_destino,
            'cantidad': float(self.cantidad) if self.cantidad else 0.0,
            'factura_id': self.factura_id,
            'factura_guid': self.factura_guid,
            'usuario_id': self.usuario_id,
            'usuario_nombre': self.usuario.nombre if self.usuario else None,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'notas': self.notas
        }


class FacturaProcesada(db.Model):
    """Facturas procesadas en el sistema (cache y control de despacho)"""
    __tablename__ = 'facturas_procesadas'
    
    id = db.Column(db.Integer, primary_key=True)
    factura_docid = db.Column(db.String(50), nullable=False, index=True)  # DocID: "00002932"
    factura_guid = db.Column(db.String(100), unique=True, nullable=False)  # GUID de ADM
    tipo_factura = db.Column(db.String(20), nullable=False)  # CASH, CREDIT, ORDER
    cliente = db.Column(db.String(200), nullable=True)
    fecha = db.Column(db.DateTime, nullable=True)
    total = db.Column(db.Numeric(10, 2), nullable=True)
    estado_despacho = db.Column(db.String(20), default='PENDIENTE', nullable=False)  # PENDIENTE, EN_PROCESO, COMPLETO, CANCELADO
    usuario_despachador = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=True)
    usuario_solicitante = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=True)  # Usuario que buscó/solicitó el documento
    fecha_inicio = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    # Cache de productos JSON
    productos_json = db.Column(db.Text, nullable=True)  # JSON con los productos de la factura
    # NUEVO: Ubicación ADM de origen
    location_id = db.Column(db.String(100), nullable=True, index=True)  # GUID ubicación ADM
    location_name = db.Column(db.String(200), nullable=True)  # "ADESA", "Mirador Sur", etc.
    
    def __repr__(self):
        return f'<FacturaProcesada {self.factura_docid} - {self.estado_despacho}>'
    
    def to_dict(self):
        """Convierte a diccionario"""
        import json
        productos = json.loads(self.productos_json) if self.productos_json else []
        return {
            'id': self.id,
            'factura_docid': self.factura_docid,
            'factura_guid': self.factura_guid,
            'tipo_factura': self.tipo_factura,
            'cliente': self.cliente,
            'fecha': self.fecha.isoformat() if self.fecha else None,
            'total': float(self.total) if self.total else 0.0,
            'estado_despacho': self.estado_despacho,
            'usuario_despachador': self.usuario_despachador,
            'usuario_solicitante': self.usuario_solicitante,
            'fecha_inicio': self.fecha_inicio.isoformat() if self.fecha_inicio else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'productos': productos,
            'location_id': self.location_id,
            'location_name': self.location_name,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class PendienteUbicacion(db.Model):
    """Productos pendientes de asignar ubicación (recepción)"""
    __tablename__ = 'pendientes_ubicacion'
    
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.String(100), nullable=False)
    sku = db.Column(db.String(100), nullable=False)
    cantidad = db.Column(db.Numeric(10, 2), nullable=False)
    referencia_compra = db.Column(db.String(100), nullable=True)  # PurchaseOrder ID
    status = db.Column(db.String(20), default='PENDIENTE', nullable=False)  # PENDIENTE, ASIGNADA
    ubicacion_asignada = db.Column(db.String(50), nullable=True)
    usuario_asigno = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    def __repr__(self):
        return f'<PendienteUbicacion {self.sku} - {self.status}>'
    
    def to_dict(self):
        """Convierte a diccionario"""
        return {
            'id': self.id,
            'product_id': self.product_id,
            'sku': self.sku,
            'cantidad': float(self.cantidad) if self.cantidad else 0.0,
            'referencia_compra': self.referencia_compra,
            'status': self.status,
            'ubicacion_asignada': self.ubicacion_asignada,
            'usuario_asigno': self.usuario_asigno,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class ProductoADM(db.Model):
    """Cache de productos de ADM Cloud para búsquedas rápidas"""
    __tablename__ = 'productos_adm'
    
    id = db.Column(db.Integer, primary_key=True)
    item_id = db.Column(db.String(100), unique=True, nullable=False, index=True)  # GUID de ADM Cloud
    nombre = db.Column(db.String(500), nullable=True)
    sku = db.Column(db.String(100), nullable=False, index=True)  # Índice para búsqueda rápida
    codigo_barras = db.Column(db.String(100), nullable=True, index=True)  # Código de barras si existe
    activo = db.Column(db.Boolean, default=True, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    synced_at = db.Column(db.DateTime, nullable=True)  # Última sincronización desde ADM
    
    # Relación con stock
    stock_ubicaciones = db.relationship('StockProductoADM', backref='producto', lazy=True, cascade='all, delete-orphan')
    
    def __repr__(self):
        return f'<ProductoADM {self.sku} - {self.nombre[:30]}>'
    
    def to_dict(self):
        """Convierte a diccionario"""
        return {
            'id': self.id,
            'item_id': self.item_id,
            'nombre': self.nombre,
            'sku': self.sku,
            'codigo_barras': self.codigo_barras,
            'activo': self.activo,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'synced_at': self.synced_at.isoformat() if self.synced_at else None,
            'stock_ubicaciones': [s.to_dict() for s in self.stock_ubicaciones] if self.stock_ubicaciones else []
        }


class StockProductoADM(db.Model):
    """Cache de stock de productos ADM por ubicación"""
    __tablename__ = 'stock_productos_adm'
    
    id = db.Column(db.Integer, primary_key=True)
    producto_id = db.Column(db.Integer, db.ForeignKey('productos_adm.id'), nullable=False, index=True)
    location_id = db.Column(db.String(100), nullable=False)  # GUID de ubicación ADM
    location_name = db.Column(db.String(200), nullable=False)  # Nombre de la ubicación (ej: "ADESA")
    stock = db.Column(db.Numeric(10, 2), default=0, nullable=False)
    sync_run_id = db.Column(db.Integer, db.ForeignKey('sync_runs.run_id'), nullable=True, index=True)  # NUEVO: Identifica a qué run pertenece
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Índice único: un producto solo puede tener una entrada por ubicación ADM POR RUN
    __table_args__ = (db.UniqueConstraint('producto_id', 'location_id', 'sync_run_id', name='uq_producto_location_run_adm'),)
    
    def __repr__(self):
        return f'<StockProductoADM {self.location_name}: {self.stock}>'
    
    def to_dict(self):
        """Convierte a diccionario"""
        return {
            'id': self.id,
            'location_id': self.location_id,
            'location_name': self.location_name,
            'stock': float(self.stock) if self.stock else 0.0,
            'sync_run_id': self.sync_run_id,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class SyncLocationStatus(db.Model):
    """Estado de sincronización por ubicación (checkpoints)"""
    __tablename__ = 'sync_locations_status'
    
    id = db.Column(db.Integer, primary_key=True)
    location_id = db.Column(db.String(100), unique=True, nullable=False, index=True)  # GUID de ubicación ADM
    location_name = db.Column(db.String(200), nullable=False)  # Nombre de la ubicación (ej: "ADESA")
    status = db.Column(db.String(20), default='pending', nullable=False, index=True)  # pending, running, done, error, paused, partial
    last_sync_at = db.Column(db.DateTime, nullable=True)  # Última sincronización exitosa
    last_error = db.Column(db.Text, nullable=True)  # Último error si status = 'error'
    items_synced = db.Column(db.Integer, default=0, nullable=False)  # Cantidad de items con stock > 0 sincronizados
    # Nuevos campos para sincronización por lotes
    total_items = db.Column(db.Integer, default=0, nullable=False)  # Total de items encontrados en ADM
    skip_actual = db.Column(db.Integer, default=0, nullable=False)  # Skip actual (desde dónde continuar)
    lote_actual = db.Column(db.Integer, default=0, nullable=False)  # Lote actual (1, 2, 3...)
    # NUEVO: IDs de runs para staging
    current_run_id = db.Column(db.Integer, db.ForeignKey('sync_runs.run_id'), nullable=True)  # LIVE (último run exitoso)
    running_run_id = db.Column(db.Integer, db.ForeignKey('sync_runs.run_id'), nullable=True)  # Run en ejecución
    last_heartbeat_at = db.Column(db.DateTime, nullable=True)  # Heartbeat durante sync (detectar zombies)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    def __repr__(self):
        return f'<SyncLocationStatus {self.location_name} - {self.status}>'
    
    def to_dict(self):
        """Convierte a diccionario"""
        return {
            'id': self.id,
            'location_id': self.location_id,
            'location_name': self.location_name,
            'status': self.status,
            'last_sync_at': self.last_sync_at.isoformat() if self.last_sync_at else None,
            'last_error': self.last_error,
            'items_synced': self.items_synced,
            'total_items': self.total_items,
            'skip_actual': self.skip_actual,
            'lote_actual': self.lote_actual,
            'current_run_id': self.current_run_id,
            'running_run_id': self.running_run_id,
            'last_heartbeat_at': self.last_heartbeat_at.isoformat() if self.last_heartbeat_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class Discrepancia(db.Model):
    """Discrepancias críticas entre stock ERP (ADM) y stock físico (WMS)"""
    __tablename__ = 'discrepancias'
    
    id = db.Column(db.Integer, primary_key=True)
    producto_id = db.Column(db.Integer, db.ForeignKey('productos_adm.id'), nullable=False, index=True)
    sku = db.Column(db.String(100), nullable=False, index=True)
    location_id = db.Column(db.String(100), nullable=True, index=True)  # Ubicación ADM
    location_name = db.Column(db.String(200), nullable=True)  # Nombre ubicación ADM
    ubicacion_fisica = db.Column(db.String(50), nullable=True)  # Ubicación física WMS
    
    stock_erp = db.Column(db.Numeric(10, 2), default=0, nullable=False)  # Stock ADM (ERP cache)
    stock_fisico_wms = db.Column(db.Numeric(10, 2), default=0, nullable=False)  # Stock físico WMS
    
    tipo = db.Column(db.String(20), default='critica', nullable=False)  # critica, menor, etc.
    estado = db.Column(db.String(20), default='pendiente', nullable=False, index=True)  # pendiente, revisado, resuelto
    
    fecha_deteccion = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    fecha_revision = db.Column(db.DateTime, nullable=True)
    fecha_resolucion = db.Column(db.DateTime, nullable=True)
    
    notas = db.Column(db.Text, nullable=True)  # Notas del administrador
    resuelto_por = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=True)
    
    # Relación con producto
    producto = db.relationship('ProductoADM', backref='discrepancias')
    
    def __repr__(self):
        return f'<Discrepancia {self.sku} - {self.location_name}: ERP={self.stock_erp}, Físico={self.stock_fisico_wms}>'
    
    def to_dict(self):
        """Convierte a diccionario"""
        return {
            'id': self.id,
            'producto_id': self.producto_id,
            'sku': self.sku,
            'location_id': self.location_id,
            'location_name': self.location_name,
            'ubicacion_fisica': self.ubicacion_fisica,
            'stock_erp': float(self.stock_erp) if self.stock_erp else 0.0,
            'stock_fisico_wms': float(self.stock_fisico_wms) if self.stock_fisico_wms else 0.0,
            'tipo': self.tipo,
            'estado': self.estado,
            'fecha_deteccion': self.fecha_deteccion.isoformat() if self.fecha_deteccion else None,
            'fecha_revision': self.fecha_revision.isoformat() if self.fecha_revision else None,
            'fecha_resolucion': self.fecha_resolucion.isoformat() if self.fecha_resolucion else None,
            'notas': self.notas,
            'resuelto_por': self.resuelto_por
        }


class RecepcionProcesada(db.Model):
    """Control de recepciones procesadas desde ADM Cloud (persistencia al cargar)"""
    __tablename__ = 'recepciones_procesadas'
    
    id = db.Column(db.Integer, primary_key=True)
    recepcion_guid = db.Column(db.String(100), unique=True, nullable=False, index=True)  # GUID de ADM
    recepcion_docid = db.Column(db.String(50), nullable=False, index=True)  # DocID: "00001234"
    tipo_recepcion = db.Column(db.String(30), nullable=False)  # RECEPTION, VEND_REC, CREDIT_NOTE
    cliente = db.Column(db.String(200), nullable=True)  # Proveedor, cliente o referencia
    fecha = db.Column(db.DateTime, nullable=True)
    total = db.Column(db.Numeric(10, 2), nullable=True)
    location_id = db.Column(db.String(100), nullable=True, index=True)
    location_name = db.Column(db.String(200), nullable=True)
    
    estado_recepcion = db.Column(db.String(20), default='PENDIENTE', nullable=False, index=True)  # PENDIENTE, EN_PROCESO, COMPLETO
    usuario_solicitante = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=True)  # Usuario que buscó/cargó
    usuario_procesador = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=True)
    fecha_inicio = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    
    productos_json = db.Column(db.Text, nullable=True)  # JSON con productos
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    __table_args__ = (db.UniqueConstraint('recepcion_guid', name='uq_recepcion_guid'),)
    
    def __repr__(self):
        return f'<RecepcionProcesada {self.recepcion_docid} - {self.estado_recepcion}>'
    
    def to_dict(self):
        import json
        productos = json.loads(self.productos_json) if self.productos_json else []
        return {
            'id': self.id,
            'recepcion_guid': self.recepcion_guid,
            'recepcion_docid': self.recepcion_docid,
            'tipo_recepcion': self.tipo_recepcion,
            'cliente': self.cliente,
            'fecha': self.fecha.isoformat() if self.fecha else None,
            'total': float(self.total) if self.total else 0.0,
            'location_id': self.location_id,
            'location_name': self.location_name,
            'estado_recepcion': self.estado_recepcion,
            'productos': productos,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class TransferenciaProcesada(db.Model):
    """Control de transferencias procesadas desde ADM Cloud"""
    __tablename__ = 'transferencias_procesadas'
    
    id = db.Column(db.Integer, primary_key=True)
    transferencia_docid = db.Column(db.String(50), nullable=False, index=True)  # DocID: "00000231"
    transferencia_guid = db.Column(db.String(100), unique=True, nullable=False, index=True)  # GUID de ADM
    location_id_origen = db.Column(db.String(100), nullable=False)  # GUID ubicación origen
    location_name_origen = db.Column(db.String(200), nullable=False)  # "ADESA"
    location_id_destino = db.Column(db.String(100), nullable=False)  # GUID ubicación destino
    location_name_destino = db.Column(db.String(200), nullable=False)  # "Mirador Sur"
    fecha_transferencia = db.Column(db.DateTime, nullable=True)  # Fecha en ADM
    estado_procesamiento = db.Column(db.String(20), default='PENDIENTE', nullable=False, index=True)  
    # PENDIENTE, PROCESADA, ERROR
    
    # Mapeo de ubicaciones físicas WMS
    ubicacion_fisica_origen = db.Column(db.String(50), nullable=True)  # "A-01-02" (si aplica)
    ubicacion_fisica_destino = db.Column(db.String(50), nullable=True)  # "B-03-04" (si aplica)
    
    usuario_procesador = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=True)
    usuario_solicitante = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=True)  # Usuario que buscó/solicitó la transferencia
    fecha_procesamiento = db.Column(db.DateTime, nullable=True)
    
    # Cache de productos JSON
    productos_json = db.Column(db.Text, nullable=True)  # JSON con productos transferidos
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Índice único para evitar duplicados
    __table_args__ = (db.UniqueConstraint('transferencia_guid', name='uq_transferencia_guid'),)
    
    def __repr__(self):
        return f'<TransferenciaProcesada {self.transferencia_docid} - {self.estado_procesamiento}>'
    
    def to_dict(self):
        """Convierte a diccionario"""
        import json
        productos = json.loads(self.productos_json) if self.productos_json else []
        return {
            'id': self.id,
            'transferencia_docid': self.transferencia_docid,
            'transferencia_guid': self.transferencia_guid,
            'location_id_origen': self.location_id_origen,
            'location_name_origen': self.location_name_origen,
            'location_id_destino': self.location_id_destino,
            'location_name_destino': self.location_name_destino,
            'fecha_transferencia': self.fecha_transferencia.isoformat() if self.fecha_transferencia else None,
            'estado_procesamiento': self.estado_procesamiento,
            'ubicacion_fisica_origen': self.ubicacion_fisica_origen,
            'ubicacion_fisica_destino': self.ubicacion_fisica_destino,
            'usuario_procesador': self.usuario_procesador,
            'usuario_solicitante': self.usuario_solicitante,
            'fecha_procesamiento': self.fecha_procesamiento.isoformat() if self.fecha_procesamiento else None,
            'productos': productos,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class MapeoUbicacionADM_WMS(db.Model):
    """Mapeo entre ubicaciones ADM Cloud y ubicaciones físicas WMS"""
    __tablename__ = 'mapeo_ubicaciones_adm_wms'
    
    id = db.Column(db.Integer, primary_key=True)
    location_id_adm = db.Column(db.String(100), nullable=False, index=True)  # GUID ubicación ADM
    location_name_adm = db.Column(db.String(200), nullable=False)  # "ADESA", "Mirador Sur", etc.
    ubicacion_fisica_wms = db.Column(db.String(50), nullable=False)  # "A-01-02", "B-03-04", etc.
    activo = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Índice único: una ubicación ADM puede mapear a múltiples ubicaciones WMS
    # Pero no puede haber duplicados exactos
    __table_args__ = (db.UniqueConstraint('location_id_adm', 'ubicacion_fisica_wms', name='uq_mapeo_adm_wms'),)
    
    def __repr__(self):
        return f'<MapeoUbicacionADM_WMS {self.location_name_adm} -> {self.ubicacion_fisica_wms}>'
    
    def to_dict(self):
        """Convierte a diccionario"""
        return {
            'id': self.id,
            'location_id_adm': self.location_id_adm,
            'location_name_adm': self.location_name_adm,
            'ubicacion_fisica_wms': self.ubicacion_fisica_wms,
            'activo': self.activo,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class UbicacionFisica(db.Model):
    """Ubicaciones físicas del almacén WMS (ej: A-01-02, B-03-04, etc.)"""
    __tablename__ = 'ubicaciones_fisicas'
    
    id = db.Column(db.Integer, primary_key=True)
    codigo = db.Column(db.String(50), unique=True, nullable=False, index=True)  # "A-01-02"
    nombre = db.Column(db.String(200), nullable=False)  # "Pasillo A, Estante 01, Nivel 02"
    descripcion = db.Column(db.Text, nullable=True)  # Descripción opcional
    activa = db.Column(db.Boolean, default=True, nullable=False)  # Si está activa o no
    tipo = db.Column(db.String(50), nullable=True)  # "PASILLO", "ESTANTE", "ZONA", etc. (opcional)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    def __repr__(self):
        return f'<UbicacionFisica {self.codigo}>'
    
    def to_dict(self):
        """Convierte a diccionario"""
        return {
            'id': self.id,
            'codigo': self.codigo,
            'nombre': self.nombre,
            'descripcion': self.descripcion,
            'activa': self.activa,
            'tipo': self.tipo,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class SyncRun(db.Model):
    """Registro de cada ejecución de sincronización (staging)"""
    __tablename__ = 'sync_runs'
    
    run_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    location_id = db.Column(db.String(100), nullable=False, index=True)
    location_name = db.Column(db.String(200), nullable=False)
    
    status = db.Column(db.String(20), default='running', nullable=False, index=True)
    # running, done, partial, failed, cancelled
    
    started_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    finished_at = db.Column(db.DateTime, nullable=True)
    
    items_synced = db.Column(db.Integer, default=0, nullable=False)
    total_items = db.Column(db.Integer, default=0, nullable=False)
    
    previous_run_id = db.Column(db.Integer, nullable=True)  # Para comparar con OLD
    
    # Metadata adicional
    sync_type = db.Column(db.String(20), default='full', nullable=False)  # full, partial
    errors_count = db.Column(db.Integer, default=0, nullable=False)
    warnings_count = db.Column(db.Integer, default=0, nullable=False)
    notas = db.Column(db.Text, nullable=True)  # Notas adicionales (ej: motivo de partial/failed)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relación con StockProductoADM
    stock_records = db.relationship('StockProductoADM', backref='sync_run', lazy='dynamic', foreign_keys='StockProductoADM.sync_run_id')
    
    def __repr__(self):
        return f'<SyncRun {self.location_name} - {self.status} - run_id={self.run_id}>'
    
    def to_dict(self):
        """Convierte a diccionario"""
        return {
            'run_id': self.run_id,
            'location_id': self.location_id,
            'location_name': self.location_name,
            'status': self.status,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'finished_at': self.finished_at.isoformat() if self.finished_at else None,
            'items_synced': self.items_synced,
            'total_items': self.total_items,
            'previous_run_id': self.previous_run_id,
            'sync_type': self.sync_type,
            'errors_count': self.errors_count,
            'warnings_count': self.warnings_count,
            'notas': self.notas,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class SchedulerLock(db.Model):
    """Lock global para el tick automático (evitar dos crons simultáneos)"""
    __tablename__ = 'scheduler_lock'
    
    id = db.Column(db.Integer, primary_key=True, default=1)
    locked_until = db.Column(db.DateTime, nullable=True)
    locked_by = db.Column(db.String(64), nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class EnRevision(db.Model):
    """SKUs que requieren revisión después de sincronización"""
    __tablename__ = 'en_revision'
    
    id = db.Column(db.Integer, primary_key=True)
    producto_id = db.Column(db.Integer, db.ForeignKey('productos_adm.id'), nullable=False, index=True)
    sku = db.Column(db.String(100), nullable=False, index=True)
    location_id = db.Column(db.String(100), nullable=False, index=True)
    location_name = db.Column(db.String(200), nullable=True)
    
    motivo = db.Column(db.Text, nullable=False)  # Descripción del problema
    tipo = db.Column(db.String(50), nullable=False, index=True)  # desaparecido, cambio_brusco, critica_adm_vs_fisico, etc.
    severidad = db.Column(db.String(20), default='media', nullable=False, index=True)  # critica, alta, media, baja
    
    run_detectado = db.Column(db.Integer, db.ForeignKey('sync_runs.run_id'), nullable=False, index=True)
    estado = db.Column(db.String(20), default='pendiente', nullable=False, index=True)
    # pendiente, resuelto, ignorado, ignorado_automatico
    
    stock_old = db.Column(db.Numeric(10, 2), nullable=True)
    stock_new = db.Column(db.Numeric(10, 2), nullable=True)
    stock_fisico = db.Column(db.Numeric(10, 2), nullable=True)
    
    fecha_deteccion = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    fecha_resolucion = db.Column(db.DateTime, nullable=True)
    resuelto_por = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=True)
    notas = db.Column(db.Text, nullable=True)
    
    # Contador de repeticiones (para casos crónicos)
    veces_detectado = db.Column(db.Integer, default=1)
    
    # Relaciones
    producto = db.relationship('ProductoADM', backref='en_revision')
    sync_run = db.relationship('SyncRun', backref='en_revision')
    
    def __repr__(self):
        return f'<EnRevision {self.sku} - {self.location_name} - {self.estado}>'
    
    def to_dict(self):
        """Convierte a diccionario"""
        return {
            'id': self.id,
            'producto_id': self.producto_id,
            'sku': self.sku,
            'location_id': self.location_id,
            'location_name': self.location_name,
            'motivo': self.motivo,
            'tipo': self.tipo,
            'severidad': self.severidad,
            'run_detectado': self.run_detectado,
            'estado': self.estado,
            'stock_old': float(self.stock_old) if self.stock_old else None,
            'stock_new': float(self.stock_new) if self.stock_new else None,
            'stock_fisico': float(self.stock_fisico) if self.stock_fisico else None,
            'fecha_deteccion': self.fecha_deteccion.isoformat() if self.fecha_deteccion else None,
            'fecha_resolucion': self.fecha_resolucion.isoformat() if self.fecha_resolucion else None,
            'resuelto_por': self.resuelto_por,
            'notas': self.notas,
            'veces_detectado': self.veces_detectado
        }


class AbastecimientoPolitica(db.Model):
    """Mínimos/máximos de abastecimiento por producto y ubicación ADM (ej. Mirador Sur)."""
    __tablename__ = 'abastecimiento_politica'

    id = db.Column(db.Integer, primary_key=True)
    producto_id = db.Column(db.Integer, db.ForeignKey('productos_adm.id'), nullable=False, index=True)
    location_id = db.Column(db.String(100), nullable=False, index=True)
    stock_min = db.Column(db.Numeric(10, 2), nullable=False)
    stock_max = db.Column(db.Numeric(10, 2), nullable=False)
    activo = db.Column(db.Boolean, default=True, nullable=False)
    # Define si el producto forma parte del universo principal de abastecimiento de la ubicación.
    es_base_abastecimiento = db.Column(db.Boolean, default=False, nullable=False, index=True)
    observacion = db.Column(db.String(500), nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=True)

    producto = db.relationship('ProductoADM', backref=db.backref('politicas_abastecimiento', lazy='dynamic'))
    __table_args__ = (db.UniqueConstraint('producto_id', 'location_id', name='uq_abast_producto_ubicacion'),)

    def __repr__(self):
        return f'<AbastecimientoPolitica producto_id={self.producto_id} loc={self.location_id[:8]}...>'


class NotificacionesConfig(db.Model):
    """Configuración de notificaciones por email"""
    __tablename__ = 'notificaciones_config'
    
    id = db.Column(db.Integer, primary_key=True)
    # Email de discrepancias (ya implementado)
    email_discrepancias_activo = db.Column(db.Boolean, default=True, nullable=False)
    # Email de estado de sincronización (nuevo)
    email_estado_sync_activo = db.Column(db.Boolean, default=True, nullable=False)
    # Email de destinatario (puede ser diferente al de discrepancias en el futuro)
    email_destinatario = db.Column(db.String(200), nullable=True)
    # Timestamps
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    def __repr__(self):
        return f'<NotificacionesConfig id={self.id}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'email_discrepancias_activo': self.email_discrepancias_activo,
            'email_estado_sync_activo': self.email_estado_sync_activo,
            'email_destinatario': self.email_destinatario,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    @staticmethod
    def get_config():
        """Obtiene la configuración de notificaciones (crea una por defecto si no existe)"""
        config = NotificacionesConfig.query.first()
        if not config:
            config = NotificacionesConfig(
                email_discrepancias_activo=True,
                email_estado_sync_activo=True,
                email_destinatario=None  # Usará el de config.py por defecto
            )
            db.session.add(config)
            db.session.commit()
        return config


class AuditLog(db.Model):
    """Tabla de auditoría - registro de eventos del sistema (migración 002)"""
    __tablename__ = 'audit_log'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    event_type = db.Column(db.String(50), nullable=False, index=True)
    user_id = db.Column(db.Integer, nullable=True)
    target_user_id = db.Column(db.Integer, nullable=True)
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.Text, nullable=True)
    extra_data = db.Column(db.Text, nullable=True)  # JSON como texto (SQLite/MySQL compatible)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

