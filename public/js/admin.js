/* ===========================================================
   Les Amis de Montety — Espace administrateur (logique)
   =========================================================== */

const CATS = ['Atelier', 'Événement', 'Entraide', 'Sortie'];
const TONES = ['ocre', 'brique', 'olive', 'ardoise'];
const TONE_BY_CAT = { 'Atelier': 'ocre', 'Événement': 'brique', 'Entraide': 'olive', 'Sortie': 'ardoise' };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function icons() { if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } }); }

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...opts,
  });
  if (res.status === 401) { showLogin(); throw new Error('unauthorized'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

let toastTimer = null;
function toast(msg, isErr = false) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.toggle('err', isErr); t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s.length <= 10 ? s + 'T00:00' : s);
  if (isNaN(d)) return esc(s);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(s) {
  if (!s) return '';
  const d = new Date(s); if (isNaN(d)) return esc(s);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/* ----------------------------- Modale ----------------------------- */
function openModal(html) {
  $('#modal-card').innerHTML = html;
  $('#modal').hidden = false;
  icons();
}
function closeModal() { $('#modal').hidden = true; $('#modal-card').innerHTML = ''; }

/* ----------------------------- Authentification ----------------------------- */
function showLogin() { $('#dashboard').hidden = true; $('#login-screen').hidden = false; }
function showDashboard() { $('#login-screen').hidden = true; $('#dashboard').hidden = false; }

async function init() {
  // Modale : fermeture
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#login-error'); err.hidden = true;
    const btn = $('#login-submit'); btn.disabled = true; btn.textContent = 'Connexion…';
    try {
      const data = await api('/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email: $('#login-email').value.trim(), password: $('#login-password').value }),
      });
      $('#dash-user-name').textContent = data.name || data.email;
      showDashboard();
      switchView('dashboard');
    } catch (ex) {
      err.textContent = ex.message === 'unauthorized' ? 'E-mail ou mot de passe incorrect.' : ex.message;
      err.hidden = false;
    } finally { btn.disabled = false; btn.textContent = 'Se connecter'; }
  });

  $('#logout-btn').addEventListener('click', async () => {
    try { await api('/admin/logout', { method: 'POST' }); } catch (_) {}
    showLogin();
  });

  $('#dash-nav').addEventListener('click', e => {
    const b = e.target.closest('.dash-nav__item'); if (!b) return;
    switchView(b.dataset.view);
    $('.dash-side').classList.remove('is-open');
  });
  $('#dash-side-toggle').addEventListener('click', () => $('.dash-side').classList.toggle('is-open'));

  // Session déjà active ?
  try {
    const me = await api('/admin/me');
    $('#dash-user-name').textContent = me.name || me.email;
    showDashboard();
    switchView('dashboard');
  } catch (_) {
    showLogin();
  }
  icons();
}

/* ----------------------------- Navigation des vues ----------------------------- */
const VIEW_TITLES = {
  dashboard: 'Tableau de bord', events: 'Agenda', memberships: 'Adhésions',
  messages: 'Messages', donations: 'Dons', listings: 'Entraide', settings: 'Réglages',
};
function switchView(view) {
  $$('.dash-nav__item').forEach(b => b.classList.toggle('is-active', b.dataset.view === view));
  $('#view-title').textContent = VIEW_TITLES[view] || '';
  const render = { dashboard: renderDashboard, events: renderEvents, memberships: renderMemberships, messages: renderMessages, donations: renderDonations, listings: renderAdminListings, settings: renderSettings }[view];
  if (render) render();
}

async function refreshBadges() {
  try {
    const s = await api('/admin/stats');
    const bm = $('#badge-memberships'), bx = $('#badge-messages');
    bm.textContent = s.pendingMemberships; bm.hidden = !s.pendingMemberships;
    bx.textContent = s.unreadMessages; bx.hidden = !s.unreadMessages;
  } catch (_) {}
}

