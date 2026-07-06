-- 015 — Permisos por usuario, Nexus Hub, Power Quality y Scrapibids
-- Ejecutar: node backend/scripts/apply-migration-015.js

CREATE TABLE IF NOT EXISTS `usuario_modulos` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id`      BIGINT UNSIGNED NOT NULL,
  `modulo`          VARCHAR(60)     NOT NULL COMMENT 'technicalName del manifest',
  `activo`          TINYINT(1)      NOT NULL DEFAULT 1,
  `concedido_por`   BIGINT UNSIGNED DEFAULT NULL,
  `concedido_en`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expira_en`       DATETIME        DEFAULT NULL,
  `notas`           VARCHAR(255)    DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usuario_modulo` (`usuario_id`, `modulo`),
  KEY `idx_usuario_modulos_modulo` (`modulo`),
  CONSTRAINT `fk_um_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_um_concedido` FOREIGN KEY (`concedido_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hub_planes` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`            CHAR(36)        NOT NULL,
  `codigo`          VARCHAR(40)     NOT NULL COMMENT 'power_quality | scrapibids',
  `nombre`          VARCHAR(120)    NOT NULL,
  `descripcion`     TEXT,
  `precio_mensual`  DECIMAL(12,2)   DEFAULT NULL,
  `moneda`          CHAR(3)         NOT NULL DEFAULT 'USD',
  `activo`          TINYINT(1)      NOT NULL DEFAULT 1,
  `creado_en`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_hub_planes_codigo` (`codigo`),
  UNIQUE KEY `uq_hub_planes_uuid` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hub_suscripciones` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`                CHAR(36)        NOT NULL,
  `plan_id`             BIGINT UNSIGNED NOT NULL,
  `usuario_id`          BIGINT UNSIGNED NOT NULL,
  `cliente_empresa_id`  BIGINT UNSIGNED DEFAULT NULL,
  `estado`              ENUM('activa','suspendida','cancelada','trial') NOT NULL DEFAULT 'activa',
  `inicio_en`           DATE            NOT NULL,
  `renueva_en`          DATE            DEFAULT NULL,
  `cancelada_en`        DATETIME        DEFAULT NULL,
  `notas`               VARCHAR(255)    DEFAULT NULL,
  `creado_en`           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_hub_suscripciones_uuid` (`uuid`),
  KEY `idx_hub_sus_usuario` (`usuario_id`),
  KEY `idx_hub_sus_plan` (`plan_id`),
  CONSTRAINT `fk_hub_sus_plan` FOREIGN KEY (`plan_id`) REFERENCES `hub_planes` (`id`),
  CONSTRAINT `fk_hub_sus_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `scrapibids_config` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id`          BIGINT UNSIGNED NOT NULL,
  `palabras_clave`      JSON            NOT NULL COMMENT 'array de strings',
  `correo_destino`      VARCHAR(180)    NOT NULL,
  `frecuencia`          ENUM('diaria','semanal','personalizada') NOT NULL DEFAULT 'diaria',
  `hora_ejecucion`      TIME            NOT NULL DEFAULT '11:00:00',
  `dias_semana`         VARCHAR(20)     NOT NULL DEFAULT '1,2,3,4,5' COMMENT '1=lun..7=dom',
  `zona_horaria`        VARCHAR(50)     NOT NULL DEFAULT 'America/Santo_Domingo',
  `busqueda_publica`    TINYINT(1)      NOT NULL DEFAULT 1,
  `activo`              TINYINT(1)      NOT NULL DEFAULT 1,
  `ultima_ejecucion`    DATETIME        DEFAULT NULL,
  `proxima_ejecucion`   DATETIME        DEFAULT NULL,
  `actualizado_en`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_scrapibids_usuario` (`usuario_id`),
  CONSTRAINT `fk_scrapibids_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `scrapibids_ejecuciones` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id`      BIGINT UNSIGNED NOT NULL,
  `inicio_en`       DATETIME        NOT NULL,
  `fin_en`          DATETIME        DEFAULT NULL,
  `estado`          ENUM('ok','error','sin_novedades') NOT NULL DEFAULT 'ok',
  `licitaciones_nuevas` INT UNSIGNED NOT NULL DEFAULT 0,
  `mensaje`         TEXT,
  PRIMARY KEY (`id`),
  KEY `idx_scrapibids_ejec_usuario` (`usuario_id`),
  CONSTRAINT `fk_scrapibids_ejec_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pq_proyectos` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`                CHAR(36)        NOT NULL,
  `usuario_id`          BIGINT UNSIGNED NOT NULL,
  `cliente_nombre`      VARCHAR(200)    NOT NULL,
  `proyecto_nombre`     VARCHAR(200)    NOT NULL,
  `ubicacion`           VARCHAR(200)    DEFAULT NULL,
  `equipo_medicion`     VARCHAR(120)    DEFAULT NULL,
  `parametros_json`     JSON            NOT NULL,
  `estado`              ENUM('borrador','procesando','completado','error') NOT NULL DEFAULT 'borrador',
  `error_mensaje`       TEXT,
  `creado_en`           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pq_proyectos_uuid` (`uuid`),
  KEY `idx_pq_proyectos_usuario` (`usuario_id`),
  CONSTRAINT `fk_pq_proyectos_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pq_archivos` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `proyecto_id`     BIGINT UNSIGNED NOT NULL,
  `tipo`            ENUM('excel','plantilla','reporte') NOT NULL,
  `nombre_original` VARCHAR(255)    NOT NULL,
  `ruta_storage`    VARCHAR(500)    NOT NULL,
  `creado_en`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pq_archivos_proyecto` (`proyecto_id`),
  CONSTRAINT `fk_pq_archivos_proyecto` FOREIGN KEY (`proyecto_id`) REFERENCES `pq_proyectos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pq_plantillas` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`            CHAR(36)        NOT NULL,
  `usuario_id`      BIGINT UNSIGNED DEFAULT NULL COMMENT 'NULL = plantilla sistema',
  `nombre`          VARCHAR(120)    NOT NULL,
  `tipo_analisis`   VARCHAR(60)     NOT NULL DEFAULT 'completo',
  `es_sistema`      TINYINT(1)      NOT NULL DEFAULT 0,
  `ruta_storage`    VARCHAR(500)    NOT NULL,
  `activo`          TINYINT(1)      NOT NULL DEFAULT 1,
  `creado_en`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pq_plantillas_uuid` (`uuid`),
  KEY `idx_pq_plantillas_usuario` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `hub_planes` (`uuid`, `codigo`, `nombre`, `descripcion`, `precio_mensual`, `activo`)
VALUES
  (UUID(), 'power_quality', 'Power Quality', 'Análisis IEEE 519 y reportes Word desde datos AMPROBE/PME', 49.00, 1),
  (UUID(), 'scrapibids', 'ScrapiBids', 'Alertas de licitaciones DGCP por palabras clave', 29.00, 1);
