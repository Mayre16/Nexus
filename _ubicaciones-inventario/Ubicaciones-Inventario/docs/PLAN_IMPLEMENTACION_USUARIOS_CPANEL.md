# Plan de Implementación: Módulo de Usuarios y Seguridad en cPanel (sin consola)

**Fecha:** 17 de febrero de 2025  
**Entorno:** cPanel + Passenger (Python App), sin SSH/consola  
**Objetivo:** Implementar migraciones, feature flags y funcionalidad sin romper producción

---

## 1. Plan de migración sin Alembic y sin consola

### 1.1 Estructura de scripts de migración

```
scripts/
└── migrations/
    ├── __init__.py
    ├── 001_add_usuario_fields.py      ← Campos en tabla usuarios
    ├── 002_create_audit_log.py        ← Tabla audit_log (opcional, Fase posterior)
    └── README_MIGRACIONES.md          ← Instrucciones
```

### 1.2 Requisitos de cada script

| Requisito | Implementación |
|-----------|----------------|
| **Idempotente** | Verificar existencia de columna/tabla antes de `ALTER TABLE` / `CREATE TABLE`. Si ya existe, imprimir "ya aplicado" y salir con éxito. |
| **SQLite + MySQL** | Detectar motor con `db.engine.url.drivername` o `'sqlite' in str(db.engine.url)`. SQLite: `ALTER TABLE ADD COLUMN` (sin `IF NOT EXISTS` nativo; usar `pragma table_info` para verificar). MySQL: `ALTER TABLE ADD COLUMN IF NOT EXISTS` (MySQL 8.0) o verificar `information_schema`. |
| **Salida clara** | `print()` con prefijos tipo `[OK]`, `[SKIP]`, `[ERROR]`. Al final: resumen de cambios aplicados. |
| **Validación previa** | Comprobar que existe tabla `usuarios` antes de alterar. Si no existe, abortar con mensaje explícito. |
| **Permisos** | En `except` de `db.session.execute()`, capturar `OperationalError` / `ProgrammingError` e imprimir: `"ERROR: No se pudo ejecutar. Posible falta de permisos ALTER en la BD. Contacte al proveedor."` |
| **Configuración producción** | Importar `from app_wms import app` y usar `with app.app_context():`. El script debe auto-ajustar `sys.path` y `os.chdir` para funcionar cuando cPanel ejecute desde cualquier directorio. |

### 1.3 Código base para migraciones (template)

Cada script de migración debe incluir este bloque al inicio para garantizar que importe correctamente en cPanel:

```python
"""
Migración 001: Añadir campos de auditoría y control a tabla usuarios
Ejecutar desde cPanel: Execute python script → scripts/migrations/001_add_usuario_fields.py
"""
import sys
import os

# Asegurar que el script encuentra la app (para cPanel Execute python script)
_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, '..', '..'))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)
os.chdir(_project_root)

from app_wms import app
from database import db
from sqlalchemy import text
```

### 1.4 Migración 001: Campos en Usuario

**Archivo:** `scripts/migrations/001_add_usuario_fields.py`

**Campos a añadir:**

| Columna | Tipo | Default | Nullable |
|---------|------|---------|----------|
| `updated_at` | DateTime | NULL | True |
| `last_login_at` | DateTime | NULL | True |
| `must_change_password` | Boolean | 0/False | True |
| `password_updated_at` | DateTime | NULL | True |

**Lógica idempotente (ejemplo para SQLite):**
```
1. Verificar que tabla usuarios existe
2. Para cada columna:
   - SQLite: SELECT * FROM pragma_table_info('usuarios') WHERE name='columna'
   - MySQL: SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_NAME='usuarios' AND COLUMN_NAME='columna'
3. Si la columna NO existe → ejecutar ALTER TABLE ADD COLUMN
4. Si existe → imprimir [SKIP] columna ya existe
```

**MySQL:** Usar `ALTER TABLE usuarios ADD COLUMN columna tipo DEFAULT valor` (sin `IF NOT EXISTS` en versiones antiguas; la verificación previa evita errores).

### 1.5 Migración 002: Tabla audit_log (Fase posterior)

**Archivo:** `scripts/migrations/002_create_audit_log.py`

