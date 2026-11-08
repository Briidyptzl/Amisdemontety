/* ===========================================================
   Les Amis de Montety — Espace gérant de bar (tactile)
   =========================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function eur(n) { return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
function icons() { if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } }); }
function fmtDate(s) { if (!s) return ''; const d = new Date(s.length <= 10 ? s + 'T00:00' : s); return isNaN(d) ? esc(s) : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
// Nombre de jours avant péremption (null si pas de date)
function daysToExpiry(s) { if (!s) return null; const d = new Date(s + 'T00:00'); if (isNaN(d)) return null; return Math.round((d - new Date(new Date().toISOString().slice(0, 10) + 'T00:00')) / 86400000); }
// État de péremption : {cls, label} ou null
function expiryState(s) { const n = daysToExpiry(s); if (n === null) return null; if (n < 0) return { cls: 'exp-over', label: 'Périmé depuis ' + (-n) + ' j' }; if (n === 0) return { cls: 'exp-soon', label: 'Périme aujourd\'hui' }; if (n <= 7) return { cls: 'exp-soon', label: 'Périme dans ' + n + ' j' }; if (n <= 30) return { cls: 'exp-ok', label: fmtDate(s) }; return { cls: 'exp-ok', label: fmtDate(s) }; }
function isLowStock(p) { const t = Number(p.threshold) || 0; return t > 0 ? Number(p.stock) <= t : Number(p.stock) <= 5; }

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, ...opts });
  if (res.status === 401) { showLogin(); throw new Error('unauthorized'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}
let toastT = null;
function toast(msg, err) { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
function openModal(html) { $('#modal-card').innerHTML = html; $('#modal').hidden = false; icons(); }
function closeModal() { $('#modal').hidden = true; $('#modal-card').innerHTML = ''; }

function showLogin() { $('#portal').hidden = true; $('#login-screen').hidden = false; }
function showPortal() { $('#login-screen').hidden = true; $('#portal').hidden = false; }

let VIEW = 'board', PRODUCTS = [], CART = {}, ME = {};

async function init() {
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#login-error'); err.hidden = true;
    const btn = $('#login-submit'); btn.disabled = true; btn.textContent = 'Connexion…';
    try {
      const d = await api('/bar/manager/login', { method: 'POST', body: JSON.stringify({ email: $('#login-email').value.trim(), password: $('#login-password').value }) });
      ME = d; $('#bara-name').textContent = d.name || ''; showPortal(); switchView('board');
    } catch (ex) { err.textContent = ex.message === 'unauthorized' ? 'E-mail ou mot de passe incorrect.' : ex.message; err.hidden = false; }
    finally { btn.disabled = false; btn.textContent = 'Se connecter'; }
  });
  $('#forgot-link').addEventListener('click', async e => {
    e.preventDefault();
    const email = prompt('Entrez votre e-mail. Vous recevrez un lien pour définir un nouveau mot de passe.');
    if (!email) return;
    try { await fetch('/api/bar/manager/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) }); } catch (_) {}
    alert('Si cette adresse correspond à un compte, un e-mail vient d\'être envoyé.');
  });
  $('#logout-btn').addEventListener('click', async () => { try { await api('/bar/manager/logout', { method: 'POST' }); } catch (_) {} showLogin(); });
  $('#bara-tabs').addEventListener('click', e => { const b = e.target.closest('.bara-tab'); if (b) switchView(b.dataset.view); });
  try { const me = await api('/bar/manager/me'); ME = me; $('#bara-name').textContent = me.name || ''; showPortal(); switchView('board'); }
  catch (_) { showLogin(); }
  icons();
}
function switchView(v) {
  VIEW = v;
  $$('.bara-tab').forEach(b => b.classList.toggle('is-active', b.dataset.view === v));
  // La frise des disponibilités a besoin de toute la largeur pour tenir en entier
  $('#bara-content').classList.toggle('bara-content--wide', v === 'equipiers');
  ({ board: renderBoard, caisse: renderCaisse, stock: renderStock, recettes: renderRecettes, achats: renderAchats, bank: renderBank, equipiers: renderEquipiers, materiel: renderMateriel, projects: renderProjetsPartenaires, vitrine: renderVitrine }[v] || renderBoard)();
}
async function barUpload(file) {
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch('/api/bar/manager/upload', { method: 'POST', body: fd });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Envoi du fichier impossible');
  return d.key;
}

/* ----- Consignes ----- */
async function renderBoard() {
  const c = $('#bara-content'); c.innerHTML = '<p class="muted">Chargement…</p>';
  const d = await api('/bar/manager/consignes');
  c.innerHTML = `
    <div class="bara-card">
      <h2><span data-lucide="clipboard-list"></span> Consignes du chef de bar</h2>
      <div id="consignes-view" class="consignes-text">${d.consignes ? esc(d.consignes).replace(/\n/g, '<br>') : '<span class="muted">Aucune consigne pour le moment.</span>'}</div>
      <button class="btn btn--secondary btn--md" id="consignes-edit"><span data-lucide="pencil"></span> Modifier les consignes</button>
    </div>`;
  $('#consignes-edit').addEventListener('click', () => {
    const cur = d.consignes || '';
    $('#consignes-view').outerHTML = `<textarea id="consignes-input" class="consignes-input" rows="8">${esc(cur)}</textarea>`;
    $('#consignes-edit').outerHTML = `<button class="btn btn--accent btn--md" id="consignes-save">Enregistrer</button>`;
    $('#consignes-save').addEventListener('click', async () => {
      try { await api('/bar/manager/consignes', { method: 'PUT', body: JSON.stringify({ consignes: $('#consignes-input').value }) }); toast('Consignes enregistrées'); renderBoard(); }
      catch (ex) { toast(ex.message, true); }
    });
    icons();
  });
  icons();
}

