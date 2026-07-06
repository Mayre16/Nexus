# Scripts de mantenimiento WMS

Ejecutar todos los scripts desde la **raíz del proyecto**:

```bash
python scripts/nombre_script.py
```

## Scripts esenciales

| Script | Descripción |
|--------|-------------|
| `init_db.py` | Inicializa BD y crea usuario admin por defecto |
| `crear_usuario.py` | Crea o actualiza usuario (editar NUEVO_USUARIO y ejecutar) |
| `cambiar_password.py` | Cambia contraseña de usuario (interactivo) |
| `reset_password.py` | Reseteo rápido para un email (editar variables) |
| `check_user.py` | Verifica usuarios existentes (editar target_email) |

## Scripts de migración

| Script | Descripción |
|--------|-------------|
| `migrar_sqlite_a_mysql.py` | Migración completa SQLite → MySQL |
| `migrar_sqlite_a_mysql_simple.py` | Migración simplificada |
| `migrar_tablas.py` / `migrar_tablas_nuevas.py` | Crear tablas nuevas |
| `migrar_campo_usuario_solicitante.py` | Añadir campo usuario_solicitante |
| `migrar_campos_lotes_sync.py` | Campos de lotes de sincronización |

## Scripts de instalación/dependencias

| Script | Descripción |
|--------|-------------|
| `instalar_pymysql.py` | Instalar PyMySQL en entorno cPanel |
| `instalar_openpyxl.py` | Instalar openpyxl |
| `install_dateutil.py` | Instalar python-dateutil |
| `crear_indices.py` | Crear índices en BD para rendimiento |

## Scripts de diagnóstico y corrección

| Script | Descripción |
|--------|-------------|
| `verificar_bd_sync.py` | Verificar estado de sincronización |
| `verificar_migracion.py` | Verificar migración completada |
| `verificar_codigo_barras.py` | Verificar códigos de barras |
| `verificar_rutas_auth.py` | Verificar rutas de autenticación |
| `diagnostico_sincronizacion.py` | Diagnóstico de sync |
| `corregir_sincronizacion.py` | Corregir problemas de sync |
| `corregir_registros_sin_run_id.py` | Corregir registros sin run_id |
| `desbloquear_sincronizacion.py` | Desbloquear sync bloqueada |
| `buscar_casos_item_id.py` | Buscar casos por item_id |
| `limpiar_bd_mysql.py` | Limpiar BD MySQL |
| `limpiar_registros_legacy.py` | Limpiar registros legacy |

## Scripts de backup

| Script | Descripción |
|--------|-------------|
| `crear_backup.py` | Crear backup de BD |
| `restaurar_backup.py` | Restaurar desde backup |
