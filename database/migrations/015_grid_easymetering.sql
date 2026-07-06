-- =====================================================================
--  ADESA NEXUS - Migración 015: Grid / EasyMetering
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `grid_easymetering_equipos` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`                CHAR(36)        NOT NULL,
  `external_id`         VARCHAR(120)    NOT NULL COMMENT 'ID en AMI Cloud / EZM',
  `serial`              VARCHAR(80)     DEFAULT NULL,
  `nombre`              VARCHAR(180)    DEFAULT NULL,
  `estado_conexion`     ENUM('online','offline','advertencia_offline','desconocido') NOT NULL DEFAULT 'desconocido',
  `propiedad`           ENUM('sin_clasificar','adesa_prueba','easymetering','cliente') NOT NULL DEFAULT 'sin_clasificar',
  `cliente_empresa_id`  BIGINT UNSIGNED DEFAULT NULL,
  `ultima_lectura_kwh`  DECIMAL(14,4)   DEFAULT NULL,
  `ultima_lectura_en`   DATETIME        DEFAULT NULL,
  `ultima_sync_en`      DATETIME        DEFAULT NULL,
  `notas`               TEXT            DEFAULT NULL,
  `metadata_json`       JSON            DEFAULT NULL,
  `creado_en`           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_grid_em_uuid` (`uuid`),
  UNIQUE KEY `uq_grid_em_external` (`external_id`),
  KEY `idx_grid_em_estado` (`estado_conexion`, `propiedad`),
  KEY `idx_grid_em_cliente` (`cliente_empresa_id`),
  CONSTRAINT `fk_grid_em_cliente`
    FOREIGN KEY (`cliente_empresa_id`) REFERENCES `clientes_empresa` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `grid_easymetering_lecturas` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `equipo_id`     BIGINT UNSIGNED NOT NULL,
  `fecha`         DATE            NOT NULL,
  `kwh`           DECIMAL(14,4)   NOT NULL DEFAULT 0,
  `monto_estimado` DECIMAL(12,2)  DEFAULT NULL,
  `fuente`        ENUM('scrape','manual','import') NOT NULL DEFAULT 'scrape',
  `creado_en`     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_grid_lectura_dia` (`equipo_id`, `fecha`),
  KEY `idx_grid_lectura_fecha` (`fecha`),
  CONSTRAINT `fk_grid_lectura_equipo`
    FOREIGN KEY (`equipo_id`) REFERENCES `grid_easymetering_equipos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `grid_easymetering_sync` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `inicio_en`       DATETIME        NOT NULL,
  `fin_en`          DATETIME        DEFAULT NULL,
  `estado`          ENUM('ok','error','parcial','demo') NOT NULL DEFAULT 'ok',
  `equipos_total`   INT UNSIGNED    NOT NULL DEFAULT 0,
  `equipos_online`  INT UNSIGNED    NOT NULL DEFAULT 0,
  `equipos_offline` INT UNSIGNED    NOT NULL DEFAULT 0,
  `equipos_alerta`  INT UNSIGNED    NOT NULL DEFAULT 0,
  `mensaje`         TEXT            DEFAULT NULL,
  `creado_por`      BIGINT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_grid_sync_inicio` (`inicio_en`),
  CONSTRAINT `fk_grid_sync_user`
    FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