/* ----- Caisse (tactile) ----- */
const CAISSE_CATS = { tous: 'Tout', alcool: 'Alcool', soft: 'Soft', sale: 'Salé', sucre: 'Sucré' };
let CAT_FILTER = 'tous', SUMUP = { configured: false }, CAISSE_PROJECTS = [];
async function renderCaisse() {
  const c = $('#bara-content'); c.innerHTML = '<p class="muted">Chargement…</p>';
  PRODUCTS = await api('/bar/manager/products');
  try { SUMUP = await api('/bar/manager/sumup'); } catch (_) { SUMUP = { configured: false }; }
  try { CAISSE_PROJECTS = (await api('/bar/manager/projects')).filter(p => (p.items || []).length); } catch (_) { CAISSE_PROJECTS = []; }
  drawCaisse();
}
// Catalogue indexé par clé composite : "p:<id>" (produit) ou "i:<id>" (article de projet)
function buildCatalog() {
  const cat = {};
  PRODUCTS.forEach(p => { cat['p:' + p.id] = { name: p.name, price: p.price, kind: 'p', refId: p.id }; });
  CAISSE_PROJECTS.forEach(pr => (pr.items || []).forEach(it => { cat['i:' + it.id] = { name: it.name, price: it.price, kind: 'i', refId: it.id }; }));
  return cat;
}
function caisseCartTotal(CATALOG) { return Object.entries(CART).filter(([k, q]) => q > 0).reduce((s, [k, q]) => { const it = CATALOG[k]; return s + (it ? it.price * q : 0); }, 0); }
function drawCaisse() {
  const c = $('#bara-content');
  const CATALOG = buildCatalog();
  const tabBtn = (k, v) => `<button class="cat-tab ${CAT_FILTER === k ? 'is-active' : ''}" data-cat="${k}">${v}</button>`;
  const prodBtn = (key, name, price, stock, low) => `<button class="caisse-prod" data-add="${key}"><span class="cp-name">${esc(name)}</span><span class="cp-price">${eur(price)}</span>${stock !== undefined ? `<span class="cp-stock ${low ? 'low' : ''}">stock ${stock}</span>` : ''}</button>`;
  const projs = CAISSE_PROJECTS.filter(p => (p.items || []).length);
  const tabs = Object.entries(CAISSE_CATS).map(([k, v]) => tabBtn(k, v)).join('')
    + projs.map(p => tabBtn('proj:' + p.id, '🎉 ' + esc(p.title))).join('')
    + tabBtn('adhesions', '🎟️ Adhésions');
  // Zone de boutons
  let buttons;
  if (CAT_FILTER === 'adhesions') {
    const annual = (ME.cotisation_amount || 20);
    buttons = `<button class="caisse-prod adh" data-adh="annual"><span class="cp-name">Adhésion annuelle</span><span class="cp-price">${eur(annual)}</span></button>
      <button class="caisse-prod adh" data-adh="libre"><span class="cp-name">Adhésion libre</span><span class="cp-price">≥ 20 €</span></button>`;
  } else if (CAT_FILTER.startsWith('proj:')) {
    const pr = CAISSE_PROJECTS.find(x => x.id === Number(CAT_FILTER.slice(5)));
    const its = pr ? (pr.items || []) : [];
    buttons = its.length ? its.map(it => prodBtn('i:' + it.id, it.name, it.price)).join('') : '<p class="muted">Aucun article pour ce projet.</p>';
  } else {
    let active = PRODUCTS.filter(p => p.active);
    if (CAT_FILTER !== 'tous') active = active.filter(p => (p.category || '') === CAT_FILTER);
    buttons = active.length ? active.map(p => prodBtn('p:' + p.id, p.name, p.price, p.stock, isLowStock(p))).join('') : '<p class="muted">Aucun produit dans cette catégorie.</p>';
  }
  const cart = Object.entries(CART).filter(([k, q]) => q > 0).map(([k, q]) => ({ k, q, it: CATALOG[k] })).filter(x => x.it);
  const total = cart.reduce((s, { it, q }) => s + it.price * q, 0);
  c.innerHTML = `
    <div class="caisse-toolbar">
      <div class="caisse-cats">${tabs}</div>
      <button class="btn btn--ghost btn--sm sumup-btn" id="sumup-cfg" title="Configurer le terminal de paiement SumUp"><span data-lucide="credit-card"></span> Terminal SumUp ${SUMUP.configured ? '<span class="sumup-ok">● relié</span>' : '<span class="sumup-off">à configurer</span>'}</button>
    </div>
    <div class="caisse-grid">
      <div class="caisse-products">${buttons}</div>
      <div class="caisse-ticket">
        <h3>Ticket</h3>
        <div class="ticket-rows">${cart.length ? cart.map(({ k, q, it }) => `<div class="ticket-row"><span class="tr-name">${esc(it.name)}</span><span class="tr-qty"><button class="qbtn" data-dec="${k}">−</button><b>${q}</b><button class="qbtn" data-inc="${k}">+</button></span><span class="tr-sum">${eur(it.price * q)}</span></div>`).join('') : '<p class="muted">Touchez un article pour l\'ajouter.</p>'}</div>
        <div class="ticket-total">Total<strong>${eur(total)}</strong></div>
        <div class="pay-methods">
          <button class="btn btn--accent btn--md pay-btn" data-pay="especes"><span data-lucide="coins"></span> Espèces</button>
          <button class="btn btn--accent btn--md pay-btn" data-pay="carte"><span data-lucide="credit-card"></span> Carte${SUMUP.configured ? ' 📟' : ''}</button>
          <button class="btn btn--ghost btn--md pay-btn" data-pay="cadeau"><span data-lucide="gift"></span> Cadeau</button>
        </div>
        ${cart.length ? '<button class="btn btn--ghost btn--sm btn--full" id="clear" style="margin-top:8px">Vider</button>' : ''}
      </div>
    </div>`;
  $$('[data-cat]', c).forEach(b => b.addEventListener('click', () => { CAT_FILTER = b.dataset.cat; drawCaisse(); }));
  $$('[data-add]', c).forEach(b => b.addEventListener('click', () => { CART[b.dataset.add] = (CART[b.dataset.add] || 0) + 1; drawCaisse(); }));
  $$('[data-inc]', c).forEach(b => b.addEventListener('click', () => { CART[b.dataset.inc] = (CART[b.dataset.inc] || 0) + 1; drawCaisse(); }));
  $$('[data-dec]', c).forEach(b => b.addEventListener('click', () => { const k = b.dataset.dec; CART[k] = Math.max(0, (CART[k] || 0) - 1); drawCaisse(); }));
  $$('[data-adh]', c).forEach(b => b.addEventListener('click', () => membershipModal(b.dataset.adh)));
  const cl = $('#clear', c); if (cl) cl.addEventListener('click', () => { CART = {}; drawCaisse(); });
  $$('[data-pay]', c).forEach(b => b.addEventListener('click', () => encaisser(b.dataset.pay)));
  const sc = $('#sumup-cfg', c); if (sc) sc.addEventListener('click', sumupModal);
  icons();
}
async function sumupPush(amount) {
  if (!SUMUP.configured) return true;
  try { await api('/bar/manager/sumup/checkout', { method: 'POST', body: JSON.stringify({ amount: Math.round(amount * 100) / 100, description: 'Bar Montety' }) }); toast('Montant envoyé au terminal SumUp 📟'); return true; }
  catch (ex) { return confirm('Terminal SumUp injoignable (' + ex.message + '). Continuer quand même ?'); }
}
async function encaisser(method) {
  const CATALOG = buildCatalog();
  const entries = Object.entries(CART).filter(([k, q]) => q > 0);
  if (!entries.length) { alert('Ajoutez des articles au ticket.'); return; }
  const items = [], custom = [];
  entries.forEach(([k, q]) => { const it = CATALOG[k]; if (!it) return; if (it.kind === 'p') items.push({ product_id: it.refId, qty: q }); else custom.push({ name: it.name, price: it.price, qty: q }); });
  const lbl = { especes: 'espèces', carte: 'carte', cadeau: 'cadeau (offert)' }[method] || method;
  if (method === 'cadeau' && !confirm('Enregistrer ce ticket comme CADEAU (offert, sans recette) ?')) return;
  if (method === 'carte' && !(await sumupPush(caisseCartTotal(CATALOG)))) return;
  try {
    const r = await api('/bar/manager/sales', { method: 'POST', body: JSON.stringify({ items, custom, method }) });
    CART = {}; PRODUCTS = await api('/bar/manager/products');
    toast(method === 'cadeau' ? 'Cadeau enregistré' : 'Encaissé (' + lbl + ') : ' + eur(r.total));
    drawCaisse();
  } catch (ex) { toast(ex.message, true); }
}
async function membershipModal(kind) {
  const annual = (ME.cotisation_amount || 20);
  let members = [];
  try { members = await api('/bar/manager/members'); } catch (_) {}
  const opts = `<option value="">— Nouveau membre —</option>` + members.map(m => `<option value="${m.id}" data-prenom="${esc(m.prenom || '')}" data-nom="${esc(m.nom || '')}" data-email="${esc(m.email || '')}">${esc(m.nom || '')} ${esc(m.prenom || '')}${m.email ? ' (' + esc(m.email) + ')' : ''}</option>`).join('');
  openModal(`<h3>${kind === 'annual' ? 'Adhésion annuelle' : 'Adhésion libre (≥ 20 €)'}</h3>
    <form id="adh-form">
      <div class="field"><label>Membre de l'association</label><select name="member">${opts}</select><div class="hint">Choisissez un membre existant (saisie auto) ou « Nouveau membre ».</div></div>
      <div class="form-grid2"><div class="field"><label>Prénom</label><input name="prenom" required></div><div class="field"><label>Nom</label><input name="nom" required></div></div>
      <div class="field"><label>E-mail (facultatif)</label><input name="email" type="email"></div>
      <div class="form-grid2"><div class="field"><label>Montant (€)</label><input name="amount" type="number" step="0.01" min="20" value="${kind === 'annual' ? annual : ''}" ${kind === 'annual' ? 'readonly' : ''} required></div>
        <div class="field"><label>Paiement</label><select name="method"><option value="especes">Espèces</option><option value="carte">Carte</option></select></div></div>
      <p class="hint">L'adhésion est enregistrée dans la liste des adhésions et alimente la comptabilité de l'association (cotisation 756).</p>
      <div class="modal-actions"><button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button><button type="submit" class="btn btn--accent btn--md">Encaisser l'adhésion</button></div></form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  const f = $('#adh-form');
  f.member.addEventListener('change', e => { const o = e.target.selectedOptions[0]; f.prenom.value = o.dataset.prenom || ''; f.nom.value = o.dataset.nom || ''; f.email.value = o.dataset.email || ''; });
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const amount = Number(f.amount.value) || 0;
    if (amount < 20) { toast('Minimum 20 €.', true); return; }
    if (f.method.value === 'carte' && !(await sumupPush(amount))) return;
    try { const r = await api('/bar/manager/membership', { method: 'POST', body: JSON.stringify({ member_id: f.member.value || null, prenom: f.prenom.value.trim(), nom: f.nom.value.trim(), email: f.email.value.trim(), amount, method: f.method.value }) });
      closeModal(); toast((r.renewed ? 'Adhésion renouvelée : ' : 'Adhésion encaissée : ') + eur(amount)); }
    catch (ex) { toast(ex.message, true); }
  });
}
function sumupModal() {
  openModal(`<h3 class="modal-title-row">Terminal SumUp <button type="button" class="help-btn" id="sumup-help" title="Aide : comment configurer SumUp">?</button></h3>
    <p class="muted">Reliez votre terminal SumUp pour envoyer automatiquement le montant lors d'un paiement par carte.</p>
    <form id="sumup-form">
      <div class="field"><label>Merchant code</label><input name="merchant" value="${esc(SUMUP.merchant || '')}" placeholder="MCxxxxxx"></div>
      <div class="field"><label>Reader ID (identifiant du terminal)</label><input name="reader" value="${esc(SUMUP.reader || '')}" placeholder="rdr_xxxxxxxx"></div>
      <div class="field"><label>Clé d'accès (API token)</label><input name="token" type="password" placeholder="${SUMUP.has_token ? '•••••• (déjà enregistrée)' : 'sup_sk_…'}"></div>
      <p class="hint">Ces informations proviennent de votre compte SumUp (Développeurs → clés API, et l'identifiant du terminal appairé). La clé reste côté serveur.</p>
      <div class="modal-actions"><button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Fermer</button><button type="submit" class="btn btn--accent btn--md">Enregistrer</button></div></form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#sumup-help').addEventListener('click', sumupHelp);
  $('#sumup-form').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    const payload = { merchant: f.merchant.value.trim(), reader: f.reader.value.trim() };
    if (f.token.value.trim()) payload.token = f.token.value.trim();
    try { await api('/bar/manager/sumup/config', { method: 'PUT', body: JSON.stringify(payload) }); closeModal(); toast('Terminal SumUp configuré'); renderCaisse(); }
    catch (ex) { toast(ex.message, true); }
  });
}
function sumupHelp() {
  openModal(`<h3 class="modal-title-row"><span data-lucide="help-circle"></span> Configurer le terminal SumUp</h3>
    <p class="muted">Le terminal <b>SumUp Solo</b> (autonome, Wi-Fi/4G) peut recevoir le montant directement depuis la caisse. Suivez ces étapes :</p>
    <ol class="help-steps">
      <li><b>Appairez le terminal</b> à votre compte SumUp (dans l'app SumUp ou sur sumup.com → <i>Terminaux / Lecteurs</i>).</li>
      <li><b>Merchant code</b> : dans votre compte SumUp → <i>Profil / Paramètres</i>. Il commence par <code>MC</code>.</li>
      <li><b>Reader ID</b> : dans la liste de vos terminaux appairés, copiez l'identifiant du lecteur.</li>
      <li><b>Clé d'accès (API)</b> : espace <i>Développeurs</i> de SumUp → créez une clé API avec les droits « paiements / lecteurs ».</li>
      <li>Revenez ici, collez les trois valeurs et <b>Enregistrez</b>. La clé reste stockée côté serveur, jamais affichée.</li>
      <li>À l'encaissement, touchez <b>Carte</b> : le montant s'affiche sur le terminal, le client présente sa carte.</li>
    </ol>
    <p class="hint">Un <b>SumUp Air</b> (lecteur Bluetooth relié au téléphone) ne peut pas être piloté par un site web : il s'utilise avec l'application SumUp à côté.</p>
    <div class="modal-actions"><button type="button" class="btn btn--ghost btn--md" id="help-back">◀ Retour</button><button type="button" class="btn btn--accent btn--md" id="help-close">Compris</button></div>`);
  $('#help-back').addEventListener('click', sumupModal);
  $('#help-close').addEventListener('click', closeModal);
  icons();
}

