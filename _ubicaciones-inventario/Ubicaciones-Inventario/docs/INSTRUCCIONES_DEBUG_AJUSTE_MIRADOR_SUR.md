# INSTRUCCIONES PARA DEBUG: Ajuste Mirador Sur a 0

## PASOS PARA OBTENER INFORMACIÓN DE DEBUG

### 1. Revisar la respuesta del backend en DevTools

1. Abre DevTools (F12)
2. Ve a la pestaña **Network** (Red)
3. Busca la petición llamada **`registrar`** (debería estar en la lista)
4. Haz clic en la petición `registrar`
5. Ve a la pestaña **Response** (Respuesta) o **Preview**
6. **Copia y pega aquí** el contenido de la respuesta JSON

**Ejemplo de lo que deberías ver:**
```json
{
  "success": true,
  "message": "Ajuste registrado exitosamente",
  "movimientos": [...],
  "total_movimientos": 1
}
```

O si hay error:
```json
{
  "success": false,
  "error": "Mensaje de error aquí"
}
```

---

### 2. Revisar la pestaña Console

1. En DevTools, ve a la pestaña **Console**
2. Busca cualquier mensaje en **rojo** (errores)
3. **Copia y pega aquí** cualquier error que veas

---

### 3. Revisar qué se está enviando al backend

1. En DevTools, pestaña **Network**
2. Haz clic en la petición `registrar`
3. Ve a la pestaña **Payload** o **Request**
4. **Copia y pega aquí** el contenido del body que se envía

**Ejemplo de lo que deberías ver:**
```json
{
  "productos": [{
    "sku": "VP1",
    "item_id": "...",
    "asignaciones": [{
      "ubicacion_adm": "MIRADOR SUR",
      "location_id": "...",
      "cantidad": 0,
      "tipo": "adm"
    }]
  }],
  "notas": ""
}
```

---

### 4. Verificar el mensaje que aparece después de hacer clic en "Registrar Ajuste"

Después de hacer clic en "Registrar Ajuste", ¿qué mensaje aparece en la pantalla?

- ¿"Ajuste registrado exitosamente. X movimiento(s) creado(s)"?
- ¿"Error al registrar ajuste"?
- ¿Algún otro mensaje?

**Escribe aquí el mensaje exacto que ves.**

---

### 5. Verificar si el ajuste aparece en el historial

1. Haz clic en "Volver al Historial"
2. Busca el ajuste que acabas de hacer
3. ¿Aparece en la lista?
4. Si aparece, ¿qué información muestra?

---

## INFORMACIÓN ADICIONAL ÚTIL

Si puedes, también proporciona:

1. **Screenshot** de la pantalla después de hacer clic en "Registrar Ajuste"
2. **Screenshot** de la pestaña Network mostrando la petición `registrar` con su respuesta
3. **Screenshot** de la pestaña Console si hay errores

---

## PREGUNTA ESPECÍFICA

Cuando intentas ajustar Mirador Sur a 0:

1. ¿Seleccionas "MIRADOR SUR" del dropdown?
2. ¿Pones la cantidad en **0** en el campo de cantidad?
3. ¿Haces clic en "Registrar Ajuste"?
4. ¿Qué pasa después? ¿Aparece algún mensaje? ¿El formulario se limpia? ¿Nada cambia?








