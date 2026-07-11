// Classement et résumé des publications OSINT.
// Utilise l'API Claude si ANTHROPIC_API_KEY est défini, sinon un repli par mots-clés.

import Anthropic from '@anthropic-ai/sdk';

export const THEMES = ['air', 'naval', 'geopolitique'];

export const THEME_LABELS = {
  air: 'Air',
  naval: 'Naval',
  geopolitique: 'Géopolitique',
};

function model(env) {
  return env.OSINT_MODEL || 'claude-opus-4-8';
}

// --- Classement d'un item -------------------------------------------------

const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    relevant: { type: 'boolean' },
    themes: {
      type: 'array',
      items: { type: 'string', enum: ['air', 'naval', 'geopolitique'] },
    },
    place: { type: 'string' },       // nom du lieu, "" si inconnu
    has_coords: { type: 'boolean' },
    lat: { type: 'number' },         // 0 si has_coords = false
    lon: { type: 'number' },         // 0 si has_coords = false
    summary: { type: 'string' },     // une phrase en français
  },
  required: ['relevant', 'themes', 'place', 'has_coords', 'lat', 'lon', 'summary'],
  additionalProperties: false,
};

const CLASSIFY_SYSTEM = `Tu es un analyste OSINT (renseignement en sources ouvertes) spécialisé dans la défense et la géopolitique.
On te fournit une publication (souvent un tweet). Classe-la selon ces trois thèmes, un ou plusieurs peuvent s'appliquer :
- "air" : aviation militaire, avions de chasse, drones, défense aérienne, espace, missiles, activité aérienne.
- "naval" : marine, navires de guerre, sous-marins, porte-avions, activité maritime, ports militaires.
- "geopolitique" : relations internationales, conflits, diplomatie, sanctions, mouvements de troupes terrestres, politique de défense.
Règles :
- Si la publication n'a aucun rapport avec ces sujets (sport, vie privée, pub...), mets relevant=false et themes=[].
- Déduis la localisation géographique évoquée (pays, ville, mer, base...). Si tu peux estimer des coordonnées approximatives, mets has_coords=true et remplis lat/lon (sinon has_coords=false et lat=lon=0).
- "summary" : une phrase factuelle et neutre en français résumant l'information.`;

async function classifyWithClaude(env, item) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const userText = [
    item.author ? `Auteur : ${item.author}` : null,
    item.created_at ? `Date : ${item.created_at}` : null,
    `Texte : ${item.text}`,
  ].filter(Boolean).join('\n');

  const resp = await client.messages.create({
    model: model(env),
    max_tokens: 1024,
    system: CLASSIFY_SYSTEM,
    output_config: { format: { type: 'json_schema', schema: CLASSIFY_SCHEMA } },
    messages: [{ role: 'user', content: userText }],
  });

  const block = resp.content.find((b) => b.type === 'text');
  const data = JSON.parse(block.text);
  return {
    relevant: !!data.relevant,
    themes: Array.isArray(data.themes) ? data.themes.filter((t) => THEMES.includes(t)) : [],
    place: (data.place || '').trim(),
    lat: data.has_coords ? data.lat : null,
    lon: data.has_coords ? data.lon : null,
    summary: (data.summary || '').trim(),
    classified_by: 'claude',
  };
}

// --- Repli par mots-clés (sans clé API) -----------------------------------

const KEYWORDS = {
  air: [
    'avion', 'chasse', 'f-16', 'f-35', 'f16', 'f35', 'rafale', 'mig', 'sukhoi', 'su-', 'drone', 'uav',
    'missile', 'defense aerienne', 'défense aérienne', 'aircraft', 'fighter', 'jet', 'airspace',
    'espace aérien', 'hélicoptère', 'helicopter', 'bombardier', 'bomber', 's-400', 'patriot', 'awacs',
  ],
  naval: [
    'navire', 'marine', 'sous-marin', 'submarine', 'porte-avions', 'carrier', 'frégate', 'frigate',
    'destroyer', 'corvette', 'warship', 'fleet', 'flotte', 'port', 'naval', 'navy', 'maritime',
    'détroit', 'strait', 'mer ', 'sea ', 'convoi', 'convoy', 'croiseur', 'cruiser',
  ],
  geopolitique: [
    'guerre', 'war', 'conflit', 'conflict', 'sanction', 'diplomatie', 'diplomacy', 'troupes', 'troops',
    'frontière', 'border', 'otan', 'nato', 'onu', 'un ', 'traité', 'treaty', 'russie', 'russia',
    'ukraine', 'chine', 'china', 'israel', 'israël', 'iran', 'gaza', 'offensive', 'invasion',
    'mobilisation', 'ceasefire', 'cessez-le-feu', 'accord', 'summit', 'sommet',
  ],
};

function classifyWithKeywords(item) {
  const text = (item.text || '').toLowerCase();
  const themes = [];
  for (const theme of THEMES) {
    if (KEYWORDS[theme].some((kw) => text.includes(kw))) themes.push(theme);
  }
  const summary = item.text.length > 160 ? item.text.slice(0, 157).trim() + '…' : item.text;
  return {
    relevant: themes.length > 0,
    themes,
    place: '',
    lat: null,
    lon: null,
    summary,
    classified_by: 'keywords',
  };
}

export async function classifyItem(env, item) {
  if (env.ANTHROPIC_API_KEY) {
    try {
      return await classifyWithClaude(env, item);
    } catch (err) {
      console.error('Échec du classement Claude, repli mots-clés :', err.message);
    }
  }
  return classifyWithKeywords(item);
}

// --- Résumé agrégé par thème ----------------------------------------------

export async function summarizeTheme(env, themeLabel, items) {
  if (items.length === 0) {
    return `Aucune donnée disponible pour le thème « ${themeLabel} ».`;
  }
  if (!env.ANTHROPIC_API_KEY) {
    // Repli : liste à puces des résumés d'items.
    const bullets = items.slice(0, 20).map((it) => {
      const place = it.place ? ` (${it.place})` : '';
      return `- ${it.summary || it.text}${place}`;
    });
    return `**${themeLabel}** — ${items.length} publication(s). Configurez ANTHROPIC_API_KEY pour un résumé synthétique.\n\n${bullets.join('\n')}`;
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const corpus = items.slice(0, 60).map((it, i) => {
    const place = it.place ? ` [${it.place}]` : '';
    const author = it.author ? ` — ${it.author}` : '';
    return `(${i + 1})${place}${author} : ${it.summary || it.text}`;
  }).join('\n');

  const resp = await client.messages.create({
    model: model(env),
    max_tokens: 1600,
    thinking: { type: 'adaptive' },
    system: `Tu es un analyste OSINT. On te fournit un ensemble de publications récentes sur le thème « ${themeLabel} ».
Produis une synthèse de renseignement en français, structurée en Markdown :
- un court paragraphe de situation générale ;
- une liste à puces des points saillants regroupés par zone géographique quand c'est pertinent ;
- signale les tendances ou évolutions notables.
Reste factuel et neutre. Ne cite pas de faits absents des sources. Sois concis.`,
    messages: [{ role: 'user', content: `Publications :\n${corpus}` }],
  });

  const block = resp.content.find((b) => b.type === 'text');
  return block ? block.text : '';
}
