# Informe de Seguridad y Módulo de Usuarios - WMS

**Fecha:** 17 de febrero de 2025  
**Proyecto:** Sistema WMS - Gestión de Almacenes integrado con ADM Cloud

---

## 1. Estado actual de seguridad

### 1.1 Autenticación

| Aspecto | Implementación actual |
|---------|------------------------|
| Login | `/api/auth/login` con email y contraseña |
| Logout | `/api/auth/logout` |
| Sesión | Flask session con `user_id`, `user_email`, `user_nombre`, `user_rol` |
| Hashes | bcrypt para almacenar contraseñas |
| Cambio de contraseña | `/api/auth/cambiar-password` (usuario autenticado puede cambiar su propia contraseña) |

### 1.2 Control de acceso

| Decorador | Uso |
|-----------|-----|
| `@require_auth` | Requiere sesión activa. Usado en todas las páginas operativas. |
| `@require_admin` | Requiere `session['user_rol'] == 'administrador'`. Usado en endpoints sensibles. |

### 1.3 Modelo de usuario

```python
# database/models.py - Usuario
id, nombre, email, password_hash, rol, activo, created_at
```

**Roles definidos:** `administrador`, `despachador`, `almacenista`

### 1.4 Cómo obtener el número de usuarios

Ejecutar en consola Python con contexto de la app:

```python
from app_wms import app
from database.models import Usuario

with app.app_context():
    total = Usuario.query.count()
    activos = Usuario.query.filter_by(activo=True).count()
    por_rol = {r: Usuario.query.filter_by(rol=r).count() 
               for r in ['administrador', 'despachador', 'almacenista']}
    print(f"Total: {total}, Activos: {activos}, Por rol: {por_rol}")
```

O usar el script: `python scripts/check_user.py` (editar `target_email` para un usuario específico; muestra todos al final).

---

## 2. Módulos restringidos solo a administrador

Estos módulos/funcionalidades **solo** deben ser accesibles por usuarios con rol `administrador`:

| Módulo / funcionalidad | Ruta/API | Descripción |
|------------------------|----------|-------------|
| Panel Admin | `/admin` | Sincronización, discrepancias, notificaciones |
| Sincronización de catálogo | `POST /api/sincronizar/catalogo` | Sincronizar productos desde ADM |
| Sincronización por ubicación | `POST /api/sincronizar/ubicacion/<id>` | Sincronizar stock por ubicación |
| Estado de sincronización | `GET /api/sincronizar/ubicacion/<id>/estado` | Ver estado de sync |
| Listar ubicaciones sync | `GET /api/sincronizar/ubicaciones` | Ubicaciones disponibles para sync |
| Ubicaciones físicas (CRUD) | `/api/ubicaciones-fisicas` | Crear, editar, eliminar ubicaciones físicas |
| Cargar Excel ubicaciones | `POST /api/ubicaciones-fisicas/cargar-excel` | Importación masiva |
| Revertir despacho | `POST /api/despacho/<guid>/revertir` | Deshacer despacho procesado |
| Revertir recepción | `POST /api/recepciones/<guid>/revertir` | Deshacer recepción procesada |
| Revertir transferencia | `POST /api/transferencias/<guid>/revertir` | Deshacer transferencia procesada |
| Revertir ajuste | `POST /api/ajustes/<id>/revertir` | Deshacer ajuste procesado |
| En revisión (discrepancias) | `GET /api/en-revision` | Listar items en revisión |
| Historial sync runs | `GET /api/sync-runs` | Historial de sincronizaciones |
| Configuración notificaciones | `GET/PUT /api/notificaciones/config` | Emails de alertas |
| Test de email | `GET /api/test-email` | Prueba de configuración SMTP |

### Frontend

- En `index.html`, el botón "Panel de Administración" solo se muestra si `usuario.rol === 'administrador'`.
- La ruta `/admin` redirige a `/` si el rol no es administrador (`app_wms.py` líneas 275-284).

---

## 3. Gestión de usuarios actual

### Lo que existe

| Componente | Ubicación | Descripción |
|------------|-----------|-------------|
| Listar usuarios (solo id, nombre) | `GET /api/historial/usuarios` | Para filtros en historiales. Requiere `@require_auth` (cualquier usuario). |
| Crear usuario admin inicial | `scripts/init_db.py` | Crea admin@wms.local / admin123 |
| Cambiar contraseña interactivo | `scripts/cambiar_password.py` | Por consola, pide email y contraseña |
| Reset rápido de contraseña | `scripts/reset_password.py` | Email y contraseña hardcodeados, ejecutar para reset |
| Verificar usuario(s) | `scripts/check_user.py` | Lista un usuario o todos |

### Lo que NO existe

- **CRUD de usuarios** desde la interfaz web.
- **Panel de gestión de usuarios** en el admin.
- **Crear usuarios** desde la aplicación (solo scripts manuales).
- **Editar rol, nombre o estado** de usuarios.
- **Política de contraseñas** configurable (longitud mínima, complejidad).
- **Reinicio de contraseña** por el propio usuario (olvidé mi contraseña).
- **Log de auditoría** de accesos y cambios de usuarios.

