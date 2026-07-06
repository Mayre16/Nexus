-- Nexus Leads: proyectos desde iERP + vínculos (tickets, OT, etc.)

ALTER TABLE `leads`
  ADD COLUMN `tipo` ENUM('inbound','ierp_proyecto') NOT NULL DEFAULT 'inbound' AFTER `division`,
  ADD COLUMN `estado_proyecto` ENUM('activo','en_verificacion','completado','archivado','cerrado') DEFAULT NULL AFTER `estado`,
  ADD COLUMN `ierp_tenant_id` VARCHAR(36) DEFAULT NULL AFTER `notas`,
  ADD COLUMN `ierp_quote_id` VARCHAR(36) DEFAULT NULL AFTER `ierp_tenant_id`,
  ADD COLUMN `ierp_quote_number` VARCHAR(60) DEFAULT NULL AFTER `ierp_quote_id`,
  ADD COLUMN `ierp_company_id` VARCHAR(36) DEFAULT NULL AFTER `ierp_quote_number`,
  ADD COLUMN `ierp_company_name` VARCHAR(180) DEFAULT NULL AFTER `ierp_company_id`,
  ADD COLUMN `ierp_quote_total` DECIMAL(14,2) DEFAULT NULL AFTER `ierp_company_name`,
  ADD COLUMN `ierp_quote_currency` CHAR(3) DEFAULT 'DOP' AFTER `ierp_quote_total`;

ALTER TABLE `leads`
  ADD UNIQUE KEY `uq_leads_ierp_quote` (`ierp_tenant_id`, `ierp_quote_id`),
  ADD KEY `idx_leads_tipo` (`tipo`, `estado_proyecto`);

CREATE TABLE IF NOT EXISTS `lead_vinculos` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`                CHAR(36)        NOT NULL,
  `lead_id`             BIGINT UNSIGNED NOT NULL,
  `tipo`                ENUM(
                          'ierp_cotizacion',
                          'desk_ticket',
                          'ot_levantamiento',
                          'ot_verificacion',
                          'ot_servicio',
                          'nota'
                        ) NOT NULL,
  `titulo`              VARCHAR(255)    NOT NULL,
  `descripcion`         TEXT            DEFAULT NULL,
  `referencia_modulo`   ENUM('ierp','desk','nexus') NOT NULL DEFAULT 'nexus',
  `referencia_id`       VARCHAR(64)     DEFAULT NULL COMMENT 'UUID ticket Desk, etc.',
  `assignee_source`     ENUM('ierp_employee','ierp_contact','nexus_user') DEFAULT NULL,
  `assignee_id`         VARCHAR(64)     DEFAULT NULL,
  `assignee_name`       VARCHAR(120)    DEFAULT NULL,
  `nexus_asignado_id`   BIGINT UNSIGNED DEFAULT NULL,
  `estado`              ENUM('pendiente','en_progreso','completado','cancelado') NOT NULL DEFAULT 'pendiente',
  `fecha_limite`        DATE            DEFAULT NULL,
  `notificar`           TINYINT(1)      NOT NULL DEFAULT 0,
  `creado_por`          BIGINT UNSIGNED DEFAULT NULL,
  `creado_en`           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lead_vinculos_uuid` (`uuid`),
  KEY `idx_lead_vinculos_lead` (`lead_id`, `estado`),
  KEY `idx_lead_vinculos_tipo` (`tipo`),
  CONSTRAINT `fk_lead_vinculos_lead`
    FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lead_vinculos_nexus_user`
    FOREIGN KEY (`nexus_asignado_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lead_vinculos_creador`
    FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
