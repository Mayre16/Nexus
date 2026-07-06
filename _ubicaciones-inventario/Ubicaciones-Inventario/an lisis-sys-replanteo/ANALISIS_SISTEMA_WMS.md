# Análisis Funcional y Técnico del Sistema WMS
## Warehouse Management System — Integrado con ADM Cloud

---

## 1. ¿Qué es este sistema?

Este es un **Sistema de Gestión de Almacenes (WMS)** desarrollado en Python con el framework Flask. Su propósito central es llevar el control físico del inventario de un almacén y mantenerlo sincronizado con un ERP externo llamado **ADM Cloud**, que es el sistema contable y comercial de la empresa.

El sistema nació para resolver una brecha crítica: ADM Cloud gestiona las operaciones comerciales (ventas, compras, transferencias entre sucursales), pero no tiene visibilidad sobre **dónde físicamente se encuentra cada producto dentro del almacén**. Este WMS llena ese vacío.

---

## 2. ¿Qué problema resuelve?

### El problema central

En un almacén sin WMS, cuando llega un pedido, el despachador debe recordar o buscar manualmente dónde está cada producto. Cuando se recibe mercancía, no queda registrado en qué estante o zona se colocó. Cuando hay transferencias entre sucursales o ajustes de inventario, el movimiento físico puede no reflejarse en el sistema contable, y viceversa.

### Lo que este sistema resuelve específicamente

1. **Desconocimiento de la ubicación física del stock:** El sistema permite asignar cada producto a una ubicación física concreta dentro del almacén (ej. pasillo A, estante 01, nivel 02). Así, cualquier operación indica exactamente de dónde tomar o dónde colocar un producto.

2. **Desfase entre el inventario contable (ADM Cloud) y el inventario físico real:** El sistema detecta y alerta cuando el stock que registra ADM Cloud no coincide con lo que hay físicamente en el almacén. A estas diferencias el sistema las llama "discrepancias".

3. **Falta de trazabilidad en los movimientos:** Cada entrada, salida o movimiento de producto queda registrado con fecha, usuario responsable, documento de referencia y ubicaciones origen/destino.

4. **Gestión del proceso de despacho sin visibilidad:** El sistema sabe qué facturas están pendientes de despachar, cuáles están en proceso y cuáles se completaron, y guía al almacenista durante el picking.

5. **Control de recepciones de mercancía sin asignación de ubicación:** Cuando llega mercancía (compras, recepciones de proveedor, notas de crédito de clientes), el sistema permite registrar exactamente en qué ubicación física se coloca cada producto.

---

## 3. Cómo está organizado el sistema

El sistema sigue una arquitectura web clásica de tres capas:

- **Capa de presentación:** Páginas HTML que el usuario ve en el navegador.
- **Capa de lógica de negocio:** Módulos Python organizados por función (rutas/blueprints de Flask).
- **Capa de datos:** Una base de datos local (SQLite en desarrollo, MySQL/MariaDB en producción en cPanel) más la conexión a la API externa de ADM Cloud.

El sistema está desplegado en un servidor de hosting compartido con cPanel, utilizando Passenger (WSGI) como servidor de aplicaciones, lo que impone ciertas restricciones de infraestructura que han marcado decisiones de diseño a lo largo del proyecto.

---

## 4. Módulos funcionales del sistema

### 4.1 Autenticación y control de acceso

El sistema tiene su propia base de usuarios independiente de ADM Cloud. Cada usuario tiene un rol que determina a qué partes del sistema puede acceder:

- **Despachador:** puede buscar facturas y registrar despachos.
- **Almacenista:** puede registrar recepciones y transferencias, hacer ajustes de inventario.
- **Administrador:** tiene acceso total, incluyendo gestión de usuarios, sincronización con ADM Cloud, panel de discrepancias y configuración del sistema.

La autenticación funciona mediante sesiones del servidor (cookies). El sistema tiene protección contra ataques de fuerza bruta en el login: si una misma dirección IP intenta iniciar sesión más de 10 veces en 5 minutos, se bloquea temporalmente. También tiene protección CSRF que verifica que cada petición de modificación provenga del mismo origen que el servidor.

Los administradores pueden crear, editar, activar o desactivar usuarios, y existe una función para forzar el cambio de contraseña en el próximo inicio de sesión. Hay también un registro de auditoría que puede activarse para rastrear acciones sensibles sobre usuarios.

### 4.2 Sincronización con ADM Cloud

