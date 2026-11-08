-- Migration prod #2 : messagerie par utilisateur, items de caisse par projet,
-- tâches de projet, et lien équipier → compte gérant.
-- Idempotent pour les tables (IF NOT EXISTS). L'ALTER bar_team.manager_id est à
-- lancer séparément : s'il renvoie « duplicate column », la colonne existe déjà.

-- Lecture des messages, propre à chaque administrateur
CREATE TABLE IF NOT EXISTS message_reads (
  message_id INTEGER NOT NULL, reader TEXT NOT NULL,
  PRIMARY KEY (message_id, reader)
);

-- Réponses et transferts (fil de discussion, visible par tous les admins)
CREATE TABLE IF NOT EXISTS message_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL, author TEXT, kind TEXT NOT NULL,
  to_email TEXT, body TEXT, created_at TEXT DEFAULT (datetime('now'))
);

-- Boutons d'article de caisse spécifiques à un projet
CREATE TABLE IF NOT EXISTS bar_project_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL, name TEXT NOT NULL, price REAL NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);

-- Tâches d'un projet
CREATE TABLE IF NOT EXISTS bar_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL, label TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0
);