---

## 4. Propuesta para módulo de usuarios operativo

### 4.1 Objetivos

1. Permitir a administradores crear, editar y desactivar usuarios desde la web.
2. Mantener seguridad: solo administradores gestionan usuarios.
3. Mantener trazabilidad de quién hace qué.

### 4.2 Componentes propuestos

#### A) Backend – Rutas de usuarios (solo admin)

| Acción | Método | Ruta | Descripción |
|--------|--------|------|-------------|
| Listar | GET | `/api/usuarios` | Lista usuarios con paginación y filtros |
| Obtener uno | GET | `/api/usuarios/<id>` | Detalle de un usuario |
| Crear | POST | `/api/usuarios` | Crear usuario (email, nombre, rol, contraseña temporal) |
| Actualizar | PUT | `/api/usuarios/<id>` | Editar nombre, rol, activo |
| Resetear contraseña | POST | `/api/usuarios/<id>/reset-password` | Admin genera contraseña temporal |
| Desactivar | POST | `/api/usuarios/<id>/desactivar` | Poner `activo=false` |

**Nota:** Nunca devolver `password_hash` en la API. Solo datos necesarios para gestión.

#### B) Frontend – Sección Usuarios en Admin

- Nueva pestaña o sección en `/admin`: **“Usuarios”**.
- Tabla: email, nombre, rol, estado (activo/inactivo), última modificación.
- Botones: Crear usuario, Editar, Resetear contraseña, Activar/Desactivar.
- Formulario crear: email, nombre, rol (dropdown), contraseña temporal.

#### C) Reglas de negocio

1. **Un admin no puede desactivarse a sí mismo** si es el único activo.
2. **Al menos un administrador** debe quedar activo siempre.
3. **Email único**: no permitir duplicados.
4. **Contraseña temporal**: longitud mínima 6 caracteres; el usuario la cambia en primer login (opcional).

#### D) Seguridad adicional

1. **Rate limiting** en login (opcional pero recomendado).
2. **Bloqueo temporal** tras X intentos fallidos (avanzado).
3. **Historial de accesos**: tabla `audit_log` con user_id, acción, timestamp, IP (fase posterior).

### 4.3 Módulos que deben seguir siendo solo admin

Los siguientes módulos deben **seguir restringidos** solo a administradores:

| Módulo | Motivo |
|--------|--------|
| Gestión de usuarios | Crear, editar roles, activar/desactivar |
| Sincronización | Afecta datos maestros y stock en ADM |
| Ubicaciones físicas | Configuración crítica del almacén |
| Reversiones (despacho, recepción, transferencia, ajuste) | Operaciones destructivas |
| Configuración de notificaciones | Datos sensibles (emails) |
| En revisión / discrepancias | Información sensible de inventario |
| Historial de sync runs | Diagnóstico técnico |

### 4.4 Roles y permisos sugeridos

| Rol | Acceso |
|-----|--------|
| **administrador** | Todo (admin, sync, ubicaciones, reversiones, gestión de usuarios) |
| **almacenista** | Recepciones, transferencias, ajustes, productos, historiales |
| **despachador** | Despachos, historial despachos, productos (consulta) |

Actualmente los roles existen pero la restricción real es solo “admin vs no-admin”. Una mejora futura sería un sistema de permisos por módulo más fino.

---

## 5. Resumen de ideas para tu análisis

1. **Crear módulo de usuarios en Admin**  
   - CRUD de usuarios con interfaz web.
   - Endpoints protegidos con `@require_admin`.

2. **Mantener scripts de consola**  
   - `init_db`, `cambiar_password`, `reset_password`, `check_user` como respaldo y para incidencias.

3. **Proteger lista de usuarios en historiales**  
   - Hoy `/api/historial/usuarios` usa `@require_auth` y devuelve solo id y nombre.
   - Opción A: Mantener así (útil para filtros).
   - Opción B: Restringir a admin si se considera sensible.

4. **Añadir registro de auditoría**  
   - Tabla de logs para: quién creó/modificó usuarios, reversiones, etc.

5. **Reinicio de contraseña por usuario**  
   - “Olvidé mi contraseña” vía email (requiere SMTP configurado).

6. **Política de contraseñas**  
   - Longitud mínima 8 caracteres, mayúsculas, números, símbolos (opcional).

7. **No permitir que un admin se elimine o desactive** si es el único administrador activo.

---

## 6. Próximos pasos sugeridos

1. Confirmar qué componentes del módulo de usuarios se priorizan (CRUD, reset, auditoría, etc.).
2. Diseñar la UI de la sección Usuarios dentro de `/admin`.
3. Implementar las rutas `/api/usuarios/*` con `@require_admin`.
4. Añadir la vista de usuarios en el template `admin.html`.
5. Definir reglas de negocio (mínimo 1 admin, no auto-desactivación).
6. Documentar el flujo en el manual de operación.

---

*Documento generado para análisis y decisión. No incluye cambios en el código hasta que se aprueben las ideas.*
