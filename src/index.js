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

/* ----------------------------- sessions commerçant ----------------------------- */
const MERCHANT_COOKIE = 'montety_merchant';
async function makeMerchantSession(env, merchant) {
  const secret = await getSessionSecret(env);
  if (!secret) throw new Error('session_secret manquant');
  const payload = b64urlEncode(JSON.stringify({
    mid: merchant.id, slug: merchant.slug, name: merchant.name, role: 'merchant',
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
  }));
  const sig = await hmacHex(payload, secret);
  return `${payload}.${sig}`;
}
async function readMerchantSession(env, request) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp('(?:^|;\\s*)' + MERCHANT_COOKIE + '=([^;]+)'));
  if (!m) return null;
  const token = m[1], dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot), sig = token.slice(dot + 1);
  const secret = await getSessionSecret(env);
  if (!secret) return null;
  if (!timingSafeEqual(sig, await hmacHex(payload, secret))) return null;
  let data;
  try { data = JSON.parse(b64urlDecode(payload)); } catch { return null; }
  if (!data || data.role !== 'merchant' || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
  return data;
}
function merchantCookie(token, maxAge) {
  return [`${MERCHANT_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict', `Max-Age=${maxAge}`].join('; ');
}

/* ----------------------------- routeur ----------------------------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/img/')) return serveImage(env, url);
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

/* ----------------------------- images (KV) ----------------------------- */
async function serveImage(env, url) {
  const key = decodeURIComponent(url.pathname.slice('/img/'.length));
  if (!key) return new Response('Not found', { status: 404 });
  const { value, metadata } = await env.MEDIA.getWithMetadata(key, { type: 'arrayBuffer' });
  if (!value) return new Response('Not found', { status: 404 });
  return new Response(value, {
    headers: {
      'Content-Type': (metadata && metadata.ct) || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
async function handleUpload(request, env, prefix) {
  const form = await request.formData().catch(() => null);
  const file = form && form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'Aucun fichier reçu.' }, 400);
  const type = file.type || '';
  if (!/^image\/(jpeg|png|webp|gif)$/.test(type) && type !== 'application/pdf')
    return json({ error: 'Format accepté : JPEG, PNG, WebP, GIF ou PDF.' }, 400);
  const buf = await file.arrayBuffer();
  if (buf.byteLength > 8 * 1024 * 1024) return json({ error: 'Fichier trop lourd (8 Mo maximum).' }, 400);
  const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' })[type];
  const key = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await env.MEDIA.put(key, buf, { metadata: { ct: type } });
  return json({ ok: true, key, url: '/img/' + key });
}

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
      `SELECT id, title, cat, tone, free, "when", descr, location, starts_at, recur
         FROM events WHERE published = 1 AND reserved = 0
        ORDER BY (starts_at IS NULL), starts_at ASC, id ASC`).all();
    return json(results || []);
  }
  // Export iCalendar (agenda public, hors événements réservés)
  if (path === '/api/events.ics' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM events WHERE published = 1 AND reserved = 0 AND starts_at IS NOT NULL`).all();
    return icsResponse(results || [], 'Agenda — Les Amis de Montety');
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
    try { await sendTemplatedMail(env, email, 'contact_ack', { name: escapeHtmlMail(name) }, 'Message bien reçu'); } catch (_) {}
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
    try { await sendTemplatedMail(env, email, 'membership_welcome', { name: escapeHtmlMail(prenom) }, 'Bienvenue chez Les Amis de Montety'); } catch (_) {}
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

  // Commerçants — vitrine publique
  if (path === '/api/merchants' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT id, name, type, slug, description, address, phone, photo_key FROM merchants WHERE active = 1 ORDER BY name`).all();
    return json(results || []);
  }
  // Fiche détaillée d'un commerçant (par identifiant)
  const merPub = path.match(/^\/api\/merchants\/([a-z0-9-]+)$/);
  if (merPub && method === 'GET') {
    const m = await env.DB.prepare(
      `SELECT id, name, type, slug, description, address, phone, photo_key FROM merchants WHERE slug = ? AND active = 1`)
      .bind(merPub[1]).first();
    if (!m) return json({ error: 'Commerçant introuvable' }, 404);
    const products = (await env.DB.prepare(
      `SELECT id, name, description, price, photo_key FROM products WHERE merchant_id = ? ORDER BY sort, id`).bind(m.id).all()).results || [];
    const posts = (await env.DB.prepare(
      `SELECT id, kind, title, body, price, available_until, created_at FROM merchant_posts
        WHERE merchant_id = ? AND status = 'published' ORDER BY created_at DESC, id DESC`).bind(m.id).all()).results || [];
    return json({ merchant: m, products, posts });
  }
  if (path === '/api/merchant-posts' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT p.id, p.merchant_id, p.kind, p.title, p.body, p.price, p.available_until, p.created_at,
              m.name AS merchant_name, m.type AS merchant_type
         FROM merchant_posts p JOIN merchants m ON m.id = p.merchant_id
        WHERE p.status = 'published' AND m.active = 1
        ORDER BY p.created_at DESC, p.id DESC`).all();
    return json(results || []);
  }

  /* ===================== Espace commerçant ===================== */
  if (path === '/api/merchant/login' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const login = clean(b.login, 80).toLowerCase(), password = clean(b.password, 200);
    const mer = await env.DB.prepare(
      `SELECT id, name, slug, pass_hash, pass_salt, pass_iter, active FROM merchants WHERE lower(slug) = ?`).bind(login).first();
    const salt = mer ? mer.pass_salt : '00000000000000000000000000000000';
    const iter = mer ? mer.pass_iter : 100000;
    const computed = await pbkdf2Hex(password, salt, iter);
    if (!mer || !mer.active || !timingSafeEqual(computed, mer.pass_hash))
      return json({ error: 'Identifiant ou mot de passe incorrect.' }, 401);
    const token = await makeMerchantSession(env, mer);
    return json({ ok: true, name: mer.name, slug: mer.slug }, 200, { 'Set-Cookie': merchantCookie(token, SESSION_TTL) });
  }
  if (path === '/api/merchant/logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': merchantCookie('', 0) });
  }
  if (path.startsWith('/api/merchant/')) {
    const ms = await readMerchantSession(env, request);
    if (!ms) return json({ error: 'Non authentifié' }, 401);
    return handleMerchant(request, env, url, method, ms);
  }

  /* ===================== Mot de passe (jetons publics) ===================== */
  if (path === '/api/auth/forgot' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const email = clean(b.email, 254).toLowerCase();
    const admin = await env.DB.prepare(`SELECT id, email, name FROM admins WHERE lower(email)=?`).bind(email).first();
    if (admin) { try { await sendSetPasswordMail(env, admin, 'reset', url.origin); } catch (_) {} }
    return json({ ok: true });
  }
  if (path === '/api/auth/validate-token' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const t = await env.DB.prepare(
      `SELECT t.used, t.expires_at, t.kind, a.name FROM auth_tokens t JOIN admins a ON a.id=t.admin_id WHERE t.token_hash=?`)
      .bind(await sha256Hex(clean(b.token, 200))).first();
    if (!t || t.used || new Date(t.expires_at) < new Date()) return json({ valid: false });
    return json({ valid: true, name: t.name, kind: t.kind });
  }
  if (path === '/api/auth/set-password' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const password = clean(b.password, 200);
    if (password.length < 8) return json({ error: 'Mot de passe : 8 caractères minimum.' }, 400);
    const t = await env.DB.prepare(`SELECT * FROM auth_tokens WHERE token_hash=?`).bind(await sha256Hex(clean(b.token, 200))).first();
    if (!t || t.used || new Date(t.expires_at) < new Date()) return json({ error: 'Lien invalide ou expiré.' }, 400);
    const { hash, salt, iter } = await hashPassword(password);
    await env.DB.prepare(`UPDATE admins SET pass_hash=?, pass_salt=?, pass_iter=? WHERE id=?`).bind(hash, salt, iter, t.admin_id).run();
    await env.DB.prepare(`UPDATE auth_tokens SET used=1 WHERE id=?`).bind(t.id).run();
    await env.DB.prepare(`DELETE FROM auth_tokens WHERE admin_id=? AND used=0`).bind(t.admin_id).run();
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
    const rows = await env.DB.prepare(`SELECT key, value FROM settings WHERE key LIKE 'helloasso_%' OR key IN ('contact_email','mail_from','resend_api_key','plan_lieu_key')`).all();
    const cfg = {};
    (rows.results || []).forEach(r => { cfg[r.key] = r.value; });
    cfg.resend_configured = !!cfg.resend_api_key;
    delete cfg.resend_api_key;
    return json(cfg);
  }
  if (path === '/api/admin/settings' && method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    const allowed = ['helloasso_membership_url', 'helloasso_donation_url', 'contact_email', 'mail_from', 'resend_api_key', 'plan_lieu_key'];
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
  // Export iCalendar admin (inclut les événements réservés)
  if (path === '/api/admin/events.ics' && method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT * FROM events WHERE starts_at IS NOT NULL`).all();
    return icsResponse(results || [], 'Agenda complet — Les Amis de Montety');
  }
  if (path === '/api/admin/events' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const err = validateEvent(b);
    if (err) return json({ error: err }, 400);
    const r = await env.DB.prepare(
      `INSERT INTO events (title, cat, tone, free, "when", descr, location, starts_at, published, reserved, recur)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
      clean(b.title, 200), clean(b.cat, 40), clean(b.tone, 20) || null,
      b.free ? 1 : 0, clean(b.when, 80), clean(b.descr, 2000), clean(b.location, 200) || null,
      clean(b.starts_at, 40) || null, b.published === 0 ? 0 : 1, b.reserved ? 1 : 0,
      ['weekly', 'monthly'].includes(b.recur) ? b.recur : null).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }
  const evMatch = path.match(/^\/api\/admin\/events\/(\d+)$/);
  if (evMatch && method === 'PUT') {
    const id = Number(evMatch[1]);
    const b = await request.json().catch(() => ({}));
    const err = validateEvent(b);
    if (err) return json({ error: err }, 400);
    await env.DB.prepare(
      `UPDATE events SET title=?, cat=?, tone=?, free=?, "when"=?, descr=?, location=?, starts_at=?, published=?, reserved=?, recur=? WHERE id=?`)
      .bind(clean(b.title, 200), clean(b.cat, 40), clean(b.tone, 20) || null, b.free ? 1 : 0,
        clean(b.when, 80), clean(b.descr, 2000), clean(b.location, 200) || null,
        clean(b.starts_at, 40) || null, b.published === 0 ? 0 : 1, b.reserved ? 1 : 0,
        ['weekly', 'monthly'].includes(b.recur) ? b.recur : null, id).run();
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
    const id = Number(memMatch[1]);
    const b = await request.json().catch(() => ({}));
    if (b.status && ['pending', 'accepted', 'declined'].includes(b.status))
      await env.DB.prepare(`UPDATE memberships SET status=? WHERE id=?`).bind(b.status, id).run();
    if ('amount' in b || 'pay_method' in b || 'paid' in b) {
      const amount = (b.amount === null || b.amount === '' || b.amount === undefined) ? null : Number(b.amount);
      const pm = ['especes', 'cheque', 'virement', 'helloasso', 'cb'].includes(b.pay_method) ? b.pay_method : null;
      const paid = b.paid ? 1 : 0;
      await env.DB.prepare(`UPDATE memberships SET amount=?, pay_method=?, paid=?, paid_at=? WHERE id=?`)
        .bind(amount, pm, paid, paid ? (clean(b.paid_at, 40) || new Date().toISOString().slice(0, 10)) : null, id).run();
      await syncMembershipEntry(env, id);
    }
    return json({ ok: true });
  }
  if (memMatch && method === 'DELETE') {
    await deleteSourceEntry(env, 'membership', Number(memMatch[1]));
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
    const dr = await env.DB.prepare(
      `INSERT INTO donations (donor, email, amount, method, note, donated_at) VALUES (?,?,?,?,?,?)`)
      .bind(clean(b.donor, 160), clean(b.email, 254), amount, method2, clean(b.note, 500),
        clean(b.donated_at, 40) || new Date().toISOString().slice(0, 10)).run();
    await syncDonationEntry(env, dr.meta.last_row_id);
    return json({ ok: true });
  }
  const donMatch = path.match(/^\/api\/admin\/donations\/(\d+)$/);
  if (donMatch && method === 'DELETE') {
    await deleteSourceEntry(env, 'donation', Number(donMatch[1]));
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

  /* ----- Commerçants (comptes) ----- */
  if (path === '/api/admin/merchants' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT m.id, m.name, m.type, m.slug, m.description, m.address, m.phone, m.active, m.created_at,
              (SELECT COUNT(*) FROM merchant_posts p WHERE p.merchant_id = m.id) AS post_count
         FROM merchants m ORDER BY m.name`).all();
    return json(results || []);
  }
  if (path === '/api/admin/merchants' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const name = clean(b.name, 120), type = clean(b.type, 40);
    const slug = slugify(b.slug || b.name), password = clean(b.password, 200);
    if (!name || !type || !slug) return json({ error: 'Nom, type et identifiant sont requis.' }, 400);
    if (password.length < 6) return json({ error: 'Mot de passe : 6 caractères minimum.' }, 400);
    const exists = await env.DB.prepare(`SELECT id FROM merchants WHERE slug = ?`).bind(slug).first();
    if (exists) return json({ error: 'Cet identifiant est déjà pris.' }, 409);
    const { hash, salt, iter } = await hashPassword(password);
    const r = await env.DB.prepare(
      `INSERT INTO merchants (name, type, slug, description, address, phone, pass_hash, pass_salt, pass_iter, active)
       VALUES (?,?,?,?,?,?,?,?,?,1)`).bind(
      name, type, slug, clean(b.description, 1000), clean(b.address, 200), clean(b.phone, 40), hash, salt, iter).run();
    return json({ ok: true, id: r.meta.last_row_id, slug });
  }
  if (path === '/api/admin/upload' && method === 'POST') {
    return handleUpload(request, env, 'admin');
  }
  const merMatch = path.match(/^\/api\/admin\/merchants\/(\d+)$/);
  if (merMatch && method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    const name = clean(b.name, 120), type = clean(b.type, 40);
    if (!name || !type) return json({ error: 'Nom et type requis.' }, 400);
    await env.DB.prepare(
      `UPDATE merchants SET name=?, type=?, description=?, address=?, phone=?, active=?, photo_key=COALESCE(?, photo_key) WHERE id=?`).bind(
      name, type, clean(b.description, 1000), clean(b.address, 200), clean(b.phone, 40),
      b.active === 0 ? 0 : 1, b.photo_key === undefined ? null : (clean(b.photo_key, 200) || null), Number(merMatch[1])).run();
    return json({ ok: true });
  }
  if (merMatch && method === 'DELETE') {
    const id = Number(merMatch[1]);
    await env.DB.prepare(`DELETE FROM merchant_posts WHERE merchant_id = ?`).bind(id).run();
    await env.DB.prepare(`DELETE FROM merchants WHERE id = ?`).bind(id).run();
    return json({ ok: true });
  }
  const merPwMatch = path.match(/^\/api\/admin\/merchants\/(\d+)\/password$/);
  if (merPwMatch && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const password = clean(b.password, 200);
    if (password.length < 6) return json({ error: 'Mot de passe : 6 caractères minimum.' }, 400);
    const { hash, salt, iter } = await hashPassword(password);
    await env.DB.prepare(`UPDATE merchants SET pass_hash=?, pass_salt=?, pass_iter=? WHERE id=?`)
      .bind(hash, salt, iter, Number(merPwMatch[1])).run();
    return json({ ok: true });
  }

  /* ----- Commerçants (modération des annonces) ----- */
  if (path === '/api/admin/merchant-posts' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT p.*, m.name AS merchant_name FROM merchant_posts p JOIN merchants m ON m.id = p.merchant_id
        ORDER BY p.created_at DESC, p.id DESC`).all();
    return json(results || []);
  }
  const mpMatch = path.match(/^\/api\/admin\/merchant-posts\/(\d+)$/);
  if (mpMatch && method === 'PATCH') {
    const b = await request.json().catch(() => ({}));
    const status = ['published', 'hidden'].includes(b.status) ? b.status : 'published';
    await env.DB.prepare(`UPDATE merchant_posts SET status=? WHERE id=?`).bind(status, Number(mpMatch[1])).run();
    return json({ ok: true });
  }
  if (mpMatch && method === 'DELETE') {
    await env.DB.prepare(`DELETE FROM merchant_posts WHERE id=?`).bind(Number(mpMatch[1])).run();
    return json({ ok: true });
  }

  /* ----- Administrateurs (comptes & mots de passe) ----- */
  if (path === '/api/admin/admins' && method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT id, email, name, created_at FROM admins ORDER BY name`).all();
    return json((results || []).map(a => ({ ...a, me: a.email.toLowerCase() === session.email.toLowerCase() })));
  }
  if (path === '/api/admin/admins' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const email = clean(b.email, 254).toLowerCase(), name = clean(b.name, 120);
    if (!isValidEmail(email) || !name) return json({ error: 'E-mail valide et nom requis.' }, 400);
    const exists = await env.DB.prepare(`SELECT id FROM admins WHERE lower(email) = ?`).bind(email).first();
    if (exists) return json({ error: 'Un administrateur avec cet e-mail existe déjà.' }, 409);
    // mot de passe aléatoire inutilisable : le compte s'active uniquement par le lien d'invitation
    const { hash, salt, iter } = await hashPassword(bytesToHex(crypto.getRandomValues(new Uint8Array(24))));
    const r = await env.DB.prepare(`INSERT INTO admins (email, name, pass_hash, pass_salt, pass_iter) VALUES (?,?,?,?,?)`)
      .bind(email, name, hash, salt, iter).run();
    try {
      await sendSetPasswordMail(env, { id: r.meta.last_row_id, email, name }, 'invite', url.origin);
      return json({ ok: true, emailed: true });
    } catch (e) {
      return json({ ok: true, emailed: false, warning: String(e.message || e) });
    }
  }
  const adMatch = path.match(/^\/api\/admin\/admins\/(\d+)$/);
  if (adMatch && method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    const name = clean(b.name, 120);
    if (!name) return json({ error: 'Nom requis.' }, 400);
    await env.DB.prepare(`UPDATE admins SET name=? WHERE id=?`).bind(name, Number(adMatch[1])).run();
    return json({ ok: true });
  }
  if (adMatch && method === 'DELETE') {
    const target = await env.DB.prepare(`SELECT email FROM admins WHERE id=?`).bind(Number(adMatch[1])).first();
    if (!target) return json({ error: 'Compte introuvable.' }, 404);
    if (target.email.toLowerCase() === session.email.toLowerCase())
      return json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' }, 400);
    const cnt = await env.DB.prepare(`SELECT COUNT(*) AS n FROM admins`).first();
    if (cnt.n <= 1) return json({ error: 'Au moins un administrateur doit rester.' }, 400);
    await env.DB.prepare(`DELETE FROM admins WHERE id=?`).bind(Number(adMatch[1])).run();
    return json({ ok: true });
  }
  // Réinitialisation : envoie un lien à l'administrateur concerné (personne ne choisit son mot de passe)
  const adReset = path.match(/^\/api\/admin\/admins\/(\d+)\/reset$/);
  if (adReset && method === 'POST') {
    const a = await env.DB.prepare(`SELECT id, email, name FROM admins WHERE id=?`).bind(Number(adReset[1])).first();
    if (!a) return json({ error: 'Compte introuvable.' }, 404);
    try { await sendSetPasswordMail(env, a, 'reset', url.origin); return json({ ok: true, emailed: true }); }
    catch (e) { return json({ error: String(e.message || e) }, 502); }
  }

  /* ----- Comptabilité : plan de comptes ----- */
  if (path === '/api/admin/accounting/accounts' && method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT * FROM accounts WHERE archived=0 ORDER BY code`).all();
    return json(results || []);
  }
  if (path === '/api/admin/accounting/accounts' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const code = clean(b.code, 20), name = clean(b.name, 160), klass = parseInt(b.klass, 10);
    const type = ['actif', 'passif', 'charge', 'produit'].includes(b.type) ? b.type : null;
    if (!code || !name || !(klass >= 1 && klass <= 7) || !type) return json({ error: 'Code, libellé, classe (1-7) et type requis.' }, 400);
    const ex = await env.DB.prepare(`SELECT id FROM accounts WHERE code=?`).bind(code).first();
    if (ex) return json({ error: 'Ce numéro de compte existe déjà.' }, 409);
    await env.DB.prepare(`INSERT INTO accounts (code, name, klass, type) VALUES (?,?,?,?)`).bind(code, name, klass, type).run();
    return json({ ok: true });
  }
  const accMatch = path.match(/^\/api\/admin\/accounting\/accounts\/(\d+)$/);
  if (accMatch && method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    const name = clean(b.name, 160);
    if (!name) return json({ error: 'Libellé requis.' }, 400);
    await env.DB.prepare(`UPDATE accounts SET name=? WHERE id=?`).bind(name, Number(accMatch[1])).run();
    return json({ ok: true });
  }
  if (accMatch && method === 'DELETE') {
    const used = await env.DB.prepare(`SELECT COUNT(*) AS n FROM journal_lines WHERE account_id=?`).bind(Number(accMatch[1])).first();
    if (used.n > 0) return json({ error: 'Compte utilisé dans des écritures : archivez-le plutôt.' }, 400);
    await env.DB.prepare(`DELETE FROM accounts WHERE id=?`).bind(Number(accMatch[1])).run();
    return json({ ok: true });
  }

  /* ----- Comptabilité : écritures ----- */
  if (path === '/api/admin/accounting/entries' && method === 'GET') {
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    const conds = [], binds = [];
    if (from) { conds.push('e.edate >= ?'); binds.push(from); }
    if (to) { conds.push('e.edate <= ?'); binds.push(to); }
    const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
    const entries = (await env.DB.prepare(
      `SELECT id, edate, label, piece, source FROM journal_entries e${where} ORDER BY e.edate DESC, e.id DESC`).bind(...binds).all()).results || [];
    const lines = (await env.DB.prepare(
      `SELECT l.entry_id, l.account_id, l.debit, l.credit, l.label, a.code AS acode, a.name AS aname
         FROM journal_lines l JOIN accounts a ON a.id = l.account_id`).all()).results || [];
    const by = {};
    lines.forEach(l => { (by[l.entry_id] = by[l.entry_id] || []).push(l); });
    entries.forEach(e => { e.lines = by[e.id] || []; });
    return json(entries);
  }
  if (path === '/api/admin/accounting/entries' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const edate = clean(b.edate, 20), label = clean(b.label, 200);
    const lines = Array.isArray(b.lines) ? b.lines : [];
    if (!edate || !label) return json({ error: 'Date et libellé requis.' }, 400);
    let td = 0, tc = 0;
    const clean_lines = [];
    for (const l of lines) {
      const aid = parseInt(l.account_id, 10); if (!aid) continue;
      const d = Math.round((Number(l.debit) || 0) * 100) / 100, cr = Math.round((Number(l.credit) || 0) * 100) / 100;
      if (d === 0 && cr === 0) continue;
      td += d; tc += cr; clean_lines.push({ account_id: aid, debit: d, credit: cr, label: clean(l.label, 200) || null });
    }
    if (clean_lines.length < 2) return json({ error: 'Une écriture comporte au moins deux lignes.' }, 400);
    if (Math.round(td * 100) !== Math.round(tc * 100)) return json({ error: `Écriture déséquilibrée : débit ${td.toFixed(2)} € ≠ crédit ${tc.toFixed(2)} €.` }, 400);
    if (td === 0) return json({ error: 'Montant nul.' }, 400);
    await createEntry(env, { edate, label, piece: clean(b.piece, 60), source: 'manual', lines: clean_lines });
    return json({ ok: true });
  }
  const entMatch = path.match(/^\/api\/admin\/accounting\/entries\/(\d+)$/);
  if (entMatch && method === 'DELETE') {
    const id = Number(entMatch[1]);
    await env.DB.prepare(`DELETE FROM journal_lines WHERE entry_id=?`).bind(id).run();
    await env.DB.prepare(`DELETE FROM journal_entries WHERE id=?`).bind(id).run();
    return json({ ok: true });
  }

  /* ----- Comptabilité : balance (par compte, sur une période) ----- */
  if (path === '/api/admin/accounting/balance' && method === 'GET') {
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    const conds = [], binds = [];
    if (from) { conds.push('e.edate >= ?'); binds.push(from); }
    if (to) { conds.push('e.edate <= ?'); binds.push(to); }
    const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
    const { results } = await env.DB.prepare(
      `SELECT a.code, a.name, a.klass, a.type,
              COALESCE(SUM(l.debit),0) AS debit, COALESCE(SUM(l.credit),0) AS credit
         FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
         ${where} GROUP BY a.id ORDER BY a.code`).bind(...binds).all();
    return json(results || []);
  }

  /* ----- Comptabilité : export CSV ----- */
  if (path === '/api/admin/accounting/export.csv' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT e.edate, e.label, e.piece, a.code AS acode, a.name AS aname, l.debit, l.credit, l.label AS lline
         FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id JOIN accounts a ON a.id=l.account_id
        ORDER BY e.edate, e.id, l.id`).all();
    const rows = [['Date', 'Écriture', 'Pièce', 'Compte', 'Libellé compte', 'Débit', 'Crédit', 'Détail']];
    (results || []).forEach(r => rows.push([r.edate, r.label, r.piece || '', r.acode, r.aname, r.debit || '', r.credit || '', r.lline || '']));
    const csv = '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="comptabilite-montety.csv"' } });
  }

  /* ----- Lieu de vie : devis ----- */
  if (path === '/api/admin/devis' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM devis ORDER BY (status='a_valider') DESC, created_at DESC, id DESC`).all();
    return json(results || []);
  }
  if (path === '/api/admin/devis' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const title = clean(b.title, 200);
    if (!title) return json({ error: 'Le titre du devis est requis.' }, 400);
    await env.DB.prepare(
      `INSERT INTO devis (title, supplier, lot, amount, description, document_key) VALUES (?,?,?,?,?,?)`)
      .bind(title, clean(b.supplier, 160) || null, clean(b.lot, 80) || null,
        (b.amount === '' || b.amount == null) ? null : Number(b.amount),
        clean(b.description, 2000) || null, clean(b.document_key, 200) || null).run();
    return json({ ok: true });
  }
  if (path === '/api/admin/devis/upload' && method === 'POST') return handleUpload(request, env, 'devis');
  const dvMatch = path.match(/^\/api\/admin\/devis\/(\d+)$/);
  if (dvMatch && method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    const title = clean(b.title, 200);
    if (!title) return json({ error: 'Titre requis.' }, 400);
    await env.DB.prepare(
      `UPDATE devis SET title=?, supplier=?, lot=?, amount=?, description=?, document_key=COALESCE(?, document_key) WHERE id=?`)
      .bind(title, clean(b.supplier, 160) || null, clean(b.lot, 80) || null,
        (b.amount === '' || b.amount == null) ? null : Number(b.amount), clean(b.description, 2000) || null,
        b.document_key === undefined ? null : (clean(b.document_key, 200) || null), Number(dvMatch[1])).run();
    return json({ ok: true });
  }
  if (dvMatch && method === 'DELETE') {
    await env.DB.prepare(`DELETE FROM devis WHERE id=?`).bind(Number(dvMatch[1])).run();
    return json({ ok: true });
  }
  const dvStatus = path.match(/^\/api\/admin\/devis\/(\d+)\/status$/);
  if (dvStatus && method === 'PATCH') {
    const b = await request.json().catch(() => ({}));
    const st = ['a_valider', 'valide', 'refuse'].includes(b.status) ? b.status : 'a_valider';
    await env.DB.prepare(`UPDATE devis SET status=?, decided_at=? WHERE id=?`)
      .bind(st, st === 'a_valider' ? null : new Date().toISOString().slice(0, 10), Number(dvStatus[1])).run();
    return json({ ok: true });
  }
  const dvPos = path.match(/^\/api\/admin\/devis\/(\d+)\/position$/);
  if (dvPos && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const x = (b.plan_x == null) ? null : Number(b.plan_x), y = (b.plan_y == null) ? null : Number(b.plan_y);
    await env.DB.prepare(`UPDATE devis SET plan_x=?, plan_y=? WHERE id=?`).bind(x, y, Number(dvPos[1])).run();
    return json({ ok: true });
  }

  /* ----- Modèles (e-mails & attestation fiscale) ----- */
  if (path === '/api/admin/templates' && method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT key, subject, body FROM templates ORDER BY key`).all();
    return json(results || []);
  }
  const tplMatch = path.match(/^\/api\/admin\/templates\/([a-z_]+)$/);
  if (tplMatch && method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    await env.DB.prepare(`UPDATE templates SET subject=?, body=?, updated_at=datetime('now') WHERE key=?`)
      .bind(clean(b.subject, 200), clean(b.body, 20000), tplMatch[1]).run();
    return json({ ok: true });
  }

  /* ----- Dons : remerciement & reçu fiscal ----- */
  const donThank = path.match(/^\/api\/admin\/donations\/(\d+)\/thank$/);
  if (donThank && method === 'POST') {
    const d = await env.DB.prepare(`SELECT * FROM donations WHERE id=?`).bind(Number(donThank[1])).first();
    if (!d) return json({ error: 'Don introuvable.' }, 404);
    if (!d.email) return json({ error: "Ce don n'a pas d'adresse e-mail." }, 400);
    try {
      await sendTemplatedMail(env, d.email, 'thank_you',
        { name: escapeHtmlMail(d.donor || 'cher donateur'), amount: escapeHtmlMail((Number(d.amount) || 0).toLocaleString('fr-FR') + ' €') }, 'Merci pour votre don');
      return json({ ok: true });
    } catch (e) { return json({ error: String(e.message || e) }, 502); }
  }
  const donAtt = path.match(/^\/api\/admin\/donations\/(\d+)\/attestation$/);
  if (donAtt && method === 'GET') {
    const d = await env.DB.prepare(`SELECT * FROM donations WHERE id=?`).bind(Number(donAtt[1])).first();
    if (!d) return new Response('Don introuvable', { status: 404 });
    const t = await getTemplate(env, 'attestation_don');
    const methodLbl = { especes: 'espèces', cheque: 'chèque', virement: 'virement', helloasso: 'HelloAsso', cb: 'carte' }[d.method] || d.method || 'numéraire';
    const date = (d.donated_at || '').slice(0, 10);
    const vars = {
      receipt_no: 'DON-' + String(d.id).padStart(4, '0'),
      assoc_name: 'Les Amis de Montety',
      assoc_address: (await getSetting(env, 'assoc_address')) || '11 boulevard Commandant Nicolas, 83000 Toulon',
      donor_name: d.donor || 'Anonyme',
      amount: (Number(d.amount) || 0).toLocaleString('fr-FR') + ' €',
      date: date.split('-').reverse().join('/'), method: methodLbl,
      today: new Date().toLocaleDateString('fr-FR'), year: date.slice(0, 4),
    };
    const body = ((t && t.body) || '').replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars) ? String(vars[k]) : m);
    const page = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Reçu fiscal — ${vars.receipt_no}</title><style>body{background:#fff;margin:0;padding:20px}@media print{.noprint{display:none}}</style></head><body>${body}<div class="noprint" style="text-align:center;margin:24px"><button onclick="window.print()" style="padding:10px 20px">Imprimer / Enregistrer en PDF</button></div></body></html>`;
    return new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  return json({ error: 'Route inconnue' }, 404);
}

