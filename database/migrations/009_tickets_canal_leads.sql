-- Canal 'leads' para tickets creados desde Nexus Leads

ALTER TABLE `tickets`
  MODIFY COLUMN `canal` ENUM('imap','web','telefono','manual','leads') NOT NULL DEFAULT 'web';
