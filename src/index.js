/**
 * Les Amis de Montety — Cloudflare Worker
 * Sert le site statique (binding ASSETS) et expose l'API (/api/*) adossée à D1 (binding DB).
 *
 * Sécurité :
 *  - mots de passe administrateurs hachés en PBKDF2-SHA256 (jamais stockés en clair) ;
 *  - sessions signées HMAC-SHA256 dans un cookie HttpOnly/Secure/SameSite=Strict ;
 *  - le secret de signature vit dans la table `settings` (hors dépôt Git).
 */

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const SESSION_COOKIE = 'montety_session';
const SESSION_TTL = 60 * 60 * 8; // 8 h

/* ----------------------------- utilitaires ----------------------------- */
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}
function isValidEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;
}
function clean(v, max = 1000) {
  return (typeof v === 'string' ? v : '').trim().slice(0, max);
}
function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function b64urlEncode(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return decodeURIComponent(escape(atob(str)));
}

async function pbkdf2Hex(password, saltHex, iterations) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations, hash: 'SHA-256' }, key, 256);
  return bytesToHex(new Uint8Array(bits));
}
async function hmacHex(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

/* ----------------------------- sessions ----------------------------- */
async function getSessionSecret(env) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'session_secret'`).first();
  return row && row.value ? row.value : null;
}
async function makeSession(env, admin) {
  const secret = await getSessionSecret(env);
  if (!secret) throw new Error('session_secret manquant');
  const payload = b64urlEncode(JSON.stringify({
    email: admin.email, name: admin.name, exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
  }));
  const sig = await hmacHex(payload, secret);
  return `${payload}.${sig}`;
}
async function readSession(env, request) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp('(?:^|;\\s*)' + SESSION_COOKIE + '=([^;]+)'));
  if (!m) return null;
  const token = m[1];
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot), sig = token.slice(dot + 1);
  const secret = await getSessionSecret(env);
  if (!secret) return null;
  const expected = await hmacHex(payload, secret);
  if (!timingSafeEqual(sig, expected)) return null;
  let data;
  try { data = JSON.parse(b64urlDecode(payload)); } catch { return null; }
  if (!data || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
  return data;
}
function sessionCookie(token, maxAge) {
  const parts = [
    `${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict',
    `Max-Age=${maxAge}`,
  ];
  return parts.join('; ');
}