async function handleMerchant(request, env, url, method, session) {
  const path = url.pathname;
  const mid = session.mid;

  if (path === '/api/merchant/me' && method === 'GET') {
    const m = await env.DB.prepare(
      `SELECT id, name, type, slug, description, address, phone, photo_key FROM merchants WHERE id = ?`).bind(mid).first();
    if (!m) return json({ error: 'Compte introuvable' }, 404);
    return json(m);
  }
  if (path === '/api/merchant/posts' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM merchant_posts WHERE merchant_id = ? ORDER BY created_at DESC, id DESC`).bind(mid).all();
    return json(results || []);
  }
  if (path === '/api/merchant/posts' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const kind = ['annonce', 'invendu', 'promo'].includes(b.kind) ? b.kind : 'annonce';
    const title = clean(b.title, 120), body = clean(b.body, 2000);
    const price = clean(b.price, 60), until = clean(b.available_until, 120);
    if (!title) return json({ error: 'Le titre est requis.' }, 400);
    await env.DB.prepare(
      `INSERT INTO merchant_posts (merchant_id, kind, title, body, price, available_until) VALUES (?,?,?,?,?,?)`)
      .bind(mid, kind, title, body, price || null, until || null).run();
    return json({ ok: true });
  }
  const pMatch = path.match(/^\/api\/merchant\/posts\/(\d+)$/);
  if (pMatch && method === 'DELETE') {
    await env.DB.prepare(`DELETE FROM merchant_posts WHERE id = ? AND merchant_id = ?`)
      .bind(Number(pMatch[1]), mid).run();
    return json({ ok: true });
  }
  if (path === '/api/merchant/change-password' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const current = clean(b.current, 200), next = clean(b.next, 200);
    if (next.length < 6) return json({ error: 'Nouveau mot de passe : 6 caractères minimum.' }, 400);
    const m = await env.DB.prepare(`SELECT pass_hash, pass_salt, pass_iter FROM merchants WHERE id = ?`).bind(mid).first();
    if (!m || !timingSafeEqual(await pbkdf2Hex(current, m.pass_salt, m.pass_iter), m.pass_hash))
      return json({ error: 'Mot de passe actuel incorrect.' }, 401);
    const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16))), iter = 100000;
    await env.DB.prepare(`UPDATE merchants SET pass_hash=?, pass_salt=?, pass_iter=? WHERE id=?`)
      .bind(await pbkdf2Hex(next, salt, iter), salt, iter, mid).run();
    return json({ ok: true });
  }

  // Upload d'image (photo boutique ou produit)
  if (path === '/api/merchant/upload' && method === 'POST') {
    return handleUpload(request, env, 'm' + mid);
  }
  // Mise à jour de la fiche (description, coordonnées, photo)
  if (path === '/api/merchant/profile' && method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    await env.DB.prepare(
      `UPDATE merchants SET description=?, address=?, phone=?, photo_key=COALESCE(?, photo_key) WHERE id=?`)
      .bind(clean(b.description, 1000), clean(b.address, 200), clean(b.phone, 40),
        b.photo_key === undefined ? null : (clean(b.photo_key, 200) || null), mid).run();
    return json({ ok: true });
  }
  // Produits
  if (path === '/api/merchant/products' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM products WHERE merchant_id = ? ORDER BY sort, id`).bind(mid).all();
    return json(results || []);
  }
  if (path === '/api/merchant/products' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const name = clean(b.name, 120);
    if (!name) return json({ error: 'Le nom du produit est requis.' }, 400);
    await env.DB.prepare(
      `INSERT INTO products (merchant_id, name, description, price, photo_key, sort) VALUES (?,?,?,?,?,?)`)
      .bind(mid, name, clean(b.description, 1000), clean(b.price, 60) || null,
        clean(b.photo_key, 200) || null, parseInt(b.sort, 10) || 0).run();
    return json({ ok: true });
  }
  const prodMatch = path.match(/^\/api\/merchant\/products\/(\d+)$/);
  if (prodMatch && method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    const name = clean(b.name, 120);
    if (!name) return json({ error: 'Le nom du produit est requis.' }, 400);
    await env.DB.prepare(
      `UPDATE products SET name=?, description=?, price=?, photo_key=COALESCE(?, photo_key) WHERE id=? AND merchant_id=?`)
      .bind(name, clean(b.description, 1000), clean(b.price, 60) || null,
        b.photo_key === undefined ? null : (clean(b.photo_key, 200) || null), Number(prodMatch[1]), mid).run();
    return json({ ok: true });
  }
  if (prodMatch && method === 'DELETE') {
    await env.DB.prepare(`DELETE FROM products WHERE id=? AND merchant_id=?`).bind(Number(prodMatch[1]), mid).run();
    return json({ ok: true });
  }

  return json({ error: 'Route inconnue' }, 404);
}

