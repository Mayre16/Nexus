## MonitorSuite – Arquitectura General

### Objetivos
- Monitorear uso de aplicaciones, actividad/inactividad y navegación de equipos corporativos Windows de forma transparente.
- Proporcionar informes claros (incluyendo gráfico de pastel) disponibles sólo para personal autorizado.
- Asegurar retención de datos de 60 días sin eliminación por usuarios no autorizados.
- Ejecutarse automáticamente con Windows y resistir intentos accidentales de deshabilitación.

### Componentes
1. **MonitorService (Windows Service, .NET 8 Worker Service)**
   - Captura métricas de aplicaciones activas, actividad de entrada, bloqueo de sesión y navegación.
   - Persiste eventos en `SQLite` cifrado (SQLCipher) mediante EF Core.
   - Expone un canal interno seguro (Named Pipes + `NegotiateStream`) para consultas del panel administrativo.
   - Programa tareas periódicas: agregación diaria y purgado de datos > 60 días.
2. **MonitorAdmin (WPF .NET 8)**
   - Ejecutable bajo demanda para administradores autorizados.
   - Autenticación multifactor (contraseña derivada con PBKDF2 + OTP opcional).
   - Consume métricas agregadas del servicio y presenta dashboard con tiempos de uso, gráfico de pastel y navegación.
   - Exportación de reportes a PDF con `QuestPDF` (licencia comunitaria) o alternativa MIT si se prefiere.
3. **BrowserExtensions (Chrome/Edge/Firefox, Manifest V3)**
   - Envía URLs activas al servicio vía `Native Messaging`.
   - Se distribuyen únicamente en modo corporativo; muestran aviso al usuario.

### Flujo de Datos
1. Servicio detecta ventana activa con `GetForegroundWindow` y `GetWindowThreadProcessId`.
2. Identifica proceso ⇾ aplicación usando caché de procesos (`Process.MainModule.FileVersionInfo`).
3. Inactividad calculada con `GetLastInputInfo`; cambios de sesión con `SystemEvents.SessionSwitch`.
4. Extensiones notifican URL; si falta, se recurre al título de ventana para inferencia.
5. Eventos se almacenan en tablas normalizadas (`Sessions`, `AppUsage`, `BrowserActivity`, `InputActivity`).
6. Un job nocturno genera agregados diarios (`DailyUsageSummary`).
7. Consola solicita datos agregados ↔ servicio (Named Pipes). El servicio responde sólo a identidades del grupo `MonitorAdmins`.

### Seguridad y Cumplimiento
- **Credenciales**: Hash PBKDF2 con sal aleatoria y 100k iteraciones; OTP basado en TOTP opcional. Secretos protegidos en DPAPI scoped a cuenta del servicio.
- **Integridad de Datos**: Columnas sensibles cifradas; filas firmadas con HMAC para detectar manipulaciones.
- **Retención**: Job semanal elimina datos > 60 días; genera reporte de purga almacenado aparte.
- **Transparencia**: Notificación al usuario al iniciar sesión; política accesible desde panel. Logs de acceso de administradores.
- **Hardening**:
  - Servicio registrado como `Automatic (Delayed Start)` y con recovery de reinicio.
  - ACL en carpeta de datos (`%PROGRAMDATA%\\MonitorSuite`) restringida a `SYSTEM` y `MonitorAdmins`.
  - Binarios firmados (firma de prueba durante desarrollo).

### Próximos Pasos Técnicos
1. Generar solución `.sln` con tres proyectos:
   - `MonitorSuite.Service`
   - `MonitorSuite.Admin`
   - `MonitorSuite.Shared` (DTOs, contratos, utilidades)
2. Configurar proyectos:
   - Worker Service con `Microsoft.Extensions.Hosting.WindowsServices`.
   - WPF con MVVM (CommunityToolkit.Mvvm).
   - Shared con modelos EF Core y contratos de IPC.
3. Implementar persistencia (EF Core + SQLCipher provider).
4. Diseñar canal Named Pipes (`System.IO.Pipes`) con autenticación de Windows.
5. Crear prototipo de dashboard con gráfico de pastel (ScottPlot o LiveCharts 2 Community).
6. Preparar scripts de instalación (PowerShell + `sc.exe`) y políticas de grupo sugeridas.


