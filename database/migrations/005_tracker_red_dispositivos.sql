-- =====================================================================
--  ADESA NEXUS - Migración 005: asignación MAC ↔ usuario (Tracker + UniFi)
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `tracker_red_dispositivos` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `mac`              CHAR(17)        NOT NULL COMMENT 'MAC normalizada aa:bb:cc:dd:ee:ff',
  `usuario_id`       BIGINT UNSIGNED DEFAULT NULL,
  `alias`            VARCHAR(120)    DEFAULT NULL,
  `tipo_dispositivo` ENUM('pc','laptop','mac','tablet','telefono','voip','impresora','streaming','otro') DEFAULT NULL,
  `nota`             VARCHAR(255)    DEFAULT NULL,
  `creado_en`        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tracker_red_mac` (`mac`),
  KEY `fk_tracker_red_usuario` (`usuario_id`),
  CONSTRAINT `fk_tracker_red_usuario`
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