**Estructura propuesta:**
```sql
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,  -- MySQL: AUTO_INCREMENT
    event_type VARCHAR(50) NOT NULL,
    user_id INTEGER,
    target_user_id INTEGER,
    ip_address VARCHAR(45),
    user_agent TEXT,
    extra_data JSON/TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Idempotencia:** `CREATE TABLE IF NOT EXISTS audit_log (...)` existe en SQLite y MySQL.

### 1.6 Detección de motor (SQLite vs MySQL)

```python
def get_db_engine():
    url = str(db.engine.url)
    if 'sqlite' in url:
        return 'sqlite'
    if 'mysql' in url or 'mariadb' in url:
        return 'mysql'
    return 'unknown'
```

---

## 2. Instrucciones para ejecutar en cPanel

### 2.1 Ubicación de los scripts

Sube los archivos a la raíz de tu aplicación (donde está `app_wms.py`, `passenger_wsgi.py`):

```
/home2/adesa/wms.adesa.com.do/   (o tu ruta real)
├── app_wms.py
├── passenger_wsgi.py
├── scripts/
│   └── migrations/
│       ├── 001_add_usuario_fields.py
│       └── 002_create_audit_log.py
```

### 2.2 Ruta exacta para "Execute python script"

En cPanel → **Web Applications** → tu app WMS → **Execute python script**:

| Campo | Valor a pegar |
|-------|---------------|
| **Script path** | `scripts/migrations/001_add_usuario_fields.py` |
| (Alternativa si piden ruta absoluta) | `/home2/adesa/wms.adesa.com.do/scripts/migrations/001_add_usuario_fields.py` |

**Nota:** La ruta puede ser relativa al Application Root definido en Setup Python App, o absoluta desde el home. Si una no funciona, probar la otra.

### 2.3 Orden de ejecución

1. **Primero:** `scripts/migrations/001_add_usuario_fields.py`
2. **Después (cuando actives auditoría):** `scripts/migrations/002_create_audit_log.py`

### 2.4 Output esperado para considerar "OK"

**001_add_usuario_fields.py — primera ejecución:**
```
[MIGRACION 001] Add campos usuario (updated_at, last_login_at, must_change_password, password_updated_at)
[DETECTADO] Motor: mysql
[VERIFICACION] Tabla usuarios existe
[EJECUTADO] Añadida columna updated_at
[EJECUTADO] Añadida columna last_login_at
[EJECUTADO] Añadida columna must_change_password
[EJECUTADO] Añadida columna password_updated_at
[OK] Migracion 001 completada correctamente
```

**001 — segunda ejecución (idempotente):**
```
[MIGRACION 001] Add campos usuario
[DETECTADO] Motor: mysql
[SKIP] Columna updated_at ya existe
[SKIP] Columna last_login_at ya existe
[SKIP] Columna must_change_password ya existe
[SKIP] Columna password_updated_at ya existe
[OK] Migracion 001 ya estaba aplicada. Nada que hacer.
```

**Si hay error de permisos:**
```
[ERROR] No se pudo ejecutar ALTER TABLE. Posible falta de permisos.
       El usuario de BD debe tener privilegios ALTER en la tabla usuarios.
       Contacte al administrador del hosting.
```

### 2.5 Dónde ver el output

En cPanel, el resultado puede aparecer en:
- La propia interfaz "Execute python script" (área de salida)
- O en los logs: `stderr.log` / `stdout.log` en la carpeta de la aplicación o en `~/logs/`

---

## 3. Feature flags — auth sin romper login

### 3.1 Dónde configurar

**Archivo:** `config.py`

Añadir al final de la clase `Config` (antes de `DevelopmentConfig`):

```python
# Feature flags - Módulo usuarios y seguridad
# Con todos en False, el sistema funciona exactamente como hoy
FEATURE_MUST_CHANGE_PASSWORD = os.environ.get('FEATURE_MUST_CHANGE_PASSWORD', 'false').lower() == 'true'
FEATURE_AUDIT_LOG = os.environ.get('FEATURE_AUDIT_LOG', 'false').lower() == 'true'
FEATURE_RATE_LIMIT_LOGIN = os.environ.get('FEATURE_RATE_LIMIT_LOGIN', 'false').lower() == 'true'
```

### 3.2 Dónde configurar en cPanel Passenger

**cPanel** → **Setup Python App** (o **Web Applications**) → tu aplicación WMS → **Configuration** / **Environment Variables**:

| Variable | Valor | Efecto |
|----------|--------|--------|
| `FEATURE_MUST_CHANGE_PASSWORD` | *(vacío o no definido)* | Off — login como hoy |
| | `true` | On — redirige a cambiar contraseña si `must_change_password` |
| `FEATURE_AUDIT_LOG` | *(vacío)* | Off |
| | `true` | On — registra eventos en `audit_log` |
| `FEATURE_RATE_LIMIT_LOGIN` | *(vacío)* | Off |
| | `true` | On — límite de intentos de login |

### 3.3 Garantía: flags en False = comportamiento actual

En `routes/auth.py` (y donde se use):

```python
# Ejemplo: solo si FEATURE_MUST_CHANGE_PASSWORD está activo
if app.config.get('FEATURE_MUST_CHANGE_PASSWORD', False) and getattr(usuario, 'must_change_password', False):
    # Lógica nueva