/* ----------------------------- Tableau de bord ----------------------------- */
async function renderDashboard() {
  const c = $('#dash-content');
  c.innerHTML = '<p class="muted">Chargement…</p>';
  const s = await api('/admin/stats');
  const cards = [
    { ic: 'user-plus', val: s.pendingMemberships, lbl: 'Adhésions en attente' },
    { ic: 'mail', val: s.unreadMessages, lbl: 'Messages non lus' },
    { ic: 'calendar-days', val: s.publishedEvents, lbl: 'Événements publiés' },
    { ic: 'hand-heart', val: (s.donationsTotal || 0).toLocaleString('fr-FR') + ' €', lbl: s.donationsCount + ' don(s) enregistré(s)' },
  ];
  c.innerHTML = `
    <div class="stat-grid">
      ${cards.map(k => `
        <div class="stat-card card">
          <div class="stat-ic"><span data-lucide="${k.ic}"></span></div>
          <div class="stat-val">${esc(k.val)}</div>
          <div class="stat-lbl">${esc(k.lbl)}</div>
        </div>`).join('')}
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Bienvenue 👋</h3></div>
      <div class="panel-body" style="padding:22px">
        <p class="muted" style="margin:0 0 12px">Gérez ici l'agenda du quartier, les demandes d'adhésion, les messages reçus et les dons.</p>
        <div style="display:flex; gap:12px; flex-wrap:wrap">
          <button class="btn btn--accent btn--sm" id="quick-event"><span data-lucide="plus"></span> Ajouter un événement</button>
          <button class="btn btn--secondary btn--sm" data-goto="memberships">Voir les adhésions</button>
          <button class="btn btn--secondary btn--sm" data-goto="messages">Voir les messages</button>
        </div>
      </div>
    </div>`;
  $('#quick-event').addEventListener('click', () => eventModal());
  $$('[data-goto]', c).forEach(b => b.addEventListener('click', () => switchView(b.dataset.goto)));
  icons();
  refreshBadges();
}

