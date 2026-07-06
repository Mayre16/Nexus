# Requisitos Mínimos AWS para Migración desde cPanel

## 📋 Resumen Ejecutivo

**Aplicación:** Flask WMS (Warehouse Management System)  
**Base de Datos:** MySQL/MariaDB  
**Carga Esperada:** Operaciones pesadas (carga masiva Excel 2000 filas, generación de catálogos)  
**Usuarios Concurrentes:** Estimado 5-20 usuarios simultáneos  

---

## 🖥️ 1. COMPUTE (Servidor de Aplicación)

### Opción A: EC2 (Recomendado para empezar)

#### **Mínimo Recomendado:**
- **Instancia:** `t3.small` o `t3.medium`
- **vCPU:** 2 cores
- **RAM:** 2-4 GB
- **Almacenamiento:** 20 GB SSD (gp3)
- **Costo estimado:** ~$15-30 USD/mes

#### **Especificaciones:**
```
t3.small:
  - vCPU: 2
  - RAM: 2 GB
  - Red: Hasta 5 Gbps
  - Rendimiento: Burstable (CPU Credits)

t3.medium:
  - vCPU: 2
  - RAM: 4 GB
  - Red: Hasta 5 Gbps
  - Rendimiento: Burstable (CPU Credits)
```

#### **Justificación:**
- **2 vCPU:** Suficiente para Flask con múltiples workers/threads
- **2-4 GB RAM:** 
  - Flask app: ~200-500 MB
  - Python runtime: ~100-200 MB
  - Pool de conexiones DB: ~50 MB
  - Excel processing (openpyxl): ~100-500 MB (picos)
  - Buffer para operaciones pesadas: ~500 MB
- **20 GB SSD:** 
  - Sistema operativo: ~8 GB
  - Aplicación: ~500 MB
  - Logs: ~2-5 GB
  - Archivos temporales (Excel): ~1-2 GB
  - Buffer: ~5 GB

#### **Alternativa (Más económico):**
- **Instancia:** `t3.micro` (1 vCPU, 1 GB RAM)
- **Costo:** ~$7-10 USD/mes
- **Limitación:** Solo para desarrollo/testing, no recomendado para producción con carga real

---

### Opción B: Elastic Beanstalk (Recomendado para producción)

#### **Ventajas:**
- Auto-scaling automático
- Balanceador de carga incluido
- Gestión simplificada
- Health checks automáticos

#### **Configuración Mínima:**
- **Plataforma:** Python 3.11
- **Instancia:** `t3.small` (mínimo)
- **Auto-scaling:** 1-3 instancias
- **Costo estimado:** ~$20-40 USD/mes

---

### Opción C: ECS Fargate (Serverless Containers)

#### **Configuración Mínima:**
- **CPU:** 0.5 vCPU (512 unidades)
- **RAM:** 1 GB
- **Costo estimado:** ~$10-15 USD/mes
- **Limitación:** Puede ser lento para operaciones pesadas (Excel)

---

## 🗄️ 2. BASE DE DATOS

### Opción A: RDS MySQL/MariaDB (Recomendado)

#### **Mínimo Recomendado:**
- **Instancia:** `db.t3.micro` o `db.t3.small`
- **Motor:** MySQL 8.0 o MariaDB 10.11
- **Almacenamiento:** 20 GB gp3 (SSD)
- **Backup:** Habilitado (7 días de retención)
- **Multi-AZ:** No (para reducir costos inicialmente)
- **Costo estimado:** ~$15-30 USD/mes

#### **Especificaciones:**
```
db.t3.micro:
  - vCPU: 2 (burst)
  - RAM: 1 GB
  - Red: Hasta 5 Gbps
  - IOPS: 3,000 (gp3)

db.t3.small:
  - vCPU: 2 (burst)
  - RAM: 2 GB
  - Red: Hasta 5 Gbps
  - IOPS: 3,000 (gp3)
```

#### **Justificación:**
- **1-2 GB RAM:** 
  - MySQL buffer pool: ~512 MB - 1 GB
  - Conexiones simultáneas: 5-10 (según config.py)
  - Queries complejas: ~200-500 MB
- **20 GB almacenamiento:**
  - Datos actuales: ~5-10 GB (estimado)
  - Crecimiento: ~1-2 GB/mes
  - Logs binarios: ~2-5 GB
  - Backups: ~5 GB

