# OSINT‑X

Agrégateur OSINT qui, à partir de votre compte X (ou d'un import manuel), **résume les
données de renseignement en sources ouvertes** :

- **par thème** : `air`, `naval`, `géopolitique` ;
- **par localisation géographique** : chaque lieu détecté affiche le nombre de publications
  par thème, des images associées et un lien vers la carte.

Le classement (thème + localisation), le résumé par item et la **synthèse IA par thème**
sont produits par **Claude**. Un **repli par mots‑clés** permet de fonctionner sans clé API.

Stack : **Cloudflare Workers + D1** (base SQLite) + **Claude** (SDK `@anthropic-ai/sdk`).

---

## Architecture

```
Sources                Worker (src/)                     Interface (public/)
────────               ─────────────                     ───────────────────
Liste X ─┐   ┌ x.js ───────────┐
          ├──►│ index.js (API)  ├─► D1 (osint_items,      Tableau de bord
Import ──┘   │  classify.js ────┤    theme_summaries)      (onglets Air /
manuel        └─ Claude / mots‑clés                        Naval / Géopol /
                                                           Localisations / Import)
```

### Chaîne de traitement

1. **Ingestion** — un tweet (Liste X) ou un import manuel arrive sur `/api/ingest`.
2. **Classement** (`classify.js`) — Claude détermine les thèmes applicables, la
   localisation (nom + coordonnées approximatives) et un résumé d'une phrase.
   Sans clé API : classement par mots‑clés.
3. **Stockage** — dans la table D1 `osint_items` (déduplication par `source_id`).
4. **Restitution** — le tableau de bord lit `/api/feed`, `/api/locations` et
   `/api/themes/:theme/summary` (synthèse IA mise en cache).

---

## Installation

```bash
cd osint-x
npm install

# 1) Créer la base D1 puis coller le database_id renvoyé dans wrangler.toml
npm run db:create

# 2) Appliquer le schéma
npm run db:schema          # base distante
# npm run db:schema:local  # base locale pour `wrangler dev`

# 3) Configurer les secrets
npx wrangler secret put ANTHROPIC_API_KEY   # requis pour l'IA (sinon repli mots‑clés)
npx wrangler secret put X_BEARER_TOKEN      # facultatif : API X v2 (synchro Liste)
npx wrangler secret put INGEST_TOKEN        # facultatif : protège les routes d'écriture

# 4) Dans wrangler.toml, renseigner X_LIST_ID (id de votre Liste X) si vous utilisez X.

# Lancer
npm run dev      # développement local
npm run deploy   # mise en production
```

Pour le développement local, placez les secrets dans un fichier `.dev.vars` :

```
ANTHROPIC_API_KEY=sk-ant-...
X_BEARER_TOKEN=...
INGEST_TOKEN=...
```

---

## À propos de l'accès à l'API X

L'API X v2 est **payante** : lire une Liste ou une timeline nécessite au minimum le
palier **Basic**. Tant que vous n'avez pas de clés :

- l'application fonctionne dès maintenant en **import manuel** (onglet « ＋ Import ») ;
- l'adaptateur `src/x.js` est **prêt à brancher** : dès que `X_BEARER_TOKEN` et
  `X_LIST_ID` sont définis, le bouton « Synchroniser la Liste X » et `/api/x/sync`
  récupèrent les tweets, les classent et les stockent.

La curation d'une **Liste X** d'comptes OSINT (air / naval / géopolitique) est la
source recommandée. On peut aussi étendre `x.js` aux favoris (`/2/users/:id/bookmarks`,
OAuth utilisateur) ou à la timeline d'accueil.

---

## API

| Méthode | Route | Description |
|--------|-------|-------------|
| GET | `/api/health` | État (IA active, X configuré, modèle). |
| GET | `/api/feed?theme=air&place=&limit=60` | Publications filtrées par thème / lieu. |
| GET | `/api/locations` | Lieux avec compteurs par thème et images. |
| GET | `/api/themes/:theme/summary` | Synthèse IA en cache (`air`\|`naval`\|`geopolitique`). |
| POST | `/api/themes/:theme/summary` | (Re)génère la synthèse IA du thème. |
| POST | `/api/ingest` | Ingestion `{text, author?, url?, media?[]}` ou `{items:[…]}`. |
| POST | `/api/x/sync` | Synchronise la Liste X configurée. |
| DELETE | `/api/items/:id` | Supprime une publication. |

Les routes d'écriture exigent l'en‑tête `X-Ingest-Token` si `INGEST_TOKEN` est défini.

---

## Configuration

| Variable | Où | Rôle |
|----------|----|------|
| `ANTHROPIC_API_KEY` | secret | Clé API Anthropic (classement + résumés). |
| `OSINT_MODEL` | `wrangler.toml` [vars] | Modèle Claude (`claude-opus-4-8` par défaut ; `claude-haiku-4-5` pour réduire le coût). |
| `X_BEARER_TOKEN` | secret | Bearer token API X v2. |
| `X_LIST_ID` | `wrangler.toml` [vars] | Id de la Liste X à synchroniser. |
| `INGEST_TOKEN` | secret | Protège `/api/ingest`, `/api/x/sync`, la (re)génération de résumé et la suppression. |

---

## Pistes d'extension

- **Synchro automatique** : ajouter un [Cron Trigger](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
  appelant la logique de `/api/x/sync`.
- **Carte interactive** : remplacer la liste des localisations par une carte (Leaflet)
  à partir des coordonnées `lat`/`lon`.
- **Favoris / timeline X** : étendre `src/x.js` (OAuth utilisateur).
- **Alertes** : notifier (e‑mail, webhook) quand un thème/lieu franchit un seuil d'activité.
