-- =====================================================================
--  ADESA NEXUS - Migración 013: BD unificada Nexus + módulo iERP
-- ---------------------------------------------------------------------
--  Nexus ES el ADM/ERP; iERP es un módulo dentro de la misma instancia.
--  Una sola base MySQL (adesa_nexus):
--    - Tablas Nexus: usuarios, clientes_empresa, productos, pedidos…
--    - Tablas iERP (Prisma): Tenant, Company, Product, SalesOrder…
--    - Tablas puente: ierp_tenants, nexus_ierp_entidades
-- =====================================================================

SET NAMES utf8mb4;

-- --- Tenant iERP ↔ división Nexus ---
CREATE TABLE IF NOT EXISTS `ierp_tenants` (
  `id`                    VARCHAR(36)     NOT NULL COMMENT 'ID Tenant en tablas Prisma (Tenant.id)',
  `division`              ENUM('energia','deportes','ambas') NOT NULL DEFAULT 'ambas',
  `nombre`                VARCHAR(120)    NOT NULL,
  `dominio`               VARCHAR(180)    DEFAULT NULL,
  `ierp_business_line_id` VARCHAR(36)     DEFAULT NULL COMMENT 'BusinessLine.id si aplica a una división',
  `activo`                TINYINT(1)      NOT NULL DEFAULT 1,
  `creado_en`             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ierp_tenants_division` (`division`, `activo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --- Registro maestro de vínculos entidad Nexus ↔ entidad iERP ---
CREATE TABLE IF NOT EXISTS `nexus_ierp_entidades` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ierp_tenant_id`  VARCHAR(36)     NOT NULL,
  `entidad_nexus`   VARCHAR(64)     NOT NULL COMMENT 'clientes_empresa, productos, pedidos, almacenes, usuarios, leads, nexus_personas',
  `nexus_id`        BIGINT UNSIGNED DEFAULT NULL,
  `nexus_uuid`      CHAR(36)        DEFAULT NULL,
  `entidad_ierp`    VARCHAR(64)     NOT NULL COMMENT 'Company, Product, SalesOrder, Warehouse, User, Invoice, Contact, Employee',
  `ierp_id`         VARCHAR(36)     NOT NULL,
  `origen_sync`     ENUM('manual','nexus','ierp','adm','import') NOT NULL DEFAULT 'manual',
  `metadata_json`   JSON            DEFAULT NULL,
  `sincronizado_en` TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_nexus_ierp_ierp` (`ierp_tenant_id`, `entidad_ierp`, `ierp_id`),
  UNIQUE KEY `uq_nexus_ierp_nexus_id` (`entidad_nexus`, `nexus_id`, `entidad_ierp`),
  KEY `idx_nexus_ierp_uuid` (`entidad_nexus`, `nexus_uuid`),
  KEY `idx_nexus_ierp_tenant` (`ierp_tenant_id`, `entidad_nexus`),
  CONSTRAINT `fk_nexus_ierp_ent_tenant`
    FOREIGN KEY (`ierp_tenant_id`) REFERENCES `ierp_tenants` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --- Log de sincronización / eventos de unificación ---
CREATE TABLE IF NOT EXISTS `nexus_ierp_sync_log` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `direccion`    ENUM('nexus_a_ierp','ierp_a_nexus','bidireccional') NOT NULL,
  `entidad`      VARCHAR(64)     NOT NULL,
  `referencia`   VARCHAR(120)    DEFAULT NULL,
  `estado`       ENUM('ok','error','parcial') NOT NULL DEFAULT 'ok',
  `detalle_json` JSON            DEFAULT NULL,
  `creado_en`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sync_log_entidad` (`entidad`, `creado_en`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --- Columnas directas en tablas Nexus (acceso rápido sin join al registro) ---

ALTER TABLE `clientes_empresa`
  ADD COLUMN `ierp_company_id` VARCHAR(36) DEFAULT NULL AFTER `activo`,
  ADD COLUMN `ierp_tenant_id` VARCHAR(36) DEFAULT NULL AFTER `ierp_company_id`,
  ADD KEY `idx_clientes_ierp_company` (`ierp_company_id`);

ALTER TABLE `productos`
  ADD COLUMN `ierp_product_id` VARCHAR(36) DEFAULT NULL AFTER `codigo_adm`,
  ADD COLUMN `ierp_tenant_id` VARCHAR(36) DEFAULT NULL AFTER `ierp_product_id`,
  ADD KEY `idx_productos_ierp` (`ierp_product_id`, `division`);

ALTER TABLE `almacenes`
  ADD COLUMN `ierp_warehouse_id` VARCHAR(36) DEFAULT NULL AFTER `activo`,
  ADD COLUMN `ierp_tenant_id` VARCHAR(36) DEFAULT NULL AFTER `ierp_warehouse_id`,
  ADD KEY `idx_almacenes_ierp` (`ierp_warehouse_id`);

ALTER TABLE `pedidos`
  ADD COLUMN `ierp_sales_order_id` VARCHAR(36) DEFAULT NULL AFTER `adm_pedido_id`,
  ADD COLUMN `ierp_invoice_id` VARCHAR(36) DEFAULT NULL AFTER `ierp_sales_order_id`,
  ADD COLUMN `ierp_invoice_estado` ENUM('borrador','confirmada','anulada') DEFAULT NULL AFTER `ierp_invoice_id`,
  ADD COLUMN `ierp_tenant_id` VARCHAR(36) DEFAULT NULL AFTER `ierp_invoice_estado`,
  ADD KEY `idx_pedidos_ierp_so` (`ierp_sales_order_id`),
  ADD KEY `idx_pedidos_ierp_inv` (`ierp_invoice_id`);

ALTER TABLE `pedidos_almacen`
  ADD COLUMN `ierp_shipment_ref` VARCHAR(64) DEFAULT NULL AFTER `notas`,
  ADD COLUMN `picking_completado_en` DATETIME DEFAULT NULL AFTER `ierp_shipment_ref`;

ALTER TABLE `usuarios`
  ADD COLUMN `ierp_user_id` VARCHAR(36) DEFAULT NULL AFTER `activo`,
  ADD KEY `idx_usuarios_ierp` (`ierp_user_id`);

-- leads ya tiene ierp_tenant_id, ierp_quote_id, ierp_company_id (007/010)

-- Configuración unificada (se rellena tras prisma db push en iERP)
INSERT INTO `nexus_config` (`clave`, `valor_json`, `categoria`, `secreto`) VALUES
  ('ierp_unified_db', JSON_OBJECT(
    'version', 1,
    'motor', 'mysql',
    'nota', 'iERP usa la misma BD que Nexus (DB_NAME). Tablas Prisma conviven con tablas Nexus.',
    'division_tenant_map', JSON_OBJECT('energia', NULL, 'deportes', NULL),
    'business_line_map', JSON_OBJECT('energia', NULL, 'deportes', NULL)
  ), 'integrations', 0)
ON DUPLICATE KEY UPDATE `clave` = `clave`;
