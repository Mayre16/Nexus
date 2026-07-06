-- 017: Portal de autoservicio cliente (invitaciones, foro, satisfacción)
-- =====================================================================

CREATE TABLE IF NOT EXISTS `nexus_invitaciones_portal` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`          CHAR(36)        NOT NULL,
  `token_hash`    CHAR(64)        NOT NULL COMMENT 'SHA-256 del token enviado por correo',
  `usuario_id`    BIGINT UNSIGNED NOT NULL,
  `persona_id`    BIGINT UNSIGNED DEFAULT NULL,
  `tipo`          ENUM('invitacion','reset_password') NOT NULL DEFAULT 'invitacion',
  `expira_en`     DATETIME        NOT NULL,
  `usado_en`      DATETIME        DEFAULT NULL,
  `creado_por`    BIGINT UNSIGNED DEFAULT NULL,
  `creado_en`     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inv_portal_uuid` (`uuid`),
  KEY `idx_inv_token` (`token_hash`),
  KEY `fk_inv_usuario` (`usuario_id`),
  KEY `fk_inv_persona` (`persona_id`),
  CONSTRAINT `fk_inv_usuario`
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_inv_persona`
    FOREIGN KEY (`persona_id`) REFERENCES `nexus_personas` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_inv_creador`
    FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Canal portal en tickets
ALTER TABLE `tickets`
  MODIFY COLUMN `canal` ENUM('imap','web','telefono','manual','leads','portal')
  NOT NULL DEFAULT 'web';

-- Encuesta de satisfacción al cerrar (cliente)
ALTER TABLE `tickets`
  ADD COLUMN `satisfaccion` TINYINT UNSIGNED DEFAULT NULL COMMENT '1-5 estrellas del cliente' AFTER `cerrado_en`;

-- Foro comunitario básico
CREATE TABLE IF NOT EXISTS `portal_foro_categorias` (
  `id`            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `uuid`          CHAR(36)        NOT NULL,
  `division`      ENUM('energia','deportes','ambas') NOT NULL DEFAULT 'energia',
  `nombre`        VARCHAR(120)    NOT NULL,
  `descripcion`   VARCHAR(500)    DEFAULT NULL,
  `orden`         INT             NOT NULL DEFAULT 0,
  `activo`        TINYINT(1)      NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_foro_cat_uuid` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `portal_foro_temas` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`          CHAR(36)        NOT NULL,
  `categoria_id`  INT UNSIGNED    NOT NULL,
  `titulo`        VARCHAR(255)    NOT NULL,
  `autor_id`      BIGINT UNSIGNED DEFAULT NULL,
  `autor_nombre`  VARCHAR(180)    DEFAULT NULL,
  `cerrado`       TINYINT(1)      NOT NULL DEFAULT 0,
  `creado_en`     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_foro_tema_uuid` (`uuid`),
  KEY `fk_foro_tema_cat` (`categoria_id`),
  CONSTRAINT `fk_foro_tema_cat`
    FOREIGN KEY (`categoria_id`) REFERENCES `portal_foro_categorias` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `portal_foro_posts` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`          CHAR(36)        NOT NULL,
  `tema_id`       BIGINT UNSIGNED NOT NULL,
  `autor_id`      BIGINT UNSIGNED DEFAULT NULL,
  `autor_nombre`  VARCHAR(180)    DEFAULT NULL,
  `contenido`     MEDIUMTEXT      NOT NULL,
  `creado_en`     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_foro_post_uuid` (`uuid`),
  KEY `fk_foro_post_tema` (`tema_id`),
  CONSTRAINT `fk_foro_post_tema`
    FOREIGN KEY (`tema_id`) REFERENCES `portal_foro_temas` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Datos iniciales foro + KB demo
INSERT IGNORE INTO `portal_foro_categorias` (`uuid`, `division`, `nombre`, `descripcion`, `orden`) VALUES
  ('a1000001-0000-4000-8000-000000000001', 'energia', 'Medición y AMI', 'Consultas sobre medidores, lecturas y plataforma EasyMetering', 1),
  ('a1000001-0000-4000-8000-000000000002', 'energia', 'Soporte técnico', 'Incidencias, mantenimiento y contratos de soporte', 2),
  ('a1000001-0000-4000-8000-000000000003', 'deportes', 'Eventos y cronometraje', 'Comunidad deportes ADESA', 3);

INSERT IGNORE INTO `knowledge_base_howto` (`uuid`, `division`, `titulo`, `contenido`, `tags`, `publicado`) VALUES
  ('b2000001-0000-4000-8000-000000000001', 'energia',
   '¿Cómo abrir un ticket de soporte?',
   'Inicie sesión en el Portal de Soporte ADESA, vaya a la pestaña Mis solicitudes y pulse «Nueva solicitud». Describa el problema con el mayor detalle posible (equipo, serial, mensaje de error). Recibirá un número de referencia (#E####) por correo.',
   'portal,tickets,soporte', 1),
  ('b2000001-0000-4000-8000-000000000002', 'energia',
   'Estados de un ticket',
   'Abierto: recibido por soporte. En proceso: un técnico está trabajando. En espera: requiere información suya. Resuelto: solución aplicada. Cerrado: caso finalizado. Puede responder en cualquier momento desde el portal.',
   'estados,desk', 1);