Este es el módulo más crítico del sistema. ADM Cloud es el ERP de la empresa y es la fuente de verdad para el catálogo de productos y el stock contable.

El proceso de sincronización funciona así:

1. El sistema se conecta a la API de ADM Cloud usando credenciales configuradas en variables de entorno.
2. Descarga todos los productos del catálogo en lotes de 50 elementos a la vez (para no sobrecargar la API).
3. Para cada ubicación física registrada en ADM Cloud, descarga el stock que ADM considera que hay de cada producto.
4. Almacena esta información localmente en la base de datos del WMS.

Esta estrategia de caché local es fundamental porque ADM Cloud tiene límites en la cantidad de peticiones que acepta, y realizar consultas en tiempo real para cada operación sería demasiado lento e impracticable.

El sistema implementa un mecanismo de **sincronización por etapas (staging)**: cuando se inicia una nueva sincronización, el nuevo stock se escribe en un área de trabajo separada (un "run" nuevo) sin tocar los datos activos. Solo cuando la sincronización completa exitosamente, el nuevo run se convierte en el activo. Esto evita que el sistema quede con datos a medias si la sincronización falla a mitad de camino.

Cada ejecución de sincronización se llama un "SyncRun" y queda registrada con su estado (en curso, completo, parcial, fallido, cancelado), cuántos productos sincronizó, cuántos errores tuvo, y en qué momento empezó y terminó.

El sistema también soporta **sincronización automática mediante cron**: un proceso externo puede llamar a un endpoint protegido por un token secreto para lanzar la sincronización de forma periódica, sin intervención humana.

Para sincronizaciones largas (catálogos grandes), el sistema implementa reintentos automáticos con espera exponencial cuando la conexión con ADM Cloud falla temporalmente. Esto es importante porque en sincronizaciones de miles de productos, es normal que haya cortes breves de red.

### 4.3 Recepciones de mercancía

Cuando llega mercancía al almacén, el operador abre este módulo e ingresa el número de documento (DocID) de la recepción tal como aparece en ADM Cloud. El sistema busca ese documento en ADM Cloud en tiempo real y muestra los productos que contiene con sus cantidades.

El módulo soporta tres tipos de documentos de entrada:
- **Recepciones:** entradas de mercancía por compras a proveedores.
- **Recepciones de proveedor (Vendor Receptions):** un subtipo específico del proceso de compra en ADM Cloud.
- **Notas de crédito de clientes:** mercancía que devuelven los clientes y regresa al almacén.

Una vez cargado el documento, el operador asigna cada producto a una ubicación física del almacén. El sistema valida que la ubicación exista en el catálogo de ubicaciones físicas registradas. Al confirmar la recepción, el sistema incrementa el stock de esa ubicación física en la base de datos del WMS y registra un movimiento de tipo RECEIPT con todos los detalles.

El módulo distingue entre recepciones que corresponden a la ubicación principal (ADESA) y las que corresponden a otras ubicaciones (como una sucursal). Esta distinción es importante porque solo las recepciones de ADESA modifican el stock físico del almacén que gestiona el WMS; las otras solo quedan registradas como referencia.

El historial de recepciones muestra todos los documentos procesados con su estado (pendiente, en proceso, completo) y permite ver el detalle de cada uno.

### 4.4 Despacho (Picking)

El módulo de despacho gestiona la salida de mercancía del almacén cuando se atiende una factura de venta.

El proceso funciona así:
1. El despachador ingresa el número de factura (DocID) de ADM Cloud.
2. El sistema consulta ADM Cloud en tiempo real y trae los productos que incluye esa factura con sus cantidades.
3. Para cada producto, el despachador indica de qué ubicación física lo tomará y en qué cantidad.
4. El sistema valida que haya stock suficiente en esa ubicación antes de confirmar.
5. Al confirmar, registra un movimiento de tipo PICK, descuenta el stock de la ubicación física correspondiente, y actualiza el estado de la factura.

El sistema maneja el caso en que una factura tiene productos que deben tomarse de múltiples ubicaciones. También soporta despachos parciales: si no se puede despachar todo de una vez, la factura queda en estado "EN_PROCESO" y puede completarse en partes.

El sistema también puede manejar facturas de múltiples ubicaciones ADM (por ejemplo, una factura que mezcla productos de ADESA y de otra sucursal), distinguiendo cuáles afectan el stock físico del WMS y cuáles no.

Después de cada despacho, el sistema automáticamente revisa si alguna discrepancia existente para los SKUs afectados quedó resuelta con el nuevo movimiento.

