-- Upgrade a main-branch Agri Ledger PostgreSQL database to sellerProduction.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS farms (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO farms (id, name) VALUES (1, 'Default Farm')
ON CONFLICT (id) DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('farms', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM farms), 1)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS farm_id INTEGER NOT NULL DEFAULT 1;
UPDATE users SET farm_id = 1 WHERE farm_id IS NULL OR farm_id = 0;

CREATE TABLE IF NOT EXISTS kb_fertilizers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  category VARCHAR(128) NOT NULL DEFAULT '',
  composition VARCHAR(255) NOT NULL DEFAULT '',
  what_it_does TEXT NULL,
  how_to_use TEXT NULL,
  default_unit VARCHAR(32) NOT NULL DEFAULT 'kg'
);

CREATE TABLE IF NOT EXISTS kb_pesticides (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  target VARCHAR(255) NOT NULL DEFAULT '',
  what_it_does TEXT NULL,
  advice TEXT NULL,
  cycle_notes TEXT NULL
);

CREATE TABLE IF NOT EXISTS kb_schedules (
  id SERIAL PRIMARY KEY,
  source_key VARCHAR(64) NOT NULL UNIQUE,
  crop_type VARCHAR(128) NOT NULL DEFAULT '',
  name VARCHAR(255) NOT NULL,
  summary TEXT NULL
);

CREATE TABLE IF NOT EXISTS kb_schedule_steps (
  id SERIAL PRIMARY KEY,
  schedule_id INT NOT NULL,
  step_order INT NOT NULL DEFAULT 0,
  title VARCHAR(255) NOT NULL,
  summary TEXT NULL,
  details TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_kb_steps_schedule ON kb_schedule_steps (schedule_id);
