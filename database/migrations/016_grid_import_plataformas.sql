-- =====================================================================
--  ADESA NEXUS - Migración 016: Grid refinamiento import / multi-plataforma
-- =====================================================================

SET NAMES utf8mb4;

ALTER TABLE `grid_easymetering_equipos`
  ADD COLUMN `plataforma` VARCHAR(40) NOT NULL DEFAULT 'adesa_cloud' COMMENT 'adesa_cloud | cliente_*' AFTER `external_id`,
  ADD COLUMN `asignado_portal` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = tiene cliente/nombre en EZM' AFTER `nombre`;

ALTER TABLE `grid_easymetering_equipos`
  DROP INDEX `uq_grid_em_external`,
  ADD UNIQUE KEY `uq_grid_em_plat_ext` (`plataforma`, `external_id`),
  ADD KEY `idx_grid_em_plataforma` (`plataforma`, `asignado_portal`);

CREATE TABLE IF NOT EXISTS `grid_easymetering_estado_diario` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `equipo_id`       BIGINT UNSIGNED NOT NULL,
  `plataforma`      VARCHAR(40)     NOT NULL,
  `fecha`           DATE            NOT NULL,
  `estado_conexion` ENUM('online','offline','advertencia_offline','desconocido') NOT NULL,
  `sync_id`         BIGINT UNSIGNED DEFAULT NULL,
  `creado_en`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_grid_estado_dia` (`equipo_id`, `fecha`),
  KEY `idx_grid_estado_mes` (`plataforma`, `fecha`),
  CONSTRAINT `fk_grid_estado_equipo`
    FOREIGN KEY (`equipo_id`) REFERENCES `grid_easymetering_equipos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_grid_estado_sync`
    FOREIGN KEY (`sync_id`) REFERENCES `grid_easymetering_sync` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Equipos existentes → plataforma ADESA
UPDATE `grid_easymetering_equipos` SET `plataforma` = 'adesa_cloud' WHERE `plataforma` = 'adesa_cloud' OR `plataforma` IS NULL;
