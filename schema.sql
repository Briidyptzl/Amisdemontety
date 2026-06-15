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
  starts_at  TEXT,                          -- ISO 8601 (date d'ancrage / tri), facultatif
  published  INTEGER NOT NULL DEFAULT 1,    -- 0/1
  reserved   INTEGER NOT NULL DEFAULT 0,    -- 1 = visible uniquement dans l'administration
  recur      TEXT,                          -- null / 'weekly' / 'monthly'
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
  amount     REAL,                            -- montant de la cotisation
  pay_method TEXT,                            -- especes / cheque / virement / helloasso / cb
  paid       INTEGER NOT NULL DEFAULT 0,      -- 1 = encaissé (alimente la compta)
  paid_at    TEXT,
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

-- Commerçants du quartier (comptes protégés par mot de passe haché PBKDF2)
CREATE TABLE IF NOT EXISTS merchants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,                 -- boulangerie / boucherie / epicerie / bar / pizzeria / ...
  slug        TEXT NOT NULL UNIQUE,          -- identifiant de connexion
  description TEXT,
  address     TEXT,
  phone       TEXT,
  pass_hash   TEXT NOT NULL,
  pass_salt   TEXT NOT NULL,
  pass_iter   INTEGER NOT NULL DEFAULT 100000,
  active      INTEGER NOT NULL DEFAULT 1,
  photo_key   TEXT,                          -- clé de l'image dans le KV MEDIA (/img/<clé>)
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Produits proposés par les commerçants (fiche détaillée)
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_id INTEGER NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  price       TEXT,
  photo_key   TEXT,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Annonces des commerçants (invendus / promos / annonces)
CREATE TABLE IF NOT EXISTS merchant_posts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_id     INTEGER NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'annonce', -- annonce / invendu / promo
  title           TEXT NOT NULL,
  body            TEXT,
  price           TEXT,
  available_until TEXT,
  status          TEXT NOT NULL DEFAULT 'published', -- published / hidden
  created_at      TEXT DEFAULT (datetime('now'))
);

-- Comptabilité (partie double) — plan comptable associatif
CREATE TABLE IF NOT EXISTS accounts (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  code     TEXT NOT NULL UNIQUE,            -- numéro de compte (ex. 512, 756)
  name     TEXT NOT NULL,
  klass    INTEGER NOT NULL,                -- classe 1..7
  type     TEXT NOT NULL,                   -- actif / passif / charge / produit
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS journal_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  edate      TEXT NOT NULL,                 -- date de l'écriture (YYYY-MM-DD)
  label      TEXT NOT NULL,
  piece      TEXT,
  source     TEXT NOT NULL DEFAULT 'manual',-- manual / membership / donation / bar
  source_id  INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS journal_lines (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id   INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  debit      REAL NOT NULL DEFAULT 0,
  credit     REAL NOT NULL DEFAULT 0,
  label      TEXT
);

-- Lieu de vie : devis de travaux (à valider/refuser, plaçables sur un plan)
CREATE TABLE IF NOT EXISTS devis (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  supplier     TEXT,
  lot          TEXT,
  amount       REAL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'a_valider', -- a_valider / valide / refuse
  document_key TEXT,                          -- PDF/image dans KV MEDIA
  plan_x       REAL,                          -- position sur le plan (% )
  plan_y       REAL,
  created_at   TEXT DEFAULT (datetime('now')),
  decided_at   TEXT
);
-- Étages du plan (chacun avec sa propre image) ; un devis peut être placé sur un étage.
CREATE TABLE IF NOT EXISTS plan_levels (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  image_key  TEXT,                          -- image du plan de cet étage (KV MEDIA)
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
-- devis.level_id référence l'étage où la punaise est posée (plan_x/plan_y en %).

-- Modèles d'e-mails et d'attestation fiscale (éditables dans l'admin)
CREATE TABLE IF NOT EXISTS templates (
  key        TEXT PRIMARY KEY,              -- password_invite / password_reset / membership_welcome / contact_ack / thank_you / attestation_don
  subject    TEXT,
  body       TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Jetons d'invitation / réinitialisation de mot de passe (lien par e-mail)
CREATE TABLE IF NOT EXISTS auth_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,          -- sha256 du jeton (le jeton brut n'est que dans l'e-mail)
  kind       TEXT NOT NULL,                 -- invite / reset
  expires_at TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lines_entry      ON journal_lines (entry_id);
CREATE INDEX IF NOT EXISTS idx_lines_account    ON journal_lines (account_id);
CREATE INDEX IF NOT EXISTS idx_entries_date     ON journal_entries (edate);
CREATE INDEX IF NOT EXISTS idx_events_published   ON events (published, starts_at);
CREATE INDEX IF NOT EXISTS idx_contact_read       ON contact_messages (read, created_at);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships (status, created_at);
CREATE INDEX IF NOT EXISTS idx_donations_date     ON donations (donated_at);
CREATE INDEX IF NOT EXISTS idx_listings_status    ON listings (status, created_at);
CREATE INDEX IF NOT EXISTS idx_mposts_merchant    ON merchant_posts (merchant_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_products_merchant   ON products (merchant_id, sort);