/* ----- Stock (tactile) ----- */
async function renderStock() {
  const c = $('#bara-content'); c.innerHTML = '<p class="muted">Chargement…</p>';
  PRODUCTS = await api('/bar/manager/products');
  await renderStockLoad();
  drawStock();
}
let STOCK_LOCATIONS = [], INVENTORIES = [], STOCK_FILTER = null;
async function renderStockLoad() { try { INVENTORIES = await api('/bar/manager/inventories'); } catch (_) { INVENTORIES = []; } }
async function drawStock() {
  try { STOCK_LOCATIONS = await api('/bar/manager/locations'); } catch (_) { STOCK_LOCATIONS = []; }
  const c = $('#bara-content');
  const low = PRODUCTS.filter(p => p.active && isLowStock(p));
  const expSoon = PRODUCTS.filter(p => { const e = expiryState(p.expiry); return e && e.cls !== 'exp-ok'; });
  const alerts = [];
  if (expSoon.length) alerts.push(`<button class="alert-chip exp-over ${STOCK_FILTER === 'expiry' ? 'on' : ''}" data-sfilter="expiry" title="Filtrer sur ces produits">⏰ ${expSoon.length} à surveiller (péremption)</button>`);
  if (low.length) alerts.push(`<button class="alert-chip low ${STOCK_FILTER === 'low' ? 'on' : ''}" data-sfilter="low" title="Filtrer sur ces produits">📉 ${low.length} en stock bas</button>`);
  if (STOCK_FILTER) alerts.push(`<button class="alert-chip" data-sfilter="clear">✕ Tout voir</button>`);
  // Produits affichés selon le filtre d'alerte
  const shown = STOCK_FILTER === 'expiry' ? expSoon : STOCK_FILTER === 'low' ? low : PRODUCTS;
  // Regroupement par lieu de stockage
  const groups = {};
  shown.forEach(p => { const k = p.location || '— Sans lieu'; (groups[k] = groups[k] || []).push(p); });
  const keys = Object.keys(groups).sort((a, b) => a === '— Sans lieu' ? 1 : b === '— Sans lieu' ? -1 : a.localeCompare(b));
  const body = shown.length ? keys.map(k => `
      <div class="stock-group"><h3 class="stock-group-head"><span data-lucide="map-pin"></span> ${esc(k)}</h3>
      <div class="stock-list">${groups[k].map(stockRow).join('')}</div></div>`).join('') : (STOCK_FILTER ? '<p class="muted">Aucun produit pour ce filtre.</p>' : '<p class="muted">Aucun produit. Ajoutez-en avec « Produit ».</p>');
  c.innerHTML = `
    <div class="bara-card">
      <div class="bara-card-head"><h2><span data-lucide="package"></span> Produits &amp; stock</h2>
        <div style="display:flex;gap:8px"><button class="btn btn--ghost btn--md" id="loc-manage"><span data-lucide="map-pin"></span> Lieux</button><button class="btn btn--accent btn--md" id="stock-add"><span data-lucide="plus"></span> Produit</button></div></div>
      ${alerts.length ? `<div class="alert-row">${alerts.join('')}</div>` : ''}
      ${body}
    </div>
    <div class="bara-card" style="margin-top:16px">
      <h2><span data-lucide="clipboard-check"></span> Inventaire</h2>
      <p class="muted">1) Imprimez la feuille (avec lieux &amp; péremptions) · 2) comptez et cochez · 3) scannez et téléversez. Tous les inventaires sont consultables par l'association.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0">
        <a class="btn btn--secondary btn--md" href="/api/bar/manager/inventory-sheet" target="_blank" rel="noopener"><span data-lucide="printer"></span> Imprimer la feuille</a>
        <input type="file" id="inv-file" accept="image/*,application/pdf" hidden>
        <button class="btn btn--accent btn--md" id="inv-up"><span data-lucide="upload"></span> Téléverser un inventaire rempli</button>
      </div>
      <div class="stock-list">${INVENTORIES.length ? INVENTORIES.map(invRow).join('') : '<p class="muted">Aucun inventaire enregistré.</p>'}</div>
    </div>`;
  $$('[data-sfilter]', c).forEach(b => b.addEventListener('click', () => { const f = b.dataset.sfilter; STOCK_FILTER = (f === 'clear' || STOCK_FILTER === f) ? null : f; drawStock(); }));
  $('#stock-add').addEventListener('click', () => productModal());
  $('#loc-manage').addEventListener('click', locationsModal);
  $$('[data-sdec]', c).forEach(b => b.addEventListener('click', () => stockAdj(b.dataset.sdec, -1)));
  $$('[data-sinc]', c).forEach(b => b.addEventListener('click', () => stockAdj(b.dataset.sinc, 1)));
  $$('[data-sset]', c).forEach(b => b.addEventListener('click', () => stockSet(b.dataset.sset)));
  $$('[data-pedit]', c).forEach(b => b.addEventListener('click', () => productModal(PRODUCTS.find(p => p.id == b.dataset.pedit))));
  const fi = $('#inv-file', c), ub = $('#inv-up', c);
  ub.addEventListener('click', () => fi.click());
  fi.addEventListener('change', async () => {
    if (!fi.files[0]) return; ub.disabled = true; ub.textContent = 'Envoi…';
    try { const key = await barUpload(fi.files[0]); const note = prompt('Une note pour cet inventaire ? (facultatif)') || '';
      await api('/bar/manager/inventories', { method: 'POST', body: JSON.stringify({ filled_key: key, note, idate: new Date().toISOString().slice(0, 10) }) });
      toast('Inventaire enregistré'); await renderStockLoad(); drawStock();
    } catch (ex) { toast(ex.message, true); ub.disabled = false; ub.textContent = 'Téléverser un inventaire rempli'; }
  });
  $$('[data-invdel]', c).forEach(b => b.addEventListener('click', async () => { if (!confirm('Supprimer cet inventaire ?')) return; try { await api('/bar/manager/inventories/' + b.dataset.invdel, { method: 'DELETE' }); await renderStockLoad(); drawStock(); } catch (ex) { toast(ex.message, true); } }));
  icons();
}
function stockRow(p) {
  const exp = expiryState(p.expiry);
  const lowCls = isLowStock(p) ? 'low' : '';
  return `<div class="stock-item ${p.active ? '' : 'is-off'}">
    <div class="si-info"><span class="si-name">${esc(p.name)}${exp ? ` <span class="exp-badge ${exp.cls}">${exp.label}</span>` : ''}</span>
      <span class="si-meta">${eur(p.price)}${p.unit ? ' · ' + esc(p.unit) : ''}${Number(p.threshold) > 0 ? ' · seuil ' + p.threshold : ''}</span></div>
    <div class="si-stock"><button class="qbtn big" data-sdec="${p.id}">−</button><b class="${lowCls}" data-sset="${p.id}">${p.stock}</b><button class="qbtn big" data-sinc="${p.id}">+</button></div>
    <button class="icon-btn" data-pedit="${p.id}" title="Modifier"><span data-lucide="pencil"></span></button>
  </div>`;
}
function locationsModal() {
  openModal(`<h3>Lieux de stockage</h3>
    <div class="stock-list" id="loc-list">${STOCK_LOCATIONS.length ? STOCK_LOCATIONS.map(l => `<div class="stock-item"><span class="si-name">${esc(l.name)}</span><button class="icon-btn danger" data-locdel="${l.id}"><span data-lucide="trash-2"></span></button></div>`).join('') : '<p class="muted">Aucun lieu.</p>'}</div>
    <form id="loc-form" style="display:flex;gap:8px;margin-top:12px"><input name="name" placeholder="Ex. Frigo cuisine" required style="flex:1"><button class="btn btn--accent btn--md" type="submit">Ajouter</button></form>
    <div class="modal-actions"><button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Fermer</button></div>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#loc-form').addEventListener('submit', async ev => { ev.preventDefault(); try { await api('/bar/manager/locations', { method: 'POST', body: JSON.stringify({ name: ev.target.name.value.trim() }) }); STOCK_LOCATIONS = await api('/bar/manager/locations'); locationsModal(); } catch (ex) { toast(ex.message, true); } });
  $$('[data-locdel]').forEach(b => b.addEventListener('click', async () => { try { await api('/bar/manager/locations/' + b.dataset.locdel, { method: 'DELETE' }); STOCK_LOCATIONS = await api('/bar/manager/locations'); locationsModal(); } catch (ex) { toast(ex.message, true); } }));
  icons();
}
async function stockAdj(id, delta) { try { await api('/bar/manager/products/' + id + '/stock', { method: 'POST', body: JSON.stringify({ delta }) }); PRODUCTS = await api('/bar/manager/products'); drawStock(); } catch (ex) { toast(ex.message, true); } }
async function stockSet(id) { const p = PRODUCTS.find(x => x.id == id); const v = prompt('Stock pour « ' + p.name + ' » :', p.stock); if (v === null) return; try { await api('/bar/manager/products/' + id + '/stock', { method: 'POST', body: JSON.stringify({ set: Number(v) || 0 }) }); PRODUCTS = await api('/bar/manager/products'); drawStock(); } catch (ex) { toast(ex.message, true); } }
function productModal(p) {
  const e = p || {};
  const locOpts = `<option value="">— Aucun lieu —</option>` + STOCK_LOCATIONS.map(l => `<option value="${esc(l.name)}" ${e.location === l.name ? 'selected' : ''}>${esc(l.name)}</option>`).join('') + (e.location && !STOCK_LOCATIONS.some(l => l.name === e.location) ? `<option value="${esc(e.location)}" selected>${esc(e.location)}</option>` : '');
  openModal(`<h3>${p ? 'Modifier' : 'Ajouter'} un produit</h3><form id="p-form">
    <div class="field"><label>Nom</label><input name="name" value="${esc(e.name || '')}" required></div>
    <div class="form-grid2"><div class="field"><label>Prix de vente (€)</label><input name="price" type="number" step="0.01" min="0" value="${e.price != null ? esc(e.price) : ''}"></div><div class="field"><label>Prix d'achat (€)</label><input name="cost" type="number" step="0.01" min="0" value="${e.cost != null ? esc(e.cost) : ''}"></div></div>
    <div class="form-grid2"><div class="field"><label>Catégorie (caisse)</label><select name="category"><option value="">—</option>${['alcool', 'soft', 'sale', 'sucre'].map(k => `<option value="${k}" ${e.category === k ? 'selected' : ''}>${({ alcool: 'Alcool', soft: 'Soft', sale: 'Salé', sucre: 'Sucré' })[k]}</option>`).join('')}</select></div><div class="field"><label>Unité</label><input name="unit" value="${esc(e.unit || '')}" placeholder="verre, bouteille…"></div></div>
    <div class="field"><label>Lieu de stockage</label><select name="location">${locOpts}</select></div>
    <div class="form-grid2"><div class="field"><label>Date de péremption</label><input name="expiry" type="date" value="${esc(e.expiry || '')}"></div><div class="field"><label>Seuil de réappro</label><input name="threshold" type="number" step="1" min="0" value="${e.threshold != null ? esc(e.threshold) : ''}" placeholder="ex. 5"></div></div>
    ${p ? `<label style="display:flex;align-items:center;gap:8px;margin:4px 0"><input type="checkbox" name="active" ${e.active ? 'checked' : ''} style="width:auto"> Actif (visible en caisse)</label>` : '<div class="field"><label>Stock initial</label><input name="stock" type="number" step="1" min="0" value="0"></div>'}
    <div class="modal-actions"><button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button><button type="submit" class="btn btn--accent btn--md">${p ? 'Enregistrer' : 'Ajouter'}</button></div></form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#p-form').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    const payload = { name: f.name.value.trim(), price: f.price.value, cost: f.cost.value, unit: f.unit.value.trim(), location: f.location.value, expiry: f.expiry.value, threshold: f.threshold.value, category: f.category.value };
    try {
      if (p) { payload.active = f.active.checked ? 1 : 0; await api('/bar/manager/products/' + p.id, { method: 'PUT', body: JSON.stringify(payload) }); }
      else { payload.stock = f.stock.value; await api('/bar/manager/products', { method: 'POST', body: JSON.stringify(payload) }); }
      closeModal(); PRODUCTS = await api('/bar/manager/products'); toast('Produit enregistré'); drawStock();
    } catch (ex) { toast(ex.message, true); }
  });
}

