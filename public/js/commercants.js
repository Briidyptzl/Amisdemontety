// commercants.js — vitrine des commerçants + espace commerçant

const M_TYPES = {
  boulangerie: 'Boulangerie', boucherie: 'Boucherie', epicerie: 'Épicerie', primeur: 'Primeur',
  pizzeria: 'Pizzeria', restaurant: 'Restaurant', bar: 'Bar', cafe: 'Café',
  fleuriste: 'Fleuriste', coiffeur: 'Coiffeur', autre: 'Autre commerce',
};
const KINDS = {
  invendu: { label: 'Invendu', badge: 'badge--brique badge--solid' },
  promo: { label: 'Promo', badge: 'badge--ocre badge--solid' },
  annonce: { label: 'Annonce', badge: 'badge--ardoise' },
};

function cEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function typeLabel(t) { return M_TYPES[t] || (t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Commerce'); }
function cDate(s) {
  if (!s) return '';
  const d = new Date(s.length <= 10 ? s + 'T00:00' : s.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}
function icons() { if (window.refreshIcons) window.refreshIcons(); }

/* ----------------------------- Vitrine publique ----------------------------- */
let ALL_POSTS = [], POST_FILTER = 'tous';

function postCard(p) {
  const k = KINDS[p.kind] || KINDS.annonce;
  const price = p.price ? `<span class="m-price">${cEsc(p.price)}</span>` : '';
  const until = p.available_until ? `<div class="m-until"><span data-lucide="clock"></span> ${cEsc(p.available_until)}</div>` : '';
  return `
    <article class="card m-post">
      <div class="event-tags"><span class="badge ${k.badge}">${k.label}</span>${price}</div>
      <div class="m-from"><span data-lucide="store"></span> ${cEsc(p.merchant_name)} · <span class="muted">${cEsc(typeLabel(p.merchant_type))}</span></div>
      <h3>${cEsc(p.title)}</h3>
      ${p.body ? `<p class="m-body">${cEsc(p.body)}</p>` : ''}
      ${until}
      <div class="m-date">${cDate(p.created_at)}</div>
    </article>`;
}
function renderPosts() {
  const grid = document.getElementById('mposts-grid');
  let list = ALL_POSTS;
  if (POST_FILTER !== 'tous') list = list.filter(p => p.kind === POST_FILTER);
  grid.innerHTML = list.length ? list.map(postCard).join('')
    : '<p style="color:var(--color-text-muted)">Aucune annonce pour le moment.</p>';
  icons();
}
function merchantCard(m) {
  return `
    <article class="card m-card">
      <span class="badge badge--ocre">${cEsc(typeLabel(m.type))}</span>
      <h3>${cEsc(m.name)}</h3>
      ${m.description ? `<p class="muted" style="margin:0 0 12px">${cEsc(m.description)}</p>` : ''}
      <div class="m-meta">
        ${m.address ? `<div><span data-lucide="map-pin"></span> ${cEsc(m.address)}</div>` : ''}
        ${m.phone ? `<div><span data-lucide="phone"></span> <a href="tel:${cEsc(m.phone.replace(/[^+0-9]/g, ''))}">${cEsc(m.phone)}</a></div>` : ''}
      </div>
    </article>`;
}
async function loadPublic() {
  try {
    const [mp, mer] = await Promise.all([
      fetch('/api/merchant-posts').then(r => r.ok ? r.json() : []),
      fetch('/api/merchants').then(r => r.ok ? r.json() : []),
    ]);
    ALL_POSTS = mp || [];
    document.getElementById('merchants-grid').innerHTML = (mer && mer.length)
      ? mer.map(merchantCard).join('')
      : '<p style="color:var(--color-text-muted)">Aucun commerçant inscrit pour le moment.</p>';
  } catch (_) { ALL_POSTS = []; }
  renderPosts();
}
function initPostFilters() {
  const bar = document.getElementById('mposts-filters');
  bar.addEventListener('click', e => {
    const btn = e.target.closest('.filter-chip'); if (!btn) return;
    bar.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('is-active'));
    btn.classList.add('is-active');
    POST_FILTER = btn.getAttribute('data-filter');
    renderPosts();
  });
}

/* ----------------------------- Espace commerçant ----------------------------- */
async function mApi(path, opts = {}) {
  const res = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

function showMerchant(open) {
  const sp = document.getElementById('merchant-space');
  sp.hidden = !open;
  if (open) { window.scrollTo({ top: sp.offsetTop - 80, behavior: 'smooth' }); icons(); }
}

async function refreshMerchantState() {
  const login = document.getElementById('merchant-login');
  const dash = document.getElementById('merchant-dash');
  try {
    const me = await mApi('/merchant/me');
    login.hidden = true; dash.hidden = false;
    renderDash(me);
  } catch (_) {
    login.hidden = false; dash.hidden = true;
  }
}

async function renderDash(me) {
  const dash = document.getElementById('merchant-dash');
  let posts = [];
  try { posts = await mApi('/merchant/posts'); } catch (_) {}
  dash.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:18px">
      <div>
        <h2 style="font-size:1.5rem; margin:0">Bonjour, ${cEsc(me.name)}</h2>
        <p class="muted" style="margin:4px 0 0">${cEsc(typeLabel(me.type))} · identifiant <strong>${cEsc(me.slug)}</strong></p>
      </div>
      <button class="btn btn--ghost btn--sm" id="m-logout"><span data-lucide="log-out"></span> Déconnexion</button>
    </div>

    <form id="m-post-form" class="m-post-form">
      <h3 style="font-size:1.2rem; margin:0 0 14px">Publier une annonce</h3>
      <div class="field-row">
        <div class="field"><label>Type</label>
          <select name="kind"><option value="invendu">Invendu</option><option value="promo">Promotion</option><option value="annonce">Annonce</option></select>
        </div>
        <div class="field"><label>Prix / réduction (facultatif)</label><input name="price" maxlength="60" placeholder="-50%, 2€, offert…" /></div>
      </div>
      <div class="field"><label>Titre</label><input name="title" maxlength="120" placeholder="Pains et viennoiseries en fin de journée" required /></div>
      <div class="field"><label>Détails (facultatif)</label><textarea name="body" maxlength="2000" placeholder="Décrivez votre offre…"></textarea></div>
      <div class="field"><label>Disponible jusqu'à (facultatif)</label><input name="available_until" maxlength="120" placeholder="Ce soir 19h30, samedi, jusqu'à épuisement…" /></div>
      <button class="btn btn--accent btn--md" type="submit" id="m-post-btn">Publier</button>
    </form>

    <h3 style="font-size:1.2rem; margin:28px 0 12px">Vos annonces (${posts.length})</h3>
    <div id="m-own-posts">${posts.length ? posts.map(ownPostRow).join('') : '<p class="muted">Aucune annonce publiée.</p>'}</div>

    <details style="margin-top:24px">
      <summary style="cursor:pointer; color:var(--color-text-muted)">Changer mon mot de passe</summary>
      <form id="m-pwd-form" style="max-width:420px; margin-top:14px">
        <div class="field"><label>Mot de passe actuel</label><input name="current" type="password" required /></div>
        <div class="field"><label>Nouveau mot de passe (6 min.)</label><input name="next" type="password" required /></div>
        <button class="btn btn--secondary btn--sm" type="submit">Mettre à jour</button>
      </form>
    </details>`;
  icons();

  document.getElementById('m-logout').addEventListener('click', async () => {
    try { await mApi('/merchant/logout', { method: 'POST' }); } catch (_) {}
    refreshMerchantState();
  });
  document.getElementById('m-post-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const btn = document.getElementById('m-post-btn'); btn.disabled = true; btn.textContent = 'Publication…';
    try {
      await mApi('/merchant/posts', { method: 'POST', body: JSON.stringify({
        kind: f.kind.value, title: f.title.value.trim(), body: f.body.value.trim(),
        price: f.price.value.trim(), available_until: f.available_until.value.trim(),
      }) });
      f.reset(); renderDash(me); loadPublic();
    } catch (ex) { alert(ex.message); }
    finally { btn.disabled = false; btn.textContent = 'Publier'; }
  });
  document.getElementById('m-pwd-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try { await mApi('/merchant/change-password', { method: 'POST', body: JSON.stringify({ current: f.current.value, next: f.next.value }) });
      f.reset(); alert('Mot de passe mis à jour.');
    } catch (ex) { alert(ex.message); }
  });
  document.querySelectorAll('#m-own-posts [data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Supprimer cette annonce ?')) return;
    try { await mApi('/merchant/posts/' + b.dataset.del, { method: 'DELETE' }); renderDash(me); loadPublic(); }
    catch (ex) { alert(ex.message); }
  }));
}
function ownPostRow(p) {
  const k = KINDS[p.kind] || KINDS.annonce;
  const hidden = p.status === 'hidden' ? ' <span class="badge badge--neutral">Masquée</span>' : '';
  return `<div class="m-own">
    <div><span class="badge ${k.badge}">${k.label}</span>${hidden} <strong>${cEsc(p.title)}</strong>
      <div class="muted" style="font-size:.85rem">${cDate(p.created_at)}${p.price ? ' · ' + cEsc(p.price) : ''}</div></div>
    <button class="icon-btn danger" data-del="${p.id}" title="Supprimer"><span data-lucide="trash-2"></span></button>
  </div>`;
}

function initMerchantAuth() {
  document.getElementById('toggle-merchant').addEventListener('click', () => { showMerchant(true); refreshMerchantState(); });
  document.getElementById('m-login-cancel').addEventListener('click', () => showMerchant(false));
  document.getElementById('merchant-login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('merchant-login-error'); err.hidden = true;
    const btn = document.getElementById('m-login-btn'); btn.disabled = true; btn.textContent = 'Connexion…';
    try {
      await mApi('/merchant/login', { method: 'POST', body: JSON.stringify({
        login: document.getElementById('m-login').value.trim(), password: document.getElementById('m-pass').value,
      }) });
      document.getElementById('merchant-login-form').reset();
      refreshMerchantState();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    finally { btn.disabled = false; btn.textContent = 'Se connecter'; }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initPostFilters();
  initMerchantAuth();
  loadPublic();
});