#### **Configuración Recomendada:**
```sql
-- Parámetros importantes en RDS Parameter Group:
max_connections = 50
innodb_buffer_pool_size = 512M (para db.t3.micro) o 1G (para db.t3.small)
query_cache_size = 0 (deshabilitado en MySQL 8.0)
```

---

### Opción B: RDS Aurora Serverless v2 (Escalado automático)

#### **Ventajas:**
- Escala automáticamente según carga
- Pago solo por uso
- Mejor rendimiento que RDS estándar

#### **Configuración Mínima:**
- **ACU mínimo:** 0.5 ACU (1 vCPU, 4 GB RAM)
- **ACU máximo:** 2 ACU (2 vCPU, 8 GB RAM)
- **Costo estimado:** ~$30-50 USD/mes (puede variar según uso)

---

### Opción C: EC2 con MySQL instalado (Más económico, menos recomendado)

#### **Configuración:**
- **Instancia:** `t3.micro` (1 vCPU, 1 GB RAM)
- **Almacenamiento:** 20 GB EBS gp3
- **Costo estimado:** ~$7-10 USD/mes
- **Desventajas:** Debes gestionar backups, actualizaciones, seguridad

---

## 🌐 3. RED Y SEGURIDAD

### Load Balancer (Opcional, recomendado para producción)

#### **Application Load Balancer (ALB):**
- **Costo:** ~$16 USD/mes + $0.008/GB transferido
- **Uso:** Distribuir carga entre múltiples instancias
- **Recomendación:** Solo si usas 2+ instancias EC2

---

### Security Groups (Gratis)

#### **Configuración Mínima:**
```
Security Group - App Server:
  - Puerto 80 (HTTP): 0.0.0.0/0 (o solo tu IP)
  - Puerto 443 (HTTPS): 0.0.0.0/0 (o solo tu IP)
  - Puerto 22 (SSH): Solo tu IP pública

Security Group - Database:
  - Puerto 3306 (MySQL): Solo desde Security Group de App Server
```

---

### Certificado SSL (Gratis)

#### **AWS Certificate Manager (ACM):**
- Certificado SSL/TLS gratuito
- Renovación automática
- Integración con ALB y CloudFront

---

## 💾 4. ALMACENAMIENTO

### EBS Volumes (Incluido en EC2)

- **Tipo:** gp3 (SSD general purpose)
- **Tamaño:** 20 GB (mínimo)
- **IOPS:** 3,000 (incluido)
- **Costo:** Incluido en instancia EC2

---

### S3 (Opcional, para backups y archivos estáticos)

#### **Uso:**
- Backups de base de datos
- Archivos Excel generados (catálogos)
- Logs históricos

#### **Costo estimado:**
- **Almacenamiento:** ~$0.023/GB/mes
- **Requests:** ~$0.005/1000 requests
- **Costo mensual:** ~$1-5 USD (depende del uso)

---

## 📊 5. MONITOREO Y LOGS

### CloudWatch (Gratis hasta cierto límite)

#### **Incluido gratis:**
- 10 métricas personalizadas
- 5 GB de logs
- 1M requests API

#### **Métricas importantes:**
- CPU utilización
- Memoria utilizada
- Latencia de base de datos
- Requests por segundo
- Errores HTTP

---

## 💰 6. COSTO TOTAL ESTIMADO

### Configuración Mínima (Producción Básica):

```
EC2 t3.small:              $15-20 USD/mes
RDS db.t3.micro:           $15-20 USD/mes
EBS Storage (20 GB):       Incluido
Data Transfer (primeros 100 GB): Gratis
CloudWatch (básico):       Gratis
─────────────────────────────────────
TOTAL:                     $30-40 USD/mes
```

### Configuración Recomendada (Producción):

```
EC2 t3.medium:             $30-35 USD/mes
RDS db.t3.small:           $25-30 USD/mes
ALB (opcional):            $16 USD/mes
S3 (backups):              $2-5 USD/mes
CloudWatch (básico):       Gratis
─────────────────────────────────────
TOTAL:                     $55-75 USD/mes
```

### Configuración Escalable (Alto rendimiento):

