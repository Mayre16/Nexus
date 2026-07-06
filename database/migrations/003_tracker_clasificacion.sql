-- =====================================================================
--  ADESA NEXUS - Migración 003: clasificación Tracker (flota / personal)
-- =====================================================================

SET NAMES utf8mb4;

ALTER TABLE `tracker_dispositivos`
  ADD COLUMN IF NOT EXISTS `tipo_equipo` ENUM('flota','personal','mixto') NOT NULL DEFAULT 'flota'
    COMMENT 'flota=PC/celular empresa; personal=propio; mixto=ambos usos'
    AFTER `usuario_windows`;

CREATE TABLE IF NOT EXISTS `tracker_reglas_categoria` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id`   BIGINT UNSIGNED NOT NULL,
  `patron`       VARCHAR(120)    NOT NULL COMMENT 'Regex sobre proceso+nombre+url',
  `categoria`    ENUM('trabajo','investigacion','ocio','otro') NOT NULL,
  `nota`         VARCHAR(255)    DEFAULT NULL,
  `creado_en`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_regla_usuario` (`usuario_id`),
  CONSTRAINT `fk_regla_usuario`
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Martha: WhatsApp siempre trabajo (comunicación ADESA)
INSERT INTO `tracker_reglas_categoria` (`usuario_id`, `patron`, `categoria`, `nota`)
SELECT u.id, 'whatsapp', 'trabajo', 'WhatsApp laboral ADESA'
  FROM `usuarios` u
 WHERE u.email = 'martha@adesa.com.do'
   AND NOT EXISTS (
     SELECT 1 FROM `tracker_reglas_categoria` r
      WHERE r.usuario_id = u.id AND r.patron = 'whatsapp'
   )
 LIMIT 1;
