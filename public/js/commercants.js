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
  const thumb = m.photo_key
    ? `<div class="m-thumb"><img src="/img/${cEsc(m.photo_key)}" alt="${cEsc(m.name)}" loading="lazy" /></div>`
    : `<div class="m-thumb m-thumb--empty"><span data-lucide="store"></span></div>`;
  return `
    <a class="card card--interactive m-card" href="commercant.html?c=${encodeURIComponent(m.slug)}">
      ${thumb}
      <div class="m-card-body">
        <span class="badge badge--ocre">${cEsc(typeLabel(m.type))}</span>
        <h3>${cEsc(m.name)}</h3>
        ${m.description ? `<p class="muted" style="margin:0 0 12px">${cEsc(m.description)}</p>` : ''}
        <div class="m-meta">
          ${m.address ? `<div><span data-lucide="map-pin"></span> ${cEsc(m.address)}</div>` : ''}
          ${m.phone ? `<div><span data-lucide="phone"></span> ${cEsc(m.phone)}</div>` : ''}
        </div>
        <div class="m-see">Voir la fiche <span data-lucide="arrow-right"></span></div>
      </div>
    </a>`;
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

async function mUpload(file) {
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch('/api/merchant/upload', { method: 'POST', body: fd });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Envoi de l\'image impossible');
  return d.key;
}