/* ----- Inventaire ----- */
async function renderInventaire() {
  const c = $('#bara-content'); c.innerHTML = '<p class="muted">Chargement…</p>';
  const list = await api('/bar/manager/inventories');
  c.innerHTML = `<div class="bara-card">
    <h2><span data-lucide="clipboard-check"></span> Inventaire</h2>
    <p class="muted">1) Imprimez la feuille · 2) comptez et cochez à la main · 3) scannez et téléversez-la. Tous les inventaires sont consultables par l'association.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0">
      <a class="btn btn--secondary btn--md" href="/api/bar/manager/inventory-sheet" target="_blank" rel="noopener"><span data-lucide="printer"></span> Imprimer la feuille</a>
      <input type="file" id="inv-file" accept="image/*,application/pdf" hidden>
      <button class="btn btn--accent btn--md" id="inv-up"><span data-lucide="upload"></span> Téléverser un inventaire rempli</button>
    </div>
    <div class="stock-list">${list.length ? list.map(invRow).join('') : '<p class="muted">Aucun inventaire enregistré.</p>'}</div></div>`;
  const fi = $('#inv-file'), ub = $('#inv-up');
  ub.addEventListener('click', () => fi.click());
  fi.addEventListener('change', async () => {
    if (!fi.files[0]) return; ub.disabled = true; ub.textContent = 'Envoi…';
    try { const key = await barUpload(fi.files[0]); const note = prompt('Une note pour cet inventaire ? (facultatif)') || '';
      await api('/bar/manager/inventories', { method: 'POST', body: JSON.stringify({ filled_key: key, note, idate: new Date().toISOString().slice(0, 10) }) });
      toast('Inventaire enregistré'); renderInventaire();
    } catch (ex) { toast(ex.message, true); ub.disabled = false; ub.textContent = 'Téléverser un inventaire rempli'; }
  });
  $$('[data-invdel]', c).forEach(b => b.addEventListener('click', async () => { if (!confirm('Supprimer cet inventaire ?')) return; try { await api('/bar/manager/inventories/' + b.dataset.invdel, { method: 'DELETE' }); renderInventaire(); } catch (ex) { toast(ex.message, true); } }));
  icons();
}
function invRow(i) {
  return `<div class="stock-item"><div class="si-info"><span class="si-name">Inventaire du ${fmtDate(i.idate)}</span><span class="si-meta">${i.author ? esc(i.author) : ''}${i.note ? ' · ' + esc(i.note) : ''}</span></div>
    ${i.filled_key ? `<a class="btn btn--secondary btn--sm" href="/img/${esc(i.filled_key)}" target="_blank" rel="noopener">Voir</a>` : ''}
    <button class="icon-btn danger" data-invdel="${i.id}"><span data-lucide="trash-2"></span></button></div>`;
}

/* ----- Partenaires ----- */
async function renderPartners() {
  const c = $('#bara-content'); c.innerHTML = '<p class="muted">Chargement…</p>';
  const list = await api('/bar/manager/partners');
  c.innerHTML = `<div class="bara-card"><div class="bara-card-head"><h2><span data-lucide="handshake"></span> Partenaires du bar</h2><button class="btn btn--accent btn--md" id="pa-add"><span data-lucide="plus"></span> Ajouter</button></div>
    <div class="stock-list">${list.length ? list.map(partRow).join('') : '<p class="muted">Aucun partenaire.</p>'}</div></div>`;
  $('#pa-add').addEventListener('click', () => partnerModal());
  $$('[data-paedit]', c).forEach(b => b.addEventListener('click', () => partnerModal(list.find(p => p.id == b.dataset.paedit))));
  $$('[data-padel]', c).forEach(b => b.addEventListener('click', async () => { if (!confirm('Supprimer ce partenaire ?')) return; try { await api('/bar/manager/partners/' + b.dataset.padel, { method: 'DELETE' }); renderPartners(); } catch (ex) { toast(ex.message, true); } }));
  icons();
}
function partRow(p) {
  return `<div class="stock-item"><div class="si-info"><span class="si-name">${esc(p.name)}</span>${p.description ? `<span class="si-meta">${esc(p.description)}</span>` : ''}${(p.contact || p.link) ? `<span class="si-meta">${esc(p.contact || '')}${p.link ? ` · <a href="${esc(p.link)}" target="_blank" rel="noopener">site</a>` : ''}</span>` : ''}</div>
    <button class="icon-btn" data-paedit="${p.id}"><span data-lucide="pencil"></span></button><button class="icon-btn danger" data-padel="${p.id}"><span data-lucide="trash-2"></span></button></div>`;
}
function partnerModal(p) {
  const e = p || {};
  openModal(`<h3>${p ? 'Modifier' : 'Ajouter'} un partenaire</h3><form id="pa-form">
    <div class="field"><label>Nom</label><input name="name" value="${esc(e.name || '')}" required></div>
    <div class="field"><label>Description</label><textarea name="description">${esc(e.description || '')}</textarea></div>
    <div class="form-grid2"><div class="field"><label>Contact</label><input name="contact" value="${esc(e.contact || '')}"></div><div class="field"><label>Lien</label><input name="link" value="${esc(e.link || '')}" placeholder="https://"></div></div>
    <div class="modal-actions"><button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button><button type="submit" class="btn btn--accent btn--md">${p ? 'Enregistrer' : 'Ajouter'}</button></div></form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#pa-form').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    const payload = { name: f.name.value.trim(), description: f.description.value.trim(), contact: f.contact.value.trim(), link: f.link.value.trim() };
    try { if (p) await api('/bar/manager/partners/' + p.id, { method: 'PUT', body: JSON.stringify(payload) }); else await api('/bar/manager/partners', { method: 'POST', body: JSON.stringify(payload) });
      closeModal(); toast('Partenaire enregistré'); renderProjetsPartenaires(); } catch (ex) { toast(ex.message, true); }
  });
}

/* ----- Projets ----- */
const PROJ_STATUS = { idee: { label: 'Idée', badge: 'badge--neutral' }, en_cours: { label: 'En cours', badge: 'badge--ocre' }, termine: { label: 'Terminé', badge: 'badge--olive' } };
async function renderProjects() {
  const c = $('#bara-content'); c.innerHTML = '<p class="muted">Chargement…</p>';
  const list = await api('/bar/manager/projects');
  c.innerHTML = `<div class="bara-card-head" style="margin-bottom:14px"><h2 style="margin:0"><span data-lucide="folder-kanban"></span> Projets</h2><button class="btn btn--accent btn--md" id="pr-add"><span data-lucide="plus"></span> Nouveau projet</button></div>
    <div class="proj-list">${list.length ? list.map(projCard).join('') : '<p class="muted">Aucun projet.</p>'}</div>`;
  $('#pr-add').addEventListener('click', () => projectModal());
  $$('[data-predit]', c).forEach(b => b.addEventListener('click', () => projectModal(list.find(p => p.id == b.dataset.predit))));
  $$('[data-prdel]', c).forEach(b => b.addEventListener('click', async () => { if (!confirm('Supprimer ce projet ?')) return; try { await api('/bar/manager/projects/' + b.dataset.prdel, { method: 'DELETE' }); renderProjects(); } catch (ex) { toast(ex.message, true); } }));
  $$('[data-taskadd]', c).forEach(b => b.addEventListener('click', async () => { const label = prompt('Nouvelle tâche :'); if (!label) return; try { await api('/bar/manager/projects/' + b.dataset.taskadd + '/tasks', { method: 'POST', body: JSON.stringify({ label: label.trim() }) }); renderProjects(); } catch (ex) { toast(ex.message, true); } }));
  $$('[data-tasktoggle]', c).forEach(cb => cb.addEventListener('change', async () => { try { await api('/bar/manager/tasks/' + cb.dataset.tasktoggle, { method: 'PATCH', body: JSON.stringify({ done: cb.checked ? 1 : 0 }) }); cb.nextElementSibling.classList.toggle('done', cb.checked); } catch (ex) { toast(ex.message, true); } }));
  $$('[data-taskdel]', c).forEach(b => b.addEventListener('click', async () => { try { await api('/bar/manager/tasks/' + b.dataset.taskdel, { method: 'DELETE' }); renderProjects(); } catch (ex) { toast(ex.message, true); } }));
  icons();
}
function projCard(p) {
  const st = PROJ_STATUS[p.status] || PROJ_STATUS.en_cours;
  const done = p.tasks.filter(t => t.done).length;
  return `<div class="proj-card"><div class="proj-head"><div><h3>${esc(p.title)}</h3><span class="badge ${st.badge}">${st.label}</span>${p.amount != null ? ` <span class="muted">${eur(p.amount)}</span>` : ''}</div>
    <div style="white-space:nowrap"><button class="icon-btn" data-predit="${p.id}"><span data-lucide="pencil"></span></button><button class="icon-btn danger" data-prdel="${p.id}"><span data-lucide="trash-2"></span></button></div></div>
    ${p.description ? `<p class="muted" style="margin:6px 0">${esc(p.description)}</p>` : ''}
    ${p.document_key ? `<a href="/img/${esc(p.document_key)}" target="_blank" rel="noopener" class="muted" style="font-size:.9rem">📎 Devis / document</a>` : ''}
    <div class="proj-tasks"><div class="proj-tasks-head">Tâches (${done}/${p.tasks.length}) <button class="icon-btn" data-taskadd="${p.id}"><span data-lucide="plus"></span></button></div>
      ${p.tasks.map(t => `<label class="proj-task"><input type="checkbox" data-tasktoggle="${t.id}" ${t.done ? 'checked' : ''}><span class="${t.done ? 'done' : ''}">${esc(t.label)}</span><button class="icon-btn danger" data-taskdel="${t.id}"><span data-lucide="x"></span></button></label>`).join('')}
    </div>
    <div class="proj-tasks"><div class="proj-tasks-head"><span data-lucide="shopping-cart" style="width:14px;height:14px;vertical-align:-2px"></span> Articles caisse (${(p.items || []).length}) <button class="icon-btn" data-itemadd="${p.id}"><span data-lucide="plus"></span></button></div>
      ${(p.items || []).map(it => `<div class="proj-task"><span>${esc(it.name)}</span><span class="muted" style="margin-left:auto">${eur(it.price)}</span><button class="icon-btn danger" data-itemdel="${it.id}"><span data-lucide="x"></span></button></div>`).join('')}
      <div class="hint" style="margin-top:4px">Ces articles apparaissent dans la Caisse (onglet « 🎉 ${esc(p.title)} »).</div>
    </div></div>`;
}
function projectModal(p) {
  const e = p || {};
  openModal(`<h3>${p ? 'Modifier' : 'Nouveau'} projet</h3><form id="pr-form">
    <div class="field"><label>Titre</label><input name="title" value="${esc(e.title || '')}" required></div>
    <div class="form-grid2"><div class="field"><label>Statut</label><select name="status"><option value="idee" ${e.status === 'idee' ? 'selected' : ''}>Idée</option><option value="en_cours" ${(!e.status || e.status === 'en_cours') ? 'selected' : ''}>En cours</option><option value="termine" ${e.status === 'termine' ? 'selected' : ''}>Terminé</option></select></div>
      <div class="field"><label>Montant (€)</label><input name="amount" type="number" step="0.01" min="0" value="${e.amount != null ? esc(e.amount) : ''}"></div></div>
    <div class="form-grid2"><div class="field"><label>Date de début</label><input name="start_date" type="date" value="${esc(e.start_date || '')}"></div><div class="field"><label>Date de fin</label><input name="end_date" type="date" value="${esc(e.end_date || '')}"></div></div>
    <div class="field"><label>Description</label><textarea name="description">${esc(e.description || '')}</textarea></div>
    <div class="field"><label>Devis / document (facultatif)</label><input type="file" name="document" accept="image/*,application/pdf">${e.document_key ? '<div class="hint">Un document est déjà joint.</div>' : ''}</div>
    <div class="modal-actions"><button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button><button type="submit" class="btn btn--accent btn--md">${p ? 'Enregistrer' : 'Créer'}</button></div></form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#pr-form').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    try { const payload = { title: f.title.value.trim(), status: f.status.value, description: f.description.value.trim(), amount: f.amount.value || null, start_date: f.start_date.value, end_date: f.end_date.value };
      if (f.document.files[0]) payload.document_key = await barUpload(f.document.files[0]);
      if (p) await api('/bar/manager/projects/' + p.id, { method: 'PUT', body: JSON.stringify(payload) }); else await api('/bar/manager/projects', { method: 'POST', body: JSON.stringify(payload) });
      closeModal(); toast('Projet enregistré'); renderProjetsPartenaires(); } catch (ex) { toast(ex.message, true); }
  });
}

