# ✅ Checklist: Desplegar WMS en CPanel

Marca cada paso cuando lo completes:

---

## 📤 Preparación de Archivos

- [ ] Verificar que tengo todos los archivos en mi PC local
- [ ] Comprimir en ZIP (opcional, para subir más fácil)

---

## 📁 Subir Archivos a CPanel

- [ ] Entrar a CPanel → File Manager
- [ ] Navegar a `/public_html/wms.adesa.com.do/`
- [ ] Subir TODOS los archivos y carpetas
- [ ] Verificar que `passenger_wsgi.py` está en la raíz

---

## 🐍 Configurar Python App

- [ ] CPanel → Software → Setup Python App
- [ ] Crear nueva aplicación
- [ ] Python Version: 3.9/3.10/3.11
- [ ] Application Root: `/public_html/wms.adesa.com.do`
- [ ] Startup File: `passenger_wsgi.py` ✅
- [ ] Entry Point: `application` ✅
- [ ] Crear aplicación

---

## 📦 Instalar Dependencias

- [ ] Abrir Terminal en CPanel
- [ ] `cd /home/usuario/public_html/wms.adesa.com.do`
- [ ] `pip install Flask Flask-SQLAlchemy requests bcrypt Werkzeug`
- [ ] Verificar que no hay errores

---

## 🔧 Variables de Entorno

- [ ] En Python App → Environment Variables
- [ ] Agregar: `FLASK_ENV` = `production`
- [ ] Agregar: `SECRET_KEY` = (cualquier clave)
- [ ] Agregar: `ADM_EMAIL` = `luis.useche@adesa.com.do`
- [ ] Agregar: `ADM_PASSWORD` = `Merida.123.`
- [ ] Agregar: `ADM_APPID` = `cccdf964-1e69-46e7-5ed0-08de4e33921f`
- [ ] Agregar: `ADM_COMPANY` = `7b5f5222-123e-4dc7-a783-2979ea9e6cff`
- [ ] Agregar: `ADM_ROLE` = `Administradores`
- [ ] Guardar todas las variables

---

## 💾 Inicializar Base de Datos

- [ ] Terminal: `cd /home/usuario/public_html/wms.adesa.com.do`
- [ ] Terminal: `python init_db.py`
- [ ] Ver mensaje: "✓ Tablas creadas"
- [ ] Ver mensaje: "✓ Usuario administrador creado"

---

## 🔄 Reiniciar Aplicación

- [ ] Python App → Botón "Restart"
- [ ] Esperar confirmación de reinicio

---

## 🌐 Activar Dominio

- [ ] CPanel → Dominios/Subdominios
- [ ] Encontrar `wms.adesa.com.do`
- [ ] Activar toggle (de "Apagado" a "Encendido")
- [ ] Guardar cambios

---

## ✅ Probar Aplicación

- [ ] Abrir navegador: `https://wms.adesa.com.do/`
- [ ] Ver que carga la página (puede mostrar interfaz básica)
- [ ] Revisar logs si hay errores

---

## 🔍 Verificar Conexión ADM (Si hay interfaz)

- [ ] Si la página tiene sección "Verificar Conexión", probarla
- [ ] Debe mostrar "Conexión exitosa" con el total de productos
- [ ] Si hay error, revisar variables de entorno

---

## 📝 Notas del Proceso

_Anota aquí cualquier problema que encuentres:_

```
[Espacio para notas]
```

---

## 🎯 Estado Final

- [ ] ✅ Aplicación funcionando
- [ ] ✅ Conexión ADM Cloud verificada
- [ ] ⚠️ Errores encontrados (describir abajo)
- [ ] ❌ No funciona (describir problema abajo)

**Problemas encontrados:**
```
[Describir problemas aquí]
```

---

**Fecha de despliegue:** _______________

**Resultado:** ☐ Exitoso  ☐ Con errores  ☐ No completado