async function renderDash(me) {
  const dash = document.getElementById('merchant-dash');
  let posts = [], products = [];
  try { posts = await mApi('/merchant/posts'); } catch (_) {}
  try { products = await mApi('/merchant/products'); } catch (_) {}
  const photo = me.photo_key
    ? `<img src="/img/${cEsc(me.photo_key)}" alt="" class="boutique-photo" />`
    : `<div class="boutique-photo boutique-photo--empty"><span data-lucide="store"></span></div>`;
  dash.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:18px">
      <div>
        <h2 style="font-size:1.5rem; margin:0">Bonjour, ${cEsc(me.name)}</h2>
        <p class="muted" style="margin:4px 0 0">${cEsc(typeLabel(me.type))} · identifiant <strong>${cEsc(me.slug)}</strong></p>
      </div>
      <button class="btn btn--ghost btn--sm" id="m-logout"><span data-lucide="log-out"></span> Déconnexion</button>
    </div>

    <div class="m-post-form" style="margin-bottom:22px">
      <h3 style="font-size:1.2rem; margin:0 0 14px">Ma boutique</h3>
      <div class="boutique-row">
        ${photo}
        <div>
          <input type="file" id="m-photo-input" accept="image/*" hidden />
          <button class="btn btn--secondary btn--sm" id="m-photo-btn"><span data-lucide="image-up"></span> Changer la photo</button>
          <p class="hint" style="margin-top:6px">JPEG, PNG ou WebP · 3 Mo max.</p>
        </div>
      </div>
      <form id="m-profile-form" style="margin-top:16px">
        <div class="field"><label>Description</label><textarea name="description" maxlength="1000" placeholder="Présentez votre commerce…">${cEsc(me.description || '')}</textarea></div>
        <div class="field-row">
          <div class="field"><label>Adresse</label><input name="address" maxlength="200" value="${cEsc(me.address || '')}" /></div>
          <div class="field"><label>Téléphone</label><input name="phone" maxlength="40" value="${cEsc(me.phone || '')}" /></div>
        </div>
        <button class="btn btn--accent btn--sm" type="submit">Enregistrer ma fiche</button>
      </form>
    </div>

    <div class="m-post-form" style="margin-bottom:22px">
      <h3 style="font-size:1.2rem; margin:0 0 14px">Mes produits (${products.length})</h3>
      <div id="m-products">${products.length ? products.map(ownProductRow).join('') : '<p class="muted">Aucun produit. Ajoutez-en un ci-dessous.</p>'}</div>
      <form id="m-product-form" style="margin-top:14px; border-top:1px solid var(--color-border); padding-top:16px">
        <div class="field-row">
          <div class="field"><label>Nom du produit</label><input name="name" maxlength="120" placeholder="Baguette tradition" required /></div>
          <div class="field"><label>Prix (facultatif)</label><input name="price" maxlength="60" placeholder="1,30 €" /></div>
        </div>
        <div class="field"><label>Description (facultatif)</label><textarea name="description" maxlength="1000"></textarea></div>
        <div class="field"><label>Photo (facultatif)</label><input type="file" name="photo" accept="image/*" /></div>
        <button class="btn btn--accent btn--sm" type="submit" id="m-product-btn">Ajouter le produit</button>
      </form>
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

  // Photo de la boutique
  const photoBtn = document.getElementById('m-photo-btn'), photoInput = document.getElementById('m-photo-input');
  photoBtn.addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', async () => {
    if (!photoInput.files[0]) return;
    photoBtn.disabled = true; photoBtn.textContent = 'Envoi…';
    try {
      const key = await mUpload(photoInput.files[0]);
      const f = document.getElementById('m-profile-form');
      await mApi('/merchant/profile', { method: 'PUT', body: JSON.stringify({
        photo_key: key, description: f.description.value.trim(), address: f.address.value.trim(), phone: f.phone.value.trim() }) });
      me.photo_key = key; renderDash(me); loadPublic();
    } catch (ex) { alert(ex.message); photoBtn.disabled = false; photoBtn.textContent = 'Changer la photo'; }
  });

  // Profil
  document.getElementById('m-profile-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try { await mApi('/merchant/profile', { method: 'PUT', body: JSON.stringify({
      description: f.description.value.trim(), address: f.address.value.trim(), phone: f.phone.value.trim() }) });
      me.description = f.description.value.trim(); me.address = f.address.value.trim(); me.phone = f.phone.value.trim();
      alert('Fiche enregistrée.'); loadPublic();
    } catch (ex) { alert(ex.message); }
  });

  // Produits
  document.getElementById('m-product-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const btn = document.getElementById('m-product-btn'); btn.disabled = true; btn.textContent = 'Ajout…';
    try {
      let photo_key = null;
      if (f.photo.files[0]) photo_key = await mUpload(f.photo.files[0]);
      await mApi('/merchant/products', { method: 'POST', body: JSON.stringify({
        name: f.name.value.trim(), price: f.price.value.trim(), description: f.description.value.trim(), photo_key }) });
      f.reset(); renderDash(me);
    } catch (ex) { alert(ex.message); btn.disabled = false; btn.textContent = 'Ajouter le produit'; }
  });
  document.querySelectorAll('#m-products [data-delprod]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Supprimer ce produit ?')) return;
    try { await mApi('/merchant/products/' + b.dataset.delprod, { method: 'DELETE' }); renderDash(me); }
    catch (ex) { alert(ex.message); }
  }));

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
function ownProductRow(p) {
  const thumb = p.photo_key ? `<img src="/img/${cEsc(p.photo_key)}" alt="" class="prod-mini" />` : `<div class="prod-mini prod-mini--empty"><span data-lucide="image"></span></div>`;
  return `<div class="m-own">
    <div style="display:flex; align-items:center; gap:10px">${thumb}
      <div><strong>${cEsc(p.name)}</strong>${p.price ? ` <span class="muted">· ${cEsc(p.price)}</span>` : ''}
      ${p.description ? `<div class="muted" style="font-size:.85rem">${cEsc(p.description.slice(0, 60))}</div>` : ''}</div></div>
    <button class="icon-btn danger" data-delprod="${p.id}" title="Supprimer"><span data-lucide="trash-2"></span></button>
  </div>`;
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

function openMerchantSpace() { showMerchant(true); refreshMerchantState(); }

function initMerchantAuth() {
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
  const forgot = document.getElementById('m-forgot-link');
  if (forgot) forgot.addEventListener('click', async e => {
    e.preventDefault();
    const email = prompt('Entrez l\'e-mail associé à votre compte commerçant. Vous recevrez un lien pour redéfinir votre mot de passe.');
    if (!email) return;
    try { await mApi('/merchant/forgot', { method: 'POST', body: JSON.stringify({ email: email.trim() }) }); }
    catch (_) {}
    alert('Si un compte correspond à cet e-mail, un lien de réinitialisation vient d\'être envoyé.');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initPostFilters();
  initMerchantAuth();
  loadPublic();
  // Accès direct à l'espace commerçant via le raccourci du pied de page (#connexion)
  if (location.hash === '#connexion') openMerchantSpace();
});
window.addEventListener('hashchange', () => { if (location.hash === '#connexion') openMerchantSpace(); });
