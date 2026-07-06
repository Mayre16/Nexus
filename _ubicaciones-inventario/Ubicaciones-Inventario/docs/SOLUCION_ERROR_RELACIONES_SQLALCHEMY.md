# ✅ SOLUCIÓN: Error de Relaciones SQLAlchemy

**Fecha:** 2026-01-22  
**Error:** `AmbiguousForeignKeysError: Could not determine join condition between parent/child tables on relationship Usuario.facturas_procesadas`

---

## 🔍 PROBLEMA IDENTIFICADO

El error ocurre porque `FacturaProcesada` tiene **dos foreign keys** a `Usuario`:
- `usuario_despachador` → `usuarios.id`
- `usuario_solicitante` → `usuarios.id`

SQLAlchemy no puede determinar automáticamente cuál foreign key usar en la relación `Usuario.facturas_procesadas`.

---

## ✅ SOLUCIÓN APLICADA

### Cambio en `database/models.py`:

**ANTES:**
```python
facturas_procesadas = db.relationship('FacturaProcesada', backref='usuario_despachador_rel', lazy=True)
```

**DESPUÉS:**
```python
facturas_procesadas = db.relationship('FacturaProcesada', foreign_keys='FacturaProcesada.usuario_despachador', backref='usuario_despachador_rel', lazy=True)
facturas_solicitadas = db.relationship('FacturaProcesada', foreign_keys='FacturaProcesada.usuario_solicitante', backref='usuario_solicitante_rel', lazy=True)
```

### Explicación:
- `facturas_procesadas`: Usa `usuario_despachador` (facturas que el usuario procesó)
- `facturas_solicitadas`: Usa `usuario_solicitante` (facturas que el usuario solicitó)

---

## 📁 ARCHIVO MODIFICADO

1. ✅ `database/models.py` - Especificado `foreign_keys` en relaciones

---

## 🚀 PASOS PARA DEPLOY EN CPANEL

1. **Subir archivo modificado:**
   - `database/models.py`

2. **Reiniciar la aplicación:**
   - Toca el archivo `tmp/restart.txt` o reinicia desde el panel de cPanel

3. **Probar login:**
   - Debe funcionar correctamente ahora

---

## ✅ RESULTADO ESPERADO

Después de subir el archivo y reiniciar:
- ✅ No más errores de relaciones ambiguas
- ✅ Login debe funcionar correctamente
- ✅ Sistema debe inicializar sin problemas

---

**¿Problemas?** Verifica que el archivo se haya subido correctamente y que la aplicación se haya reiniciado.




