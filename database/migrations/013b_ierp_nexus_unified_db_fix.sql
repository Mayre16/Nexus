-- Complemento 013: columnas que fallaron en aplicación parcial (MariaDB)

ALTER TABLE `pedidos_almacen`
  ADD COLUMN `ierp_shipment_ref` VARCHAR(64) DEFAULT NULL AFTER `notas`,
  ADD COLUMN `picking_completado_en` DATETIME DEFAULT NULL AFTER `ierp_shipment_ref`;

ALTER TABLE `usuarios`
  ADD COLUMN `ierp_user_id` VARCHAR(36) DEFAULT NULL AFTER `activo`,
  ADD KEY `idx_usuarios_ierp_user` (`ierp_user_id`);
