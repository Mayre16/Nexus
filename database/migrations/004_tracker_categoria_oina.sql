-- =====================================================================
--  ADESA NEXUS - Migración 004: categoría personal OINA (Martha)
-- =====================================================================

SET NAMES utf8mb4;

ALTER TABLE `tracker_reglas_categoria`
  MODIFY COLUMN `categoria` ENUM('trabajo','investigacion','ocio','otro','oina') NOT NULL;

ALTER TABLE `tracker_reglas_categoria`
  ADD COLUMN IF NOT EXISTS `prioridad` TINYINT UNSIGNED NOT NULL DEFAULT 50
    COMMENT 'Mayor = se evalúa antes'
    AFTER `categoria`;

-- Cursor + Biblioteca Civis / Acropolis → OINA (solo Martha)
INSERT INTO `tracker_reglas_categoria` (`usuario_id`, `patron`, `categoria`, `prioridad`, `nota`)
SELECT u.id,
       'cursor.*(civis|acropolis|biblioteca)|(?:civis|acropolis|biblioteca).*(?:cursor|acropolis)',
       'oina',
       100,
       'Proyecto OINA — Biblioteca Civis Acropolis en Cursor'
  FROM `usuarios` u
 WHERE u.email = 'martha@adesa.com.do'
   AND NOT EXISTS (
     SELECT 1 FROM `tracker_reglas_categoria` r
      WHERE r.usuario_id = u.id AND r.categoria = 'oina'
   )
 LIMIT 1;