### 4.5 Transferencias entre ubicaciones

Cuando ADM Cloud registra una transferencia de mercancía de una ubicación a otra (por ejemplo, de la bodega principal ADESA hacia una sucursal llamada Mirador Sur), este módulo procesa ese movimiento en el WMS.

El operador ingresa el DocID de la transferencia, el sistema la busca en ADM Cloud y muestra los productos involucrados. Luego el operador puede indicar las ubicaciones físicas WMS de origen y destino (si aplica al almacén gestionado). Al procesar la transferencia, el sistema ajusta el stock en las ubicaciones físicas correspondientes.

Al igual que en los otros módulos, después de procesar una transferencia el sistema verifica automáticamente si hay discrepancias que puedan haberse resuelto con ese movimiento.

### 4.6 Ajustes de inventario

Los ajustes permiten corregir el stock en el WMS manualmente. Se usan para:
- Inventario inicial: cuando el sistema se pone en marcha y hay que cargar las existencias actuales.
- Correcciones por conteo físico: cuando un conteo manual revela diferencias con el sistema.
- Correcciones por causas diversas: mermas, pérdidas, errores de digitación anteriores, etc.

Un ajuste consiste en indicar un SKU, una ubicación física y una cantidad. El sistema valida que tanto el SKU exista en el catálogo de ADM Cloud y que la ubicación física esté registrada en el sistema antes de permitir el ajuste.

El módulo también soporta **ajustes masivos por carga de archivo Excel**, lo que permite cargar decenas o cientos de ajustes en una sola operación, usando la plantilla Excel que el sistema mismo puede exportar.

La pantalla de historial de ajustes muestra todos los ajustes registrados con filtros por fecha, usuario y ubicación. Cada ajuste tiene una vista de detalle que muestra exactamente qué cambió y quién lo hizo.

### 4.7 Control de discrepancias

Este es uno de los módulos más sofisticados del sistema. Una discrepancia ocurre cuando el stock que ADM Cloud dice que hay de un producto en una ubicación no coincide con el stock físico que el WMS registra.

El sistema detecta discrepancias automáticamente después de cada sincronización y las clasifica por severidad:
- **Críticas:** diferencias de más del 500% o más de 100 unidades.
- **Altas:** diferencias de más del 300% o más de 50 unidades.

Cada discrepancia queda registrada con el stock según ADM Cloud, el stock físico según el WMS, la fecha de detección, y su estado (pendiente, revisado, resuelto).

El sistema también usa una tabla llamada "EnRevision" para marcar SKUs que merecen atención especial: productos que "desaparecieron" entre una sincronización y la siguiente, productos con cambios bruscos de stock, o diferencias graves entre el ERP y el inventario físico. Estos alertas se pueden resolver, ignorar o documentar con notas.

Cuando se realiza cualquier movimiento (despacho, recepción, transferencia, ajuste) que afecta los SKUs con discrepancias pendientes, el sistema automáticamente recalcula si la discrepancia sigue existiendo o quedó resuelta.

El sistema puede enviar notificaciones por email cuando detecta discrepancias críticas o cuando el estado de una sincronización cambia.

### 4.8 Abastecimiento (Políticas mínimo/máximo)

Este módulo permite definir umbrales de stock por producto por ubicación. Para cada combinación de producto y ubicación ADM, el administrador puede configurar:
- **Stock mínimo:** si el stock cae por debajo de este valor, el producto necesita reposición.
- **Stock máximo:** el nivel ideal al que debe llegar tras una reposición.

Con estas políticas configuradas, el sistema puede generar un reporte de qué productos están bajo su mínimo, cuánto hay que pedir para llevarlos al máximo (la cantidad sugerida de reposición), y cuál es el estado de cada uno (sin configuración, bajo mínimo, en rango, sobre máximo).

El módulo soporta importación y exportación de políticas en formato Excel, usando la misma lógica que los ajustes masivos. También permite marcar ciertos productos como "base de abastecimiento" de una ubicación, para distinguir el universo principal de productos que se deben gestionar activamente.

### 4.9 Gestión de ubicaciones físicas

El sistema tiene un catálogo de las ubicaciones físicas del almacén. Cada ubicación tiene un código (ej. A-01-02), un nombre descriptivo (ej. "Pasillo A, Estante 01, Nivel 02"), un tipo (pasillo, estante, zona, etc.) y puede estar activa o inactiva.

Este catálogo es la fuente de validación para todos los módulos: ningún movimiento puede registrarse en una ubicación que no exista en este catálogo.