else:
    # Lógica actual (no hacer nada especial)
```

Mientras las variables no estén en `'true'`, no se ejecuta ninguna lógica nueva.

### 3.4 Reinicio tras cambiar variables

Tras modificar variables de entorno en cPanel, hay que **reiniciar la aplicación**:
- **Restart** en Setup Python App, o
- Cambiar y guardar algo en la configuración para forzar reinicio

### 3.5 Confirmación: flags OFF = comportamiento actual (garantía "mejorar sin dañar")

| Requisito | Implementación garantizada |
|-----------|---------------------------|
| **Login redirige igual que hoy** | Con todos los flags en `false`: el código de login no tiene rama que redirija a `/cambiar-password`. La lógica de redirect se mantiene: admin → `/`, no-admin → `/despacho`. |
| **Código no requiere columnas nuevas** | Toda referencia a `must_change_password`, `last_login_at`, etc. usará `getattr(usuario, 'must_change_password', False)`. Si la columna no existe o la migración no se ejecutó, se usa el default. |
| **Frontend solo aplica redirect cuando flag ON** | En `login.html`, la condición será: `if (appConfig.FEATURE_MUST_CHANGE_PASSWORD && data.usuario.must_change_password) { redirect /cambiar-password }`. El flag viene del backend (p.ej. endpoint `/api/config` o inyectado en el HTML). Con flag OFF, esa rama nunca se ejecuta. |

---

## 4. Ruta/vista para /cambiar-password (con must_change_password)

### 4.1 Enfoque mínimo y seguro

| Componente | Acción |
|------------|--------|
| **Ruta** | `GET /cambiar-password` → renderiza `cambiar_password.html` |
| **Protección** | `@require_auth` (solo usuario logueado) |
| **Lógica** | Si `FEATURE_MUST_CHANGE_PASSWORD` está OFF y el usuario llega por URL directa → redirigir a `/` (no bloquear). |
| **Formulario** | Llama a `POST /api/auth/cambiar-password` (existente) |
| **Post-cambio** | Si éxito: `must_change_password=False`, redirigir a `/` o `/despacho` según rol |
| **Evitar loops** | Si `must_change_password=True` y el flag está ON, login redirige aquí. Una vez cambiada la contraseña, se pone `False` y ya no se redirige más. |

### 4.2 Flujo sin bloqueos

```
Login exitoso
  → Si flag OFF: redirigir a / o /despacho (como hoy)
  → Si flag ON y must_change_password=True: redirigir a /cambiar-password
  → Si flag ON y must_change_password=False: redirigir a / o /despacho

Usuario en /cambiar-password
  → Envía formulario a API
  → API actualiza password y must_change_password=False
  → Respuesta success
  → JS redirige a /
```

### 4.3 Fallback si el flag está apagado

- La ruta `/cambiar-password` puede existir siempre (útil para que el usuario cambie su contraseña desde Admin o perfil).
- Si el flag está OFF, el login **nunca** redirige a `/cambiar-password` por `must_change_password`; el comportamiento es el actual.
- Acceso directo a `/cambiar-password`: si el flag está OFF, se puede tratar como página normal de "cambiar mi contraseña" sin flujo forzado.

---

## 5. Pruebas mínimas sin suite automática

### 5.1 Checklist manual

| # | Prueba | Pasos | Resultado esperado |
|---|--------|-------|-------------------|
| 1 | Login admin | Login con usuario administrador | Acceso a `/`, botón Admin visible |
| 2 | Login no-admin | Login con despachador/almacenista | Redirige a despacho, sin botón Admin |
| 3 | Acceso /admin | Como no-admin, ir a `/admin` | Redirige a `/` |
| 4 | CRUD usuarios (admin) | En Admin → Usuarios: crear, editar | Operaciones OK |
| 5 | Desactivar usuario | Admin desactiva un usuario | Ese usuario no puede hacer login |
| 6 | Último admin | Solo 1 admin activo, intentar desactivarlo | Mensaje "No se puede desactivar el último administrador" |
| 7 | must_change_password | Crear usuario con contraseña temporal, flag ON | Tras login, redirige a cambiar contraseña |
| 8 | Cambio de contraseña | Usuario cambia contraseña en /cambiar-password | Nueva contraseña funciona, puede seguir usando el sistema |

### 5.2 Script mínimo de verificación (opcional)

**Archivo:** `scripts/verificar_auth_basico.py`

Ejecutable desde cPanel "Execute python script" para comprobar:

- Conexión a BD
- Existencia de tabla `usuarios`
- Al menos 1 usuario activo
- Que el endpoint `/api/auth/login` responde (si se puede hacer request interno)

Ejemplo simplificado:

```python
"""
Verificación básica de auth y BD
Ejecutar: scripts/verificar_auth_basico.py
"""
import sys, os
_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, '..'))
sys.path.insert(0, _project_root)
os.chdir(_project_root)