/* ----- Recettes ----- */
const SALE_METHOD = { especes: { label: 'Espèces', badge: 'badge--olive' }, carte: { label: 'Carte', badge: 'badge--ardoise' }, cadeau: { label: 'Cadeau', badge: 'badge--ocre' } };
let REC_SORT = 'date', REC_DIR = -1, SALES_CACHE = [];
let REC_F = { sellers: new Set(), methods: new Set(), items: new Set(), from: '', to: '', min: '', max: '' };
function saleItemsText(s) { return (s.items && s.items.length) ? s.items.map(i => i.name + '×' + i.qty).join(', ') : 'montant libre'; }
function recFilterActive() { return REC_F.sellers.size || REC_F.methods.size || REC_F.items.size || REC_F.from || REC_F.to || REC_F.min !== '' || REC_F.max !== ''; }
function saleMatches(s) {
  if (REC_F.sellers.size && !REC_F.sellers.has(s.seller || '—')) return false;
  if (REC_F.methods.size && !REC_F.methods.has(s.method || 'especes')) return false;
  if (REC_F.items.size) { const names = (s.items || []).map(i => i.name); if (!names.some(n => REC_F.items.has(n))) return false; }
  if (REC_F.from && (s.sdate || '') < REC_F.from) return false;
  if (REC_F.to && (s.sdate || '') > REC_F.to) return false;
  const t = Number(s.total) || 0;
  if (REC_F.min !== '' && t < Number(REC_F.min)) return false;
  if (REC_F.max !== '' && t > Number(REC_F.max)) return false;
  return true;
}
async function renderRecettes() {
  const c = $('#bara-content'); c.innerHTML = '<p class="muted">Chargement…</p>';
  SALES_CACHE = await api('/bar/manager/sales');
  drawRecettes();
}
function drawRecettes() {
  const c = $('#bara-content');
  const sellers = [...new Set(SALES_CACHE.map(s => s.seller || '—'))].sort();
  const methods = [...new Set(SALES_CACHE.map(s => s.method || 'especes'))];
  const items = [...new Set(SALES_CACHE.flatMap(s => (s.items || []).map(i => i.name)))].sort();
  const filtered = SALES_CACHE.filter(saleMatches);
  const totalF = filtered.reduce((s, x) => s + (Number(x.total) || 0), 0);
  const keyFns = { date: s => s.sdate + String(s.id).padStart(8, '0'), vendeur: s => (s.seller || '').toLowerCase(), items: s => saleItemsText(s).toLowerCase(), montant: s => Number(s.total) || 0 };
  const sorted = filtered.slice().sort((a, b) => { const ka = keyFns[REC_SORT](a), kb = keyFns[REC_SORT](b); return (ka < kb ? -1 : ka > kb ? 1 : 0) * REC_DIR; });
  const chip = (group, val, lbl) => `<button class="rec-chip ${REC_F[group].has(val) ? 'on' : ''}" data-fgroup="${group}" data-fval="${esc(String(val))}">${esc(lbl)}</button>`;
  const sortBtn = (k, lbl) => `<button class="sort-btn ${REC_SORT === k ? 'is-active' : ''}" data-sort="${k}">${lbl}${REC_SORT === k ? (REC_DIR === 1 ? ' ▲' : ' ▼') : ''}</button>`;
  c.innerHTML = `<div class="bara-card">
    <div class="bara-card-head"><h2><span data-lucide="trending-up"></span> Recettes</h2><button class="btn btn--ghost btn--sm" id="rec-reset" ${recFilterActive() ? '' : 'disabled'}><span data-lucide="x"></span> Réinitialiser les filtres</button></div>
    <div class="alert-row"><span class="stat-pill">${eur(totalF)}${recFilterActive() ? ' (filtré)' : ''}</span><span class="stat-pill">${filtered.length} / ${SALES_CACHE.length} encaissements</span></div>
    <div class="rec-filters">
      ${sellers.length ? `<div class="rec-fgroup"><span class="rec-flabel">Vendeur</span><div class="rec-chips">${sellers.map(v => chip('sellers', v, v)).join('')}</div></div>` : ''}
      <div class="rec-fgroup"><span class="rec-flabel">Méthode</span><div class="rec-chips">${methods.map(v => chip('methods', v, (SALE_METHOD[v] || { label: v }).label)).join('')}</div></div>
      ${items.length ? `<div class="rec-fgroup"><span class="rec-flabel">Item vendu</span><div class="rec-chips">${items.map(v => chip('items', v, v)).join('')}</div></div>` : ''}
      <div class="rec-fgroup"><span class="rec-flabel">Période</span><div class="rec-range"><input type="date" id="rf-from" value="${REC_F.from}"> → <input type="date" id="rf-to" value="${REC_F.to}"></div></div>
      <div class="rec-fgroup"><span class="rec-flabel">Montant (€)</span><div class="rec-range"><input type="number" step="0.01" min="0" id="rf-min" value="${REC_F.min}" placeholder="min" style="width:80px"> – <input type="number" step="0.01" min="0" id="rf-max" value="${REC_F.max}" placeholder="max" style="width:80px"></div></div>
    </div>
    <div class="sort-row">Trier : ${sortBtn('date', 'Date')}${sortBtn('vendeur', 'Vendeur')}${sortBtn('items', 'Items')}${sortBtn('montant', 'Montant')}</div>
    <div class="stock-list" style="margin-top:8px">${sorted.length ? sorted.map(s => { const m = SALE_METHOD[s.method] || SALE_METHOD.especes; return `<div class="stock-item"><div class="si-info"><span class="si-name">${eur(s.total)} <span class="badge ${m.badge}">${m.label}</span></span><span class="si-meta">${fmtDate(s.sdate)}${s.seller ? ' · <b>' + esc(s.seller) + '</b>' : ''} · ${esc(saleItemsText(s))}${s.note ? ' · ' + esc(s.note) : ''}</span></div><button class="icon-btn danger" data-saledel="${s.id}" title="Annuler (restaure le stock)"><span data-lucide="trash-2"></span></button></div>`; }).join('') : '<p class="muted">Aucune recette ne correspond aux filtres.</p>'}</div></div>`;
  $$('[data-fgroup]', c).forEach(b => b.addEventListener('click', () => { const g = b.dataset.fgroup, v = b.dataset.fval; const set = REC_F[g]; set.has(v) ? set.delete(v) : set.add(v); drawRecettes(); }));
  $('#rf-from', c).addEventListener('change', e => { REC_F.from = e.target.value; drawRecettes(); });
  $('#rf-to', c).addEventListener('change', e => { REC_F.to = e.target.value; drawRecettes(); });
  $('#rf-min', c).addEventListener('change', e => { REC_F.min = e.target.value; drawRecettes(); });
  $('#rf-max', c).addEventListener('change', e => { REC_F.max = e.target.value; drawRecettes(); });
  $('#rec-reset', c).addEventListener('click', () => { REC_F = { sellers: new Set(), methods: new Set(), items: new Set(), from: '', to: '', min: '', max: '' }; drawRecettes(); });
  $$('[data-sort]', c).forEach(b => b.addEventListener('click', () => { const k = b.dataset.sort; if (REC_SORT === k) REC_DIR *= -1; else { REC_SORT = k; REC_DIR = (k === 'date' || k === 'montant') ? -1 : 1; } drawRecettes(); }));
  $$('[data-saledel]', c).forEach(b => b.addEventListener('click', async () => { if (!confirm('Annuler cette recette ? Le stock sera restauré.')) return; try { await api('/bar/manager/sales/' + b.dataset.saledel, { method: 'DELETE' }); toast('Recette annulée'); renderRecettes(); } catch (ex) { toast(ex.message, true); } }));
  icons();
}

