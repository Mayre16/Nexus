-- Configuración centralizada Nexus (SMTP, notificaciones, integraciones)

CREATE TABLE IF NOT EXISTS `nexus_config` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `clave`           VARCHAR(120)    NOT NULL,
  `valor_json`      JSON            NOT NULL,
  `categoria`       ENUM('general','smtp','notifications','integrations') NOT NULL DEFAULT 'general',
  `secreto`         TINYINT(1)      NOT NULL DEFAULT 0,
  `actualizado_por` BIGINT UNSIGNED DEFAULT NULL,
  `actualizado_en`  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_nexus_config_clave` (`clave`),
  KEY `idx_nexus_config_cat` (`categoria`),
  CONSTRAINT `fk_nexus_config_usuario`
    FOREIGN KEY (`actualizado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