from app_wms import app
from database import db
from database.models import Usuario
from sqlalchemy import text

with app.app_context():
    try:
        db.session.execute(text("SELECT 1"))
        print("[1] Conexion BD: OK")
    except Exception as e:
        print(f"[1] Conexion BD: FAIL - {e}")
        sys.exit(1)
    users = Usuario.query.filter_by(activo=True).count()
    print(f"[2] Usuarios activos: {users}")
    admins = Usuario.query.filter_by(rol='administrador', activo=True).count()
    print(f"[3] Admins activos: {admins}")
    print("[OK] Verificacion basica completada" if users > 0 else "[WARN] No hay usuarios activos")
```

### 5.3 Endpoints útiles para validación manual

| Endpoint | Uso |
|----------|-----|
| `GET /api/auth/me` | Comprobar sesión activa (con cookie de login) |
| `GET /api/historial/usuarios` | Lista usuarios (autenticado) |
| `GET /test` | Ya existe en app_wms.py para comprobar que la app responde |

---

## 6. Resumen de orden de implementación

1. **Crear** `scripts/migrations/001_add_usuario_fields.py` e incluir el boilerplate de path/cwd.
2. **Subir** a cPanel y ejecutar con "Execute python script".
3. **Verificar** output OK y que las columnas existen (phpMyAdmin o script de verificación).
4. **Añadir** feature flags en `config.py` y variables de entorno (todas en false).
5. **Implementar** CRUD usuarios, regla "último admin", y UI en Admin.
6. **Implementar** `/cambiar-password` + lógica en login cuando `FEATURE_MUST_CHANGE_PASSWORD=true`.
7. **Crear** `002_create_audit_log.py` cuando se active auditoría.
8. **Activar** flags de forma gradual (primero `FEATURE_MUST_CHANGE_PASSWORD`, luego auditoría, luego rate limit).

---

## Anexo A: Confirmaciones técnicas (pre-ejecución)

| Punto | Confirmación |
|-------|--------------|
| **Nombre tabla** | `Usuario.__tablename__` = `'usuarios'`. El script 001 lo obtiene dinámicamente, no hardcode. |
| **MySQL ADD COLUMN** | No se usa `IF NOT EXISTS`. Siempre: 1) verificar con `information_schema`, 2) si no existe, ejecutar `ALTER TABLE ADD COLUMN`. |
| **commit/rollback** | 001: `db.session.commit()` tras cambios exitosos; `db.session.rollback()` en `except`. 002: `commit` tras `create_all`; `rollback` en error. |
| **audit_log** | Modelo SQLAlchemy con `db.Text` para `extra_data` (TEXT en ambos motores). `db.create_all(tables=[AuditLog.__table__])` crea solo esa tabla. |
| **Resumen final** | Ambos scripts imprimen `[OK]` con descripción clara al terminar. |

---

## Anexo B: Código listo para copiar/pegar

Los archivos ya están creados en el proyecto:
- `scripts/migrations/001_add_usuario_fields.py`
- `scripts/migrations/002_create_audit_log.py`
- `scripts/verificar_schema.py`

Ruta para cPanel Execute python script:
1. `scripts/migrations/001_add_usuario_fields.py`
2. `scripts/migrations/002_create_audit_log.py`
3. `scripts/verificar_schema.py` (verificación opcional)

---

*Documento actualizado. Scripts de migración implementados y listos para ejecución vía cPanel.*