/* ----- Achats / remboursements ----- */
const PAY_LBL = { especes: 'Espèces', rib: 'Virement / RIB', wero: 'Wero', cheque: 'Chèque', autre: 'Autre' };
let BAR_TEAM = [];
const PAID_SHOWN = 8;
async function renderAchats() {
  const c = $('#bara-content'); c.innerHTML = '<p class="muted">Chargement…</p>';
  const [list, team] = await Promise.all([api('/bar/manager/purchases'), api('/bar/manager/team')]);
  BAR_TEAM = team;
  const treas = !!ME.treasurer;
  const due = list.filter(p => !p.reimbursed);
  const totalDue = due.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const paid = list.filter(p => p.reimbursed).sort((a, b) => (a.reimbursed_at < b.reimbursed_at ? 1 : -1));
  const paidShown = paid.slice(0, PAID_SHOWN);
  const row = p => `<div class="stock-item ${p.reimbursed ? 'is-paid' : ''}"><div class="si-info"><span class="si-name">${esc(p.designation)}${p.qty ? ' <span class="muted">×' + p.qty + '</span>' : ''} — ${eur(p.amount)}${p.receipt_key ? ` <a href="/img/${esc(p.receipt_key)}" target="_blank" rel="noopener" class="ticket-link" title="Voir le ticket">🧾</a>` : ''}</span>
      <span class="si-meta">${fmtDate(p.pdate)}${p.buyer ? ' · ' + esc(p.buyer) : ''}${p.method ? ' · ' + (PAY_LBL[p.method] || esc(p.method)) : ''}${p.reimbursed && p.reimbursed_at ? ' · remboursé le ' + fmtDate(p.reimbursed_at) : ''}${p.note ? ' · ' + esc(p.note) : ''}</span></div>
      <label class="reimb-check" title="${treas ? 'Marquer remboursé' : 'Réservé aux trésoriers'}"><input type="checkbox" data-reimb="${p.id}" ${p.reimbursed ? 'checked' : ''} ${treas ? '' : 'disabled'}> remboursé</label>
      ${p.reimbursed ? '<span class="lock-badge" title="Verrouillé"><span data-lucide="lock"></span></span>' : `<button class="icon-btn" data-puredit="${p.id}"><span data-lucide="pencil"></span></button><button class="icon-btn danger" data-purdel="${p.id}"><span data-lucide="trash-2"></span></button>`}</div>`;
  c.innerHTML = `<div class="bara-card">
    <div class="bara-card-head"><h2><span data-lucide="receipt"></span> Achats &amp; remboursements</h2><button class="btn btn--accent btn--md" id="pur-add"><span data-lucide="plus"></span> Achat</button></div>
    <div class="alert-row"><span class="stat-pill ${totalDue > 0 ? 'low' : ''}">${eur(totalDue)} à rembourser</span><span class="stat-pill">${due.length} en attente</span>${treas ? '<span class="stat-pill">🔑 Trésorier</span>' : ''}</div>
    ${treas ? '' : '<p class="hint" style="margin:6px 0 0">Seul un trésorier peut valider les remboursements. Les lignes remboursées sont verrouillées.</p>'}
    <h3 class="stock-group-head" style="margin-top:14px">À rembourser</h3>
    <div class="stock-list">${due.length ? due.map(row).join('') : '<p class="muted">Rien à rembourser.</p>'}</div>
    ${paid.length ? `<h3 class="stock-group-head" style="margin-top:16px">Remboursés récents${paid.length > PAID_SHOWN ? ` (${paidShown.length}/${paid.length})` : ''}</h3><div class="stock-list">${paidShown.map(row).join('')}</div>${paid.length > PAID_SHOWN ? '<p class="hint" style="margin-top:6px">Les remboursements plus anciens sont archivés.</p>' : ''}` : ''}
  </div>`;
  $('#pur-add').addEventListener('click', () => purchaseModal());
  $$('[data-puredit]', c).forEach(b => b.addEventListener('click', () => purchaseModal((list).find(p => p.id == b.dataset.puredit))));
  $$('[data-purdel]', c).forEach(b => b.addEventListener('click', async () => { if (!confirm('Supprimer cet achat ?')) return; try { await api('/bar/manager/purchases/' + b.dataset.purdel, { method: 'DELETE' }); renderAchats(); } catch (ex) { toast(ex.message, true); } }));
  $$('[data-reimb]', c).forEach(cb => cb.addEventListener('change', async () => { try { await api('/bar/manager/purchases/' + cb.dataset.reimb, { method: 'PUT', body: JSON.stringify({ reimbursed: cb.checked ? 1 : 0 }) }); renderAchats(); } catch (ex) { toast(ex.message, true); cb.checked = !cb.checked; } }));
  icons();
}
function purchaseModal(p) {
  const e = p || {};
  const buyerOpts = `<option value="">—</option>` + BAR_TEAM.map(t => `<option value="${esc(t.name)}" ${e.buyer === t.name ? 'selected' : ''}>${esc(t.name)}</option>`).join('') + (e.buyer && !BAR_TEAM.some(t => t.name === e.buyer) ? `<option value="${esc(e.buyer)}" selected>${esc(e.buyer)}</option>` : '');
  const methOpts = Object.entries(PAY_LBL).map(([k, v]) => `<option value="${k}" ${e.method === k ? 'selected' : ''}>${v}</option>`).join('');
  openModal(`<h3>${p ? 'Modifier' : 'Nouvel'} achat</h3><form id="pur-form">
    <div class="field"><label>Désignation</label><input name="designation" value="${esc(e.designation || '')}" required></div>
    <div class="form-grid2"><div class="field"><label>Quantité</label><input name="qty" type="number" step="1" min="0" value="${e.qty != null ? esc(e.qty) : ''}"></div><div class="field"><label>Montant (€)</label><input name="amount" type="number" step="0.01" min="0" value="${e.amount != null ? esc(e.amount) : ''}" required></div></div>
    <div class="form-grid2"><div class="field"><label>Acheté par</label><select name="buyer">${buyerOpts}</select></div><div class="field"><label>Date</label><input name="pdate" type="date" value="${esc(e.pdate || new Date().toISOString().slice(0, 10))}"></div></div>
    <div class="form-grid2"><div class="field"><label>Moyen de remboursement</label><select name="method"><option value="">—</option>${methOpts}</select></div><div class="field"><label>Note</label><input name="note" value="${esc(e.note || '')}"></div></div>
    <div class="field"><label>Facture / preuve d'achat (photo ou PDF)</label><input type="file" name="receipt" accept="image/*,application/pdf">${e.receipt_key ? ` <a href="/img/${esc(e.receipt_key)}" target="_blank" rel="noopener" class="hint">🧾 Preuve déjà jointe</a>` : ''}</div>
    ${ME.treasurer ? `<label style="display:flex;align-items:center;gap:8px;margin:4px 0"><input type="checkbox" name="reimbursed" ${e.reimbursed ? 'checked' : ''} style="width:auto"> Déjà remboursé</label>` : ''}
    <div class="modal-actions"><button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button><button type="submit" class="btn btn--accent btn--md">${p ? 'Enregistrer' : 'Ajouter'}</button></div></form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#pur-form').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    const payload = { designation: f.designation.value.trim(), qty: f.qty.value, amount: f.amount.value, buyer: f.buyer.value, pdate: f.pdate.value, method: f.method.value, note: f.note.value.trim() };
    if (f.reimbursed) payload.reimbursed = f.reimbursed.checked ? 1 : 0;
    try {
      if (f.receipt.files[0]) payload.receipt_key = await barUpload(f.receipt.files[0]);
      if (p) await api('/bar/manager/purchases/' + p.id, { method: 'PUT', body: JSON.stringify(payload) }); else await api('/bar/manager/purchases', { method: 'POST', body: JSON.stringify(payload) });
      closeModal(); toast('Achat enregistré'); renderAchats(); } catch (ex) { toast(ex.message, true); }
  });
}

/* ----- Équipiers : répertoire + frise de disponibilités ----- */
const WD_ABBR = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
function isoLocal(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
// On reste en heure locale : toISOString() repasserait en UTC et décalerait d'un jour (fuseau France → le mois démarrerait le 31 du mois précédent).
function addDays(iso, n) { const d = new Date(iso + 'T00:00'); d.setDate(d.getDate() + n); return isoLocal(d); }
function todayLocal() { return isoLocal(new Date()); }
function monthStart(iso) { return iso.slice(0, 7) + '-01'; }
function daysInMonth(iso) { const [y, m] = iso.split('-').map(Number); return new Date(y, m, 0).getDate(); }
function addMonths(iso, n) { const [y, m] = iso.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'; }
let AVAIL_START = monthStart(todayLocal());
const PAY_PREF_LBL = { wero: 'Wero', virement: 'Virement', liquide: 'Liquide', autre: 'Autre' };
function eqRow(t) {
  const meta = [];
  if (t.phone) meta.push(`<span class="eq-field">📞 <a href="tel:${esc(String(t.phone).replace(/[^+0-9]/g, ''))}">${esc(t.phone)}</a> <button class="eq-copy" data-copyval="${esc(t.phone)}" title="Copier le numéro"><span data-lucide="copy"></span><span class="eq-copy-txt">Copier</span></button></span>`);
  if (t.email) meta.push(`<span class="eq-field">✉ <a href="mailto:${esc(t.email)}">${esc(t.email)}</a> <button class="eq-copy" data-copyval="${esc(t.email)}" title="Copier l'e-mail"><span data-lucide="copy"></span><span class="eq-copy-txt">Copier</span></button></span>`);
  if (t.rib) meta.push(`<span class="eq-field">IBAN ${esc(t.rib)} <button class="eq-copy" data-copyval="${esc(t.rib)}" title="Copier l'IBAN"><span data-lucide="copy"></span><span class="eq-copy-txt">Copier</span></button></span>`);
  if (t.pay_method) meta.push(`<span class="badge badge--ocre">Remb. : ${esc(PAY_PREF_LBL[t.pay_method] || t.pay_method)}</span>`);
  const tag = t.is_manager ? ' <span class="badge badge--olive" title="A un accès à l\'espace gérant du bar">Gérant</span>' : (t.role ? ` <span class="badge badge--neutral">${esc(t.role)}</span>` : '');
  return `<div class="stock-item"><div class="si-info"><span class="si-name">${esc(t.name)}${tag}</span><span class="si-meta eq-meta">${meta.join('') || '—'}</span></div>
    <button class="icon-btn" data-eqedit="${t.id}" title="Modifier"><span data-lucide="pencil"></span></button>${t.is_manager ? '' : `<button class="icon-btn danger" data-eqdel="${t.id}" title="Supprimer"><span data-lucide="trash-2"></span></button>`}</div>`;
}
async function renderEquipiers() {
  const c = $('#bara-content'); c.innerHTML = '<p class="muted">Chargement…</p>';
  const from = AVAIL_START, ndays = daysInMonth(from), to = addDays(from, ndays - 1);
  const [list, avail, projects, purchases] = await Promise.all([api('/bar/manager/team'), api('/bar/manager/availability?from=' + from + '&to=' + to), api('/bar/manager/projects'), api('/bar/manager/purchases')]);
  const aset = new Set(avail.map(a => a.team_id + '|' + a.adate));
  const today = todayLocal();
  const cols = []; for (let i = 0; i < ndays; i++) { const d = addDays(from, i); const wd = new Date(d + 'T00:00').getDay(); cols.push({ d, wd, we: wd === 0 || wd === 6 }); }
  const headCells = cols.map(col => `<th class="${col.we ? 'we' : ''} ${col.d === today ? 'is-today' : ''}"><span class="fr-wd">${WD_ABBR[col.wd]}</span><span class="fr-dn">${Number(col.d.slice(8, 10))}</span></th>`).join('');
  // Achats des équipiers : un « A » dans la case du jour de l'achat — rouge si non remboursé, vert si remboursé.
  // Alimenté automatiquement par les achats saisis dans l'onglet Achats et remis à jour quand un achat est remboursé.
  const buyMap = {};
  const normName = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  purchases.forEach(p => {
    if (!p.pdate || p.pdate < from || p.pdate > to) return;
    const t = list.find(x => x.name === p.buyer) || list.find(x => p.buyer && normName(x.name).startsWith(normName(p.buyer)));
    if (!t) return;
    const k = t.id + '|' + p.pdate, m = buyMap[k] || (buyMap[k] = { paid: 0, unpaid: 0, items: [] });
    if (p.reimbursed) m.paid++; else m.unpaid++;
    m.items.push(p.designation + ' (' + (Number(p.amount) || 0).toFixed(2) + ' €)');
  });
  const buyMark = (tid, d) => { const m = buyMap[tid + '|' + d]; if (!m) return ''; const unpaid = m.unpaid > 0; return `<span class="fr-buy ${unpaid ? 'unpaid' : 'paid'}" title="${esc(m.items.join(', '))} — ${unpaid ? 'à rembourser' : 'remboursé'}">A</span>`; };
  const bodyRows = list.map(t => `<tr><th class="fr-name">${esc(t.name)}</th>${cols.map(col => `<td class="${col.we ? 'we' : ''}"><button class="fr-cell ${aset.has(t.id + '|' + col.d) ? 'on' : ''}" data-av="${t.id}|${col.d}"></button>${buyMark(t.id, col.d)}</td>`).join('')}</tr>`).join('');
  // Ligne Projets : couvre les jours entre date de début et date de fin
  const projsD = projects.filter(p => p.start_date || p.end_date);
  const projDays = {}, labelAt = {};
  projsD.forEach(p => { const a = p.start_date || p.end_date, b = p.end_date || p.start_date; const lo = a < b ? a : b, hi = a < b ? b : a; if (hi < from || lo > to) return; cols.forEach(col => { if (col.d >= lo && col.d <= hi) (projDays[col.d] = projDays[col.d] || []).push(p); }); const ld = lo < from ? from : lo; labelAt[ld] = labelAt[ld] ? labelAt[ld] + ' / ' + p.title : p.title; });
  const projRow = projsD.length ? `<tr class="fr-proj-row"><th class="fr-name"><span data-lucide="folder-kanban" style="width:14px;height:14px;vertical-align:-2px"></span> Projets</th>${cols.map(col => { const covered = (projDays[col.d] || []).length > 0; const lbl = labelAt[col.d]; const tip = (projDays[col.d] || []).map(p => p.title).join(', '); return `<td class="${col.we ? 'we' : ''} fr-proj-td"${covered ? ` title="${esc(tip)}"` : ''}><span class="fr-proj ${covered ? 'on' : ''}"></span>${lbl ? `<span class="fr-proj-label">${esc(lbl)}</span>` : ''}</td>`; }).join('')}</tr>` : '';
  const monthLbl = new Date(from + 'T00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  c.innerHTML = `
    <div class="bara-card">
      <div class="bara-card-head"><h2><span data-lucide="calendar-days"></span> Disponibilités</h2>
        <div style="display:flex;align-items:center;gap:6px"><button class="btn btn--ghost btn--sm" id="av-prev"><span data-lucide="chevron-left"></span></button><span class="muted" style="min-width:150px;text-align:center">${esc(monthLbl)}</span><button class="btn btn--ghost btn--sm" id="av-next"><span data-lucide="chevron-right"></span></button></div></div>
      <p class="muted">Touchez une case pour (dé)marquer un équipier disponible ce jour. La ligne <b>Projets</b> montre les projets datés. Un <b class="fr-buy-ex unpaid">A</b> rouge signale un achat à rembourser, <b class="fr-buy-ex paid">A</b> vert un achat remboursé.</p>
      ${list.length ? `<div class="frise-wrap"><table class="frise"><thead><tr><th class="fr-corner">Équipier</th>${headCells}</tr></thead><tbody>${projRow}${bodyRows}</tbody></table></div>` : '<p class="muted">Ajoutez des équipiers ci-dessous pour gérer les disponibilités.</p>'}
    </div>
    <div class="bara-card" style="margin-top:16px">
      <div class="bara-card-head"><h2><span data-lucide="users"></span> Répertoire des équipiers</h2><button class="btn btn--accent btn--md" id="eq-add"><span data-lucide="plus"></span> Équipier</button></div>
      <div class="stock-list">${list.length ? list.map(eqRow).join('') : '<p class="muted">Aucun équipier.</p>'}</div>
    </div>`;
  $('#av-prev').addEventListener('click', () => { AVAIL_START = addMonths(AVAIL_START, -1); renderEquipiers(); });
  $('#av-next').addEventListener('click', () => { AVAIL_START = addMonths(AVAIL_START, 1); renderEquipiers(); });
  $$('[data-av]', c).forEach(b => b.addEventListener('click', async () => {
    const [tid, d] = b.dataset.av.split('|'); const on = !b.classList.contains('on'); b.classList.toggle('on', on);
    try { await api('/bar/manager/availability', { method: 'POST', body: JSON.stringify({ team_id: Number(tid), adate: d, available: on ? 1 : 0 }) }); }
    catch (ex) { toast(ex.message, true); b.classList.toggle('on', !on); }
  }));
  $('#eq-add').addEventListener('click', () => teamModal());
  $$('[data-eqedit]', c).forEach(b => b.addEventListener('click', () => teamModal(list.find(t => t.id == b.dataset.eqedit))));
  $$('[data-copyval]', c).forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    navigator.clipboard.writeText(b.dataset.copyval).then(() => {
      const txt = b.querySelector('.eq-copy-txt'); const prev = txt ? txt.textContent : '';
      b.classList.add('is-copied'); if (txt) txt.textContent = 'Copié ✓';
      setTimeout(() => { b.classList.remove('is-copied'); if (txt) txt.textContent = prev; }, 1500);
      toast('Copié');
    }, () => toast('Copie impossible', true));
  }));
  $$('[data-eqdel]', c).forEach(b => b.addEventListener('click', async () => { if (!confirm('Supprimer cet équipier ?')) return; try { await api('/bar/manager/team/' + b.dataset.eqdel, { method: 'DELETE' }); renderEquipiers(); } catch (ex) { toast(ex.message, true); } }));
  icons();
}
function teamModal(t) {
  const e = t || {};
  openModal(`<h3>${t ? 'Modifier' : 'Ajouter'} un équipier</h3><form id="eq-form">
    <div class="form-grid2"><div class="field"><label>Nom</label><input name="name" value="${esc(e.name || '')}" required></div><div class="field"><label>Rôle</label><input name="role" value="${esc(e.role || '')}" placeholder="Coloc, bénévole…"></div></div>
    <div class="form-grid2"><div class="field"><label>Téléphone</label><input name="phone" value="${esc(e.phone || '')}"></div><div class="field"><label>E-mail</label><input name="email" type="email" value="${esc(e.email || '')}"></div></div>
    <div class="form-grid2">
      <div class="field"><label>IBAN</label><input name="rib" value="${esc(e.rib || '')}" placeholder="FR76 …"></div>
      <div class="field"><label>Moyen de remboursement demandé</label><select name="pay_method"><option value="">— Non précisé —</option>${['wero', 'virement', 'liquide', 'autre'].map(k => `<option value="${k}" ${e.pay_method === k ? 'selected' : ''}>${({ wero: 'Wero', virement: 'Virement', liquide: 'Liquide', autre: 'Autre' })[k]}</option>`).join('')}</select></div>
    </div>
    <div class="modal-actions"><button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button><button type="submit" class="btn btn--accent btn--md">${t ? 'Enregistrer' : 'Ajouter'}</button></div></form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#eq-form').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    const payload = { name: f.name.value.trim(), role: f.role.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), rib: f.rib.value.trim(), pay_method: f.pay_method.value };
    try { if (t) await api('/bar/manager/team/' + t.id, { method: 'PUT', body: JSON.stringify(payload) }); else await api('/bar/manager/team', { method: 'POST', body: JSON.stringify(payload) });
      closeModal(); toast('Équipier enregistré'); renderEquipiers(); } catch (ex) { toast(ex.message, true); }
  });
}

