# 🔧 Instalar PyMySQL sin Terminal (Solo Execute Python Script)

## 📋 Problema

No tienes acceso a Terminal en cPanel, solo puedes ejecutar scripts Python desde "Execute python script".

## ✅ Solución

He creado un script que instala PyMySQL y verifica todo automáticamente.

---

## 🚀 Pasos

### 1. Subir el Script

Subir el archivo `instalar_pymysql.py` a la raíz del proyecto en cPanel:
```
/home2/adesa/wms.adesa.com.do/instalar_pymysql.py
```

### 2. Ejecutar el Script

En cPanel → Setup Python App → "Execute Python script":
```
instalar_pymysql.py
```

### 3. Qué Hace el Script

El script automáticamente:
- ✅ Verifica si PyMySQL ya está instalado
- ✅ Si no está, lo instala usando `pip install pymysql`
- ✅ Verifica que `DATABASE_URL` esté configurada
- ✅ Prueba la conexión a MySQL
- ✅ Verifica que los archivos necesarios estén presentes

### 4. Resultado Esperado

Si todo está bien, verás:
```
✅ PyMySQL instalado exitosamente
✅ DATABASE_URL configurada correctamente
✅ Conexión exitosa a MySQL
✅ Todos los archivos necesarios están presentes
```

---

## ⚠️ Si Hay Errores

### Error: "Permission denied" al instalar
**Solución:** Algunos servidores no permiten instalar paquetes desde scripts. En ese caso:
- Contactar al soporte de hosting para que instalen PyMySQL
- O pedir acceso a Terminal

### Error: "No module named 'pip'"
**Solución:** El entorno virtual puede no tener pip. Contactar soporte.

### Error: "Access denied" en MySQL
**Solución:** Verificar que:
- Usuario y contraseña sean correctos en `DATABASE_URL`
- Usuario tenga ALL PRIVILEGES en la base de datos

---

## 📝 Después de Instalar

Una vez que el script confirme que todo está bien:
1. Ejecutar `migrar_sqlite_a_mysql.py` para migrar los datos
2. Reiniciar la aplicación
3. Verificar que funciona

---

## 🔄 Alternativa Manual (Si el Script No Funciona)

Si el script no puede instalar PyMySQL automáticamente:

1. **Contactar soporte de hosting** y pedir que ejecuten:
   ```bash
   pip install pymysql
   ```
   En el entorno virtual: `/home2/adesa/virtualenv/wms.adesa.com.do/3.11`

2. **O pedir acceso a Terminal** temporalmente para ejecutar el comando