/* ----------------------------- Agenda (CRUD) ----------------------------- */
async function renderEvents() {
  const c = $('#dash-content');
  c.innerHTML = '<p class="muted">Chargement…</p>';
  const evs = await api('/admin/events');
  c.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3>Événements (${evs.length})</h3>
        <button class="btn btn--accent btn--sm" id="add-event"><span data-lucide="plus"></span> Ajouter un événement</button>
      </div>
      <div class="panel-body">
        ${evs.length ? `<table class="table">
          <thead><tr><th>Titre</th><th>Catégorie</th><th>Quand</th><th>État</th><th class="col-actions">Actions</th></tr></thead>
          <tbody>${evs.map(eventRow).join('')}</tbody>
        </table>` : `<div class="empty-state">Aucun événement. Cliquez sur « Ajouter un événement ».</div>`}
      </div>
    </div>`;
  $('#add-event').addEventListener('click', () => eventModal());
  $$('[data-edit]', c).forEach(b => b.addEventListener('click', () => eventModal(evs.find(e => e.id == b.dataset.edit))));
  $$('[data-del]', c).forEach(b => b.addEventListener('click', () => deleteEvent(b.dataset.del)));
  $$('[data-pub]', c).forEach(b => b.addEventListener('click', () => togglePublish(evs.find(e => e.id == b.dataset.pub))));
  icons();
}
function eventRow(e) {
  return `<tr>
    <td><div class="cell-title">${esc(e.title)}</div><div class="cell-sub">${esc(e.descr || '').slice(0, 60)}</div></td>
    <td><span class="badge badge--${esc(e.tone || TONE_BY_CAT[e.cat] || 'neutral')}">${esc(e.cat)}</span>${e.free ? ' <span class="badge badge--olive badge--solid">Gratuit</span>' : ''}</td>
    <td class="muted">${esc(e.when || fmtDate(e.starts_at))}</td>
    <td>${e.published ? '<span class="badge badge--olive">Publié</span>' : '<span class="badge badge--neutral">Brouillon</span>'}</td>
    <td class="col-actions">
      <button class="icon-btn" data-pub="${e.id}" title="${e.published ? 'Dépublier' : 'Publier'}"><span data-lucide="${e.published ? 'eye-off' : 'eye'}"></span></button>
      <button class="icon-btn" data-edit="${e.id}" title="Modifier"><span data-lucide="pencil"></span></button>
      <button class="icon-btn danger" data-del="${e.id}" title="Supprimer"><span data-lucide="trash-2"></span></button>
    </td></tr>`;
}
function eventModal(ev) {
  const e = ev || {};
  openModal(`
    <h3>${ev ? 'Modifier' : 'Ajouter'} un événement</h3>
    <form id="event-form">
      <div class="field"><label>Titre</label><input name="title" value="${esc(e.title || '')}" required /></div>
      <div class="form-grid2">
        <div class="field"><label>Catégorie</label><select name="cat">${CATS.map(x => `<option ${e.cat === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        <div class="field"><label>Couleur (ton)</label><select name="tone"><option value="">Auto (selon catégorie)</option>${TONES.map(x => `<option ${e.tone === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Quand (texte affiché)</label><input name="when" value="${esc(e.when || '')}" placeholder="JEU. 18 JUIN · 15H" /></div>
      <div class="form-grid2">
        <div class="field"><label>Date/heure (tri, facultatif)</label><input name="starts_at" type="datetime-local" value="${esc((e.starts_at || '').slice(0, 16))}" /></div>
        <div class="field"><label>Lieu</label><input name="location" value="${esc(e.location || '')}" placeholder="Place de Montety" /></div>
      </div>
      <div class="field"><label>Description</label><textarea name="descr">${esc(e.descr || '')}</textarea></div>
      <div class="field" style="display:flex; gap:24px; align-items:center">
        <label style="display:flex; align-items:center; gap:8px; margin:0"><input type="checkbox" name="free" ${e.free ? 'checked' : ''} style="width:auto"/> Gratuit</label>
        <label style="display:flex; align-items:center; gap:8px; margin:0"><input type="checkbox" name="published" ${e.published === 0 ? '' : 'checked'} style="width:auto"/> Publié</label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button>
        <button type="submit" class="btn btn--accent btn--md">${ev ? 'Enregistrer' : 'Ajouter'}</button>
      </div>
    </form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#event-form').addEventListener('submit', async ev2 => {
    ev2.preventDefault();
    const f = ev2.target;
    const payload = {
      title: f.title.value.trim(), cat: f.cat.value, tone: f.tone.value || null,
      when: f.when.value.trim(), starts_at: f.starts_at.value || null,
      location: f.location.value.trim(), descr: f.descr.value.trim(),
      free: f.free.checked, published: f.published.checked ? 1 : 0,
    };
    try {
      if (ev) await api('/admin/events/' + ev.id, { method: 'PUT', body: JSON.stringify(payload) });
      else await api('/admin/events', { method: 'POST', body: JSON.stringify(payload) });
      closeModal(); toast('Événement enregistré'); renderEvents();
    } catch (ex) { toast(ex.message, true); }
  });
}
async function deleteEvent(id) {
  if (!confirm('Supprimer cet événement ?')) return;
  try { await api('/admin/events/' + id, { method: 'DELETE' }); toast('Événement supprimé'); renderEvents(); }
  catch (ex) { toast(ex.message, true); }
}
async function togglePublish(e) {
  try { await api('/admin/events/' + e.id, { method: 'PUT', body: JSON.stringify({ ...e, free: !!e.free, published: e.published ? 0 : 1 }) }); renderEvents(); }
  catch (ex) { toast(ex.message, true); }
}

/* ----------------------------- Adhésions ----------------------------- */
async function renderMemberships() {
  const c = $('#dash-content');
  c.innerHTML = '<p class="muted">Chargement…</p>';
  const list = await api('/admin/memberships');
  c.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>Demandes d'adhésion (${list.length})</h3></div>
      <div class="panel-body">
        ${list.length ? `<table class="table">
          <thead><tr><th>Nom</th><th>Contact</th><th>Message</th><th>Statut</th><th class="col-actions">Actions</th></tr></thead>
          <tbody>${list.map(memberRow).join('')}</tbody>
        </table>` : `<div class="empty-state">Aucune demande pour l'instant.</div>`}
      </div>
    </div>`;
  $$('[data-acc]', c).forEach(b => b.addEventListener('click', () => setMember(b.dataset.acc, 'accepted')));
  $$('[data-dec]', c).forEach(b => b.addEventListener('click', () => setMember(b.dataset.dec, 'declined')));
  $$('[data-del]', c).forEach(b => b.addEventListener('click', () => delMember(b.dataset.del)));
  icons();
  refreshBadges();
}
function memberRow(m) {
  const badge = { pending: 'badge--ocre', accepted: 'badge--olive', declined: 'badge--brique' }[m.status] || 'badge--neutral';
  const label = { pending: 'En attente', accepted: 'Accepté', declined: 'Refusé' }[m.status] || m.status;
  return `<tr>
    <td><div class="cell-title">${esc(m.prenom)} ${esc(m.nom)}</div><div class="cell-sub">${esc(m.rue || '')}</div></td>
    <td><a href="mailto:${esc(m.email)}">${esc(m.email)}</a><div class="cell-sub">${fmtDateTime(m.created_at)}</div></td>
    <td class="muted">${esc(m.message || '')}</td>
    <td><span class="badge ${badge}">${esc(label)}</span></td>
    <td class="col-actions">
      <button class="icon-btn ok" data-acc="${m.id}" title="Accepter"><span data-lucide="check"></span></button>
      <button class="icon-btn" data-dec="${m.id}" title="Refuser"><span data-lucide="x"></span></button>
      <button class="icon-btn danger" data-del="${m.id}" title="Supprimer"><span data-lucide="trash-2"></span></button>
    </td></tr>`;
}
async function setMember(id, status) {
  try { await api('/admin/memberships/' + id, { method: 'PATCH', body: JSON.stringify({ status }) }); renderMemberships(); }
  catch (ex) { toast(ex.message, true); }
}
async function delMember(id) {
  if (!confirm('Supprimer cette demande ?')) return;
  try { await api('/admin/memberships/' + id, { method: 'DELETE' }); renderMemberships(); }
  catch (ex) { toast(ex.message, true); }
}

/* ----------------------------- Messages ----------------------------- */
async function renderMessages() {
  const c = $('#dash-content');
  c.innerHTML = '<p class="muted">Chargement…</p>';
  const list = await api('/admin/messages');
  c.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>Messages reçus (${list.length})</h3></div>
      <div class="panel-body" style="padding:0">
        ${list.length ? list.map(msgItem).join('') : `<div class="empty-state">Aucun message.</div>`}
      </div>
    </div>`;
  $$('.msg-head', c).forEach(h => h.addEventListener('click', () => {
    const item = h.closest('.msg-item');
    const body = $('.msg-body', item);
    body.hidden = !body.hidden;
    if (item.classList.contains('unread')) markRead(item.dataset.id, true, item);
  }));
  $$('[data-delmsg]', c).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); delMsg(b.dataset.delmsg); }));
  icons();
  refreshBadges();
}
function msgItem(m) {
  return `<div class="msg-item ${m.read ? '' : 'unread'}" data-id="${m.id}">
    <div class="msg-head">
      <span data-lucide="${m.read ? 'mail-open' : 'mail'}"></span>
      <span class="who">${esc(m.name)}</span>
      <span class="muted" style="font-size:.88rem">${esc(m.subject || '(sans sujet)')}</span>
      <span class="when">${fmtDateTime(m.created_at)}</span>
      <button class="icon-btn danger" data-delmsg="${m.id}" title="Supprimer"><span data-lucide="trash-2"></span></button>
    </div>
    <div class="msg-body" hidden>
      ${esc(m.message)}
      <div class="msg-meta"><a href="mailto:${esc(m.email)}?subject=Re: ${esc(m.subject || '')}">Répondre à ${esc(m.email)}</a></div>
    </div>
  </div>`;
}
async function markRead(id, read, item) {
  try { await api('/admin/messages/' + id, { method: 'PATCH', body: JSON.stringify({ read: read ? 1 : 0 }) });
    if (item) { item.classList.remove('unread'); const ic = item.querySelector('.msg-head [data-lucide]'); }
    refreshBadges();
  } catch (_) {}
}
async function delMsg(id) {
  if (!confirm('Supprimer ce message ?')) return;
  try { await api('/admin/messages/' + id, { method: 'DELETE' }); renderMessages(); }
  catch (ex) { toast(ex.message, true); }
}

