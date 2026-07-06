-- Leads: sync auth/pipeline iERP + facturación OT

ALTER TABLE `leads`
  ADD COLUMN `ierp_auth_status` VARCHAR(20) DEFAULT NULL AFTER `ierp_quote_currency`,
  ADD COLUMN `ierp_pipeline_stage` VARCHAR(120) DEFAULT NULL AFTER `ierp_auth_status`;

ALTER TABLE `lead_vinculos`
  ADD COLUMN `ierp_invoice_id` VARCHAR(36) DEFAULT NULL AFTER `referencia_id`,
  ADD COLUMN `facturacion_autorizada` TINYINT(1) NOT NULL DEFAULT 0 AFTER `notificar`;