También existe un sistema de **mapeo entre ubicaciones ADM Cloud y ubicaciones físicas WMS**. Esto permite que una ubicación lógica de ADM Cloud (como "ADESA") se relacione con múltiples ubicaciones físicas del almacén (A-01-02, B-03-04, etc.). Este mapeo es útil para las transferencias y para el módulo de abastecimiento.

### 4.10 Consulta de stock

Los usuarios pueden consultar el stock actual de cualquier producto, tanto el stock físico por ubicación dentro del WMS como el stock que reporta ADM Cloud para cada una de sus ubicaciones contables.

También está disponible la consulta de productos del catálogo sincronizado desde ADM Cloud, con búsqueda por SKU, nombre o código de barras.

### 4.11 Dashboard

La pantalla principal muestra un resumen en tiempo real del estado del almacén:
- Cantidad de facturas pendientes de despachar.
- Cantidad de facturas en proceso de despacho.
- Productos pendientes de asignar ubicación.
- Cantidad de movimientos registrados en el día.

### 4.12 Historiales

El sistema mantiene historiales completos de todos los tipos de documentos procesados:
- Historial de despachos: qué facturas se despacharon, cuándo y quién las procesó.
- Historial de recepciones: qué documentos de entrada se procesaron.
- Historial de transferencias: qué transferencias entre ubicaciones fueron procesadas.
- Historial de ajustes: qué ajustes de inventario se realizaron y por quién.

Cada historial tiene filtros y permite ver el detalle completo de cada operación.

---

## 5. Cómo fluye la información

### Flujo de sincronización con ADM Cloud

ADM Cloud es siempre la fuente de verdad para el catálogo de productos y el stock contable. El WMS descarga esa información y la almacena localmente. Cuando el WMS procesa un movimiento (despacho, recepción, etc.), actualiza su stock local pero **no escribe de vuelta a ADM Cloud**. ADM Cloud lleva su propio stock de forma independiente; el WMS lleva el control de las ubicaciones físicas.

La reconciliación entre ambos mundos ocurre a través del módulo de discrepancias, que compara periódicamente ambas fuentes y alerta cuando difieren significativamente.

### Flujo de un despacho

1. El despachador busca la factura en el sistema ingresando el número de documento.
2. El sistema consulta ADM Cloud y trae los productos.
3. El despachador indica de qué ubicación física tomará cada producto.
4. El sistema valida stock disponible en esa ubicación.
5. Se registra el movimiento y se descuenta el stock de la ubicación física.
6. El sistema revisa si hay discrepancias que se resolvieron.
7. La factura queda marcada como despachada (completa o parcialmente).

### Flujo de una recepción

1. El almacenista busca el documento de compra/recepción en el sistema.
2. El sistema consulta ADM Cloud y trae los productos de ese documento.
3. El almacenista asigna cada producto a su ubicación física de destino.
4. Se registra el movimiento y se suma el stock a esa ubicación física.
5. El sistema revisa discrepancias relacionadas.

---

## 6. Estructura de la base de datos

El sistema tiene las siguientes tablas principales:

| Tabla | Propósito |
|---|---|
| usuarios | Usuarios del sistema con sus roles y credenciales |
| movimientos | Registro histórico de todos los movimientos (RECEIPT, PICK, TRANSFER, ADJUSTMENT) |
| stock_por_ubicacion | Stock físico actual por producto y ubicación física WMS |
| facturas_procesadas | Control de facturas de venta procesadas en despacho |
| recepciones_procesadas | Control de documentos de recepción procesados |
| transferencias_procesadas | Control de transferencias entre ubicaciones procesadas |
| productos_adm | Catálogo de productos sincronizado desde ADM Cloud |
| stock_productos_adm | Stock por ubicación ADM sincronizado desde ADM Cloud (caché) |
| sync_locations_status | Estado de la sincronización por ubicación ADM |
| sync_runs | Historial de cada ejecución de sincronización |
| ubicaciones_fisicas | Catálogo de ubicaciones físicas del almacén |
| mapeo_ubicaciones_adm_wms | Relación entre ubicaciones ADM y ubicaciones físicas WMS |
| discrepancias | Diferencias detectadas entre stock ERP y stock físico |
| en_revision | SKUs que requieren atención por cambios anómalos en stock |
| pendientes_ubicacion | Productos recibidos sin ubicación asignada |
| abastecimiento_politica | Políticas de mínimo y máximo de stock por producto y ubicación |
| scheduler_lock | Control de bloqueo para evitar dos sincronizaciones simultáneas |
| notificaciones_config | Configuración de notificaciones por email |
| audit_log | Registro de auditoría de acciones de usuarios |

