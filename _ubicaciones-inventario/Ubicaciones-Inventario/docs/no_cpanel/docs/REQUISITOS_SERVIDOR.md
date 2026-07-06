# Requisitos de Servidor para WMS

## 📊 Análisis de Requisitos del Sistema

### **1. Requisitos Mínimos del Servidor**

#### **CPU (Procesador)**
- **Mínimo**: 2 vCPU / 2 cores
- **Recomendado**: 4 vCPU / 4 cores
- **Razón**: 
  - Flask es ligero, pero las operaciones simultáneas (múltiples usuarios escaneando) requieren procesamiento paralelo
  - Las consultas a ADM Cloud API pueden ser concurrentes
  - Operaciones de base de datos (especialmente con índices)

#### **RAM (Memoria)**
- **Mínimo**: 2 GB
- **Recomendado**: 4 GB
- **Ideal para producción**: 8 GB
- **Razón**:
  - Python/Flask: ~200-300 MB base
  - Base de datos (SQLite/PostgreSQL): ~100-500 MB
  - Cache de productos (5000+ productos): ~50-100 MB
  - Múltiples usuarios concurrentes: ~50-100 MB por usuario activo
  - Sistema operativo: ~500 MB

#### **Almacenamiento (Disco)**
- **Mínimo**: 10 GB
- **Recomendado**: 20-50 GB
- **Razón**:
  - Aplicación Flask: ~100 MB
  - Base de datos inicial: ~10-50 MB
  - Crecimiento estimado:
    - Movimientos: ~1 KB por movimiento
    - 1000 movimientos/día × 365 días = ~365 MB/año
    - Facturas procesadas: ~5-10 KB por factura
    - 100 facturas/día × 365 días = ~180-360 MB/año
    - Stock por ubicación: ~500 bytes por registro
    - 5000 productos × 5 ubicaciones = ~12.5 MB
  - Logs: ~100-500 MB/mes
  - Backups: 2-3x el tamaño de la BD

#### **Ancho de Banda (Network)**
- **Mínimo**: 10 Mbps
- **Recomendado**: 50-100 Mbps
- **Razón**:
  - Cada consulta a ADM Cloud API: ~50-200 KB
  - Escaneo móvil: ~1-5 KB por escaneo
  - Sincronización de stock: ~500 KB - 2 MB por sincronización
  - 10 usuarios simultáneos: ~5-10 Mbps

---

### **2. Base de Datos: SQLite vs PostgreSQL/MySQL**

#### **SQLite (Actual - Desarrollo/Pequeña Escala)**
✅ **Ventajas:**
- No requiere servidor separado
- Fácil de configurar en CPanel
- Suficiente para < 10 usuarios concurrentes
- Bajo consumo de recursos

❌ **Limitaciones:**
- Máximo ~100,000 transacciones/día
- Un solo escritor a la vez (locks en escrituras concurrentes)
- No escalable horizontalmente
- Sin replicación nativa

**Recomendación**: SQLite es suficiente para **inicio y hasta 5-10 usuarios simultáneos**

#### **PostgreSQL/MySQL (Producción/Escala)**
✅ **Ventajas:**
- Múltiples escritores simultáneos
- Mejor rendimiento con índices complejos
- Escalable horizontalmente
- Replicación y backups avanzados
- Transacciones ACID robustas

❌ **Desventajas:**
- Requiere servidor separado o servicio gestionado
- Más complejo de configurar
- Mayor consumo de recursos

**Recomendación**: Migrar a PostgreSQL cuando:
- Tengas > 10 usuarios simultáneos
- > 50,000 movimientos/mes
- Necesites alta disponibilidad

---

### **3. CPanel vs AWS: Comparación**

#### **CPanel (Hosting Compartido/VPS)**

✅ **Ventajas:**
- **Costo**: $5-30/mes (compartido) o $20-100/mes (VPS)
- **Facilidad**: Interfaz gráfica, sin necesidad de conocimientos avanzados
- **Soporte**: Incluido en la mayoría de planes
- **Python App**: Ya lo estás usando, funciona bien
- **Base de datos**: MySQL/PostgreSQL incluido en la mayoría de planes
- **SSL**: Certificados Let's Encrypt gratuitos

❌ **Limitaciones:**
- **Recursos compartidos**: En hosting compartido, recursos limitados
- **Escalabilidad**: Limitada, requiere upgrade de plan
- **Control**: Menos control sobre el servidor
- **Rendimiento**: Puede ser más lento que servidores dedicados

**Recomendación CPanel:**
- ✅ **Hosting Compartido**: Solo si tienes < 5 usuarios simultáneos
- ✅ **VPS CPanel**: Ideal para 5-20 usuarios simultáneos
- ✅ **Servidor Dedicado CPanel**: Para > 20 usuarios

#### **AWS (Cloud)**

✅ **Ventajas:**
- **Escalabilidad**: Auto-scaling, crece según demanda
- **Rendimiento**: Servidores optimizados, CDN global
- **Alta disponibilidad**: Múltiples zonas, backups automáticos
- **Servicios gestionados**: RDS (PostgreSQL), Elastic Beanstalk
- **Control total**: Configuración completa del servidor

❌ **Desventajas:**
- **Costo**: $30-200+/mes (depende del uso)
- **Complejidad**: Requiere conocimientos de AWS, EC2, RDS, etc.
- **Configuración**: Más tiempo de setup inicial
- **Curva de aprendizaje**: Necesitas aprender AWS

**Recomendación AWS:**
- ✅ **EC2 + RDS**: Para > 20 usuarios simultáneos
- ✅ **Elastic Beanstalk**: Para despliegue automatizado
- ✅ **Cuando necesites**: Alta disponibilidad, múltiples ubicaciones, auto-scaling