async function hashPassword(password) {
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16))), iter = 100000;
  return { hash: await pbkdf2Hex(password, salt, iter), salt, iter };
}
function slugify(s) {
  return clean(s, 80).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function validateEvent(b) {
  if (!clean(b.title)) return 'Le titre est requis.';
  if (!clean(b.cat)) return 'La catégorie est requise.';
  return null;
}

/* ----------------------------- export iCalendar ----------------------------- */
function pad2(n) { return String(n).padStart(2, '0'); }
function icsDate(dt) {
  const m = dt.length > 10
    ? dt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
    : dt.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dt.replace(/[-:T]/g, '');
  return dt.length > 10 ? `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}00` : `${m[1]}${m[2]}${m[3]}`;
}
function icsWeekday(dt) {
  const d = new Date(dt.length <= 10 ? dt + 'T00:00:00' : dt + ':00');
  return ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d.getDay()];
}
function icsRrule(ev) {
  if (ev.recur === 'weekly') return `RRULE:FREQ=WEEKLY;BYDAY=${icsWeekday(ev.starts_at)}`;
  if (ev.recur === 'monthly') {
    const nth = Math.ceil(parseInt(ev.starts_at.slice(8, 10), 10) / 7);
    return `RRULE:FREQ=MONTHLY;BYDAY=${nth}${icsWeekday(ev.starts_at)}`;
  }
  return null;
}
function icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function addHours(dt, h) {
  const d = new Date(dt + ':00'); d.setHours(d.getHours() + h);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function icsResponse(events, name) {
  const n = new Date();
  const stamp = `${n.getUTCFullYear()}${pad2(n.getUTCMonth() + 1)}${pad2(n.getUTCDate())}T${pad2(n.getUTCHours())}${pad2(n.getUTCMinutes())}${pad2(n.getUTCSeconds())}Z`;
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Les Amis de Montety//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEscape(name)}`];
  for (const ev of events) {
    if (!ev.starts_at) continue;
    const hasTime = ev.starts_at.length > 10;
    L.push('BEGIN:VEVENT', `UID:montety-${ev.id}@lesamisdemontety.com`, `DTSTAMP:${stamp}`);
    if (hasTime) { L.push(`DTSTART:${icsDate(ev.starts_at)}`, `DTEND:${icsDate(addHours(ev.starts_at, 2))}`); }
    else { L.push(`DTSTART;VALUE=DATE:${icsDate(ev.starts_at)}`); }
    const rr = icsRrule(ev); if (rr) L.push(rr);
    L.push(`SUMMARY:${icsEscape(ev.title)}`);
    if (ev.descr) L.push(`DESCRIPTION:${icsEscape(ev.descr)}`);
    if (ev.location) L.push(`LOCATION:${icsEscape(ev.location)}`);
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return new Response(L.join('\r\n'), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="agenda-montety.ics"' },
  });
}

/* ----------------------------- comptabilité (partie double) ----------------------------- */
async function accountIdByCode(env, code) {
  const r = await env.DB.prepare(`SELECT id FROM accounts WHERE code = ?`).bind(code).first();
  return r ? r.id : null;
}
async function createEntry(env, e) {
  const r = await env.DB.prepare(
    `INSERT INTO journal_entries (edate, label, piece, source, source_id) VALUES (?,?,?,?,?)`)
    .bind(e.edate, e.label, e.piece || null, e.source || 'manual', e.source_id || null).run();
  const eid = r.meta.last_row_id;
  for (const l of e.lines) {
    await env.DB.prepare(`INSERT INTO journal_lines (entry_id, account_id, debit, credit, label) VALUES (?,?,?,?,?)`)
      .bind(eid, l.account_id, Number(l.debit) || 0, Number(l.credit) || 0, l.label || null).run();
  }
  return eid;
}
async function deleteSourceEntry(env, source, sourceId) {
  await env.DB.prepare(
    `DELETE FROM journal_lines WHERE entry_id IN (SELECT id FROM journal_entries WHERE source=? AND source_id=?)`)
    .bind(source, sourceId).run();
  await env.DB.prepare(`DELETE FROM journal_entries WHERE source=? AND source_id=?`).bind(source, sourceId).run();
}
function payToAsset(method) { return method === 'especes' ? '530' : '512'; }
async function syncMembershipEntry(env, mid) {
  await deleteSourceEntry(env, 'membership', mid);
  const m = await env.DB.prepare(`SELECT * FROM memberships WHERE id=?`).bind(mid).first();
  if (!m || !m.paid || !(Number(m.amount) > 0)) return;
  const debitId = await accountIdByCode(env, payToAsset(m.pay_method));
  const credId = await accountIdByCode(env, '756');
  if (!debitId || !credId) return;
  await createEntry(env, {
    edate: m.paid_at || new Date().toISOString().slice(0, 10),
    label: `Cotisation — ${m.prenom} ${m.nom}`, source: 'membership', source_id: mid,
    lines: [{ account_id: debitId, debit: m.amount, credit: 0 }, { account_id: credId, debit: 0, credit: m.amount }],
  });
}
async function syncDonationEntry(env, did) {
  await deleteSourceEntry(env, 'donation', did);
  const d = await env.DB.prepare(`SELECT * FROM donations WHERE id=?`).bind(did).first();
  if (!d || !(Number(d.amount) > 0)) return;
  const debitId = await accountIdByCode(env, payToAsset(d.method));
  const credId = await accountIdByCode(env, '754');
  if (!debitId || !credId) return;
  await createEntry(env, {
    edate: (d.donated_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    label: `Don — ${d.donor || 'Anonyme'}`, source: 'donation', source_id: did,
    lines: [{ account_id: debitId, debit: d.amount, credit: 0 }, { account_id: credId, debit: 0, credit: d.amount }],
  });
}
function csvCell(v) { const s = String(v == null ? '' : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

/* ----------------------------- e-mails & jetons de mot de passe ----------------------------- */
async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return bytesToHex(new Uint8Array(buf));
}
async function getSetting(env, key) {
  const r = await env.DB.prepare(`SELECT value FROM settings WHERE key=?`).bind(key).first();
  return r ? r.value : null;
}
function escapeHtmlMail(s) { return String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
async function sendMail(env, to, subject, html) {
  const apiKey = await getSetting(env, 'resend_api_key');
  if (!apiKey) throw new Error("L'envoi d'e-mails n'est pas encore configuré.");
  const from = (await getSetting(env, 'mail_from')) || 'Les Amis de Montety <noreply@lesamisdemontety.com>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) throw new Error('Envoi e-mail refusé : ' + (await res.text()).slice(0, 200));
  return true;
}
async function createAuthToken(env, adminId, kind, hours) {
  const raw = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await sha256Hex(raw);
  const exp = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  await env.DB.prepare(`DELETE FROM auth_tokens WHERE admin_id=? AND kind=? AND used=0`).bind(adminId, kind).run();
  await env.DB.prepare(`INSERT INTO auth_tokens (admin_id, token_hash, kind, expires_at) VALUES (?,?,?,?)`)
    .bind(adminId, hash, kind, exp).run();
  return raw;
}
async function getTemplate(env, key) {
  return await env.DB.prepare(`SELECT subject, body FROM templates WHERE key=?`).bind(key).first();
}
function wrapMail(inner) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#233640;max-width:560px;line-height:1.55">
    <h2 style="color:#29414E;margin:0 0 14px">Les Amis de Montety</h2>${inner}</div>`;
}
function fillTemplate(text, vars) {
  const html = escapeHtmlMail(text || '').replace(/\r?\n/g, '<br>');
  return html.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars) ? vars[k] : m);
}
async function sendTemplatedMail(env, to, key, vars, fallbackSubject) {
  const t = await getTemplate(env, key);
  const subject = (t && t.subject) || fallbackSubject || 'Les Amis de Montety';
  await sendMail(env, to, subject, wrapMail(fillTemplate(t && t.body, vars)));
}
async function sendSetPasswordMail(env, admin, kind, origin) {
  const raw = await createAuthToken(env, admin.id, kind, kind === 'invite' ? 72 : 2);
  const link = `${origin}/definir-mot-de-passe.html?token=${raw}`;
  const button = `<a href="${link}" style="display:inline-block;background:#CE6446;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold">Définir mon mot de passe</a><br><span style="color:#4E5C66;font-size:12px">Ou copiez&nbsp;: ${link}</span>`;
  await sendTemplatedMail(env, admin.email, kind === 'invite' ? 'password_invite' : 'password_reset',
    { name: escapeHtmlMail(admin.name), link: button },
    kind === 'invite' ? 'Initialisez votre compte administrateur' : 'Réinitialisation de votre mot de passe');
}