/* ----------------------------- Dons ----------------------------- */
async function renderDonations() {
  const c = $('#dash-content');
  c.innerHTML = '<p class="muted">Chargement…</p>';
  const list = await api('/admin/donations');
  const total = list.reduce((a, d) => a + (Number(d.amount) || 0), 0);
  c.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3>Dons — ${total.toLocaleString('fr-FR')} € (${list.length})</h3>
        <button class="btn btn--accent btn--sm" id="add-don"><span data-lucide="plus"></span> Enregistrer un don</button>
      </div>
      <div class="panel-body">
        <p class="muted" style="padding:0 22px">Les dons en ligne sont gérés et suivis sur votre tableau de bord HelloAsso. Ce journal sert à noter les dons reçus par chèque, virement ou espèces.</p>
        ${list.length ? `<table class="table">
          <thead><tr><th>Donateur</th><th>Montant</th><th>Moyen</th><th>Date</th><th class="col-actions"></th></tr></thead>
          <tbody>${list.map(donRow).join('')}</tbody>
        </table>` : `<div class="empty-state">Aucun don enregistré.</div>`}
      </div>
    </div>`;
  $('#add-don').addEventListener('click', donModal);
  $$('[data-deldon]', c).forEach(b => b.addEventListener('click', () => delDon(b.dataset.deldon)));
  icons();
}
function donRow(d) {
  return `<tr>
    <td><div class="cell-title">${esc(d.donor || 'Anonyme')}</div><div class="cell-sub">${esc(d.email || '')}</div>${d.note ? `<div class="cell-sub">${esc(d.note)}</div>` : ''}</td>
    <td class="cell-title">${(Number(d.amount) || 0).toLocaleString('fr-FR')} €</td>
    <td class="muted">${esc(d.method)}</td>
    <td class="muted">${fmtDate(d.donated_at)}</td>
    <td class="col-actions"><button class="icon-btn danger" data-deldon="${d.id}" title="Supprimer"><span data-lucide="trash-2"></span></button></td>
  </tr>`;
}
function donModal() {
  openModal(`
    <h3>Enregistrer un don</h3>
    <form id="don-form">
      <div class="form-grid2">
        <div class="field"><label>Donateur</label><input name="donor" placeholder="Prénom Nom" /></div>
        <div class="field"><label>Montant (€)</label><input name="amount" type="number" min="0" step="0.01" required /></div>
      </div>
      <div class="form-grid2">
        <div class="field"><label>E-mail</label><input name="email" type="email" /></div>
        <div class="field"><label>Moyen</label><select name="method"><option value="cheque">Chèque</option><option value="virement">Virement</option><option value="especes">Espèces</option><option value="helloasso">HelloAsso</option></select></div>
      </div>
      <div class="field"><label>Date</label><input name="donated_at" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
      <div class="field"><label>Note</label><input name="note" placeholder="Remarque facultative" /></div>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button>
        <button type="submit" class="btn btn--accent btn--md">Enregistrer</button>
      </div>
    </form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#don-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/admin/donations', { method: 'POST', body: JSON.stringify({
        donor: f.donor.value.trim(), amount: Number(f.amount.value), email: f.email.value.trim(),
        method: f.method.value, donated_at: f.donated_at.value, note: f.note.value.trim(),
      }) });
      closeModal(); toast('Don enregistré'); renderDonations();
    } catch (ex) { toast(ex.message, true); }
  });
}
async function delDon(id) {
  if (!confirm('Supprimer ce don ?')) return;
  try { await api('/admin/donations/' + id, { method: 'DELETE' }); toast('Don supprimé'); renderDonations(); }
  catch (ex) { toast(ex.message, true); }
}