```
Elastic Beanstalk (2x t3.medium):  $60-70 USD/mes
RDS db.t3.medium:                  $50-60 USD/mes
ALB:                               $16 USD/mes
S3:                                $5-10 USD/mes
CloudWatch:                        $5-10 USD/mes
─────────────────────────────────────
TOTAL:                             $136-166 USD/mes
```

---

## 🚀 7. CONFIGURACIÓN DE SERVIDOR

### Software Necesario:

```bash
# Sistema Operativo
Ubuntu 22.04 LTS o Amazon Linux 2023

# Runtime
Python 3.11+
pip, virtualenv

# Servidor Web
Nginx (reverse proxy)
Gunicorn (WSGI server)

# Base de Datos
MySQL 8.0 o MariaDB 10.11 (si no usas RDS)

# Otros
Git (para deployment)
Supervisor o systemd (para gestión de procesos)
```

### Configuración Gunicorn:

```python
# gunicorn_config.py
workers = 2  # (2 x CPU cores) + 1 = 5 para t3.small
worker_class = 'sync'
worker_connections = 1000
timeout = 120  # Para operaciones pesadas (Excel)
keepalive = 5
bind = '0.0.0.0:8000'
```

---

## ⚠️ 8. CONSIDERACIONES IMPORTANTES

### Limitaciones de la Configuración Mínima:

1. **CPU Burstable (t3):**
   - Puede tener throttling si se usa constantemente
   - Para carga constante, considerar `t3a` o instancias `m5`

2. **Memoria Limitada:**
   - Operaciones Excel grandes pueden causar OOM (Out of Memory)
   - Monitorear uso de memoria constantemente

3. **Base de Datos:**
   - `db.t3.micro` puede ser lento para queries complejas
   - Considerar `db.t3.small` si hay timeouts frecuentes

4. **Red:**
   - Transferencia de datos puede ser costosa si hay mucho tráfico
   - Primeros 100 GB/mes son gratis

### Optimizaciones Recomendadas:

1. **Caché:**
   - Usar ElastiCache (Redis) para caché de productos
   - Costo: ~$15-20 USD/mes (opcional)

2. **CDN:**
   - CloudFront para archivos estáticos
   - Costo: ~$1-5 USD/mes (depende del tráfico)

3. **Auto-scaling:**
   - Configurar auto-scaling para picos de carga
   - Solo pagas por lo que usas

---

## 📝 9. CHECKLIST DE MIGRACIÓN

- [ ] Crear cuenta AWS y configurar billing alerts
- [ ] Crear VPC y subnets
- [ ] Configurar Security Groups
- [ ] Lanzar instancia EC2 (t3.small mínimo)
- [ ] Instalar Python, Nginx, Gunicorn
- [ ] Configurar RDS MySQL/MariaDB
- [ ] Migrar base de datos desde cPanel
- [ ] Configurar dominio y DNS (Route 53 o externo)
- [ ] Configurar SSL con ACM
- [ ] Configurar backups automáticos (RDS + S3)
- [ ] Configurar CloudWatch alarms
- [ ] Probar aplicación en staging
- [ ] Migrar datos de producción
- [ ] Configurar monitoreo y alertas

---

## 🔗 10. RECURSOS ADICIONALES

- **AWS Free Tier:** 12 meses gratis para nuevos usuarios
- **AWS Pricing Calculator:** https://calculator.aws/
- **Documentación RDS:** https://docs.aws.amazon.com/rds/
- **Documentación EC2:** https://docs.aws.amazon.com/ec2/

---

## ✅ CONCLUSIÓN

**Configuración Mínima Recomendada:**
- **EC2:** t3.small (2 vCPU, 2 GB RAM)
- **RDS:** db.t3.micro (1 GB RAM) o db.t3.small (2 GB RAM)
- **Costo:** ~$30-40 USD/mes

Esta configuración es suficiente para:
- ✅ 5-20 usuarios concurrentes
- ✅ Carga masiva Excel (2000 filas)
- ✅ Generación de catálogos
- ✅ Operaciones normales del WMS

**Si el presupuesto es muy limitado:**
- **EC2:** t3.micro (1 vCPU, 1 GB RAM) - ~$7-10/mes
- **RDS:** db.t3.micro (1 GB RAM) - ~$15/mes
- **Costo:** ~$22-25 USD/mes
- ⚠️ Puede tener problemas con operaciones muy pesadas
