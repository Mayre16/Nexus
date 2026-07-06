-- =====================================================================
--  ADESA NEXUS - ESQUEMA MAESTRO UNIFICADO  (nexus_master.sql)
-- ---------------------------------------------------------------------
--  Suite empresarial multi-tenant (ERP/CRM/Ticketing/Monitoreo).
--  Motor:   MySQL 8 / MariaDB 10.4+  (compatible con cPanel)
--  Charset: utf8mb4 (soporte completo de emojis y acentos)
--  Engine:  InnoDB (claves foráneas + transacciones ACID)
-- ---------------------------------------------------------------------
--  NOTAS DE SEGURIDAD (ver SECURITY-NEXUS.md):
--   - Separación de divisiones de negocio vía columna `division`
--     (energia | deportes) presente en cada tabla de negocio. Toda
--     consulta del backend DEBE filtrar por division según el contexto
--     del usuario (aislamiento multi-tenant a nivel aplicación).
--   - Los campos "_cifrado" se guardan ENCRIPTADOS con AES-256-GCM
--     desde la capa de aplicación (backend/utils/crypto.js). La BD
--     NUNCA ve el texto plano de credenciales/VPN/passwords.
--   - Contraseñas de usuario: hash con bcrypt/argon2 (NUNCA texto plano).
--   - D13: este script crea el esquema desde cero. NO ejecutar sobre una
--     BD con datos sin backup verificado. Para prod usar migraciones
--     incrementales en lugar de re-correr este archivo.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET @OLD_SQL_MODE = @@SQL_MODE;
SET SQL_MODE = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO';

