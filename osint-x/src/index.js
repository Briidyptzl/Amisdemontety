// Worker OSINT-X : API + service du tableau de bord statique.
import { classifyItem, summarizeTheme, THEMES, THEME_LABELS } from './classify.js';
import { fetchListTweets, xConfigured } from './x.js';

const THEME_COLUMN = {
  air: 'theme_air',
  naval: 'theme_naval',
  geopolitique: 'theme_geopol',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function requireIngestToken(request, env) {
  // Si INGEST_TOKEN est défini, les routes d'écriture l'exigent (en-tête X-Ingest-Token).
  if (!env.INGEST_TOKEN) return null;
  const provided = request.headers.get('x-ingest-token');
  if (provided !== env.INGEST_TOKEN) return json({ error: 'Jeton d\'ingestion invalide ou manquant.' }, 401);
  return null;
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Ingère un item : classe puis insère (ignore les doublons via source_id).
async function ingestOne(env, raw) {
  const text = (raw.text || '').trim();
  if (!text) return { skipped: true, reason: 'texte vide' };

  const item = {
    text,
    author: raw.author || '',
    created_at: raw.created_at || null,
  };
  const cls = await classifyItem(env, item);

  const source = raw.source || 'manual';
  const source_id = raw.source_id || (await sha256(source + '|' + text)).slice(0, 32);
  const media = Array.isArray(raw.media) ? raw.media : [];
  const now = new Date().toISOString();

  try {
    await env.DB.prepare(
      `INSERT INTO osint_items
        (source, source_id, author, author_name, url, text, media_json, lang,
         theme_air, theme_naval, theme_geopol, relevant, place, lat, lon,
         summary, classified_by, created_at, ingested_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(source_id) DO NOTHING`
    ).bind(
      source,
      source_id,
      raw.author || '',
      raw.author_name || '',
      raw.url || '',
      text,
      JSON.stringify(media),
      raw.lang || '',
      cls.themes.includes('air') ? 1 : 0,
      cls.themes.includes('naval') ? 1 : 0,
      cls.themes.includes('geopolitique') ? 1 : 0,
      cls.relevant ? 1 : 0,
      cls.place || '',
      cls.lat,
      cls.lon,
      cls.summary || '',
      cls.classified_by,
      raw.created_at || now,
      now
    ).run();
  } catch (err) {
    return { error: err.message, source_id };
  }

  return { ok: true, source_id, themes: cls.themes, place: cls.place, relevant: cls.relevant };
}

function rowToItem(r) {
  const themes = [];
  if (r.theme_air) themes.push('air');
  if (r.theme_naval) themes.push('naval');
  if (r.theme_geopol) themes.push('geopolitique');
  return {
    id: r.id,
    source: r.source,
    author: r.author,
    author_name: r.author_name,
    url: r.url,
    text: r.text,
    media: JSON.parse(r.media_json || '[]'),
    themes,
    place: r.place,
    lat: r.lat,
    lon: r.lon,
    summary: r.summary,
    classified_by: r.classified_by,
    created_at: r.created_at,
  };
}

async function handleApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  // GET /api/health
  if (path === '/api/health') {
    return json({
      ok: true,
      claude: !!env.ANTHROPIC_API_KEY,
      x: xConfigured(env),
      model: env.OSINT_MODEL || 'claude-opus-4-8',
      themes: THEMES,
    });
  }

  // GET /api/feed?theme=air&place=&limit=50
  if (path === '/api/feed' && method === 'GET') {
    const theme = url.searchParams.get('theme');
    const place = url.searchParams.get('place');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '60', 10), 200);
    const where = ['relevant = 1'];
    const binds = [];
    if (theme && THEME_COLUMN[theme]) where.push(`${THEME_COLUMN[theme]} = 1`);
    if (place) { where.push('place = ?'); binds.push(place); }
    const sql = `SELECT * FROM osint_items WHERE ${where.join(' AND ')}
                 ORDER BY COALESCE(created_at, ingested_at) DESC LIMIT ?`;
    binds.push(limit);
    const { results } = await env.DB.prepare(sql).bind(...binds).all();
    return json({ items: (results || []).map(rowToItem) });
  }

  // GET /api/locations — regroupement par lieu avec compteurs par thème
  if (path === '/api/locations' && method === 'GET') {
    const sql = `SELECT place,
                        COUNT(*) AS total,
                        SUM(theme_air) AS air,
                        SUM(theme_naval) AS naval,
                        SUM(theme_geopol) AS geopolitique,
                        AVG(lat) AS lat, AVG(lon) AS lon
                 FROM osint_items
                 WHERE relevant = 1 AND place <> ''
                 GROUP BY place ORDER BY total DESC LIMIT 100`;
    const { results } = await env.DB.prepare(sql).all();
    const locations = [];
    for (const r of results || []) {
      // quelques images d'exemple pour la vignette du lieu
      const { results: media } = await env.DB.prepare(
        `SELECT media_json FROM osint_items WHERE place = ? AND media_json <> '[]' LIMIT 4`
      ).bind(r.place).all();
      const images = [];
      for (const m of media || []) {
        for (const u of JSON.parse(m.media_json || '[]')) { if (images.length < 4) images.push(u); }
      }
      locations.push({
        place: r.place,
        total: r.total,
        counts: { air: r.air || 0, naval: r.naval || 0, geopolitique: r.geopolitique || 0 },
        lat: r.lat, lon: r.lon,
        images,
      });
    }
    return json({ locations });
  }

  // GET|POST /api/themes/:theme/summary
  const summaryMatch = path.match(/^\/api\/themes\/([^/]+)\/summary$/);
  if (summaryMatch) {
    const theme = summaryMatch[1];
    if (!THEME_COLUMN[theme]) return json({ error: 'Thème inconnu' }, 404);
    const label = THEME_LABELS[theme];

    if (method === 'GET') {
      const row = await env.DB.prepare('SELECT * FROM theme_summaries WHERE theme = ?').bind(theme).first();
      if (row && row.summary) {
        return json({ theme, summary: row.summary, item_count: row.item_count, generated_at: row.generated_at, cached: true });
      }
      // rien en cache → indiquer au client de régénérer
      return json({ theme, summary: '', cached: false });
    }

    if (method === 'POST') {
      const authErr = requireIngestToken(request, env);
      if (authErr) return authErr;
      const { results } = await env.DB.prepare(
        `SELECT * FROM osint_items WHERE relevant = 1 AND ${THEME_COLUMN[theme]} = 1
         ORDER BY COALESCE(created_at, ingested_at) DESC LIMIT 60`
      ).all();
      const items = (results || []).map(rowToItem);
      const summary = await summarizeTheme(env, label, items);
      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO theme_summaries (theme, summary, item_count, generated_at)
         VALUES (?,?,?,?)
         ON CONFLICT(theme) DO UPDATE SET summary=excluded.summary, item_count=excluded.item_count, generated_at=excluded.generated_at`
      ).bind(theme, summary, items.length, now).run();
      return json({ theme, summary, item_count: items.length, generated_at: now, cached: false });
    }
  }

  // POST /api/ingest — un item {text,...} ou {items:[...]}
  if (path === '/api/ingest' && method === 'POST') {
    const authErr = requireIngestToken(request, env);
    if (authErr) return authErr;
    let body;
    try { body = await request.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
    const list = Array.isArray(body.items) ? body.items : [body];
    const results = [];
    for (const raw of list) results.push(await ingestOne(env, raw));
    return json({ ingested: results.length, results });
  }

  // POST /api/x/sync — synchronise la Liste X
  if (path === '/api/x/sync' && method === 'POST') {
    const authErr = requireIngestToken(request, env);
    if (authErr) return authErr;
    if (!xConfigured(env)) {
      return json({ error: 'API X non configurée. Définissez X_BEARER_TOKEN et X_LIST_ID.' }, 400);
    }
    let max = 50;
    try { const b = await request.json(); if (b && b.max) max = b.max; } catch { /* corps facultatif */ }
    let tweets;
    try { tweets = await fetchListTweets(env, max); }
    catch (err) { return json({ error: err.message }, 502); }
    const results = [];
    for (const t of tweets) results.push(await ingestOne(env, t));
    const inserted = results.filter((r) => r.ok).length;
    return json({ fetched: tweets.length, inserted, results });
  }

  // DELETE /api/items/:id
  const delMatch = path.match(/^\/api\/items\/(\d+)$/);
  if (delMatch && method === 'DELETE') {
    const authErr = requireIngestToken(request, env);
    if (authErr) return authErr;
    await env.DB.prepare('DELETE FROM osint_items WHERE id = ?').bind(delMatch[1]).run();
    return json({ deleted: delMatch[1] });
  }

  return json({ error: 'Route inconnue' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        console.error('Erreur API :', err);
        return json({ error: err.message || 'Erreur serveur' }, 500);
      }
    }
    // Sinon : tableau de bord statique
    return env.ASSETS.fetch(request);
  },
};
