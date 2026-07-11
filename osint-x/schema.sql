-- Schéma D1 pour l'agrégateur OSINT.
-- Exécuter : npm run db:schema (ou :local pour le développement)

-- Publications OSINT ingérées (depuis X ou import manuel), classées par thème.
CREATE TABLE IF NOT EXISTS osint_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source       TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'x-list' | 'x-bookmarks'
  source_id    TEXT UNIQUE,                       -- id du tweet, ou hash du contenu pour l'import manuel
  author       TEXT,                              -- handle (ex : @OSINTdefender)
  author_name  TEXT,                              -- nom affiché
  url          TEXT,                              -- lien vers la publication source
  text         TEXT NOT NULL,                     -- contenu texte
  media_json   TEXT NOT NULL DEFAULT '[]',        -- tableau JSON d'URL d'images
  lang         TEXT DEFAULT '',

  -- Thèmes (un item peut appartenir à plusieurs)
  theme_air        INTEGER NOT NULL DEFAULT 0,
  theme_naval      INTEGER NOT NULL DEFAULT 0,
  theme_geopol     INTEGER NOT NULL DEFAULT 0,
  relevant         INTEGER NOT NULL DEFAULT 1,    -- 0 = classé hors-sujet

  -- Localisation
  place        TEXT DEFAULT '',
  lat          REAL,
  lon          REAL,

  summary      TEXT DEFAULT '',                   -- résumé court (1 phrase) par item
  classified_by TEXT DEFAULT 'keywords',          -- 'claude' | 'keywords'

  created_at   TEXT,                              -- horodatage de la publication source (ISO 8601)
  ingested_at  TEXT NOT NULL                      -- horodatage d'ingestion (ISO 8601)
);

CREATE INDEX IF NOT EXISTS idx_items_air     ON osint_items(theme_air, created_at);
CREATE INDEX IF NOT EXISTS idx_items_naval   ON osint_items(theme_naval, created_at);
CREATE INDEX IF NOT EXISTS idx_items_geopol  ON osint_items(theme_geopol, created_at);
CREATE INDEX IF NOT EXISTS idx_items_place   ON osint_items(place);
CREATE INDEX IF NOT EXISTS idx_items_created ON osint_items(created_at);

-- Résumés IA agrégés par thème (mis en cache et régénérés à la demande).
CREATE TABLE IF NOT EXISTS theme_summaries (
  theme        TEXT PRIMARY KEY,                  -- 'air' | 'naval' | 'geopolitique'
  summary      TEXT NOT NULL DEFAULT '',
  item_count   INTEGER NOT NULL DEFAULT 0,
  generated_at TEXT
);
