# Site — Les Amis de Montety

Site de l'association **Les Amis de Montety** (association de quartier intergénérationnelle, Toulon),
refondu selon la charte graphique et hébergé sur **Cloudflare** (Worker + base D1).

- **Front** : HTML / CSS / JS statique (`public/`), fidèle aux tokens du design system.
- **Back** : un **Cloudflare Worker** (`src/index.js`) sert le site et expose une API (`/api/*`)
  adossée à la base **D1** `amisdemontety`.
- **Paiement** : adhésion et dons via **HelloAsso** (gratuit pour l'association).

## Pages

| Page | Fichier | Rôle |
|------|---------|------|
| Accueil | `public/index.html` | Hero, mission, aperçu agenda, bandeau adhésion/don |
| Agenda | `public/agenda.html` | Événements filtrables (depuis la base) |
| Le quartier | `public/quartier.html` | Histoire du quartier |
| Adhérer | `public/adherer.html` | Bouton HelloAsso + formulaire de demande |
| Faire un don | `public/don.html` | Bouton HelloAsso + repli chèque/virement |
| Contact | `public/contact.html` | Formulaire de contact |
| **Administration** | `public/admin.html` | Portail sécurisé (voir plus bas) |

## API du Worker
- `GET  /api/config` · `GET /api/events` · `POST /api/contact` · `POST /api/membership` (public)
- `POST /api/admin/login` · `logout` · `GET /api/admin/me` · `POST /api/admin/setup` (1re install)
- `/api/admin/*` (protégé) : `stats`, `settings`, `events`, `memberships`, `messages`,
  `donations`, `change-password`.

---

## ✅ Déjà fait
- Base **D1 `amisdemontety`** créée (région Europe de l'Ouest), schéma + agenda d'exemple chargés.
- **Compte administrateur** créé et **secret de session** généré (stocké dans la base, hors dépôt).
- Code poussé sur la branche **`main`** de ce dépôt. L'ancien site est conservé sur **`master`**
  (et `ancien-site`).

## ▶️ Mettre le site en ligne (sans rien installer)

Le Worker doit être déployé une fois. Le plus simple, via le **dashboard Cloudflare** :

1. **Workers & Pages** → **Create** → onglet **Import a repository** → connectez GitHub et
   choisissez **`Briidyptzl/Amisdemontety`**, branche **`main`**.
2. Cloudflare lit `wrangler.toml` (le binding D1 est déjà configuré) et déploie. À chaque `git push`
   sur `main`, le site se redéploie automatiquement.
3. Le site est en ligne sur `https://amisdemontety.<votre-sous-domaine>.workers.dev`, puis sur
   votre nom de domaine (onglet **Custom Domains** du Worker).

> Variante en ligne de commande (nécessite Node.js) : `npm install` puis `npx wrangler deploy`.

## 🔑 Se connecter à l'administration
- Adresse : `…/admin.html`
- Identifiant : **briidyb@gmail.com**
- Mot de passe temporaire : **fourni séparément dans le chat** — à changer dès la 1re connexion
  (Réglages → Changer mon mot de passe).

## 💳 Activer les paiements HelloAsso
1. Créez un compte association sur **helloasso.com** (gratuit) et deux campagnes :
   une **adhésion**, un **don/collecte**.
2. Copiez l'URL publique de chaque campagne.
3. Dans l'administration → **Réglages**, collez les deux liens. Les boutons « Adhérer en ligne »
   et « Faire un don » du site les utilisent automatiquement (sans redéploiement).
   Tant qu'ils sont vides, la page Don propose le repli chèque/virement.

---

## Sécurité
- Mots de passe administrateurs **hachés** (PBKDF2-SHA256, sel par compte) — jamais en clair.
- Sessions **signées HMAC-SHA256**, cookie **HttpOnly / Secure / SameSite=Strict**, expiration 8 h.
- Secret de session et identifiants **uniquement dans la base D1**, jamais dans le dépôt Git.
- ⚠️ **À faire par vous** : révoquer l'ancien **token GitHub** (il avait été stocké en clair) —
  GitHub → Settings → Developer settings → Personal access tokens → Revoke.

## Gérer l'agenda
Tout se fait depuis l'administration (onglet **Agenda** : ajouter / modifier / publier / supprimer).
Catégories : `Atelier`, `Événement`, `Entraide`, `Sortie`.

## Développement local (optionnel, nécessite Node.js)
```bash
npm install
npm run db:schema:local && npm run db:seed:local
npm run dev
```

## Reste à faire (phases suivantes)
- Pages producteurs (miel, maraîcher) et coup de pouce dans le nouveau design.
- Export/relances des adhérents, statistiques avancées.
