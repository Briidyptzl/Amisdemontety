# Site — Les Amis de Montety

Site de l'association **Les Amis de Montety** (association de quartier intergénérationnelle, Toulon),
reconstruit à partir du système de design « Charte Graphique » et hébergé sur **Cloudflare**.

- **Front** : HTML / CSS / JS statique, fidèle aux tokens et composants de la charte.
- **Back** : un **Cloudflare Worker** sert le site et expose une petite API (`/api/*`)
  adossée à une base de données **D1**.

## Contenu

| Page | Fichier | Description |
|------|---------|-------------|
| Accueil | `public/index.html` | Hero, mission, aperçu agenda, bandeau adhésion |
| L'agenda | `public/agenda.html` | Liste filtrable des événements (depuis l'API) |
| Le quartier | `public/quartier.html` | Histoire du quartier et de Paulin de Montety |
| Adhérer | `public/adherer.html` | Formulaire d'adhésion (enregistré en base) |

API du Worker (`src/index.js`) :
- `GET  /api/events` — agenda public (table `events`)
- `POST /api/contact` — message de contact (table `contact_messages`)
- `POST /api/membership` — demande d'adhésion (table `memberships`)

> Ouvert en local sans serveur, le site fonctionne quand même : l'agenda retombe sur des
> données d'exemple et les formulaires affichent la confirmation. Les données réelles
> n'arrivent qu'une fois déployé avec la base D1.

---

## Déploiement A — GitHub → Cloudflare (recommandé, sans rien installer)

1. **Pousser ce dossier sur GitHub** (un dépôt dédié, p. ex. `amisdemontety-site`).
2. Dans le **dashboard Cloudflare** → *Workers & Pages* → *Create* → *Import a repository*,
   choisir ce dépôt. Cloudflare détecte `wrangler.toml` et déploie à chaque `git push`.
3. **Créer la base D1** (une fois) : *Storage & Databases* → *D1* → *Create* → nom `amisdemontety`.
   Copier l'**ID** affiché et le coller dans `wrangler.toml` (`database_id`).
4. **Charger le schéma** : dans la console D1 de la base, exécuter le contenu de `schema.sql`
   puis (facultatif) `seed.sql` pour les événements d'exemple.
5. Re-pousser sur GitHub : le site est en ligne sur `*.workers.dev`, puis sur votre domaine.

## Déploiement B — en local (nécessite Node.js)

```bash
npm install
npx wrangler login
npx wrangler d1 create amisdemontety      # → copier database_id dans wrangler.toml
npm run db:schema                          # crée les tables (--remote)
npm run db:seed                            # événements d'exemple (facultatif)
npm run deploy                             # met le site en ligne
# Développement local :
npm run db:schema:local && npm run db:seed:local && npm run dev
```

---

## Gérer les événements de l'agenda

Tant que l'interface d'administration n'est pas refaite (phase 2), on ajoute/modifie les
événements directement dans la base D1 (console D1 du dashboard) :

```sql
INSERT INTO events (title, cat, tone, free, "when", descr, starts_at, published)
VALUES ('Vide-grenier', 'Événement', 'brique', 0, 'DIM. 14 SEPT. · 8H',
        'Le grand vide-grenier de la rue, ouvert à tous.', '2026-09-14T08:00', 1);
```

`cat` : `Atelier` · `Événement` · `Entraide` · `Sortie`
`tone` : `ocre` · `brique` · `olive` · `ardoise` (laisser vide = déduit de la catégorie)
`free` : `1` (gratuit) ou `0` · `published` : `1` (visible) ou `0` (brouillon)

---

## Reste à faire (phases suivantes)

- **Phase 2** : adhésion & dons en ligne via **HelloAsso** (gratuit pour l'association),
  pages producteurs (miel, maraîcher), coup de pouce, contact, CGU.
- **Phase 3** : interface d'administration (agenda, adhérents, dons, messages) avec
  authentification réelle (mots de passe hachés côté serveur, pas dans le code).

## Design

Source : `../Les Amis de Montety — Charte Graphique/`. Tokens repris dans
`public/css/tokens.css`, composants (boutons, cartes, badges, champs) dans `public/css/site.css`.
Ne pas ré-encoder de valeurs en dur : utiliser les variables CSS.