-- =====================================================================
--  TABLA: clientes_empresa
--  Empresas / clientes finales de ambas divisiones de negocio.
-- =====================================================================
CREATE TABLE IF NOT EXISTS `clientes_empresa` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`            CHAR(36)        NOT NULL,                 -- ID público (evita exponer IDs secuenciales / IDOR)
  `razon_social`    VARCHAR(180)    NOT NULL,
  `rnc_cedula`      VARCHAR(20)     DEFAULT NULL,             -- Identificador fiscal (clave para ERP ADM)
  `division`        ENUM('energia','deportes') NOT NULL,
  `tipo_cliente`    ENUM('externo','suscriptor','interno') NOT NULL DEFAULT 'externo',
  `email_contacto`  VARCHAR(180)    DEFAULT NULL,
  `telefono`        VARCHAR(40)     DEFAULT NULL,
  `direccion`       VARCHAR(255)    DEFAULT NULL,
  `notas`           TEXT            DEFAULT NULL,
  `activo`          TINYINT(1)      NOT NULL DEFAULT 1,
  `creado_en`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_clientes_uuid` (`uuid`),
  UNIQUE KEY `uq_clientes_rnc_division` (`rnc_cedula`, `division`),
  KEY `idx_clientes_division` (`division`),
  KEY `idx_clientes_tipo` (`tipo_cliente`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  TABLA: usuarios
--  Usuarios del sistema. RBAC estricto vía columna `rol`.
--  Roles: admin | empleado (técnico) | cliente_externo | cliente_suscriptor
-- =====================================================================
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`                CHAR(36)        NOT NULL,             -- ID público
  `nombre_completo`     VARCHAR(150)    NOT NULL,
  `email`               VARCHAR(180)    NOT NULL,
  `password_hash`       VARCHAR(255)    NOT NULL,             -- bcrypt/argon2 (NUNCA texto plano)
  `rol`                 ENUM('admin','empleado','cliente_externo','cliente_suscriptor') NOT NULL,
  `division`            ENUM('energia','deportes','ambas') NOT NULL DEFAULT 'energia',
  `cliente_empresa_id`  BIGINT UNSIGNED DEFAULT NULL,         -- FK si el usuario pertenece a un cliente
  -- --- MFA (segundo factor) - secreto TOTP cifrado con AES-256-GCM ---
  `mfa_habilitado`      TINYINT(1)      NOT NULL DEFAULT 0,
  `mfa_secret_cifrado`  VARBINARY(512)  DEFAULT NULL,
  -- --- Defensa contra fuerza bruta / D2 ---
  `intentos_fallidos`   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `bloqueado_hasta`     DATETIME        DEFAULT NULL,         -- lockout temporal
  `ultimo_login`        DATETIME        DEFAULT NULL,
  -- --- Rotación de refresh token (solo guardamos el hash) ---
  `refresh_token_hash`  VARCHAR(255)    DEFAULT NULL,
  `token_version`       INT UNSIGNED    NOT NULL DEFAULT 0,   -- invalida todos los JWT al incrementar
  `activo`              TINYINT(1)      NOT NULL DEFAULT 1,
  `creado_en`           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usuarios_uuid` (`uuid`),
  UNIQUE KEY `uq_usuarios_email` (`email`),
  KEY `idx_usuarios_rol` (`rol`),
  KEY `idx_usuarios_division` (`division`),
  KEY `fk_usuarios_cliente` (`cliente_empresa_id`),
  CONSTRAINT `fk_usuarios_cliente`
    FOREIGN KEY (`cliente_empresa_id`) REFERENCES `clientes_empresa` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  TABLA: contratos_soporte_licencias
--  Contratos de soporte anual + tracking de licencias Schneider
--  (PME / EPO / EBO) y horas de soporte consumidas.
-- =====================================================================
CREATE TABLE IF NOT EXISTS `contratos_soporte_licencias` (
  `id`                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`                  CHAR(36)        NOT NULL,
  `cliente_empresa_id`    BIGINT UNSIGNED NOT NULL,
  `division`              ENUM('energia','deportes') NOT NULL DEFAULT 'energia',
  `tipo_software`         ENUM('PME','EPO','EBO','OTRO') DEFAULT NULL,
  `version_software`      VARCHAR(40)     DEFAULT NULL,        -- Ej: "PME 2023 / 9.x"
  `creditos`             INT             DEFAULT NULL,        -- Créditos de licencia disponibles
  `tipo_contrato_soporte` ENUM('basico','estandar','premium','power_advisor','ninguno')
                          NOT NULL DEFAULT 'ninguno',
  -- --- Bolsa de horas de soporte anual ---
  `horas_contratadas`     DECIMAL(8,2)    NOT NULL DEFAULT 0.00,
  `horas_consumidas`      DECIMAL(8,2)    NOT NULL DEFAULT 0.00,
  `fecha_inicio`          DATE            DEFAULT NULL,
  `fecha_vencimiento`     DATE            DEFAULT NULL,        -- Alerta 30 días antes (Nexus Grid)
  `monto_anual`           DECIMAL(12,2)   DEFAULT NULL,
  `moneda`                CHAR(3)         NOT NULL DEFAULT 'DOP',
  `recordatorio_enviado`  TINYINT(1)      NOT NULL DEFAULT 0,  -- evita reenviar la alerta de vencimiento
  `activo`                TINYINT(1)      NOT NULL DEFAULT 1,
  `creado_en`             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_contratos_uuid` (`uuid`),
  KEY `fk_contratos_cliente` (`cliente_empresa_id`),
  KEY `idx_contratos_vencimiento` (`fecha_vencimiento`),
  KEY `idx_contratos_division` (`division`),
  CONSTRAINT `fk_contratos_cliente`
    FOREIGN KEY (`cliente_empresa_id`) REFERENCES `clientes_empresa` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  TABLA: tickets  (Nexus Desk)
--  Ticketing con threading por correo (email_message_id) para el
--  parseo IMAP inteligente: #1024 => seguimiento; si no => nuevo.
-- =====================================================================
CREATE TABLE IF NOT EXISTS `tickets` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `numero`              INT UNSIGNED    NOT NULL,             -- Número visible (#1024)
  `uuid`                CHAR(36)        NOT NULL,
  `cliente_empresa_id`  BIGINT UNSIGNED DEFAULT NULL,
  `division`            ENUM('energia','deportes') NOT NULL DEFAULT 'energia',
  `creado_por`          BIGINT UNSIGNED DEFAULT NULL,         -- usuario que abrió (si aplica)
  `asignado_a`          BIGINT UNSIGNED DEFAULT NULL,         -- técnico responsable
  `asunto`              VARCHAR(255)    NOT NULL,
  `descripcion`         MEDIUMTEXT      DEFAULT NULL,
  `canal`               ENUM('imap','web','telefono','manual','leads') NOT NULL DEFAULT 'web',
  `estado`              ENUM('abierto','en_proceso','en_espera','resuelto','cerrado')
                        NOT NULL DEFAULT 'abierto',
  `prioridad`           ENUM('baja','media','alta','critica') NOT NULL DEFAULT 'media',
  -- --- Threading de correo entrante ---
  `email_message_id`    VARCHAR(255)    DEFAULT NULL,         -- Message-ID del correo origen
  `email_remitente`     VARCHAR(180)    DEFAULT NULL,
  -- --- Cierre técnico (requisitos: tiempo, informe, OT) ---
  `tiempo_invertido_min` INT UNSIGNED   NOT NULL DEFAULT 0,   -- se descuenta del contrato
  `informe_resolucion`  MEDIUMTEXT      DEFAULT NULL,
  `contrato_id`         BIGINT UNSIGNED DEFAULT NULL,         -- contrato al que se carga el tiempo
  `ot_pdf_path`         VARCHAR(255)    DEFAULT NULL,         -- ruta confinada de la OT en PDF
  `cerrado_en`          DATETIME        DEFAULT NULL,
  `creado_en`           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tickets_uuid` (`uuid`),
  UNIQUE KEY `uq_tickets_numero_division` (`numero`, `division`),
  KEY `idx_tickets_estado` (`estado`),
  KEY `idx_tickets_division` (`division`),
  KEY `idx_tickets_email_msgid` (`email_message_id`),
  KEY `fk_tickets_cliente` (`cliente_empresa_id`),
  KEY `fk_tickets_asignado` (`asignado_a`),
  KEY `fk_tickets_contrato` (`contrato_id`),
  CONSTRAINT `fk_tickets_cliente`
    FOREIGN KEY (`cliente_empresa_id`) REFERENCES `clientes_empresa` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_tickets_creador`
    FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_tickets_asignado`
    FOREIGN KEY (`asignado_a`) REFERENCES `usuarios` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_tickets_contrato`
    FOREIGN KEY (`contrato_id`) REFERENCES `contratos_soporte_licencias` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  TABLA: ticket_seguimientos
--  Hilo de seguimiento (respuestas internas y de cliente / correos).
-- =====================================================================
CREATE TABLE IF NOT EXISTS `ticket_seguimientos` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ticket_id`     BIGINT UNSIGNED NOT NULL,
  `autor_id`      BIGINT UNSIGNED DEFAULT NULL,
  `tipo`          ENUM('nota_interna','respuesta_cliente','correo_entrante','sistema')
                  NOT NULL DEFAULT 'nota_interna',
  `contenido`     MEDIUMTEXT      NOT NULL,
  `email_message_id` VARCHAR(255) DEFAULT NULL,
  `creado_en`     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_seg_ticket` (`ticket_id`),
  KEY `fk_seg_autor` (`autor_id`),
  CONSTRAINT `fk_seg_ticket`
    FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_seg_autor`
    FOREIGN KEY (`autor_id`) REFERENCES `usuarios` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  TABLA: ticket_adjuntos
--  Evidencia obligatoria al cierre (imágenes) y otros archivos.
--  Se guarda solo metadata + ruta confinada; el binario va fuera del webroot.
-- =====================================================================
CREATE TABLE IF NOT EXISTS `ticket_adjuntos` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ticket_id`       BIGINT UNSIGNED NOT NULL,
  `nombre_original` VARCHAR(255)    NOT NULL,                 -- nombre mostrado (no usado para guardar)
  `nombre_guardado` VARCHAR(255)    NOT NULL,                 -- nombre aleatorio en disco
  `ruta_relativa`   VARCHAR(255)    NOT NULL,                 -- relativa a UPLOAD_DIR (anti path traversal)
  `mime_type`       VARCHAR(120)    NOT NULL,                 -- validado contra tipo real
  `tamano_bytes`    INT UNSIGNED    NOT NULL,
  `subido_por`      BIGINT UNSIGNED DEFAULT NULL,
  `es_evidencia_cierre` TINYINT(1)  NOT NULL DEFAULT 0,
  `creado_en`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_adj_ticket` (`ticket_id`),
  KEY `fk_adj_usuario` (`subido_por`),
  CONSTRAINT `fk_adj_ticket`
    FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_adj_usuario`
    FOREIGN KEY (`subido_por`) REFERENCES `usuarios` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  TABLA: bitacora_soporte_remoto  ⚠ CONTIENE CAMPOS CIFRADOS
--  Cómo conectarse a cada cliente. Credenciales/VPN se guardan
--  ENCRIPTADAS con AES-256-GCM (VARBINARY). El servidor NUNCA persiste
--  texto plano. El acceso a esta tabla se restringe a admin/empleado y
--  cada lectura/uso se registra en bitacora_accesos_log.
-- =====================================================================
CREATE TABLE IF NOT EXISTS `bitacora_soporte_remoto` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`                CHAR(36)        NOT NULL,
  `cliente_empresa_id`  BIGINT UNSIGNED NOT NULL,
  `division`            ENUM('energia','deportes') NOT NULL DEFAULT 'energia',
  `etiqueta`            VARCHAR(120)    NOT NULL,             -- Ej: "VPN Multiparques - PLC #2"
  `metodo_conexion`     ENUM('vpn','rdp','ssh','anydesk','teamviewer','vnc','web','otro')
                        NOT NULL DEFAULT 'otro',
  `host_cifrado`        VARBINARY(512)  DEFAULT NULL,         -- IP/host (AES-256-GCM)
  `puerto`              SMALLINT UNSIGNED DEFAULT NULL,       -- el puerto puede ir en claro
  `usuario_cifrado`     VARBINARY(512)  DEFAULT NULL,         -- usuario (AES-256-GCM)
  `password_cifrado`    VARBINARY(1024) DEFAULT NULL,         -- contraseña (AES-256-GCM)
  `vpn_config_cifrado`  VARBINARY(8192) DEFAULT NULL,         -- perfil/credenciales VPN (AES-256-GCM)
  `notas_cifrado`       VARBINARY(8192) DEFAULT NULL,         -- instrucciones sensibles (AES-256-GCM)
  `creado_por`          BIGINT UNSIGNED DEFAULT NULL,
  `creado_en`           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bitacora_uuid` (`uuid`),
  KEY `fk_bitacora_cliente` (`cliente_empresa_id`),
  KEY `fk_bitacora_creador` (`creado_por`),
  CONSTRAINT `fk_bitacora_cliente`
    FOREIGN KEY (`cliente_empresa_id`) REFERENCES `clientes_empresa` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bitacora_creador`
    FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  TABLA: bitacora_accesos_log
--  Log de quién accedió / usó una credencial de soporte remoto y cuándo.
--  Trazabilidad de acceso a secretos (D1 / D11).
-- =====================================================================
CREATE TABLE IF NOT EXISTS `bitacora_accesos_log` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `bitacora_id`   BIGINT UNSIGNED NOT NULL,
  `usuario_id`    BIGINT UNSIGNED DEFAULT NULL,
  `accion`        ENUM('ver_credencial','editar','crear','eliminar','conectar') NOT NULL,
  `ip`            VARCHAR(45)     DEFAULT NULL,
  `user_agent`    VARCHAR(255)    DEFAULT NULL,
  `creado_en`     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_acceso_bitacora` (`bitacora_id`),
  KEY `fk_acceso_usuario` (`usuario_id`),
  CONSTRAINT `fk_acceso_bitacora`
    FOREIGN KEY (`bitacora_id`) REFERENCES `bitacora_soporte_remoto` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_acceso_usuario`
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  TABLA: knowledge_base_howto
--  Base de conocimientos auto-alimentada al cerrar tickets ("How-To").
-- =====================================================================
CREATE TABLE IF NOT EXISTS `knowledge_base_howto` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`          CHAR(36)        NOT NULL,
  `ticket_id`     BIGINT UNSIGNED DEFAULT NULL,              -- ticket de origen (si aplica)
  `division`      ENUM('energia','deportes') NOT NULL DEFAULT 'energia',
  `titulo`        VARCHAR(255)    NOT NULL,
  `contenido`     MEDIUMTEXT      NOT NULL,
  `tags`          VARCHAR(255)    DEFAULT NULL,              -- CSV simple de etiquetas
  `autor_id`      BIGINT UNSIGNED DEFAULT NULL,
  `publicado`     TINYINT(1)      NOT NULL DEFAULT 1,
  `creado_en`     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_kb_uuid` (`uuid`),
  KEY `fk_kb_ticket` (`ticket_id`),
  KEY `fk_kb_autor` (`autor_id`),
  KEY `idx_kb_division` (`division`),
  FULLTEXT KEY `ft_kb_busqueda` (`titulo`, `contenido`, `tags`),  -- búsqueda interna
  CONSTRAINT `fk_kb_ticket`
    FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_kb_autor`
    FOREIGN KEY (`autor_id`) REFERENCES `usuarios` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  TABLA: historial_logs_seguridad
--  Auditoría de eventos de seguridad (D11): logins, accesos denegados,
--  rate limit, cambios sensibles. NUNCA almacena contraseñas ni tokens.
-- =====================================================================
CREATE TABLE IF NOT EXISTS `historial_logs_seguridad` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id`    BIGINT UNSIGNED DEFAULT NULL,              -- puede ser NULL (intento anónimo)
  `email_intento` VARCHAR(180)    DEFAULT NULL,              -- email usado en login fallido
  `evento`        VARCHAR(80)     NOT NULL,                  -- ej: LOGIN_OK, LOGIN_FAIL, RATE_LIMIT, ACCESS_DENIED
  `severidad`     ENUM('info','warning','critical') NOT NULL DEFAULT 'info',
  `exito`         TINYINT(1)      NOT NULL DEFAULT 0,
  `ip`            VARCHAR(45)     DEFAULT NULL,
  `user_agent`    VARCHAR(255)    DEFAULT NULL,
  `ruta`          VARCHAR(255)    DEFAULT NULL,              -- endpoint afectado
  `detalle`       TEXT            DEFAULT NULL,              -- contexto NO sensible
  `creado_en`     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_logs_evento` (`evento`),
  KEY `idx_logs_severidad` (`severidad`),
  KEY `idx_logs_creado` (`creado_en`),
  KEY `fk_logs_usuario` (`usuario_id`),
  CONSTRAINT `fk_logs_usuario`
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  SECUENCIA DE NÚMERO DE TICKET POR DIVISIÓN (opcional, ayuda al #1024)
--  Mantiene un contador atómico por división para asignar `numero`.
-- =====================================================================
CREATE TABLE IF NOT EXISTS `secuencias` (
  `nombre`    VARCHAR(60)     NOT NULL,                      -- ej: 'ticket_energia'
  `valor`     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `secuencias` (`nombre`, `valor`) VALUES
  ('ticket_energia', 1000),
  ('ticket_deportes', 1000)
ON DUPLICATE KEY UPDATE `nombre` = `nombre`;

-- =====================================================================
--  RESTAURAR FLAGS
-- =====================================================================
SET SQL_MODE = @OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
--  FIN nexus_master.sql
--  Próximos módulos (no incluidos en este arranque):
--   leads/crm, proyectos/gantt, performance_logs (Tracker),
--   easymetering_monitoreo, store_productos/pedidos, suscripciones_hub.
-- =====================================================================
