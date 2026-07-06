# WMS - Sistema de Gestión de Almacenes

Sistema de gestión de almacenes (WMS) integrado con ADM Cloud para el control de inventario físico.

## 📁 Estructura del Proyecto

```
Ubicaciones-Inventario/
├── app_wms.py              # Aplicación principal Flask
├── config.py               # Configuración del sistema
├── passenger_wsgi.py       # Entry point para cPanel/Passenger
├── requirements.txt        # Dependencias Python
│
├── api/                    # Integración con ADM Cloud
│   └── adm_cloud.py
│
├── database/               # Modelos de base de datos
│   └── models.py
│
├── routes/                 # Rutas y endpoints de la aplicación
│   ├── auth.py
│   ├── recepciones.py
│   ├── transferencias.py
│   ├── despacho.py
│   ├── ajustes.py
│   └── ...
│
├── templates/              # Plantillas HTML
│   ├── index.html
│   ├── recepciones.html
│   ├── transferencias.html
│   └── ...
│
├── static/                 # Archivos estáticos (CSS, JS)
│
├── utils/                  # Utilidades y helpers
│   ├── helpers.py
│   └── validaciones.py
│
├── scripts/                # Scripts de migración y utilidades
│   ├── init_db.py
│   ├── migrar_*.py
│   └── ...
│
├── docs/                   # Documentación del proyecto
│   ├── REGLAS_DE_ORO_SISTEMA.md
│   ├── INFORME_MODULO_*.md
│   └── ...
│
└── backups/                # Backups del sistema
```

## 🚀 Inicio Rápido

### Requisitos
- Python 3.11+
- SQLite (o MySQL para producción)
- Acceso a API ADM Cloud

### Instalación

1. Instalar dependencias:
```bash
pip install -r requirements.txt
```

2. Inicializar base de datos:
```bash
python scripts/init_db.py
```

3. Configurar `config.py` con credenciales ADM Cloud

4. Ejecutar aplicación:
```bash
python app_wms.py
```

## 📚 Documentación

Toda la documentación técnica se encuentra en la carpeta `docs/`:

- **REGLAS_DE_ORO_SISTEMA.md** - Reglas fundamentales del sistema
- **INFORME_MODULO_*.md** - Documentación de cada módulo
- **PLAN_TECNICO_*.md** - Planes técnicos de implementación

## 🔑 Reglas de Oro del Sistema

1. **Stock 0 en ADM**: Productos con stock 0 en ADM Cloud no deben aparecer en el WMS
2. **Consultas desde cache local**: Todas las consultas de productos se realizan desde la BD local
3. **Discrepancias críticas**: Alertar cuando el stock físico (WMS) difiere del stock ADM
4. **ADESA vs NO-ADESA**: Diferenciar ubicaciones físicas controladas por WMS vs ubicaciones externas

## 🛠️ Scripts Disponibles

- `scripts/init_db.py` - Inicializar base de datos
- `scripts/migrar_*.py` - Scripts de migración de datos
- `scripts/crear_backup.py` - Crear backup de la base de datos
- `scripts/restaurar_backup.py` - Restaurar backup

## 📝 Módulos Principales

- **Recepciones**: Registro de recepciones desde ADM Cloud con asignación de ubicaciones físicas
- **Transferencias**: Gestión de transferencias entre ubicaciones (ADESA/NO-ADESA)
- **Despachos**: Proceso de despacho de productos
- **Ajustes**: Ajustes de inventario físico
- **Sincronización**: Sincronización de productos y stock desde ADM Cloud

## 🔒 Seguridad

- Autenticación requerida para todas las rutas excepto `/login`
- Roles de usuario: Admin, Usuario
- Operaciones sensibles (reversión) solo para administradores

## 📞 Soporte

Para más información, consultar la documentación en `docs/`.









