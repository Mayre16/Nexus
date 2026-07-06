# Participantes, usuarios Nexus e iERP — hoja de ruta

Documento de referencia (no olvidar). Nexus **no duplica** usuarios iERP; los vincula cuando hace falta.

## Tres capas de personas

| Capa | Qué es | Login Nexus | Ejemplo |
|------|--------|-------------|---------|
| **Usuario Nexus** | Cuenta interna ADESA (RBAC) | Sí, permanente | Martha admin, técnico energía |
| **Persona vinculada iERP** | Mismo humano; en iERP es empleado/contacto | Sí (usuario) o no | Técnico en nómina iERP ↔ usuario Nexus |
| **Participante externo** | Contratista, cliente, contacto sin cuenta full | **Acceso temporal** (portal) o solo notificaciones | Instalador externo, cliente que recibe cotización |

### Usuarios Nexus ≠ usuarios iERP

- Roles Nexus actuales (`admin`, `empleado`, …) siguen siendo válidos.
- Un usuario Nexus puede tener **perfil interno** adicional: admin, desarrollador, técnico, comercial, operaciones.
- En iERP se **busca y enlaza** empleado/contacto (`ierp_employee_id` / `ierp_contact_id`); no se crea automáticamente usuario iERP al crear usuario Nexus.
- Admins y desarrolladores pueden no existir en iERP.

### Acceso temporal (portal — fase 2)

Personas creadas en Nexus **sin ser usuarios permanentes**, con permisos acotados y fecha de expiración:

| Permiso portal | Desk | Tasks | Leads |
|----------------|------|-------|-------|
| Ver tickets propios | ✓ | | |
| Abrir / gestionar sus tickets | ✓ | | |
| Ver tareas asignadas / etiquetado | | ✓ | |
| Levantamientos asignados (contratista) | | | ✓ |
| Cotizaciones pendientes de recibir | | | ✓ |
| Subir / asociar cotización recibida | | | ✓ (documentación) |

---

## Etiquetar participantes en eventos

En **Tasks**, **Leads**, **OT/vínculos**, **Desk** y (futuro) **reuniones**:

1. Buscar persona (interna, contratista, cliente, contacto iERP).
2. Asignar **rol en el evento**: asignado, etiquetado, contratista levantamiento, receptor cotización, observador.
3. Si `notificar=true` → correo (SMTP) + registro en `nexus_notificaciones_persona`.

Casos de uso ADESA:

- Contratista etiquetado en OT de **levantamiento** en Leads → notificación con enlace al lead.
- Tarea interna de QA con contratista como observador.
- Cotización enviada al contratista → evento `receptor_cotizacion`; al recibir PDF, vincular tarea/documento.

---

## Modelo de datos (migración 012)

```
nexus_personas              ← directorio (internos + externos)
nexus_evento_participantes  ← etiqueta en task | lead | lead_vinculo | ticket | reunion
nexus_notificaciones_persona ← cola / historial de avisos
usuarios.*                  ← ierp_employee_id, ierp_contact_id, persona_id, perfil_interno
```

---

## Fases de implementación

### Fase A — Fundación (en curso)

- [x] Tablas + API `/api/personas`
- [x] Etiquetar en Tasks y Leads (API + UI básica)
- [x] Notificación por correo al etiquetar
- [ ] Enlace usuario Nexus ↔ persona ↔ iERP en Ajustes

### Fase B — Portal temporal

- [ ] Login magic-link / token temporal
- [ ] Vistas reducidas Desk / Tasks / Leads por permiso
- [ ] Expiración automática de acceso

### Fase C — Cotizaciones contratista

- [ ] Evento `receptor_cotizacion` en lead
- [ ] Adjuntar cotización recibida y ligar a tarea OT
- [ ] Sync opcional con iERP (documento proveedor)

---

## API (resumen)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/personas?q=` | Buscar directorio |
| POST | `/api/personas` | Crear contratista/cliente |
| GET | `/api/personas/:uuid` | Detalle |
| PATCH | `/api/personas/:uuid` | Actualizar / acceso temporal |
| GET | `/api/personas/evento/:tipo/:ref` | Participantes de un evento |
| POST | `/api/personas/evento/:tipo/:ref` | Etiquetar + notificar |
| DELETE | `/api/personas/vinculos/:uuid` | Quitar etiqueta |

Tipos de evento: `task`, `lead`, `lead_vinculo`, `ticket`, `reunion`.