---

## 7. Aspectos de seguridad

El sistema implementa varias capas de protección:

- **Autenticación por sesión:** todas las rutas requieren sesión activa, verificada en cada petición.
- **Control de roles:** las funciones administrativas (sincronización, gestión de usuarios, panel de discrepancias) solo están disponibles para el rol administrador.
- **Protección CSRF:** el servidor verifica que cada petición de modificación provenga del mismo dominio que el servidor, rechazando peticiones de orígenes externos.
- **Rate limiting en login:** limitación de intentos de acceso para mitigar ataques de fuerza bruta.
- **Credenciales en variables de entorno:** las credenciales de ADM Cloud y la clave secreta de sesión se configuran exclusivamente mediante variables de entorno, nunca hardcodeadas en el código.
- **Headers de seguridad:** cada respuesta incluye headers para prevenir ataques de tipo clickjacking (X-Frame-Options), inyección de contenido (X-Content-Type-Options) y XSS (X-XSS-Protection).
- **Contraseñas con hash:** las contraseñas de usuarios se almacenan hasheadas con bcrypt, nunca en texto plano.
- **Token de cron:** el endpoint de sincronización automática está protegido por un token secreto que debe enviarse en un header específico.

---

## 8. Despliegue y entornos

El sistema soporta dos entornos:

- **Desarrollo local:** usa SQLite como base de datos, accesible desde `localhost:5000`. Se inicia con el archivo `Iniciar-WMS.bat`.
- **Producción en cPanel:** usa MySQL/MariaDB como base de datos. La aplicación corre bajo el servidor web LiteSpeed/Apache a través de Passenger (WSGI). Las variables de entorno se configuran en el panel de cPanel.

Hay consideraciones especiales para el entorno de producción en cPanel:
- El pooling de conexiones a MySQL se configura cuidadosamente para evitar errores de "packet sequence wrong" que ocurren cuando el servidor de base de datos cierra conexiones inactivas.
- Existe un modo alternativo (NullPool) que abre y cierra una conexión por cada petición, sacrificando rendimiento a cambio de estabilidad máxima.
- La sincronización con ADM Cloud puede activarse mediante un cron job configurado en cPanel.

---

## 9. Reglas de negocio fundamentales

El proyecto documenta internamente un conjunto de "Reglas de Oro" que gobiernan las decisiones de diseño:

1. **Solo ADESA modifica stock físico WMS:** Los movimientos registrados solo afectan el stock del WMS si corresponden a la ubicación ADESA (la ubicación principal que gestiona este WMS). Los documentos de otras ubicaciones se registran como referencia pero no alteran el stock físico local.

2. **La ubicación física debe existir antes del movimiento:** Ningún movimiento puede asignar productos a una ubicación que no esté previamente registrada en el catálogo de ubicaciones físicas. Esta regla evita la proliferación de ubicaciones inventadas.

3. **El stock no puede quedar negativo:** Antes de confirmar cualquier salida (despacho, transferencia), el sistema valida que haya cantidad suficiente en la ubicación de origen.

4. **La sincronización usa staging:** Los datos de una sincronización nueva nunca reemplazan los datos activos hasta que la sincronización completa exitosamente.

5. **Las discrepancias se recalculan tras cada movimiento:** Después de cualquier operación que cambia el stock físico, el sistema verifica automáticamente si las discrepancias relacionadas con los SKUs afectados siguen siendo válidas o quedaron resueltas.

---

## 10. Resumen ejecutivo

Este WMS es una capa de control físico construida encima de ADM Cloud. ADM Cloud sabe lo que se compró, lo que se vendió y lo que se transfirió entre sucursales; este WMS sabe **dónde está cada cosa dentro del almacén físico** y garantiza que cada movimiento de mercancía quede trazado con responsable, fecha y ubicación exacta.

El sistema resuelve el problema clásico de los almacenes que operan con un ERP contable pero sin control de ubicaciones: el inventario del sistema no coincide con lo que hay físicamente, los despachos se hacen "de memoria", y cuando hay diferencias nadie sabe cuándo ocurrieron ni quién fue responsable. Con este WMS, cada operación queda registrada, cada diferencia es visible, y el administrador tiene las herramientas para detectar y corregir desfases antes de que se conviertan en problemas contables o comerciales graves.