/* ----------------------------- Entraide (modération) ----------------------------- */
const LISTING_STATUS = {
  published: { badge: 'badge--olive', label: 'En ligne' },
  pending: { badge: 'badge--ocre', label: 'En attente' },
  hidden: { badge: 'badge--neutral', label: 'Masquée' },
};
async function renderAdminListings() {
  const c = $('#dash-content');
  c.innerHTML = '<p class="muted">Chargement…</p>';
  const list = await api('/admin/listings');
  c.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>Annonces d'entraide (${list.length})</h3></div>
      <div class="panel-body">
        ${list.length ? `<table class="table">
          <thead><tr><th>Annonce</th><th>Type</th><th>Déposée par</th><th>État</th><th class="col-actions">Actions</th></tr></thead>
          <tbody>${list.map(listingRow).join('')}</tbody>
        </table>` : `<div class="empty-state">Aucune annonce déposée.</div>`}
      </div>
    </div>`;
  $$('[data-pub]', c).forEach(b => b.addEventListener('click', () => setListing(b.dataset.pub, 'published')));
  $$('[data-hide]', c).forEach(b => b.addEventListener('click', () => setListing(b.dataset.hide, 'hidden')));
  $$('[data-del]', c).forEach(b => b.addEventListener('click', () => delListing(b.dataset.del)));
  icons();
}
function listingRow(l) {
  const st = LISTING_STATUS[l.status] || LISTING_STATUS.published;
  const typ = l.type === 'demande'
    ? '<span class="badge badge--brique">Je cherche</span>'
    : '<span class="badge badge--olive">Je propose</span>';
  const isLive = l.status === 'published';
  return `<tr>
    <td><div class="cell-title">${esc(l.title)}</div><div class="cell-sub">${esc((l.description || '').slice(0, 80))}</div>${l.category ? `<div class="cell-sub">${esc(l.category)}${l.area ? ' · ' + esc(l.area) : ''}</div>` : ''}</td>
    <td>${typ}</td>
    <td>${esc(l.author_name)}<div class="cell-sub">${esc(l.contact)}</div><div class="cell-sub">${fmtDate(l.created_at)}</div></td>
    <td><span class="badge ${st.badge}">${st.label}</span></td>
    <td class="col-actions">
      ${isLive
        ? `<button class="icon-btn" data-hide="${l.id}" title="Masquer"><span data-lucide="eye-off"></span></button>`
        : `<button class="icon-btn ok" data-pub="${l.id}" title="Publier"><span data-lucide="eye"></span></button>`}
      <button class="icon-btn danger" data-del="${l.id}" title="Supprimer"><span data-lucide="trash-2"></span></button>
    </td></tr>`;
}
async function setListing(id, status) {
  try { await api('/admin/listings/' + id, { method: 'PATCH', body: JSON.stringify({ status }) }); toast(status === 'published' ? 'Annonce publiée' : 'Annonce masquée'); renderAdminListings(); }
  catch (ex) { toast(ex.message, true); }
}
async function delListing(id) {
  if (!confirm('Supprimer définitivement cette annonce ?')) return;
  try { await api('/admin/listings/' + id, { method: 'DELETE' }); toast('Annonce supprimée'); renderAdminListings(); }
  catch (ex) { toast(ex.message, true); }
}

/* ----------------------------- Réglages ----------------------------- */
async function renderSettings() {
  const c = $('#dash-content');
  c.innerHTML = '<p class="muted">Chargement…</p>';
  const s = await api('/admin/settings');
  c.innerHTML = `
    <div class="panel" style="margin-bottom:24px">
      <div class="panel-head"><h3>Liens HelloAsso & contact</h3></div>
      <div class="panel-body" style="padding:22px">
        <p class="muted" style="margin:0 0 18px">Collez ici les liens de vos campagnes HelloAsso. Ils alimentent automatiquement les boutons « Adhérer en ligne » et « Faire un don » du site.</p>
        <form id="settings-form">
          <div class="field"><label>Lien HelloAsso — Adhésion</label><input name="helloasso_membership_url" type="url" value="${esc(s.helloasso_membership_url || '')}" placeholder="https://www.helloasso.com/associations/.../adhesions/..." /></div>
          <div class="field"><label>Lien HelloAsso — Don</label><input name="helloasso_donation_url" type="url" value="${esc(s.helloasso_donation_url || '')}" placeholder="https://www.helloasso.com/associations/.../formulaires/..." /></div>
          <div class="field"><label>E-mail de contact public</label><input name="contact_email" type="email" value="${esc(s.contact_email || '')}" /></div>
          <button class="btn btn--accent btn--md" type="submit">Enregistrer</button>
        </form>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Changer mon mot de passe</h3></div>
      <div class="panel-body" style="padding:22px">
        <form id="pwd-form" style="max-width:420px">
          <div class="field"><label>Mot de passe actuel</label><input name="current" type="password" autocomplete="current-password" required /></div>
          <div class="field"><label>Nouveau mot de passe (8 caractères min.)</label><input name="next" type="password" autocomplete="new-password" required /></div>
          <button class="btn btn--secondary btn--md" type="submit">Mettre à jour</button>
        </form>
      </div>
    </div>`;
  $('#settings-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/admin/settings', { method: 'PUT', body: JSON.stringify({
        helloasso_membership_url: f.helloasso_membership_url.value.trim(),
        helloasso_donation_url: f.helloasso_donation_url.value.trim(),
        contact_email: f.contact_email.value.trim(),
      }) });
      toast('Réglages enregistrés');
    } catch (ex) { toast(ex.message, true); }
  });
  $('#pwd-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/admin/change-password', { method: 'POST', body: JSON.stringify({ current: f.current.value, next: f.next.value }) });
      f.reset(); toast('Mot de passe mis à jour');
    } catch (ex) { toast(ex.message, true); }
  });
  icons();
}

document.addEventListener('DOMContentLoaded', init);