/* ----- Page publique ----- */
async function renderVitrine() {
  const c = $('#bara-content'); c.innerHTML = '<p class="muted">Chargement…</p>';
  const s = await api('/bar/manager/settings');
  c.innerHTML = `<div class="bara-card"><h2><span data-lucide="store"></span> Page publique du bar</h2>
    <p class="muted">Ce texte s'affiche sur la page publique du bar. La carte est générée automatiquement à partir des produits actifs.</p>
    <form id="vit-form" style="margin-top:12px">
      <div class="field"><label>Description</label><textarea name="bar_description" rows="4" class="consignes-input">${esc(s.bar_description || '')}</textarea></div>
      <div class="field"><label>Horaires</label><input name="bar_hours" class="consignes-input" value="${esc(s.bar_hours || '')}" placeholder="Ex. Vendredi &amp; samedi 18h–minuit"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px"><button class="btn btn--accent btn--md" type="submit">Enregistrer</button><a class="btn btn--ghost btn--md" href="/bar.html" target="_blank" rel="noopener"><span data-lucide="external-link"></span> Voir la page</a></div>
    </form></div>`;
  $('#vit-form').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    try { await api('/bar/manager/settings', { method: 'PUT', body: JSON.stringify({ bar_description: f.bar_description.value.trim(), bar_hours: f.bar_hours.value.trim() }) }); toast('Page publique enregistrée'); }
    catch (ex) { toast(ex.message, true); }
  });
  icons();
}

/* ----- Projets & partenaires (fusionnés) ----- */
async function renderProjetsPartenaires() {
  const c = $('#bara-content'); c.innerHTML = '<p class="muted">Chargement…</p>';
  const [projects, partners] = await Promise.all([api('/bar/manager/projects'), api('/bar/manager/partners')]);
  c.innerHTML = `
    <div class="bara-card-head" style="margin-bottom:12px"><h2 style="margin:0"><span data-lucide="folder-kanban"></span> Projets</h2><button class="btn btn--accent btn--md" id="pr-add"><span data-lucide="plus"></span> Projet</button></div>
    <div class="proj-list">${projects.length ? projects.map(projCard).join('') : '<p class="muted">Aucun projet.</p>'}</div>
    <div class="bara-card" style="margin-top:18px"><div class="bara-card-head"><h2><span data-lucide="handshake"></span> Partenaires</h2><button class="btn btn--accent btn--md" id="pa-add"><span data-lucide="plus"></span> Partenaire</button></div>
      <div class="stock-list">${partners.length ? partners.map(partRow).join('') : '<p class="muted">Aucun partenaire.</p>'}</div></div>`;
  const R = renderProjetsPartenaires;
  $('#pr-add').addEventListener('click', () => projectModal());
  $('#pa-add').addEventListener('click', () => partnerModal());
  $$('[data-predit]', c).forEach(b => b.addEventListener('click', () => projectModal(projects.find(p => p.id == b.dataset.predit))));
  $$('[data-prdel]', c).forEach(b => b.addEventListener('click', async () => { if (!confirm('Supprimer ce projet ?')) return; try { await api('/bar/manager/projects/' + b.dataset.prdel, { method: 'DELETE' }); R(); } catch (ex) { toast(ex.message, true); } }));
  $$('[data-taskadd]', c).forEach(b => b.addEventListener('click', async () => { const label = prompt('Nouvelle tâche :'); if (!label) return; try { await api('/bar/manager/projects/' + b.dataset.taskadd + '/tasks', { method: 'POST', body: JSON.stringify({ label: label.trim() }) }); R(); } catch (ex) { toast(ex.message, true); } }));
  $$('[data-tasktoggle]', c).forEach(cb => cb.addEventListener('change', async () => { try { await api('/bar/manager/tasks/' + cb.dataset.tasktoggle, { method: 'PATCH', body: JSON.stringify({ done: cb.checked ? 1 : 0 }) }); cb.nextElementSibling.classList.toggle('done', cb.checked); } catch (ex) { toast(ex.message, true); } }));
  $$('[data-taskdel]', c).forEach(b => b.addEventListener('click', async () => { try { await api('/bar/manager/tasks/' + b.dataset.taskdel, { method: 'DELETE' }); R(); } catch (ex) { toast(ex.message, true); } }));
  $$('[data-itemadd]', c).forEach(b => b.addEventListener('click', async () => { const name = prompt('Nom de l\'article (ex. Repas, Boisson) :'); if (!name) return; const price = prompt('Prix (€) :', '0'); if (price === null) return; try { await api('/bar/manager/projects/' + b.dataset.itemadd + '/items', { method: 'POST', body: JSON.stringify({ name: name.trim(), price: Number(price) || 0 }) }); R(); } catch (ex) { toast(ex.message, true); } }));
  $$('[data-itemdel]', c).forEach(b => b.addEventListener('click', async () => { try { await api('/bar/manager/project-items/' + b.dataset.itemdel, { method: 'DELETE' }); R(); } catch (ex) { toast(ex.message, true); } }));
  $$('[data-paedit]', c).forEach(b => b.addEventListener('click', () => partnerModal(partners.find(p => p.id == b.dataset.paedit))));
  $$('[data-padel]', c).forEach(b => b.addEventListener('click', async () => { if (!confirm('Supprimer ce partenaire ?')) return; try { await api('/bar/manager/partners/' + b.dataset.padel, { method: 'DELETE' }); R(); } catch (ex) { toast(ex.message, true); } }));
  icons();
}

