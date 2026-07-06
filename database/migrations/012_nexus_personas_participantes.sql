-- Nexus: directorio de personas, etiquetado en eventos y notificaciones

CREATE TABLE IF NOT EXISTS `nexus_personas` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`                CHAR(36)        NOT NULL,
  `tipo`                ENUM('empleado_interno','contratista','cliente','contacto_ierp') NOT NULL DEFAULT 'contratista',
  `nombre_completo`     VARCHAR(150)    NOT NULL,
  `email`               VARCHAR(180)    DEFAULT NULL,
  `telefono`            VARCHAR(40)     DEFAULT NULL,
  `empresa`             VARCHAR(180)    DEFAULT NULL,
  `division`            ENUM('energia','deportes','ambas','interno') NOT NULL DEFAULT 'interno',
  `usuario_id`          BIGINT UNSIGNED DEFAULT NULL COMMENT 'Si tiene cuenta Nexus permanente',
  `ierp_employee_id`    VARCHAR(36)     DEFAULT NULL,
  `ierp_contact_id`     VARCHAR(36)     DEFAULT NULL,
  `acceso_portal`       ENUM('ninguno','temporal','permanente') NOT NULL DEFAULT 'ninguno',
  `acceso_expira_en`    DATETIME        DEFAULT NULL,
  `permisos_json`       JSON            DEFAULT NULL COMMENT 'Permisos portal temporal',
  `notas`               TEXT            DEFAULT NULL,
  `activo`              TINYINT(1)      NOT NULL DEFAULT 1,
  `creado_por`          BIGINT UNSIGNED DEFAULT NULL,
  `creado_en`           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_nexus_personas_uuid` (`uuid`),
  KEY `idx_nexus_personas_tipo` (`tipo`, `activo`),
  KEY `idx_nexus_personas_email` (`email`),
  KEY `idx_nexus_personas_usuario` (`usuario_id`),
  CONSTRAINT `fk_nexus_personas_usuario`
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_nexus_personas_creador`
    FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `nexus_evento_participantes` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`                CHAR(36)        NOT NULL,
  `persona_id`          BIGINT UNSIGNED NOT NULL,
  `evento_tipo`         ENUM('task','lead','lead_vinculo','ticket','reunion') NOT NULL,
  `evento_ref`          CHAR(36)        NOT NULL COMMENT 'UUID del task, lead, vinculo, ticket, etc.',
  `rol_participacion`   ENUM(
                          'asignado',
                          'etiquetado',
                          'contratista_levantamiento',
                          'receptor_cotizacion',
                          'observador'
                        ) NOT NULL DEFAULT 'etiquetado',
  `notificar`           TINYINT(1)      NOT NULL DEFAULT 1,
  `notificado_en`       TIMESTAMP       NULL DEFAULT NULL,
  `mensaje`             VARCHAR(500)    DEFAULT NULL,
  `creado_por`          BIGINT UNSIGNED DEFAULT NULL,
  `creado_en`           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_evento_participante` (`persona_id`, `evento_tipo`, `evento_ref`, `rol_participacion`),
  UNIQUE KEY `uq_evento_part_uuid` (`uuid`),
  KEY `idx_evento_part_ref` (`evento_tipo`, `evento_ref`),
  CONSTRAINT `fk_evento_part_persona`
    FOREIGN KEY (`persona_id`) REFERENCES `nexus_personas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_evento_part_creador`
    FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `nexus_notificaciones_persona` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`                CHAR(36)        NOT NULL,
  `persona_id`          BIGINT UNSIGNED NOT NULL,
  `participante_id`     BIGINT UNSIGNED DEFAULT NULL,
  `evento_tipo`         VARCHAR(40)     NOT NULL,
  `evento_ref`          CHAR(36)        NOT NULL,
  `canal`               ENUM('email','portal') NOT NULL DEFAULT 'email',
  `estado`              ENUM('pendiente','enviada','fallida','leida') NOT NULL DEFAULT 'pendiente',
  `asunto`              VARCHAR(255)    NOT NULL,
  `cuerpo`              TEXT            NOT NULL,
  `error_msg`           VARCHAR(500)    DEFAULT NULL,
  `enviado_en`          TIMESTAMP       NULL DEFAULT NULL,
  `creado_en`           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notif_persona_uuid` (`uuid`),
  KEY `idx_notif_persona_estado` (`persona_id`, `estado`),
  CONSTRAINT `fk_notif_persona`
    FOREIGN KEY (`persona_id`) REFERENCES `nexus_personas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_notif_participante`
    FOREIGN KEY (`participante_id`) REFERENCES `nexus_evento_participantes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `usuarios`
  ADD COLUMN `perfil_interno` ENUM('admin','desarrollador','tecnico','comercial','operaciones') DEFAULT NULL AFTER `rol`,
  ADD COLUMN `ierp_employee_id` VARCHAR(36) DEFAULT NULL AFTER `cliente_empresa_id`,
  ADD COLUMN `ierp_contact_id` VARCHAR(36) DEFAULT NULL AFTER `ierp_employee_id`,
  ADD COLUMN `persona_id` BIGINT UNSIGNED DEFAULT NULL AFTER `ierp_contact_id`;

ALTER TABLE `usuarios`
  ADD KEY `idx_usuarios_persona` (`persona_id`),
  ADD KEY `idx_usuarios_ierp_emp` (`ierp_employee_id`);

ALTER TABLE `usuarios`
  ADD CONSTRAINT `fk_usuarios_persona`
    FOREIGN KEY (`persona_id`) REFERENCES `nexus_personas` (`id`) ON DELETE SET NULL;
