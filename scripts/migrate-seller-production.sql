-- Upgrade a main-branch Agri Ledger MySQL database to sellerProduction.
-- Safe to run more than once.
--
-- What this does:
--   1. Creates `farms` (one row per tenant)
--   2. Puts existing users onto Default Farm (id = 1) via users.farm_id
--   3. Creates empty shared knowledge-base tables (content is seeded on first
--      /getKnowledgeBase call)
--
-- Does NOT touch inventory amounts, expenses, crops, or other private data.

CREATE TABLE IF NOT EXISTS farms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO farms (id, name) VALUES (1, 'Default Farm');

SET @farm_id_exists := (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'users'
     AND COLUMN_NAME = 'farm_id'
);

SET @farm_id_sql := IF(
  @farm_id_exists = 0,
  'ALTER TABLE users ADD COLUMN farm_id INT NOT NULL DEFAULT 1',
  'SELECT 1'
);

PREPARE farm_id_stmt FROM @farm_id_sql;
EXECUTE farm_id_stmt;
DEALLOCATE PREPARE farm_id_stmt;

UPDATE users SET farm_id = 1 WHERE farm_id IS NULL OR farm_id = 0;

CREATE TABLE IF NOT EXISTS kb_fertilizers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(128) NOT NULL DEFAULT '',
  composition VARCHAR(255) NOT NULL DEFAULT '',
  what_it_does TEXT NULL,
  how_to_use TEXT NULL,
  default_unit VARCHAR(32) NOT NULL DEFAULT 'kg',
  UNIQUE KEY uq_kb_fertilizers_name (name)
);

CREATE TABLE IF NOT EXISTS kb_pesticides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  target VARCHAR(255) NOT NULL DEFAULT '',
  what_it_does TEXT NULL,
  advice TEXT NULL,
  cycle_notes TEXT NULL,
  UNIQUE KEY uq_kb_pesticides_name (name)
);

CREATE TABLE IF NOT EXISTS kb_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_key VARCHAR(64) NOT NULL,
  crop_type VARCHAR(128) NOT NULL DEFAULT '',
  name VARCHAR(255) NOT NULL,
  summary TEXT NULL,
  UNIQUE KEY uq_kb_schedules_source (source_key)
);

CREATE TABLE IF NOT EXISTS kb_schedule_steps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  schedule_id INT NOT NULL,
  step_order INT NOT NULL DEFAULT 0,
  title VARCHAR(255) NOT NULL,
  summary TEXT NULL,
  details TEXT NULL,
  INDEX idx_kb_steps_schedule (schedule_id)
);
