-- =====================================================================
--  ADESA NEXUS - Migración 002: Nexus Tracker (MonitorSuite / BadBoy)
-- ---------------------------------------------------------------------
--  Ejecutar sobre adesa_nexus DESPUÉS de nexus_master.sql:
--    docker exec -i nexus_mariadb mariadb -unexus_app -pnexus_dev_pw adesa_nexus < database/migrations/002_nexus_tracker.sql
-- =====================================================================

SET NAMES utf8mb4;

-- Dispositivos Windows registrados (agente BadBoy / MonitorSuite).
CREATE TABLE IF NOT EXISTS `tracker_dispositivos` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`            CHAR(36)        NOT NULL,
  `usuario_id`      BIGINT UNSIGNED NOT NULL,
  `nombre_equipo`   VARCHAR(120)    NOT NULL,
  `usuario_windows` VARCHAR(120)    DEFAULT NULL,
  `api_secret_cifrado` VARBINARY(512) NOT NULL,  -- AES-256-GCM (ver crypto.js)
  `activo`          TINYINT(1)      NOT NULL DEFAULT 1,
  `ultimo_reporte`  DATETIME        DEFAULT NULL,
  `creado_en`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tracker_uuid` (`uuid`),
  KEY `fk_tracker_usuario` (`usuario_id`),
  CONSTRAINT `fk_tracker_usuario`
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lotes de reporte recibidos cada ~5 min desde el agente Windows.
CREATE TABLE IF NOT EXISTS `performance_logs` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`            CHAR(36)        NOT NULL,
  `dispositivo_id`  BIGINT UNSIGNED NOT NULL,
  `periodo_inicio`  DATETIME(3)     NOT NULL,
  `periodo_fin`     DATETIME(3)     NOT NULL,
  `estado_sesion`   ENUM('activa','bloqueada','inactiva','desconocida') NOT NULL DEFAULT 'activa',
  `segundos_activo` INT UNSIGNED    NOT NULL DEFAULT 0,
  `segundos_inactivo` INT UNSIGNED  NOT NULL DEFAULT 0,
  `recibido_en`     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_perf_uuid` (`uuid`),
  KEY `fk_perf_dispositivo` (`dispositivo_id`),
  KEY `idx_perf_periodo` (`periodo_inicio`, `periodo_fin`),
  CONSTRAINT `fk_perf_dispositivo`
    FOREIGN KEY (`dispositivo_id`) REFERENCES `tracker_dispositivos` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Uso de aplicaciones (ventana activa) dentro del lote.
CREATE TABLE IF NOT EXISTS `performance_app_uso` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `log_id`          BIGINT UNSIGNED NOT NULL,
  `proceso`         VARCHAR(120)    NOT NULL,
  `nombre_app`      VARCHAR(180)    NOT NULL,
  `segundos`        INT UNSIGNED    NOT NULL DEFAULT 0,
  `con_input`       TINYINT(1)      NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `fk_app_log` (`log_id`),
  CONSTRAINT `fk_app_log`
    FOREIGN KEY (`log_id`) REFERENCES `performance_logs` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- URLs / navegación capturada por extensiones o título de ventana.
CREATE TABLE IF NOT EXISTS `performance_url_uso` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `log_id`          BIGINT UNSIGNED NOT NULL,
  `navegador`       VARCHAR(80)     DEFAULT NULL,
  `url`             VARCHAR(500)    NOT NULL,
  `titulo`          VARCHAR(255)    DEFAULT NULL,
  `segundos`        INT UNSIGNED    NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `fk_url_log` (`log_id`),
  CONSTRAINT `fk_url_log`
    FOREIGN KEY (`log_id`) REFERENCES `performance_logs` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pregunta web al empleado: "¿En qué trabajas ahora?" (fase 2 del cruce).
CREATE TABLE IF NOT EXISTS `performance_autoreporte` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id`      BIGINT UNSIGNED NOT NULL,
  `descripcion`     VARCHAR(500)    NOT NULL,
  `ticket_id`       BIGINT UNSIGNED DEFAULT NULL,
  `creado_en`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_autorep_usuario` (`usuario_id`),
  CONSTRAINT `fk_autorep_usuario`
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
