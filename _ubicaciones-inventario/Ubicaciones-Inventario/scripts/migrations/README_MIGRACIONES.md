# Migraciones WMS - Ejecución en cPanel

## Ruta exacta para "Execute python script"

En cPanel → Web Applications → tu app WMS → **Execute python script**:

| Orden | Script | Ruta a pegar |
|-------|--------|--------------|
| 1 | Migración 001 | `scripts/migrations/001_add_usuario_fields.py` |
| 2 | Migración 002 | `scripts/migrations/002_create_audit_log.py` |
| 3 | Verificación | `scripts/verificar_schema.py` |

**Crear usuarios (sin CRUD en UI):**
| Script | Ruta |
|--------|------|
| Crear/actualizar usuario | `scripts/crear_usuario.py` |

Si cPanel requiere ruta absoluta:
`/home2/adesa/wms.adesa.com.do/scripts/migrations/001_add_usuario_fields.py`
(Ajustar según tu directorio real)

## Tabla usada

El script 001 usa `Usuario.__tablename__` → **usuarios** (no hardcode).

## Output esperado (001)

**Primera ejecución:**
```
[MIGRACION 001] Añadir campos a tabla usuarios
[DETECTADO] Motor: mysql
[VERIFICACION] Tabla 'usuarios' existe
[EJECUTADO] Añadida columna 'updated_at'
...
[OK] Migracion 001 completada. Cambios aplicados: ...
```

**Segunda ejecución (idempotente):**
```
[SKIP] Columna 'updated_at' ya existe
...
[OK] Migracion 001 ya estaba aplicada. Nada que hacer.
```

## Output esperado (002)

```
[MIGRACION 002] Crear tabla audit_log
[DETECTADO] Motor: mysql
[EJECUTADO] Tabla audit_log creada
[OK] Migracion 002 completada correctamente
```

## Verificación

`scripts/verificar_schema.py` muestra:
- Motor detectado
- Tabla usuarios y sus columnas
- Si existe tabla audit_log
