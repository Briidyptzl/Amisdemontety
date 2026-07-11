// Adaptateur API X (Twitter) v2.
// Récupère les tweets d'une Liste X et les normalise au format « item » de l'app.
// Nécessite les secrets X_BEARER_TOKEN et la variable X_LIST_ID.
// Sans ces valeurs, syncFromXList() renvoie une erreur explicite — l'import manuel
// reste disponible pour démarrer sans accès à l'API X.

const X_API = 'https://api.twitter.com/2';

export function xConfigured(env) {
  return !!(env.X_BEARER_TOKEN && env.X_LIST_ID);
}

// Récupère jusqu'à `max` tweets récents de la Liste configurée.
export async function fetchListTweets(env, max = 50) {
  const params = new URLSearchParams({
    max_results: String(Math.min(Math.max(max, 5), 100)),
    expansions: 'author_id,attachments.media_keys',
    'tweet.fields': 'created_at,lang,text,entities',
    'media.fields': 'url,preview_image_url,type',
    'user.fields': 'username,name',
  });

  const res = await fetch(`${X_API}/lists/${env.X_LIST_ID}/tweets?${params}`, {
    headers: { Authorization: `Bearer ${env.X_BEARER_TOKEN}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API X ${res.status} : ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  return normalize(json);
}

function normalize(json) {
  const tweets = json.data || [];
  const users = {};
  for (const u of json.includes?.users || []) users[u.id] = u;
  const media = {};
  for (const m of json.includes?.media || []) media[m.media_key] = m;

  return tweets.map((t) => {
    const user = users[t.author_id] || {};
    const mediaUrls = (t.attachments?.media_keys || [])
      .map((k) => media[k])
      .filter(Boolean)
      .map((m) => m.url || m.preview_image_url)
      .filter(Boolean);

    return {
      source: 'x-list',
      source_id: t.id,
      author: user.username ? `@${user.username}` : '',
      author_name: user.name || '',
      url: user.username ? `https://x.com/${user.username}/status/${t.id}` : '',
      text: t.text || '',
      media: mediaUrls,
      lang: t.lang || '',
      created_at: t.created_at || null,
    };
  });
}
