-- =====================================================================
--  ADESA NEXUS - Migración 014: Ubicaciones físicas en Nexus Almacén
--  (parte del módulo almacen, no app separada)
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `ubicaciones` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`            CHAR(36)        NOT NULL,
  `almacen_id`      BIGINT UNSIGNED NOT NULL,
  `codigo`          VARCHAR(50)     NOT NULL COMMENT 'Ej: A-01-02',
  `nombre`          VARCHAR(200)    NOT NULL,
  `pasillo`         VARCHAR(20)     DEFAULT NULL,
  `estante`         VARCHAR(20)     DEFAULT NULL,
  `nivel`           VARCHAR(20)     DEFAULT NULL,
  `tipo`            ENUM('pick','staging','cuarentena','devolucion') NOT NULL DEFAULT 'pick',
  `activo`          TINYINT(1)      NOT NULL DEFAULT 1,
  `creado_en`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ubicaciones_uuid` (`uuid`),
  UNIQUE KEY `uq_ubicaciones_almacen_codigo` (`almacen_id`, `codigo`),
  KEY `idx_ubicaciones_activo` (`almacen_id`, `activo`, `codigo`),
  CONSTRAINT `fk_ubicaciones_almacen`
    FOREIGN KEY (`almacen_id`) REFERENCES `almacenes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stock_ubicacion` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `producto_id`     BIGINT UNSIGNED NOT NULL,
  `ubicacion_id`    BIGINT UNSIGNED NOT NULL,
  `cantidad`        INT NOT NULL DEFAULT 0,
  `actualizado_en`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_stock_prod_ubic` (`producto_id`, `ubicacion_id`),
  KEY `idx_stock_ubicacion` (`ubicacion_id`),
  CONSTRAINT `fk_stock_prod` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_stock_ubic` FOREIGN KEY (`ubicacion_id`) REFERENCES `ubicaciones` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `picking_lineas` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `pedido_almacen_id`   BIGINT UNSIGNED NOT NULL,
  `pedido_linea_id`     BIGINT UNSIGNED NOT NULL,
  `producto_id`         BIGINT UNSIGNED NOT NULL,
  `ubicacion_id`        BIGINT UNSIGNED NOT NULL,
  `cantidad`            INT UNSIGNED NOT NULL,
  `usuario_id`          BIGINT UNSIGNED DEFAULT NULL,
  `pickeado_en`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_picking_pa` (`pedido_almacen_id`),
  KEY `idx_picking_linea` (`pedido_linea_id`),
  CONSTRAINT `fk_picking_pa` FOREIGN KEY (`pedido_almacen_id`) REFERENCES `pedidos_almacen` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_picking_pl` FOREIGN KEY (`pedido_linea_id`) REFERENCES `pedido_lineas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_picking_prod` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`),
  CONSTRAINT `fk_picking_ubic` FOREIGN KEY (`ubicacion_id`) REFERENCES `ubicaciones` (`id`),
  CONSTRAINT `fk_picking_user` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `movimientos_inventario`
  ADD COLUMN `ubicacion_id` BIGINT UNSIGNED DEFAULT NULL AFTER `almacen_id`,
  ADD KEY `fk_mov_ubicacion` (`ubicacion_id`),
  ADD CONSTRAINT `fk_mov_ubicacion` FOREIGN KEY (`ubicacion_id`) REFERENCES `ubicaciones` (`id`) ON DELETE SET NULL;

-- Demo: ubicaciones y stock inicial en almacén principal
INSERT INTO `ubicaciones` (`uuid`, `almacen_id`, `codigo`, `nombre`, `pasillo`, `estante`, `nivel`, `tipo`)
SELECT UUID(), a.id, 'A-01-01', 'Pasillo A · Estante 01 · Nivel 01', 'A', '01', '01', 'pick'
  FROM `almacenes` a
 WHERE a.activo = 1
   AND NOT EXISTS (SELECT 1 FROM `ubicaciones` u WHERE u.almacen_id = a.id AND u.codigo = 'A-01-01')
 LIMIT 1;

INSERT INTO `ubicaciones` (`uuid`, `almacen_id`, `codigo`, `nombre`, `pasillo`, `estante`, `nivel`, `tipo`)
SELECT UUID(), a.id, 'A-01-02', 'Pasillo A · Estante 01 · Nivel 02', 'A', '01', '02', 'pick'
  FROM `almacenes` a
 WHERE a.activo = 1
   AND NOT EXISTS (SELECT 1 FROM `ubicaciones` u WHERE u.almacen_id = a.id AND u.codigo = 'A-01-02')
 LIMIT 1;

INSERT INTO `ubicaciones` (`uuid`, `almacen_id`, `codigo`, `nombre`, `pasillo`, `estante`, `nivel`, `tipo`)
SELECT UUID(), a.id, 'B-02-01', 'Pasillo B · Estante 02 · Nivel 01', 'B', '02', '01', 'pick'
  FROM `almacenes` a
 WHERE a.activo = 1
   AND NOT EXISTS (SELECT 1 FROM `ubicaciones` u WHERE u.almacen_id = a.id AND u.codigo = 'B-02-01')
 LIMIT 1;

INSERT INTO `stock_ubicacion` (`producto_id`, `ubicacion_id`, `cantidad`)
SELECT p.id, u.id, 15
  FROM `productos` p
  JOIN `ubicaciones` u ON u.codigo = 'A-01-01'
 WHERE p.sku = 'SCH-PME-001' AND p.division = 'energia'
   AND NOT EXISTS (
     SELECT 1 FROM `stock_ubicacion` s WHERE s.producto_id = p.id AND s.ubicacion_id = u.id
   );

INSERT INTO `stock_ubicacion` (`producto_id`, `ubicacion_id`, `cantidad`)
SELECT p.id, u.id, 10
  FROM `productos` p
  JOIN `ubicaciones` u ON u.codigo = 'A-01-02'
 WHERE p.sku = 'SCH-PME-001' AND p.division = 'energia'
   AND NOT EXISTS (
     SELECT 1 FROM `stock_ubicacion` s WHERE s.producto_id = p.id AND s.ubicacion_id = u.id
   );

INSERT INTO `stock_ubicacion` (`producto_id`, `ubicacion_id`, `cantidad`)
SELECT p.id, u.id, 12
  FROM `productos` p
  JOIN `ubicaciones` u ON u.codigo = 'A-01-01'
 WHERE p.sku = 'ACC-EM133' AND p.division = 'energia'
   AND NOT EXISTS (
     SELECT 1 FROM `stock_ubicacion` s WHERE s.producto_id = p.id AND s.ubicacion_id = u.id
   );

INSERT INTO `stock_ubicacion` (`producto_id`, `ubicacion_id`, `cantidad`)
SELECT p.id, u.id, 5
  FROM `productos` p
  JOIN `ubicaciones` u ON u.codigo = 'B-02-01'
 WHERE p.sku = 'BIKE-URB-01' AND p.division = 'deportes'
   AND NOT EXISTS (
     SELECT 1 FROM `stock_ubicacion` s WHERE s.producto_id = p.id AND s.ubicacion_id = u.id
   );

INSERT INTO `stock_ubicacion` (`producto_id`, `ubicacion_id`, `cantidad`)
SELECT p.id, u.id, 20
  FROM `productos` p
  JOIN `ubicaciones` u ON u.codigo = 'A-01-02'
 WHERE p.sku = 'BIKE-CAS-01' AND p.division = 'deportes'
   AND NOT EXISTS (
     SELECT 1 FROM `stock_ubicacion` s WHERE s.producto_id = p.id AND s.ubicacion_id = u.id
   );