/* ----------------------------- routeur ----------------------------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        return json({ error: 'Erreur serveur', detail: String(err && err.message || err) }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleApi(request, env, url) {
  const path = url.pathname;
  const method = request.method.toUpperCase();

  /* ===================== API publique ===================== */

  // Configuration publique (liens HelloAsso, e-mail de contact)
  if (path === '/api/config' && method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT key, value FROM settings WHERE key IN
       ('helloasso_membership_url','helloasso_donation_url','contact_email')`).all();
    const cfg = {};
    (rows.results || []).forEach(r => { cfg[r.key] = r.value; });
    return json({
      membershipUrl: cfg.helloasso_membership_url || '',
      donationUrl: cfg.helloasso_donation_url || '',
      contactEmail: cfg.contact_email || 'bonjour@amisdemontety.fr',
    });
  }

  // Agenda public
  if (path === '/api/events' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT id, title, cat, tone, free, "when", descr, location, starts_at
         FROM events WHERE published = 1
        ORDER BY (starts_at IS NULL), starts_at ASC, id ASC`).all();
    return json(results || []);
  }

  // Message de contact
  if (path === '/api/contact' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const name = clean(b.name, 120), email = clean(b.email, 254);
    const subject = clean(b.subject, 200), message = clean(b.message, 4000);
    if (!name || !isValidEmail(email) || !message)
      return json({ error: 'Nom, e-mail valide et message sont requis.' }, 400);
    await env.DB.prepare(
      `INSERT INTO contact_messages (name, email, subject, message) VALUES (?,?,?,?)`)
      .bind(name, email, subject, message).run();
    return json({ ok: true });
  }

  // Demande d'adhésion
  if (path === '/api/membership' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const prenom = clean(b.prenom, 120), nom = clean(b.nom, 120), email = clean(b.email, 254);
    const rue = clean(b.rue, 200), message = clean(b.message, 2000);
    if (!prenom || !nom || !isValidEmail(email))
      return json({ error: 'Prénom, nom et e-mail valide sont requis.' }, 400);
    await env.DB.prepare(
      `INSERT INTO memberships (prenom, nom, email, rue, message) VALUES (?,?,?,?,?)`)
      .bind(prenom, nom, email, rue, message).run();
    return json({ ok: true });
  }

  // Entraide — petites annonces publiques
  if (path === '/api/listings' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT id, type, category, title, description, author_name, contact, area, created_at
         FROM listings WHERE status = 'published'
        ORDER BY created_at DESC, id DESC`).all();
    return json(results || []);
  }
  if (path === '/api/listings' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    if (clean(b.website)) return json({ ok: true }); // pot de miel anti-robot
    const type = (b.type === 'offre' || b.type === 'demande') ? b.type : '';
    const title = clean(b.title, 120), description = clean(b.description, 2000);
    const author = clean(b.author_name, 120), contact = clean(b.contact, 200);
    const category = clean(b.category, 60), area = clean(b.area, 120);
    if (!type || !title || !description || !author || !contact)
      return json({ error: 'Type, titre, description, nom et contact sont requis.' }, 400);
    await env.DB.prepare(
      `INSERT INTO listings (type, category, title, description, author_name, contact, area, status)
       VALUES (?,?,?,?,?,?,?, 'published')`)
      .bind(type, category, title, description, author, contact, area).run();
    return json({ ok: true });
  }

  /* ===================== Authentification ===================== */

  if (path === '/api/admin/login' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const email = clean(b.email, 254).toLowerCase(), password = clean(b.password, 200);
    const admin = await env.DB.prepare(
      `SELECT email, name, pass_hash, pass_salt, pass_iter FROM admins WHERE lower(email) = ?`)
      .bind(email).first();
    // calcul systématique pour limiter l'attaque temporelle, même si le compte n'existe pas
    const salt = admin ? admin.pass_salt : '00000000000000000000000000000000';
    const iter = admin ? admin.pass_iter : 100000;
    const computed = await pbkdf2Hex(password, salt, iter);
    if (!admin || !timingSafeEqual(computed, admin.pass_hash))
      return json({ error: 'E-mail ou mot de passe incorrect.' }, 401);
    const token = await makeSession(env, admin);
    return json({ ok: true, name: admin.name, email: admin.email }, 200,
      { 'Set-Cookie': sessionCookie(token, SESSION_TTL) });
  }

  if (path === '/api/admin/logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
  }

  if (path === '/api/admin/me' && method === 'GET') {
    const s = await readSession(env, request);
    if (!s) return json({ error: 'Non authentifié' }, 401);
    return json({ email: s.email, name: s.name });
  }

  // Initialisation (uniquement si aucun admin n'existe encore)
  if (path === '/api/admin/setup' && method === 'POST') {
    const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM admins`).first();
    if (count && count.n > 0) return json({ error: 'Déjà initialisé.' }, 409);
    const b = await request.json().catch(() => ({}));
    const email = clean(b.email, 254).toLowerCase(), name = clean(b.name, 120) || 'Administrateur';
    const password = clean(b.password, 200);
    if (!isValidEmail(email) || password.length < 8)
      return json({ error: 'E-mail valide et mot de passe de 8 caractères minimum requis.' }, 400);
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const salt = bytesToHex(saltBytes), iter = 100000;
    const hash = await pbkdf2Hex(password, salt, iter);
    await env.DB.prepare(`INSERT INTO admins (email, name, pass_hash, pass_salt, pass_iter) VALUES (?,?,?,?,?)`)
      .bind(email, name, hash, salt, iter).run();
    const secret = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('session_secret', ?)`)
      .bind(secret).run();
    return json({ ok: true });
  }

  /* ===================== API admin (protégée) ===================== */
  if (path.startsWith('/api/admin/')) {
    const session = await readSession(env, request);
    if (!session) return json({ error: 'Non authentifié' }, 401);
    return handleAdmin(request, env, url, method, session);
  }

  return json({ error: 'Route inconnue' }, 404);
}

async function handleAdmin(request, env, url, method, session) {
  const path = url.pathname;

  // Changement de mot de passe
  if (path === '/api/admin/change-password' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const current = clean(b.current, 200), next = clean(b.next, 200);
    if (next.length < 8) return json({ error: 'Le nouveau mot de passe doit faire 8 caractères minimum.' }, 400);
    const admin = await env.DB.prepare(
      `SELECT email, pass_hash, pass_salt, pass_iter FROM admins WHERE lower(email) = ?`)
      .bind(session.email.toLowerCase()).first();
    if (!admin) return json({ error: 'Compte introuvable.' }, 404);
    const computed = await pbkdf2Hex(current, admin.pass_salt, admin.pass_iter);
    if (!timingSafeEqual(computed, admin.pass_hash))
      return json({ error: 'Mot de passe actuel incorrect.' }, 401);
    const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16))), iter = 100000;
    const hash = await pbkdf2Hex(next, salt, iter);
    await env.DB.prepare(`UPDATE admins SET pass_hash=?, pass_salt=?, pass_iter=? WHERE lower(email)=?`)
      .bind(hash, salt, iter, session.email.toLowerCase()).run();
    return json({ ok: true });
  }

  // Statistiques du tableau de bord
  if (path === '/api/admin/stats' && method === 'GET') {
    const pending = await env.DB.prepare(`SELECT COUNT(*) AS n FROM memberships WHERE status='pending'`).first();
    const unread = await env.DB.prepare(`SELECT COUNT(*) AS n FROM contact_messages WHERE read=0`).first();
    const upcoming = await env.DB.prepare(`SELECT COUNT(*) AS n FROM events WHERE published=1`).first();
    const donTotal = await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS s, COUNT(*) AS n FROM donations`).first();
    const membersOk = await env.DB.prepare(`SELECT COUNT(*) AS n FROM memberships WHERE status='accepted'`).first();
    return json({
      pendingMemberships: pending.n, unreadMessages: unread.n, publishedEvents: upcoming.n,
      acceptedMembers: membersOk.n, donationsTotal: donTotal.s, donationsCount: donTotal.n,
    });
  }

  // Paramètres (liens HelloAsso, e-mail de contact)
  if (path === '/api/admin/settings' && method === 'GET') {
    const rows = await env.DB.prepare(`SELECT key, value FROM settings WHERE key LIKE 'helloasso_%' OR key='contact_email'`).all();
    const cfg = {};
    (rows.results || []).forEach(r => { cfg[r.key] = r.value; });
    return json(cfg);
  }
  if (path === '/api/admin/settings' && method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    const allowed = ['helloasso_membership_url', 'helloasso_donation_url', 'contact_email'];
    for (const k of allowed) {
      if (k in b) {
        await env.DB.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?,?,datetime('now'))`)
          .bind(k, clean(b[k], 500)).run();
      }
    }
    return json({ ok: true });
  }

  /* ----- Événements (CRUD) ----- */
  if (path === '/api/admin/events' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM events ORDER BY (starts_at IS NULL), starts_at ASC, id ASC`).all();
    return json(results || []);
  }
  if (path === '/api/admin/events' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const err = validateEvent(b);
    if (err) return json({ error: err }, 400);
    const r = await env.DB.prepare(
      `INSERT INTO events (title, cat, tone, free, "when", descr, location, starts_at, published)
       VALUES (?,?,?,?,?,?,?,?,?)`).bind(
      clean(b.title, 200), clean(b.cat, 40), clean(b.tone, 20) || null,
      b.free ? 1 : 0, clean(b.when, 80), clean(b.descr, 2000), clean(b.location, 200) || null,
      clean(b.starts_at, 40) || null, b.published === 0 ? 0 : 1).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }
  const evMatch = path.match(/^\/api\/admin\/events\/(\d+)$/);
  if (evMatch && method === 'PUT') {
    const id = Number(evMatch[1]);
    const b = await request.json().catch(() => ({}));
    const err = validateEvent(b);
    if (err) return json({ error: err }, 400);
    await env.DB.prepare(
      `UPDATE events SET title=?, cat=?, tone=?, free=?, "when"=?, descr=?, location=?, starts_at=?, published=? WHERE id=?`)
      .bind(clean(b.title, 200), clean(b.cat, 40), clean(b.tone, 20) || null, b.free ? 1 : 0,
        clean(b.when, 80), clean(b.descr, 2000), clean(b.location, 200) || null,
        clean(b.starts_at, 40) || null, b.published === 0 ? 0 : 1, id).run();
    return json({ ok: true });
  }
  if (evMatch && method === 'DELETE') {
    await env.DB.prepare(`DELETE FROM events WHERE id=?`).bind(Number(evMatch[1])).run();
    return json({ ok: true });
  }

  /* ----- Adhésions ----- */
  if (path === '/api/admin/memberships' && method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT * FROM memberships ORDER BY created_at DESC, id DESC`).all();
    return json(results || []);
  }
  const memMatch = path.match(/^\/api\/admin\/memberships\/(\d+)$/);
  if (memMatch && method === 'PATCH') {
    const b = await request.json().catch(() => ({}));
    const status = ['pending', 'accepted', 'declined'].includes(b.status) ? b.status : 'pending';
    await env.DB.prepare(`UPDATE memberships SET status=? WHERE id=?`).bind(status, Number(memMatch[1])).run();
    return json({ ok: true });
  }
  if (memMatch && method === 'DELETE') {
    await env.DB.prepare(`DELETE FROM memberships WHERE id=?`).bind(Number(memMatch[1])).run();
    return json({ ok: true });
  }

  /* ----- Messages ----- */
  if (path === '/api/admin/messages' && method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT * FROM contact_messages ORDER BY created_at DESC, id DESC`).all();
    return json(results || []);
  }
  const msgMatch = path.match(/^\/api\/admin\/messages\/(\d+)$/);
  if (msgMatch && method === 'PATCH') {
    const b = await request.json().catch(() => ({}));
    await env.DB.prepare(`UPDATE contact_messages SET read=? WHERE id=?`).bind(b.read ? 1 : 0, Number(msgMatch[1])).run();
    return json({ ok: true });
  }
  if (msgMatch && method === 'DELETE') {
    await env.DB.prepare(`DELETE FROM contact_messages WHERE id=?`).bind(Number(msgMatch[1])).run();
    return json({ ok: true });
  }

  /* ----- Dons ----- */
  if (path === '/api/admin/donations' && method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT * FROM donations ORDER BY donated_at DESC, id DESC`).all();
    return json(results || []);
  }
  if (path === '/api/admin/donations' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const amount = Number(b.amount);
    if (!(amount > 0)) return json({ error: 'Montant invalide.' }, 400);
    const method2 = ['helloasso', 'cheque', 'virement', 'especes'].includes(b.method) ? b.method : 'helloasso';
    await env.DB.prepare(
      `INSERT INTO donations (donor, email, amount, method, note, donated_at) VALUES (?,?,?,?,?,?)`)
      .bind(clean(b.donor, 160), clean(b.email, 254), amount, method2, clean(b.note, 500),
        clean(b.donated_at, 40) || new Date().toISOString().slice(0, 10)).run();
    return json({ ok: true });
  }
  const donMatch = path.match(/^\/api\/admin\/donations\/(\d+)$/);
  if (donMatch && method === 'DELETE') {
    await env.DB.prepare(`DELETE FROM donations WHERE id=?`).bind(Number(donMatch[1])).run();
    return json({ ok: true });
  }

  /* ----- Entraide (modération des annonces) ----- */
  if (path === '/api/admin/listings' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM listings ORDER BY created_at DESC, id DESC`).all();
    return json(results || []);
  }
  const lstMatch = path.match(/^\/api\/admin\/listings\/(\d+)$/);
  if (lstMatch && method === 'PATCH') {
    const b = await request.json().catch(() => ({}));
    const status = ['published', 'pending', 'hidden'].includes(b.status) ? b.status : 'published';
    await env.DB.prepare(`UPDATE listings SET status=? WHERE id=?`).bind(status, Number(lstMatch[1])).run();
    return json({ ok: true });
  }
  if (lstMatch && method === 'DELETE') {
    await env.DB.prepare(`DELETE FROM listings WHERE id=?`).bind(Number(lstMatch[1])).run();
    return json({ ok: true });
  }

  return json({ error: 'Route inconnue' }, 404);
}

function validateEvent(b) {
  if (!clean(b.title)) return 'Le titre est requis.';
  if (!clean(b.cat)) return 'La catégorie est requise.';
  return null;
}
