-- ===========================================================
-- Les Amis de Montety — Schéma de la base D1
-- ===========================================================

-- Agenda du quartier
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  cat        TEXT NOT NULL,                 -- Atelier / Événement / Entraide / Sortie
  tone       TEXT,                          -- ocre / brique / olive / ardoise
  free       INTEGER NOT NULL DEFAULT 0,    -- 0/1
  "when"     TEXT,                          -- libellé affiché (ex. "JEU. 18 JUIN · 15H")
  descr      TEXT,
  location   TEXT,
  starts_at  TEXT,                          -- ISO 8601 (tri), facultatif
  published  INTEGER NOT NULL DEFAULT 1,    -- 0/1
  created_at TEXT DEFAULT (datetime('now'))
);

-- Messages du formulaire de contact
CREATE TABLE IF NOT EXISTS contact_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT,
  message    TEXT NOT NULL,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Demandes d'adhésion (le paiement éventuel passe par HelloAsso)
CREATE TABLE IF NOT EXISTS memberships (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  prenom     TEXT NOT NULL,
  nom        TEXT NOT NULL,
  email      TEXT NOT NULL,
  rue        TEXT,
  message    TEXT,
  status     TEXT NOT NULL DEFAULT 'pending', -- pending / accepted / declined
  created_at TEXT DEFAULT (datetime('now'))
);

-- Dons (journal interne ; la source de vérité reste HelloAsso)
CREATE TABLE IF NOT EXISTS donations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  donor      TEXT,
  email      TEXT,
  amount     REAL NOT NULL DEFAULT 0,        -- en euros
  method     TEXT DEFAULT 'helloasso',       -- helloasso / cheque / virement / especes
  note       TEXT,
  donated_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Comptes administrateurs (mots de passe hachés PBKDF2-SHA256, jamais en clair)
CREATE TABLE IF NOT EXISTS admins (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  pass_hash  TEXT NOT NULL,                  -- hex
  pass_salt  TEXT NOT NULL,                  -- hex
  pass_iter  INTEGER NOT NULL DEFAULT 100000,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Paramètres internes (clé/valeur) — ex. secret de signature des sessions
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Entraide — petites annonces (demandes de coup de main / offres de service)
CREATE TABLE IF NOT EXISTS listings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,                 -- 'demande' | 'offre'
  category    TEXT,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  author_name TEXT NOT NULL,
  contact     TEXT NOT NULL,                 -- e-mail ou téléphone (affiché publiquement)
  area        TEXT,
  status      TEXT NOT NULL DEFAULT 'published', -- published / pending / hidden
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_published   ON events (published, starts_at);
CREATE INDEX IF NOT EXISTS idx_contact_read       ON contact_messages (read, created_at);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships (status, created_at);
CREATE INDEX IF NOT EXISTS idx_donations_date     ON donations (donated_at);
CREATE INDEX IF NOT EXISTS idx_listings_status    ON listings (status, created_at);