/* ----- Matériel ----- */
async function renderMateriel() {
  const c = $('#bara-content'); c.innerHTML = '<p class="muted">Chargement…</p>';
  try { STOCK_LOCATIONS = await api('/bar/manager/locations'); } catch (_) {}
  const list = await api('/bar/manager/equipment');
  c.innerHTML = `<div class="bara-card"><div class="bara-card-head"><h2><span data-lucide="wrench"></span> Matériel du bar</h2><button class="btn btn--accent btn--md" id="eqp-add"><span data-lucide="plus"></span> Matériel</button></div>
    <div class="mat-grid">${list.length ? list.map(matCard).join('') : '<p class="muted">Aucun matériel enregistré.</p>'}</div></div>`;
  $('#eqp-add').addEventListener('click', () => equipmentModal());
  $$('[data-eqpedit]', c).forEach(b => b.addEventListener('click', () => equipmentModal(list.find(x => x.id == b.dataset.eqpedit))));
  $$('[data-eqpdel]', c).forEach(b => b.addEventListener('click', async () => { if (!confirm('Supprimer ce matériel ?')) return; try { await api('/bar/manager/equipment/' + b.dataset.eqpdel, { method: 'DELETE' }); renderMateriel(); } catch (ex) { toast(ex.message, true); } }));
  icons();
}
function matCard(m) {
  return `<div class="mat-card">
    ${m.photo_key ? `<a href="/img/${esc(m.photo_key)}" target="_blank" rel="noopener"><img class="mat-photo" src="/img/${esc(m.photo_key)}" alt=""></a>` : '<div class="mat-photo mat-photo--empty"><span data-lucide="wrench"></span></div>'}
    <div class="mat-body"><div class="mat-head"><strong>${esc(m.name)}</strong><span style="white-space:nowrap"><button class="icon-btn" data-eqpedit="${m.id}"><span data-lucide="pencil"></span></button><button class="icon-btn danger" data-eqpdel="${m.id}"><span data-lucide="trash-2"></span></button></span></div>
      ${m.location ? `<div class="mat-meta"><span data-lucide="map-pin"></span> ${esc(m.location)}</div>` : ''}
      ${m.note ? `<p class="mat-note">${esc(m.note)}</p>` : ''}
      ${m.invoice_key ? `<a class="btn btn--ghost btn--sm" href="/img/${esc(m.invoice_key)}" target="_blank" rel="noopener"><span data-lucide="file-text"></span> Facture</a>` : ''}
    </div></div>`;
}
function equipmentModal(m) {
  const e = m || {};
  const locOpts = `<option value="">— Aucun lieu —</option>` + STOCK_LOCATIONS.map(l => `<option value="${esc(l.name)}" ${e.location === l.name ? 'selected' : ''}>${esc(l.name)}</option>`).join('') + (e.location && !STOCK_LOCATIONS.some(l => l.name === e.location) ? `<option value="${esc(e.location)}" selected>${esc(e.location)}</option>` : '');
  openModal(`<h3>${m ? 'Modifier' : 'Ajouter'} du matériel</h3><form id="eqp-form">
    <div class="field"><label>Nom du matériel</label><input name="name" value="${esc(e.name || '')}" required></div>
    <div class="field"><label>Lieu de rangement</label><select name="location">${locOpts}</select></div>
    <div class="field"><label>Observation</label><textarea name="note">${esc(e.note || '')}</textarea></div>
    <div class="form-grid2"><div class="field"><label>Photo du rangement</label><input type="file" name="photo" accept="image/*">${e.photo_key ? '<div class="hint">Photo déjà jointe.</div>' : ''}</div>
      <div class="field"><label>Facture d'achat</label><input type="file" name="invoice" accept="image/*,application/pdf">${e.invoice_key ? '<div class="hint">Facture déjà jointe.</div>' : ''}</div></div>
    <div class="modal-actions"><button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button><button type="submit" class="btn btn--accent btn--md">${m ? 'Enregistrer' : 'Ajouter'}</button></div></form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#eqp-form').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    try {
      const payload = { name: f.name.value.trim(), location: f.location.value, note: f.note.value.trim() };
      if (f.photo.files[0]) payload.photo_key = await barUpload(f.photo.files[0]);
      if (f.invoice.files[0]) payload.invoice_key = await barUpload(f.invoice.files[0]);
      if (m) await api('/bar/manager/equipment/' + m.id, { method: 'PUT', body: JSON.stringify(payload) }); else await api('/bar/manager/equipment', { method: 'POST', body: JSON.stringify(payload) });
      closeModal(); toast('Matériel enregistré'); renderMateriel();
    } catch (ex) { toast(ex.message, true); }
  });
}

/* ----- Compte bancaire (Enable Banking) ----- */
async function renderBank() {
  const c = $('#bara-content'); c.innerHTML = '<p class="muted">Chargement…</p>';
  const s = await api('/bar/manager/bank');
  c.innerHTML = `<div class="bara-card">
    <h2 class="modal-title-row"><span data-lucide="landmark"></span> Compte bancaire du bar <button type="button" class="help-btn" id="bank-help" title="Aide : connexion du compte bancaire">?</button></h2>
    <p class="muted">Reliez le compte bancaire de l'association via <b>Enable Banking</b> pour voir le solde et les mouvements en lecture seule.</p>
    <div class="alert-row"><span class="stat-pill ${s.connected ? '' : 'low'}">${s.connected ? '🟢 Compte relié' : (s.configured ? '🟠 À connecter' : '⚪ Non configuré')}</span></div>
    ${s.connected ? `<p class="muted" style="margin-top:12px">Le solde et les derniers mouvements s'afficheront ici.</p>` : `
    <div class="bank-setup">
      <ol class="muted" style="line-height:1.7">
        <li>Créez une application sur <b>enablebanking.com</b> (gratuit en bac à sable).</li>
        <li>Renseignez l'<b>Application ID</b> ci-dessous ; la clé privée se configure côté serveur (sécurisé).</li>
        <li>Cliquez sur <b>Connecter</b> : vous serez redirigé vers votre banque pour autoriser l'accès (lecture seule).</li>
      </ol>
      <form id="bank-form" style="max-width:520px">
        <div class="field"><label>Application ID (Enable Banking)</label><input name="app_id" value="${esc(s.app_id || '')}" placeholder="xxxxxxxx-xxxx-xxxx"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn--accent btn--md" type="submit">Enregistrer</button>
        <button class="btn btn--secondary btn--md" type="button" id="bank-connect" ${s.configured ? '' : 'disabled'}><span data-lucide="link"></span> Connecter le compte</button></div>
      </form>
      <p class="hint" style="margin-top:12px">⚠️ La connexion réelle nécessite une clé privée Enable Banking et une URL de redirection publique (donc le site en ligne, pas le serveur de test local).</p>
    </div>`}</div>`;
  const bf = $('#bank-form', c);
  if (bf) bf.addEventListener('submit', async ev => { ev.preventDefault(); try { await api('/bar/manager/bank/config', { method: 'PUT', body: JSON.stringify({ app_id: ev.target.app_id.value.trim() }) }); toast('Configuration enregistrée'); renderBank(); } catch (ex) { toast(ex.message, true); } });
  const bc = $('#bank-connect', c);
  if (bc) bc.addEventListener('click', () => alert("La connexion Enable Banking se fera sur le site en ligne (redirection bancaire). Configuration à finaliser avec la clé privée côté serveur."));
  $('#bank-help', c).addEventListener('click', bankHelp);
  icons();
}
function bankHelp() {
  openModal(`<h3 class="modal-title-row"><span data-lucide="help-circle"></span> Relier le compte bancaire (Enable Banking)</h3>
    <p class="muted">Enable Banking permet de consulter le solde et les mouvements du compte de l'association, en <b>lecture seule</b> (aucun virement possible). Procédure :</p>
    <ol class="help-steps">
      <li>Créez un compte sur <b>enablebanking.com</b> (l'environnement bac à sable est gratuit).</li>
      <li>Créez une <b>Application</b> : vous obtenez un <b>Application ID</b> et vous générez une <b>paire de clés</b> — gardez précieusement la <b>clé privée</b>.</li>
      <li>Déclarez l'<b>URL de redirection</b> du site (ex. <code>https://lesamisdemontety.com/…</code>) dans votre application.</li>
      <li>Transmettez l'<b>Application ID</b> (à saisir ici) et la <b>clé privée</b> (installée côté serveur par l'administrateur, jamais affichée).</li>
      <li>Cliquez sur <b>Connecter le compte</b> : vous choisissez la banque de l'association et vous autorisez l'accès (consentement bancaire, valable quelques mois).</li>
      <li>Le <b>solde</b> et les <b>derniers mouvements</b> s'affichent ensuite dans cet onglet.</li>
    </ol>
    <p class="hint">La connexion réelle ne fonctionne que sur le <b>site en ligne</b> (la banque renvoie vers une adresse publique), pas sur le serveur de test local.</p>
    <div class="modal-actions"><button type="button" class="btn btn--accent btn--md" id="help-close">Compris</button></div>`);
  $('#help-close').addEventListener('click', closeModal);
  icons();
}

document.addEventListener('DOMContentLoaded', init);
