# 🔧 SOLUCIÓN: Timeout en Sincronización de ADESA

**Fecha:** 2026-01-22  
**Problema:** ADESA tiene 4583+ items y el proceso es terminado por timeout (signal 15)

---

## 🔍 DIAGNÓSTICO

**Logs muestran:**
- Sincronización comenzó correctamente
- Procesó hasta 200 items (lote 5)
- Proceso terminado: `[UID:1077][1045417] Child process with pid: 1045502 was killed by signal: 15`

**Signal 15 = SIGTERM** = Passenger mató el proceso por timeout

**Causa:**
- ADESA tiene 4583 items
- Con commits cada 100 items, el proceso toma > 5 minutos
- Passenger timeout por defecto = ~5 minutos
- Proceso muere antes de completar

---

## ✅ SOLUCIONES IMPLEMENTADAS

### 1. Commits más frecuentes

**Cambio en `routes/sincronizar.py`:**
- **Antes:** Commit cada 100 items
- **Ahora:** Commit cada 50 items

**Beneficio:**
- Guarda progreso más frecuentemente
- Si hay timeout, se pierden menos datos
- Menos carga en memoria entre commits

---

### 2. Aumentar timeout de Passenger

**Archivo `.htaccess` creado:**

```apache
# Aumentar timeout de Passenger a 10 minutos (600 segundos)
PassengerMaxRequestTime 600
```

**Pasos:**
1. Subir `.htaccess` a la raíz del proyecto en cPanel
2. Reiniciar aplicación (si es necesario)

**Beneficio:**
- Proceso puede durar hasta 10 minutos
- Suficiente para sincronizar ADESA (4583 items)

---

## 📋 ARCHIVOS A SUBIR A CPANEL

1. ✅ `routes/sincronizar.py` (modificado - commits cada 50 items)
2. ✅ `.htaccess` (nuevo - aumenta timeout)

---

## 🔧 PASOS EN CPANEL

### PASO 1: Subir archivos

1. Subir `routes/sincronizar.py` (modificado)
2. Subir `.htaccess` (nuevo) a la raíz del proyecto

### PASO 2: Verificar `.htaccess`

**Ubicación:** `/home2/adesa/wms.adesa.com.do/.htaccess`

**Contenido debe ser:**
```apache
PassengerMaxRequestTime 600
```

### PASO 3: Reiniciar aplicación (si es necesario)

En cPanel → "Restart App" o tocar `tmp/restart.txt`

### PASO 4: Probar sincronización de ADESA

1. Ir a página de sincronización
2. Sincronizar ADESA
3. Debe completar sin timeout

---

## 📊 ESTIMACIÓN DE TIEMPO

**ADESA: 4583 items**

- Lotes de 50 items = ~92 lotes
- Tiempo por lote: ~2-3 segundos
- **Tiempo total estimado: ~4-5 minutos**
- **Con timeout de 10 minutos: ✅ Suficiente**

---

## ⚠️ SI SIGUE HABIENDO TIMEOUT

### Opción A: Aumentar más el timeout

En `.htaccess`:
```apache
PassengerMaxRequestTime 900  # 15 minutos
```

### Opción B: Verificar configuración de Passenger

En cPanel → "Passenger" → Verificar configuración de timeout

### Opción C: Sincronización asíncrona (futuro)

Implementar sincronización en background con cola de tareas (más complejo)

---

## 📝 RESUMEN

### Cambios:
1. ✅ Commits cada 50 items (más frecuentes)
2. ✅ Timeout aumentado a 10 minutos

### Archivos:
1. `routes/sincronizar.py` (modificado)
2. `.htaccess` (nuevo)

### Resultado esperado:
- ADESA se sincroniza completamente sin timeout
- Progreso se guarda cada 50 items
- Si hay timeout, se pierden menos datos

---

**¿Necesitas ayuda con algún paso?** Puedo ayudarte a verificar la configuración.




