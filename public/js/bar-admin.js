/* ===========================================================
   Les Amis de Montety — Espace gérant de bar (tactile)
   =========================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function eur(n) { return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
function icons() { if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } }); }
function fmtDate(s) { if (!s) return ''; const d = new Date(s.length <= 10 ? s + 'T00:00' : s); return isNaN(d) ? esc(s) : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }

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

let VIEW = 'board', PRODUCTS = [], CART = {};

async function init() {
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#login-error'); err.hidden = true;
    const btn = $('#login-submit'); btn.disabled = true; btn.textContent = 'Connexion…';
    try {
      const d = await api('/bar/manager/login', { method: 'POST', body: JSON.stringify({ email: $('#login-email').value.trim(), password: $('#login-password').value }) });
      $('#bara-name').textContent = d.name || ''; showPortal(); switchView('board');
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
  try { const me = await api('/bar/manager/me'); $('#bara-name').textContent = me.name || ''; showPortal(); switchView('board'); }
  catch (_) { showLogin(); }
  icons();
}
function switchView(v) {
  VIEW = v;
  $$('.bara-tab').forEach(b => b.classList.toggle('is-active', b.dataset.view === v));
  ({ board: renderBoard, caisse: renderCaisse, stock: renderStock, inventaire: renderInventaire, partners: renderPartners, projects: renderProjects }[v] || renderBoard)();
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
async function renderCaisse() {
  const c = $('#bara-content'); c.innerHTML = '<p class="muted">Chargement…</p>';
  PRODUCTS = await api('/bar/manager/products');
  drawCaisse();
}
function drawCaisse() {
  const c = $('#bara-content');
  const active = PRODUCTS.filter(p => p.active);
  const cart = Object.entries(CART).filter(([id, q]) => q > 0).map(([id, q]) => ({ p: PRODUCTS.find(x => x.id == id), q })).filter(x => x.p);
  const total = cart.reduce((s, { p, q }) => s + p.price * q, 0);
  c.innerHTML = `
    <div class="caisse-grid">
      <div class="caisse-products">${active.length ? active.map(p => `<button class="caisse-prod" data-add="${p.id}"><span class="cp-name">${esc(p.name)}</span><span class="cp-price">${eur(p.price)}</span><span class="cp-stock ${p.stock <= 5 ? 'low' : ''}">stock ${p.stock}</span></button>`).join('') : '<p class="muted">Aucun produit. Ajoutez-en dans l\'onglet Stock.</p>'}</div>
      <div class="caisse-ticket">
        <h3>Ticket</h3>
        <div class="ticket-rows">${cart.length ? cart.map(({ p, q }) => `<div class="ticket-row"><span class="tr-name">${esc(p.name)}</span><span class="tr-qty"><button class="qbtn" data-dec="${p.id}">−</button><b>${q}</b><button class="qbtn" data-inc="${p.id}">+</button></span><span class="tr-sum">${eur(p.price * q)}</span></div>`).join('') : '<p class="muted">Touchez un produit pour l\'ajouter.</p>'}</div>
        <div class="ticket-total">Total<strong>${eur(total)}</strong></div>
        <button class="btn btn--accent btn--lg btn--full" id="encaisser">Encaisser</button>
        ${cart.length ? '<button class="btn btn--ghost btn--md btn--full" id="clear" style="margin-top:8px">Vider</button>' : ''}
      </div>
    </div>`;
  $$('[data-add]', c).forEach(b => b.addEventListener('click', () => { CART[b.dataset.add] = (CART[b.dataset.add] || 0) + 1; drawCaisse(); }));
  $$('[data-inc]', c).forEach(b => b.addEventListener('click', () => { CART[b.dataset.inc] = (CART[b.dataset.inc] || 0) + 1; drawCaisse(); }));
  $$('[data-dec]', c).forEach(b => b.addEventListener('click', () => { const id = b.dataset.dec; CART[id] = Math.max(0, (CART[id] || 0) - 1); drawCaisse(); }));
  const cl = $('#clear', c); if (cl) cl.addEventListener('click', () => { CART = {}; drawCaisse(); });
  $('#encaisser', c).addEventListener('click', async () => {
    const items = Object.entries(CART).filter(([id, q]) => q > 0).map(([id, q]) => ({ product_id: Number(id), qty: q }));
    if (!items.length) { alert('Ajoutez des produits au ticket.'); return; }
    try { const r = await api('/bar/manager/sales', { method: 'POST', body: JSON.stringify({ items }) }); CART = {}; PRODUCTS = await api('/bar/manager/products'); toast('Encaissé : ' + eur(r.total)); drawCaisse(); }
    catch (ex) { toast(ex.message, true); }
  });
  icons();
}

/* ----- Stock (tactile) ----- */
async function renderStock() {
  const c = $('#bara-content'); c.innerHTML = '<p class="muted">Chargement…</p>';
  PRODUCTS = await api('/bar/manager/products');
  drawStock();
}
function drawStock() {
  const c = $('#bara-content');
  c.innerHTML = `
    <div class="bara-card">
      <div class="bara-card-head"><h2><span data-lucide="package"></span> Stock</h2><button class="btn btn--accent btn--md" id="stock-add"><span data-lucide="plus"></span> Produit</button></div>
      <div class="stock-list">${PRODUCTS.length ? PRODUCTS.map(stockRow).join('') : '<p class="muted">Aucun produit.</p>'}</div>
    </div>`;
  $('#stock-add').addEventListener('click', () => productModal());
  $$('[data-sdec]', c).forEach(b => b.addEventListener('click', () => stockAdj(b.dataset.sdec, -1)));
  $$('[data-sinc]', c).forEach(b => b.addEventListener('click', () => stockAdj(b.dataset.sinc, 1)));
  $$('[data-sset]', c).forEach(b => b.addEventListener('click', () => stockSet(b.dataset.sset)));
  $$('[data-pedit]', c).forEach(b => b.addEventListener('click', () => productModal(PRODUCTS.find(p => p.id == b.dataset.pedit))));
  icons();
}
function stockRow(p) {
  return `<div class="stock-item ${p.active ? '' : 'is-off'}">
    <div class="si-info"><span class="si-name">${esc(p.name)}</span><span class="si-meta">${eur(p.price)}${p.unit ? ' · ' + esc(p.unit) : ''}</span></div>
    <div class="si-stock"><button class="qbtn big" data-sdec="${p.id}">−</button><b class="${p.stock <= 5 ? 'low' : ''}" data-sset="${p.id}">${p.stock}</b><button class="qbtn big" data-sinc="${p.id}">+</button></div>
    <button class="icon-btn" data-pedit="${p.id}" title="Modifier"><span data-lucide="pencil"></span></button>
  </div>`;
}
async function stockAdj(id, delta) { try { await api('/bar/manager/products/' + id + '/stock', { method: 'POST', body: JSON.stringify({ delta }) }); PRODUCTS = await api('/bar/manager/products'); drawStock(); } catch (ex) { toast(ex.message, true); } }
async function stockSet(id) { const p = PRODUCTS.find(x => x.id == id); const v = prompt('Stock pour « ' + p.name + ' » :', p.stock); if (v === null) return; try { await api('/bar/manager/products/' + id + '/stock', { method: 'POST', body: JSON.stringify({ set: Number(v) || 0 }) }); PRODUCTS = await api('/bar/manager/products'); drawStock(); } catch (ex) { toast(ex.message, true); } }
function productModal(p) {
  const e = p || {};
  openModal(`<h3>${p ? 'Modifier' : 'Ajouter'} un produit</h3><form id="p-form">
    <div class="field"><label>Nom</label><input name="name" value="${esc(e.name || '')}" required></div>
    <div class="form-grid2"><div class="field"><label>Prix (€)</label><input name="price" type="number" step="0.01" min="0" value="${e.price != null ? esc(e.price) : ''}"></div><div class="field"><label>Unité</label><input name="unit" value="${esc(e.unit || '')}" placeholder="verre…"></div></div>
    ${p ? `<label style="display:flex;align-items:center;gap:8px;margin:4px 0"><input type="checkbox" name="active" ${e.active ? 'checked' : ''} style="width:auto"> Actif (visible en caisse)</label>` : '<div class="field"><label>Stock initial</label><input name="stock" type="number" step="1" min="0" value="0"></div>'}
    <div class="modal-actions"><button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button><button type="submit" class="btn btn--accent btn--md">${p ? 'Enregistrer' : 'Ajouter'}</button></div></form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#p-form').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    const payload = { name: f.name.value.trim(), price: f.price.value, unit: f.unit.value.trim() };
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
      closeModal(); toast('Partenaire enregistré'); renderPartners(); } catch (ex) { toast(ex.message, true); }
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
    </div></div>`;
}
function projectModal(p) {
  const e = p || {};
  openModal(`<h3>${p ? 'Modifier' : 'Nouveau'} projet</h3><form id="pr-form">
    <div class="field"><label>Titre</label><input name="title" value="${esc(e.title || '')}" required></div>
    <div class="form-grid2"><div class="field"><label>Statut</label><select name="status"><option value="idee" ${e.status === 'idee' ? 'selected' : ''}>Idée</option><option value="en_cours" ${(!e.status || e.status === 'en_cours') ? 'selected' : ''}>En cours</option><option value="termine" ${e.status === 'termine' ? 'selected' : ''}>Terminé</option></select></div>
      <div class="field"><label>Montant (€)</label><input name="amount" type="number" step="0.01" min="0" value="${e.amount != null ? esc(e.amount) : ''}"></div></div>
    <div class="field"><label>Description</label><textarea name="description">${esc(e.description || '')}</textarea></div>
    <div class="field"><label>Devis / document (facultatif)</label><input type="file" name="document" accept="image/*,application/pdf">${e.document_key ? '<div class="hint">Un document est déjà joint.</div>' : ''}</div>
    <div class="modal-actions"><button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button><button type="submit" class="btn btn--accent btn--md">${p ? 'Enregistrer' : 'Créer'}</button></div></form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#pr-form').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    try { const payload = { title: f.title.value.trim(), status: f.status.value, description: f.description.value.trim(), amount: f.amount.value || null };
      if (f.document.files[0]) payload.document_key = await barUpload(f.document.files[0]);
      if (p) await api('/bar/manager/projects/' + p.id, { method: 'PUT', body: JSON.stringify(payload) }); else await api('/bar/manager/projects', { method: 'POST', body: JSON.stringify(payload) });
      closeModal(); toast('Projet enregistré'); renderProjects(); } catch (ex) { toast(ex.message, true); }
  });
}

document.addEventListener('DOMContentLoaded', init);
