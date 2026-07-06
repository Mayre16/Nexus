-- Nexus Tasks: tablero interno Kanban (backlog ADESA)

INSERT INTO `secuencias` (`nombre`, `valor`) VALUES ('task_nexus', 100)
ON DUPLICATE KEY UPDATE `nombre` = `nombre`;

CREATE TABLE IF NOT EXISTS `nexus_tasks` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`              CHAR(36)        NOT NULL,
  `numero`            INT UNSIGNED    NOT NULL,
  `division`          ENUM('energia','deportes','interno') NOT NULL DEFAULT 'interno',
  `titulo`            VARCHAR(255)    NOT NULL,
  `descripcion`       TEXT            DEFAULT NULL,
  `estado`            ENUM('pendiente','en_progreso','completado','archivado') NOT NULL DEFAULT 'pendiente',
  `prioridad`         ENUM('baja','media','alta') NOT NULL DEFAULT 'media',
  `etiquetas`         JSON            DEFAULT NULL COMMENT 'Array JSON de strings',
  `lead_uuid`         CHAR(36)        DEFAULT NULL,
  `ticket_uuid`       CHAR(36)        DEFAULT NULL,
  `ierp_activity_id`  VARCHAR(36)     DEFAULT NULL,
  `asignado_id`       BIGINT UNSIGNED DEFAULT NULL,
  `orden`             INT             NOT NULL DEFAULT 0,
  `fecha_limite`      DATE            DEFAULT NULL,
  `completado_en`     TIMESTAMP       NULL DEFAULT NULL,
  `archivado_en`      TIMESTAMP       NULL DEFAULT NULL,
  `archivado_por`     BIGINT UNSIGNED DEFAULT NULL,
  `creado_por`        BIGINT UNSIGNED DEFAULT NULL,
  `creado_en`         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_nexus_tasks_uuid` (`uuid`),
  KEY `idx_nexus_tasks_estado` (`estado`, `division`, `orden`),
  KEY `idx_nexus_tasks_lead` (`lead_uuid`),
  KEY `idx_nexus_tasks_ticket` (`ticket_uuid`),
  KEY `idx_nexus_tasks_asignado` (`asignado_id`, `estado`),
  CONSTRAINT `fk_nexus_tasks_asignado`
    FOREIGN KEY (`asignado_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_nexus_tasks_creador`
    FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_nexus_tasks_archivador`
    FOREIGN KEY (`archivado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
