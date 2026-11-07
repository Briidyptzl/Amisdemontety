-- ===========================================================
-- Migration à exécuter UNE SEULE FOIS sur la base D1 de PRODUCTION
-- avant de déployer le nouveau code du portail gérant de bar.
--   wrangler d1 execute amisdemontety --remote --file=./migrate-bar-prod.sql
-- (nécessite un jeton Cloudflare avec le droit D1:Edit)
-- ===========================================================

-- Nouvelles tables
CREATE TABLE IF NOT EXISTS bar_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bar_team (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, email TEXT, rib TEXT, role TEXT,
  pay_method TEXT, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bar_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT, pdate TEXT NOT NULL, designation TEXT NOT NULL, qty REAL,
  amount REAL NOT NULL DEFAULT 0, buyer TEXT, method TEXT, reimbursed INTEGER NOT NULL DEFAULT 0,
  reimbursed_at TEXT, note TEXT, receipt_key TEXT, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS bar_availability (
  team_id INTEGER NOT NULL, adate TEXT NOT NULL, PRIMARY KEY (team_id, adate)
);
CREATE TABLE IF NOT EXISTS bar_equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, location TEXT,
  photo_key TEXT, invoice_key TEXT, note TEXT, sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Nouvelles colonnes sur des tables existantes
ALTER TABLE bar_products ADD COLUMN location TEXT;
ALTER TABLE bar_products ADD COLUMN expiry TEXT;
ALTER TABLE bar_products ADD COLUMN threshold REAL NOT NULL DEFAULT 0;
ALTER TABLE bar_products ADD COLUMN cost REAL;
ALTER TABLE bar_products ADD COLUMN category TEXT;

ALTER TABLE bar_managers ADD COLUMN treasurer INTEGER NOT NULL DEFAULT 0;

ALTER TABLE bar_sales ADD COLUMN method TEXT;
ALTER TABLE bar_sales ADD COLUMN seller TEXT;

ALTER TABLE bar_projects ADD COLUMN start_date TEXT;
ALTER TABLE bar_projects ADD COLUMN end_date TEXT;
