# Informe: Errores que provocan parpadeo y cierre de sesión en WMS

**Fecha:** 2026-02-25  
**Módulos afectados:** Historial de Recepciones, Historial de Usuarios, y otros módulos que usan `auth/me`

---

## 1. Síntomas observados

| Síntoma | Descripción |
|---------|-------------|
| **Parpadeo de pantalla** | La interfaz “titila” o recarga de forma brusca |
| **Cierre inesperado de sesión** | El usuario es enviado a la pantalla de login sin haber cerrado sesión |
| **"Error al cargar datos"** | Mensajes de error en rojo en lugar de los datos esperados |
| **Peticiones 500** | Respuestas *Internal Server Error* en endpoints como `/api/historial/recepciones` y `/api/historial/usuarios` |

---

## 2. Cadena de eventos (qué ocurre paso a paso)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Usuario entra al Historial de Recepciones                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. La página ejecuta en paralelo:                                            │
│    • verificarAutenticacion()  → GET /api/auth/me                            │
│    • cargarUsuarios()          → GET /api/historial/usuarios                 │
│    • aplicarFiltros()          → GET /api/historial/recepciones               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. Algún endpoint falla (historial, usuarios) con error de base de datos:   │
│    • MultipleResultsFound                                                    │
│    • "This result object does not return rows"                                │
│    • MySQL "server has gone away" / "Command Out of Sync"                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. El pool de conexiones queda afectado:                                      │
│    • La conexión donde ocurrió el error se “estropea”                         │
│    • Otras peticiones que usan esa conexión fallan                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. auth/me falla (usa la misma sesión/pool):                                 │
│    • safe_db_call devuelve None                                              │
│    • auth/me responde 503 (DB unavailable) o 500 si hay excepción no manejada  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. El frontend interpreta fallo como “sesión inválida”:                       │
│    • Código: if (!data.success) { window.location.href = '/login' }          │
│    • O: catch (error) { window.location.href = '/login' }                      │
│    • Si la respuesta es HTML (error 500), response.json() lanza y cae en catch│
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 7. Resultado: usuario enviado a login y sensación de “parpadeo”              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Posibles causas técnicas

### 3.1 Errores de SQLAlchemy/ORM

| Error | Causa |
|-------|-------|
| `MultipleResultsFound` | Uso de `query.count()` o `.scalar()` cuando la consulta devuelve más de una fila (p. ej. por relaciones o joins duplicados) |
| `This result object does not return rows` | Uso de `with_entities(func.count())` con consultas ORM que SQLAlchemy sigue interpretando como carga de entidades |

### 3.2 Errores de conexión MySQL

| Error | Causa |
|-------|-------|
| `MySQL server has gone away` (2006) | Conexión cerrada por timeout o por el servidor |
| `Lost connection to MySQL server` (2013) | Interrupción de la conexión durante la ejecución |
| `Command Out of Sync` (2014) | Estado incoherente en la conexión (p. ej. varias consultas en la misma conexión o uso incorrecto del cliente) |

### 3.3 Pool de conexiones

| Causa | Descripción |
|-------|-------------|
| Reutilización de conexiones en mal estado | El pool devuelve conexiones que ya fallaron y no se han descartado |
| Timeout del servidor MySQL | `wait_timeout` de MySQL menor que `pool_recycle` de SQLAlchemy |
| Entorno cPanel/Passenger | Varios procesos/workers compartiendo pool con conexiones inestables |

### 3.4 Comportamiento del frontend

| Causa | Descripción |
|-------|-------------|
| Tratar 503 como “no autenticado” | auth/me devuelve 503, pero el código hace redirect igual que con 401 |
| Parseo de HTML como JSON | Error 500 devuelve HTML; `response.json()` lanza; el `catch` redirige a login |
| Falta de reintentos | Ante un fallo puntual, no hay retry antes de desloguear |

---

## 4. Soluciones propuestas

### 4.1 Aplicar NullPool en producción (prioritario)

**Objetivo:** Evitar compartir conexiones en mal estado entre peticiones.