---

### **4. Escenarios de Uso y Recomendaciones**

#### **Escenario 1: Inicio (1-5 usuarios simultáneos)**
- **Servidor**: CPanel Hosting Compartido o VPS básico
- **Especificaciones**: 2 vCPU, 2 GB RAM, 20 GB disco
- **Base de datos**: SQLite (actual)
- **Costo estimado**: $10-30/mes
- **✅ CPanel es PERFECTO para esto**

#### **Escenario 2: Crecimiento (5-15 usuarios simultáneos)**
- **Servidor**: CPanel VPS
- **Especificaciones**: 4 vCPU, 4 GB RAM, 50 GB disco
- **Base de datos**: PostgreSQL (migrar desde SQLite)
- **Costo estimado**: $40-80/mes
- **✅ CPanel VPS sigue siendo suficiente**

#### **Escenario 3: Producción (15-50 usuarios simultáneos)**
- **Servidor**: CPanel VPS/Dedicado o AWS EC2
- **Especificaciones**: 4-8 vCPU, 8 GB RAM, 100 GB disco
- **Base de datos**: PostgreSQL (RDS en AWS o servidor dedicado)
- **Costo estimado**: $80-150/mes
- **✅ CPanel VPS/Dedicado o AWS EC2 (según preferencia)**

#### **Escenario 4: Gran Escala (50+ usuarios simultáneos)**
- **Servidor**: AWS EC2 + RDS o servidor dedicado
- **Especificaciones**: 8+ vCPU, 16+ GB RAM, 200+ GB disco
- **Base de datos**: PostgreSQL con replicación
- **Costo estimado**: $150-500+/mes
- **✅ AWS es recomendado para escalabilidad**

---

### **5. Recomendación Final para tu Caso**

Basado en tu descripción del sistema:

#### **Fase Inicial (Desarrollo/Pruebas)**
✅ **CPanel VPS o Hosting Compartido con Python App**
- **Especificaciones mínimas**: 2 vCPU, 2 GB RAM, 20 GB disco
- **Base de datos**: SQLite (actual)
- **Costo**: $10-40/mes
- **Razón**: Suficiente para desarrollo, pruebas y primeros usuarios

#### **Fase de Producción (5-20 usuarios)**
✅ **CPanel VPS**
- **Especificaciones**: 4 vCPU, 4-8 GB RAM, 50-100 GB disco
- **Base de datos**: PostgreSQL (migrar desde SQLite)
- **Costo**: $50-100/mes
- **Razón**: CPanel VPS es más que suficiente, fácil de gestionar, sin necesidad de AWS

#### **Fase de Expansión (20+ usuarios)**
✅ **CPanel VPS/Dedicado o AWS EC2**
- **Especificaciones**: 8 vCPU, 8-16 GB RAM, 100+ GB disco
- **Base de datos**: PostgreSQL (RDS en AWS o servidor dedicado)
- **Costo**: $100-200/mes
- **Razón**: Depende de tu preferencia (facilidad vs escalabilidad)

---

### **6. Checklist de Requisitos por Fase**

#### **Fase 1: Desarrollo/Pruebas (Ahora)**
- [x] CPanel con Python App (ya lo tienes)
- [x] SQLite (ya configurado)
- [x] 2 GB RAM mínimo
- [x] 10 GB disco mínimo
- [x] SSL/HTTPS (Let's Encrypt)

#### **Fase 2: Producción Inicial (5-10 usuarios)**
- [ ] CPanel VPS (upgrade desde compartido si es necesario)
- [ ] PostgreSQL (migrar desde SQLite)
- [ ] 4 GB RAM
- [ ] 50 GB disco
- [ ] Backups automáticos diarios
- [ ] Monitoreo básico

#### **Fase 3: Producción Estable (10-20 usuarios)**
- [ ] CPanel VPS o AWS EC2
- [ ] PostgreSQL optimizado
- [ ] 8 GB RAM
- [ ] 100 GB disco
- [ ] Backups automáticos + replicación
- [ ] Monitoreo avanzado
- [ ] CDN para assets estáticos (opcional)

---

### **7. Conclusión**

**Para tu caso específico:**

1. **CPanel es PERFECTO para empezar** ✅
   - Ya lo tienes funcionando
   - Suficiente para desarrollo y primeros usuarios
   - Fácil de gestionar
   - Costo razonable

2. **No necesitas AWS inicialmente** ❌
   - AWS es overkill para < 20 usuarios
   - Mayor complejidad sin beneficios inmediatos
   - CPanel VPS puede manejar 20-50 usuarios sin problemas

3. **Cuándo considerar AWS:**
   - Si superas 50 usuarios simultáneos
   - Si necesitas múltiples ubicaciones/servidores
   - Si necesitas auto-scaling automático
   - Si tu equipo tiene experiencia con AWS

4. **Migración futura:**
   - La aplicación está diseñada para ser portable
   - Puedes migrar de CPanel a AWS cuando sea necesario
   - La base de datos se puede migrar fácilmente (SQLite → PostgreSQL → RDS)

---

### **8. Plan de Acción Recomendado**

1. **Ahora (Desarrollo)**: Continúa con CPanel actual ✅
2. **Próximos 3-6 meses**: Evalúa el uso real (usuarios, carga)
3. **Si necesitas más recursos**: Upgrade a CPanel VPS
4. **Si superas 20 usuarios**: Considera AWS o servidor dedicado

**En resumen: CPanel es suficiente para tu aplicación. No necesitas AWS a menos que crezcas significativamente.**

