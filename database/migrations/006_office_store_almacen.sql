-- =====================================================================
--  ADESA NEXUS - Migración 006: CRM (Office), Store, Almacén, ADM hooks
-- =====================================================================

SET NAMES utf8mb4;

-- --- Secuencias ---
INSERT INTO `secuencias` (`nombre`, `valor`) VALUES
  ('lead_energia', 100),
  ('lead_deportes', 100),
  ('pedido_energia', 1000),
  ('pedido_deportes', 1000)
ON DUPLICATE KEY UPDATE `nombre` = `nombre`;

-- --- CRM: leads ---
CREATE TABLE IF NOT EXISTS `leads` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`              CHAR(36)        NOT NULL,
  `numero`            INT UNSIGNED    NOT NULL,
  `division`          ENUM('energia','deportes') NOT NULL DEFAULT 'energia',
  `nombre_contacto`   VARCHAR(120)    NOT NULL,
  `empresa`           VARCHAR(180)    DEFAULT NULL,
  `email`             VARCHAR(180)    DEFAULT NULL,
  `telefono`          VARCHAR(40)     DEFAULT NULL,
  `estado`            ENUM('nuevo','contactado','calificado','propuesta','ganado','perdido') NOT NULL DEFAULT 'nuevo',
  `fuente`            VARCHAR(80)     DEFAULT NULL,
  `asignado_a`        BIGINT UNSIGNED DEFAULT NULL,
  `cliente_empresa_id` BIGINT UNSIGNED DEFAULT NULL,
  `notas`             TEXT            DEFAULT NULL,
  `creado_por`        BIGINT UNSIGNED DEFAULT NULL,
  `creado_en`         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_leads_uuid` (`uuid`),
  UNIQUE KEY `uq_leads_numero_division` (`numero`, `division`),
  KEY `idx_leads_estado` (`estado`, `division`),
  CONSTRAINT `fk_leads_asignado` FOREIGN KEY (`asignado_a`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_leads_cliente` FOREIGN KEY (`cliente_empresa_id`) REFERENCES `clientes_empresa` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_leads_creador` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --- Catálogo / ERP local (sync ADM) ---
CREATE TABLE IF NOT EXISTS `productos` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`            CHAR(36)        NOT NULL,
  `sku`             VARCHAR(60)     NOT NULL,
  `codigo_adm`      VARCHAR(60)     DEFAULT NULL COMMENT 'ID/código en ERP ADM',
  `nombre`          VARCHAR(180)    NOT NULL,
  `descripcion`     TEXT            DEFAULT NULL,
  `division`        ENUM('energia','deportes') NOT NULL DEFAULT 'energia',
  `precio`          DECIMAL(12,2)   NOT NULL DEFAULT 0,
  `moneda`          CHAR(3)         NOT NULL DEFAULT 'DOP',
  `stock_disponible` INT NOT NULL DEFAULT 0,
  `stock_reservado`  INT NOT NULL DEFAULT 0,
  `unidad`          VARCHAR(20)     NOT NULL DEFAULT 'UND',
  `categoria`       VARCHAR(80)     DEFAULT NULL,
  `activo`          TINYINT(1)      NOT NULL DEFAULT 1,
  `sincronizado_adm` DATETIME       DEFAULT NULL,
  `creado_en`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_productos_uuid` (`uuid`),
  UNIQUE KEY `uq_productos_sku_division` (`sku`, `division`),
  KEY `idx_productos_division` (`division`, `activo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `almacenes` (
  `id`       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`     CHAR(36)        NOT NULL,
  `nombre`   VARCHAR(120)    NOT NULL,
  `division` ENUM('energia','deportes','ambas') NOT NULL DEFAULT 'energia',
  `activo`   TINYINT(1)      NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_almacenes_uuid` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --- Pedidos e-commerce ---
CREATE TABLE IF NOT EXISTS `pedidos` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`               CHAR(36)        NOT NULL,
  `numero`             INT UNSIGNED    NOT NULL,
  `division`           ENUM('energia','deportes') NOT NULL DEFAULT 'energia',
  `cliente_empresa_id` BIGINT UNSIGNED DEFAULT NULL,
  `estado`             ENUM('borrador','pendiente_pago','pagado','en_almacen','enviado','entregado','cancelado') NOT NULL DEFAULT 'borrador',
  `canal`              ENUM('web','telefono','adm','manual') NOT NULL DEFAULT 'web',
  `subtotal`           DECIMAL(12,2)   NOT NULL DEFAULT 0,
  `impuestos`          DECIMAL(12,2)   NOT NULL DEFAULT 0,
  `total`              DECIMAL(12,2)   NOT NULL DEFAULT 0,
  `moneda`             CHAR(3)         NOT NULL DEFAULT 'DOP',
  `adm_pedido_id`      VARCHAR(60)     DEFAULT NULL,
  `notas`              TEXT            DEFAULT NULL,
  `creado_por`         BIGINT UNSIGNED DEFAULT NULL,
  `creado_en`          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pedidos_uuid` (`uuid`),
  UNIQUE KEY `uq_pedidos_numero_division` (`numero`, `division`),
  KEY `idx_pedidos_estado` (`estado`, `division`),
  CONSTRAINT `fk_pedidos_cliente` FOREIGN KEY (`cliente_empresa_id`) REFERENCES `clientes_empresa` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pedidos_creador` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pedido_lineas` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `pedido_id`       BIGINT UNSIGNED NOT NULL,
  `producto_id`     BIGINT UNSIGNED DEFAULT NULL,
  `sku`             VARCHAR(60)     NOT NULL,
  `descripcion`     VARCHAR(255)    NOT NULL,
  `cantidad`        INT UNSIGNED    NOT NULL DEFAULT 1,
  `precio_unitario` DECIMAL(12,2)   NOT NULL DEFAULT 0,
  `subtotal`        DECIMAL(12,2)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `fk_linea_pedido` (`pedido_id`),
  CONSTRAINT `fk_linea_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_linea_producto` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --- Cola de almacén (picking / envío) ---
CREATE TABLE IF NOT EXISTS `pedidos_almacen` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`         CHAR(36)        NOT NULL,
  `pedido_id`    BIGINT UNSIGNED NOT NULL,
  `almacen_id`   BIGINT UNSIGNED NOT NULL,
  `estado`       ENUM('pendiente','picking','empacado','listo_envio','enviado','cancelado') NOT NULL DEFAULT 'pendiente',
  `asignado_a`   BIGINT UNSIGNED DEFAULT NULL,
  `notas`        TEXT            DEFAULT NULL,
  `actualizado_en` TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ped_almacen_uuid` (`uuid`),
  UNIQUE KEY `uq_ped_almacen_pedido` (`pedido_id`),
  CONSTRAINT `fk_palmacen_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_palmacen_almacen` FOREIGN KEY (`almacen_id`) REFERENCES `almacenes` (`id`),
  CONSTRAINT `fk_palmacen_asignado` FOREIGN KEY (`asignado_a`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `movimientos_inventario` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `producto_id`  BIGINT UNSIGNED NOT NULL,
  `almacen_id`   BIGINT UNSIGNED DEFAULT NULL,
  `tipo`         ENUM('entrada','salida','reserva','liberacion','ajuste') NOT NULL,
  `cantidad`     INT NOT NULL,
  `pedido_id`    BIGINT UNSIGNED DEFAULT NULL,
  `referencia`   VARCHAR(120)    DEFAULT NULL,
  `creado_en`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_mov_producto` (`producto_id`),
  CONSTRAINT `fk_mov_producto` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`),
  CONSTRAINT `fk_mov_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --- Datos demo desarrollo ---
INSERT INTO `almacenes` (`uuid`, `nombre`, `division`)
SELECT UUID(), 'Almacén Principal ADESA', 'ambas'
 WHERE NOT EXISTS (SELECT 1 FROM `almacenes` LIMIT 1);

INSERT INTO `productos` (`uuid`, `sku`, `nombre`, `descripcion`, `division`, `precio`, `stock_disponible`, `categoria`)
SELECT UUID(), 'SCH-PME-001', 'PowerTag PME', 'Medidor Schneider PowerTag', 'energia', 12500.00, 25, 'Schneider'
 WHERE NOT EXISTS (SELECT 1 FROM `productos` WHERE sku='SCH-PME-001' AND division='energia');

INSERT INTO `productos` (`uuid`, `sku`, `nombre`, `descripcion`, `division`, `precio`, `stock_disponible`, `categoria`)
SELECT UUID(), 'ACC-EM133', 'Medidor EM133 Accuenergy', 'Medidor de energía Accuenergy', 'energia', 8900.00, 15, 'Accuenergy'
 WHERE NOT EXISTS (SELECT 1 FROM `productos` WHERE sku='ACC-EM133' AND division='energia');

INSERT INTO `productos` (`uuid`, `sku`, `nombre`, `descripcion`, `division`, `precio`, `stock_disponible`, `categoria`)
SELECT UUID(), 'BIKE-URB-01', 'Bicicleta Urbana Pro', 'Bicicleta urbana La Bicicletería', 'deportes', 45900.00, 8, 'Bicicletas'
 WHERE NOT EXISTS (SELECT 1 FROM `productos` WHERE sku='BIKE-URB-01' AND division='deportes');

INSERT INTO `productos` (`uuid`, `sku`, `nombre`, `descripcion`, `division`, `precio`, `stock_disponible`, `categoria`)
SELECT UUID(), 'BIKE-CAS-01', 'Casco Urbano', 'Casco certificado', 'deportes', 3500.00, 40, 'Accesorios'
 WHERE NOT EXISTS (SELECT 1 FROM `productos` WHERE sku='BIKE-CAS-01' AND division='deportes');