En cPanel, en variables de entorno de la aplicación Python:

```
DB_USE_NULLPOOL=true
```

Con esto, cada request usa una conexión nueva y no se reutiliza el pool.  
**Archivo:** `config.py` (ya soporta `DB_USE_NULLPOOL`)

---

### 4.2 Consultas sin errores ORM (ya aplicado)

En historial de recepciones, sustituir:

- `query.count()` 
- `query.with_entities(func.count()).scalar()`

Por:

```python
from sqlalchemy import select
count_stmt = select(func.count()).select_from(query.subquery())
total = db.session.execute(count_stmt).scalar() or 0
```

**Archivo:** `routes/historiales.py`

---

### 4.3 Diferenciar 401 y 503 en el frontend

En las páginas que usan `auth/me`, tratar 503 de forma distinta a 401:

```javascript
async function verificarAutenticacion() {
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();

        if (response.status === 503 || data.error === 'db_unavailable') {
            // Error temporal de BD: no redirigir a login
            mostrarAviso('Error temporal. Reintentando...');
            setTimeout(verificarAutenticacion, 3000);
            return;
        }
        if (!data.success) {
            window.location.href = '/login';
            return;
        }
        document.getElementById('user-info').textContent = `${data.usuario.nombre} (${data.usuario.rol})`;
    } catch (error) {
        // Si la respuesta no es JSON (ej. 500 con HTML), reintentar antes de redirigir
        if (error instanceof SyntaxError && error.message.includes('JSON')) {
            console.warn('Respuesta no JSON (posible error 500). Reintentando en 2s...');
            setTimeout(verificarAutenticacion, 2000);
            return;
        }
        window.location.href = '/login';
    }
}
```

**Archivos a actualizar:**  
Plantillas que usan `verificarAutenticacion()` o lógica similar:  
`recepciones_historial.html`, `despachos_historial.html`, `transferencias_historial.html`, etc.

---

### 4.4 Proteger historial de usuarios

Si `/api/historial/usuarios` falla con 500, puede afectar la carga de la página. Revisar que:

- No haya consultas que provoquen `MultipleResultsFound`.
- Se manejen bien los errores y se devuelva JSON en lugar de HTML en caso de error.

---

### 4.5 Ajustar configuración del pool (alternativa a NullPool)

Si no se usa NullPool, se puede endurecer el pool:

```python
SQLALCHEMY_ENGINE_OPTIONS = {
    'pool_pre_ping': True,
    'pool_recycle': 180,  # Reciclar antes del wait_timeout típico de MySQL
    'pool_size': 2,
    'max_overflow': 2,
}
```

---

### 4.6 Logging y monitoreo

Añadir logs claros cuando auth/me devuelve 503:

```
[auth_me] DB unavailable - request_id=xxx
```

Y en las rutas de historial, registrar el tipo de error antes de propagarlo.

---

## 5. Plan de acción recomendado

| Prioridad | Acción | Esfuerzo |
|-----------|--------|----------|
| 1 | Activar `DB_USE_NULLPOOL=true` en cPanel | Bajo |
| 2 | Confirmar uso de `select(func.count()).select_from(query.subquery())` en historiales | Bajo |
| 3 | Actualizar `verificarAutenticacion()` para tratar 503 y errores de parseo JSON | Medio |
| 4 | Revisar y proteger `/api/historial/usuarios` | Bajo |
| 5 | Revisar `pool_recycle` si se mantiene el pool | Bajo |

---

## 6. Referencias en el código

| Componente | Archivo | Función |
|------------|---------|---------|
| auth/me | `routes/auth.py` | `get_current_user()` |
| safe_db_call | `utils/db_helpers.py` | Retry y manejo de errores de conexión |
| Historial recepciones | `routes/historiales.py` | `historial_recepciones()` |
| Config BD | `config.py` | `Config.SQLALCHEMY_ENGINE_OPTIONS` |
| NullPool | `config.py` | Condición `USE_NULL_POOL` |
