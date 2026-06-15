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
async function adminUpload(file) {
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Envoi de l\'image impossible');
  return d.key;
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

  $('#forgot-link').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = prompt('Entrez votre e-mail d\'administrateur. Vous recevrez un lien pour réinitialiser votre mot de passe.');
    if (!email) return;
    try { await fetch('/api/auth/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) }); } catch (_) {}
    alert('Si cette adresse correspond à un compte administrateur, un e-mail de réinitialisation vient d\'être envoyé.');
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
  messages: 'Messages', donations: 'Dons', accounting: 'Comptabilité', listings: 'Entraide',
  merchants: 'Commerçants', bar: 'Bar', devis: 'Lieu de vie', admins: 'Administrateurs',
  templates: 'Modèles', settings: 'Réglages',
};
function switchView(view) {
  $$('.dash-nav__item').forEach(b => b.classList.toggle('is-active', b.dataset.view === view));
  $('#view-title').textContent = VIEW_TITLES[view] || '';
  const render = { dashboard: renderDashboard, events: renderEvents, memberships: renderMemberships, messages: renderMessages, donations: renderDonations, accounting: renderAccounting, listings: renderAdminListings, merchants: renderAdminMerchants, bar: renderBar, devis: renderDevis, admins: renderAdmins, templates: renderTemplates, settings: renderSettings }[view];
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
let ADMIN_EVENTS = [], EV_VIEW = 'liste', CAL_REF = new Date();
const DOW_LBL = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTH_LBL = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

async function renderEvents() {
  const c = $('#dash-content');
  c.innerHTML = '<p class="muted">Chargement…</p>';
  ADMIN_EVENTS = await api('/admin/events');
  drawEvents();
}
function drawEvents() {
  const c = $('#dash-content');
  const tab = (v, lbl) => `<button class="seg-btn ${EV_VIEW === v ? 'is-active' : ''}" data-view="${v}">${lbl}</button>`;
  const nav = (EV_VIEW === 'liste') ? '' : `
    <div class="cal-nav">
      <button class="icon-btn" data-cal="prev"><span data-lucide="chevron-left"></span></button>
      <button class="btn btn--ghost btn--sm" data-cal="today">Aujourd'hui</button>
      <button class="icon-btn" data-cal="next"><span data-lucide="chevron-right"></span></button>
      <span class="cal-title">${calTitle()}</span>
    </div>`;
  c.innerHTML = `
    <div class="panel">
      <div class="panel-head" style="gap:12px">
        <div class="seg">${tab('liste', 'Liste')}${tab('semaine', 'Semaine')}${tab('mois', 'Mois')}</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          <a class="btn btn--secondary btn--sm" href="/api/admin/events.ics" title="Télécharger pour votre agenda"><span data-lucide="calendar-arrow-down"></span> Exporter</a>
          <button class="btn btn--accent btn--sm" id="add-event"><span data-lucide="plus"></span> Ajouter</button>
        </div>
      </div>
      ${nav}
      <div class="panel-body">${EV_VIEW === 'liste' ? listView() : EV_VIEW === 'semaine' ? weekView() : monthView()}</div>
    </div>`;
  $('#add-event').addEventListener('click', () => eventModal());
  $$('.seg-btn', c).forEach(b => b.addEventListener('click', () => { EV_VIEW = b.dataset.view; drawEvents(); }));
  $$('[data-cal]', c).forEach(b => b.addEventListener('click', () => moveCal(b.dataset.cal)));
  bindEventActions(c);
  icons();
}
function bindEventActions(c) {
  $$('[data-edit]', c).forEach(b => b.addEventListener('click', () => eventModal(ADMIN_EVENTS.find(e => e.id == b.dataset.edit))));
  $$('[data-del]', c).forEach(b => b.addEventListener('click', () => deleteEvent(b.dataset.del)));
  $$('[data-pub]', c).forEach(b => b.addEventListener('click', () => togglePublish(ADMIN_EVENTS.find(e => e.id == b.dataset.pub))));
  $$('[data-occ]', c).forEach(b => b.addEventListener('click', () => eventModal(ADMIN_EVENTS.find(e => e.id == b.dataset.occ))));
}
function listView() {
  const evs = ADMIN_EVENTS;
  return evs.length ? `<table class="table">
    <thead><tr><th>Titre</th><th>Catégorie</th><th>Quand</th><th>État</th><th class="col-actions">Actions</th></tr></thead>
    <tbody>${evs.map(eventRow).join('')}</tbody></table>`
    : `<div class="empty-state">Aucun événement. Cliquez sur « Ajouter ».</div>`;
}
function moveCal(dir) {
  if (dir === 'today') CAL_REF = new Date();
  else { const step = EV_VIEW === 'semaine' ? 7 : 0; const d = new Date(CAL_REF);
    if (EV_VIEW === 'semaine') d.setDate(d.getDate() + (dir === 'next' ? 7 : -7));
    else d.setMonth(d.getMonth() + (dir === 'next' ? 1 : -1));
    CAL_REF = d; }
  drawEvents();
}
function calTitle() {
  if (EV_VIEW === 'semaine') { const { start, end } = weekRange(CAL_REF);
    const e = new Date(end); e.setDate(e.getDate() - 1);
    return `${start.getDate()} ${MONTH_LBL[start.getMonth()]} – ${e.getDate()} ${MONTH_LBL[e.getMonth()]} ${e.getFullYear()}`; }
  return `${MONTH_LBL[CAL_REF.getMonth()]} ${CAL_REF.getFullYear()}`;
}
function weekRange(ref) {
  const start = new Date(ref); const dow = (start.getDay() + 6) % 7; // Lundi=0
  start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - dow);
  const end = new Date(start); end.setDate(start.getDate() + 7);
  return { start, end };
}
function eventRow(e) {
  const recurLbl = e.recur === 'weekly' ? ' · chaque semaine' : e.recur === 'monthly' ? ' · chaque mois' : '';
  return `<tr>
    <td><div class="cell-title">${esc(e.title)}</div><div class="cell-sub">${esc(e.descr || '').slice(0, 60)}</div></td>
    <td><span class="badge badge--${esc(e.tone || TONE_BY_CAT[e.cat] || 'neutral')}">${esc(e.cat)}</span>${e.free ? ' <span class="badge badge--olive badge--solid">Gratuit</span>' : ''}</td>
    <td class="muted">${esc(e.when || fmtDate(e.starts_at))}${recurLbl}</td>
    <td>${e.published ? '<span class="badge badge--olive">Publié</span>' : '<span class="badge badge--neutral">Brouillon</span>'}${e.reserved ? ' <span class="badge badge--brique">Réservé</span>' : ''}</td>
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
      <div class="form-grid2">
        <div class="field"><label>Récurrence</label>
          <select name="recur">
            <option value="" ${!e.recur ? 'selected' : ''}>Aucune (une seule date)</option>
            <option value="weekly" ${e.recur === 'weekly' ? 'selected' : ''}>Chaque semaine</option>
            <option value="monthly" ${e.recur === 'monthly' ? 'selected' : ''}>Chaque mois</option>
          </select>
          <div class="hint">Se répète à partir de la date ci-dessus.</div>
        </div>
        <div class="field"></div>
      </div>
      <div class="field"><label>Description</label><textarea name="descr">${esc(e.descr || '')}</textarea></div>
      <div class="field" style="display:flex; gap:24px; align-items:center; flex-wrap:wrap">
        <label style="display:flex; align-items:center; gap:8px; margin:0"><input type="checkbox" name="free" ${e.free ? 'checked' : ''} style="width:auto"/> Gratuit</label>
        <label style="display:flex; align-items:center; gap:8px; margin:0"><input type="checkbox" name="published" ${e.published === 0 ? '' : 'checked'} style="width:auto"/> Publié</label>
        <label style="display:flex; align-items:center; gap:8px; margin:0" title="Visible uniquement dans l'administration"><input type="checkbox" name="reserved" ${e.reserved ? 'checked' : ''} style="width:auto"/> Réservé (privé)</label>
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
      reserved: f.reserved.checked ? 1 : 0, recur: f.recur.value || null,
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

/* ----- vues calendrier ----- */
function pad2a(n) { return String(n).padStart(2, '0'); }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function nthWeekdayOfMonth(y, mon, dow, nth, h, min) {
  const first = new Date(y, mon, 1);
  const offset = (dow - first.getDay() + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  const d = new Date(y, mon, day, h || 0, min || 0);
  return d.getMonth() === mon ? d : null;
}
function expandOccurrences(events, rangeStart, rangeEnd) {
  const occ = [];
  for (const e of events) {
    if (!e.starts_at) continue;
    const base = new Date(e.starts_at.length <= 10 ? e.starts_at + 'T00:00' : e.starts_at);
    if (isNaN(base)) continue;
    if (!e.recur) {
      if (base >= rangeStart && base < rangeEnd) occ.push({ ev: e, date: base });
    } else if (e.recur === 'weekly') {
      let d = new Date(base);
      while (d < rangeStart) d.setDate(d.getDate() + 7);
      while (d < rangeEnd) { if (d >= base) occ.push({ ev: e, date: new Date(d) }); d.setDate(d.getDate() + 7); }
    } else if (e.recur === 'monthly') {
      const nth = Math.ceil(base.getDate() / 7), dow = base.getDay();
      let m = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
      while (m < rangeEnd) {
        const d = nthWeekdayOfMonth(m.getFullYear(), m.getMonth(), dow, nth, base.getHours(), base.getMinutes());
        if (d && d >= rangeStart && d < rangeEnd && d >= base) occ.push({ ev: e, date: d });
        m.setMonth(m.getMonth() + 1);
      }
    }
  }
  return occ.sort((a, b) => a.date - b.date);
}
function occChip(o) {
  const e = o.ev, tone = e.tone || TONE_BY_CAT[e.cat] || 'ardoise';
  const time = (e.starts_at && e.starts_at.length > 10) ? `<b>${pad2a(o.date.getHours())}:${pad2a(o.date.getMinutes())}</b> ` : '';
  const lock = e.reserved ? '<span data-lucide="lock"></span> ' : '';
  return `<button class="cal-chip cal-chip--${tone} ${e.published ? '' : 'is-draft'}" data-occ="${e.id}" title="${esc(e.title)}">${time}${lock}${esc(e.title)}</button>`;
}
function undatedNote() {
  const u = ADMIN_EVENTS.filter(e => !e.starts_at);
  return u.length ? `<p class="hint" style="padding:12px 22px 0">${u.length} événement(s) sans date précise — visibles en vue Liste.</p>` : '';
}
function weekView() {
  const { start, end } = weekRange(CAL_REF);
  const occ = expandOccurrences(ADMIN_EVENTS, start, end);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let cols = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const dayOcc = occ.filter(o => sameDay(o.date, d));
    cols += `<div class="cal-col ${d.getTime() === today.getTime() ? 'is-today' : ''}">
      <div class="cal-col-head">${DOW_LBL[i]} ${d.getDate()}</div>
      <div class="cal-col-body">${dayOcc.length ? dayOcc.map(occChip).join('') : '<span class="cal-empty">—</span>'}</div></div>`;
  }
  return `<div class="cal-scroll"><div class="cal-week">${cols}</div></div>${undatedNote()}`;
}
function monthView() {
  const y = CAL_REF.getFullYear(), m = CAL_REF.getMonth();
  const startDow = (new Date(y, m, 1).getDay() + 6) % 7;
  const gridStart = new Date(y, m, 1 - startDow); gridStart.setHours(0, 0, 0, 0);
  const gridEnd = new Date(gridStart); gridEnd.setDate(gridStart.getDate() + 42);
  const occ = expandOccurrences(ADMIN_EVENTS, gridStart, gridEnd);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    const dayOcc = occ.filter(o => sameDay(o.date, d));
    cells += `<div class="cal-cell ${d.getMonth() !== m ? 'is-out' : ''} ${d.getTime() === today.getTime() ? 'is-today' : ''}">
      <div class="cal-cell-day">${d.getDate()}</div>${dayOcc.map(occChip).join('')}</div>`;
  }
  return `<div class="cal-scroll"><div class="cal-month">
    <div class="cal-month-head">${DOW_LBL.map(l => `<div>${l}</div>`).join('')}</div>
    <div class="cal-grid">${cells}</div></div></div>${undatedNote()}`;
}

/* ----------------------------- Adhésions ----------------------------- */
async function renderMemberships() {
  const c = $('#dash-content');
  c.innerHTML = '<p class="muted">Chargement…</p>';
  const list = await api('/admin/memberships');
  c.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>Membres & adhésions (${list.length})</h3><button class="btn btn--accent btn--sm" id="add-member"><span data-lucide="user-plus"></span> Ajouter un membre</button></div>
      <div class="panel-body">
        ${list.length ? `<table class="table">
          <thead><tr><th>Nom</th><th>Type</th><th>Contact</th><th>Paiement</th><th>Statut</th><th class="col-actions">Actions</th></tr></thead>
          <tbody>${list.map(memberRow).join('')}</tbody>
        </table>` : `<div class="empty-state">Aucun membre pour l'instant.</div>`}
      </div>
    </div>`;
  $('#add-member').addEventListener('click', () => memberModal());
  $$('[data-acc]', c).forEach(b => b.addEventListener('click', () => setMember(b.dataset.acc, 'accepted')));
  $$('[data-dec]', c).forEach(b => b.addEventListener('click', () => setMember(b.dataset.dec, 'declined')));
  $$('[data-pay]', c).forEach(b => b.addEventListener('click', () => paymentModal(list.find(m => m.id == b.dataset.pay))));
  $$('[data-del]', c).forEach(b => b.addEventListener('click', () => delMember(b.dataset.del)));
  icons();
  refreshBadges();
}
const PAY_LBL = { especes: 'Espèces', cheque: 'Chèque', virement: 'Virement', helloasso: 'HelloAsso', cb: 'Carte' };
const MTYPE_LBL = { adherent: 'Adhérent', bienfaiteur: 'Bienfaiteur', donateur: 'Donateur', honneur: "Membre d'honneur" };
const MTYPE_BADGE = { adherent: 'badge--ardoise', bienfaiteur: 'badge--ocre', donateur: 'badge--brique', honneur: 'badge--olive' };
function memberModal() {
  openModal(`<h3>Ajouter un membre</h3><form id="member-form">
    <div class="form-grid2"><div class="field"><label>Prénom</label><input name="prenom" required></div><div class="field"><label>Nom</label><input name="nom" required></div></div>
    <div class="field"><label>E-mail (facultatif)</label><input name="email" type="email"></div>
    <div class="field"><label>Type de membre</label><select name="mtype">${Object.entries(MTYPE_LBL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <div class="form-grid2"><div class="field"><label>Montant (€)</label><input name="amount" type="number" min="0" step="0.01"></div>
      <div class="field"><label>Moyen</label><select name="pay_method"><option value="">—</option>${Object.entries(PAY_LBL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div></div>
    <div class="field"><label>Paiement</label><select name="pay_status"><option value="">Non payé</option><option value="attente">En attente d'encaissement</option><option value="encaisse">Encaissé</option></select></div>
    <p class="hint">Un membre « encaissé » alimente automatiquement la comptabilité (cotisation 756).</p>
    <div class="modal-actions"><button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button><button type="submit" class="btn btn--accent btn--md">Ajouter</button></div></form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#member-form').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    try {
      await api('/admin/memberships', { method: 'POST', body: JSON.stringify({
        prenom: f.prenom.value.trim(), nom: f.nom.value.trim(), email: f.email.value.trim(),
        mtype: f.mtype.value, amount: f.amount.value || null, pay_method: f.pay_method.value || null, pay_status: f.pay_status.value || null }) });
      closeModal(); toast('Membre ajouté'); renderMemberships();
    } catch (ex) { toast(ex.message, true); }
  });
}
function paymentModal(m) {
  const curPs = m.pay_status || (m.paid ? 'encaisse' : '');
  openModal(`
    <h3>Paiement — ${esc(m.prenom)} ${esc(m.nom)}</h3>
    <form id="pay-form">
      <div class="field"><label>Type de membre</label><select name="mtype">${Object.entries(MTYPE_LBL).map(([k, v]) => `<option value="${k}" ${m.mtype === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="form-grid2">
        <div class="field"><label>Montant (€)</label><input name="amount" type="number" min="0" step="0.01" value="${m.amount != null ? esc(m.amount) : ''}" /></div>
        <div class="field"><label>Moyen</label>
          <select name="pay_method"><option value="">—</option>${Object.entries(PAY_LBL).map(([k, v]) => `<option value="${k}" ${m.pay_method === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field"><label>État du paiement</label>
        <select name="pay_status">
          <option value="" ${!curPs ? 'selected' : ''}>Non payé</option>
          <option value="attente" ${curPs === 'attente' ? 'selected' : ''}>En attente d'encaissement</option>
          <option value="encaisse" ${curPs === 'encaisse' ? 'selected' : ''}>Encaissé</option>
        </select>
      </div>
      <p class="hint">« Encaissé » alimente automatiquement la comptabilité (cotisation 756). « En attente » garde la trace d'un chèque reçu mais non déposé.</p>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button>
        <button type="submit" class="btn btn--accent btn--md">Enregistrer</button>
      </div>
    </form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#pay-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/admin/memberships/' + m.id, { method: 'PATCH', body: JSON.stringify({
        mtype: f.mtype.value, amount: f.amount.value || null, pay_method: f.pay_method.value || null, pay_status: f.pay_status.value || null }) });
      closeModal(); toast('Paiement enregistré'); renderMemberships();
    } catch (ex) { toast(ex.message, true); }
  });
}
function memberRow(m) {
  const badge = { pending: 'badge--ocre', accepted: 'badge--olive', declined: 'badge--brique' }[m.status] || 'badge--neutral';
  const label = { pending: 'En attente', accepted: 'Accepté', declined: 'Refusé' }[m.status] || m.status;
  const amt = m.amount != null ? Number(m.amount).toLocaleString('fr-FR') + ' €' : '';
  let pay;
  if (m.pay_status === 'encaisse' || m.paid) pay = `<span class="badge badge--olive badge--solid">${amt || 'Payé'}</span>${m.pay_method ? `<div class="cell-sub">${esc(PAY_LBL[m.pay_method] || m.pay_method)}</div>` : ''}`;
  else if (m.pay_status === 'attente') pay = `<span class="badge badge--ocre">${amt || 'En attente'}</span><div class="cell-sub">en attente d'encaissement${m.pay_method ? ' · ' + esc(PAY_LBL[m.pay_method] || m.pay_method) : ''}</div>`;
  else pay = (m.amount != null ? `<span class="muted">${amt} — non encaissé</span>` : '<span class="cell-sub">—</span>');
  return `<tr>
    <td><div class="cell-title">${esc(m.prenom)} ${esc(m.nom)}</div><div class="cell-sub">${esc(m.rue || '')}</div>${m.message ? `<div class="cell-sub">${esc(m.message)}</div>` : ''}</td>
    <td><span class="badge ${MTYPE_BADGE[m.mtype] || 'badge--neutral'}">${esc(MTYPE_LBL[m.mtype] || m.mtype || 'Adhérent')}</span></td>
    <td>${m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : '<span class="muted">—</span>'}<div class="cell-sub">${fmtDateTime(m.created_at)}</div></td>
    <td>${pay}</td>
    <td><span class="badge ${badge}">${esc(label)}</span></td>
    <td class="col-actions">
      <button class="icon-btn ok" data-acc="${m.id}" title="Accepter"><span data-lucide="check"></span></button>
      <button class="icon-btn" data-dec="${m.id}" title="Refuser"><span data-lucide="x"></span></button>
      <button class="icon-btn" data-pay="${m.id}" title="Enregistrer le paiement"><span data-lucide="banknote"></span></button>
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
  $$('[data-thank]', c).forEach(b => b.addEventListener('click', () => thankDon(b.dataset.thank)));
  icons();
}
function donRow(d) {
  return `<tr>
    <td><div class="cell-title">${esc(d.donor || 'Anonyme')}</div><div class="cell-sub">${esc(d.email || '')}</div>${d.note ? `<div class="cell-sub">${esc(d.note)}</div>` : ''}</td>
    <td class="cell-title">${(Number(d.amount) || 0).toLocaleString('fr-FR')} €</td>
    <td class="muted">${esc(d.method)}</td>
    <td class="muted">${fmtDate(d.donated_at)}</td>
    <td class="col-actions">
      <a class="icon-btn" href="/api/admin/donations/${d.id}/attestation" target="_blank" rel="noopener" title="Reçu fiscal"><span data-lucide="receipt"></span></a>
      ${d.email ? `<button class="icon-btn" data-thank="${d.id}" title="Envoyer un remerciement"><span data-lucide="mail"></span></button>` : ''}
      <button class="icon-btn danger" data-deldon="${d.id}" title="Supprimer"><span data-lucide="trash-2"></span></button>
    </td>
  </tr>`;
}
async function thankDon(id) {
  if (!confirm('Envoyer un e-mail de remerciement à ce donateur ?')) return;
  try { await api('/admin/donations/' + id + '/thank', { method: 'POST', body: '{}' }); toast('Remerciement envoyé'); }
  catch (ex) { toast(ex.message, true); }
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

/* ----------------------------- Commerçants ----------------------------- */
const M_TYPES_ADMIN = ['boulangerie', 'boucherie', 'epicerie', 'primeur', 'pizzeria', 'restaurant', 'bar', 'cafe', 'fleuriste', 'coiffeur', 'autre'];
const M_TYPE_LBL = { boulangerie: 'Boulangerie', boucherie: 'Boucherie', epicerie: 'Épicerie', primeur: 'Primeur', pizzeria: 'Pizzeria', restaurant: 'Restaurant', bar: 'Bar', cafe: 'Café', fleuriste: 'Fleuriste', coiffeur: 'Coiffeur', autre: 'Autre commerce' };
const KIND_LBL = { invendu: 'Invendu', promo: 'Promo', annonce: 'Annonce' };

async function renderAdminMerchants() {
  const c = $('#dash-content');
  c.innerHTML = '<p class="muted">Chargement…</p>';
  const [mers, posts] = await Promise.all([api('/admin/merchants'), api('/admin/merchant-posts')]);
  c.innerHTML = `
    <div class="panel" style="margin-bottom:24px">
      <div class="panel-head">
        <h3>Comptes commerçants (${mers.length})</h3>
        <button class="btn btn--accent btn--sm" id="add-merchant"><span data-lucide="plus"></span> Ajouter un commerçant</button>
      </div>
      <div class="panel-body">
        ${mers.length ? `<table class="table">
          <thead><tr><th>Commerce</th><th>Type</th><th>Identifiant</th><th>État</th><th class="col-actions">Actions</th></tr></thead>
          <tbody>${mers.map(merRow).join('')}</tbody></table>`
          : `<div class="empty-state">Aucun commerçant. Cliquez sur « Ajouter un commerçant ».</div>`}
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Annonces des commerçants (${posts.length})</h3></div>
      <div class="panel-body">
        ${posts.length ? `<table class="table">
          <thead><tr><th>Annonce</th><th>Commerce</th><th>État</th><th class="col-actions">Actions</th></tr></thead>
          <tbody>${posts.map(mPostRow).join('')}</tbody></table>`
          : `<div class="empty-state">Aucune annonce publiée par les commerçants.</div>`}
      </div>
    </div>`;
  $('#add-merchant').addEventListener('click', () => merchantModal());
  $$('[data-edit]', c).forEach(b => b.addEventListener('click', () => merchantModal(mers.find(m => m.id == b.dataset.edit))));
  $$('[data-pwd]', c).forEach(b => b.addEventListener('click', () => merchantPwdModal(b.dataset.pwd)));
  $$('[data-delmer]', c).forEach(b => b.addEventListener('click', () => delMerchant(b.dataset.delmer)));
  $$('[data-mphide]', c).forEach(b => b.addEventListener('click', () => setMPost(b.dataset.mphide, 'hidden')));
  $$('[data-mpshow]', c).forEach(b => b.addEventListener('click', () => setMPost(b.dataset.mpshow, 'published')));
  $$('[data-mpdel]', c).forEach(b => b.addEventListener('click', () => delMPost(b.dataset.mpdel)));
  icons();
}
function merRow(m) {
  return `<tr>
    <td><div class="cell-title">${esc(m.name)}</div><div class="cell-sub">${esc(m.address || '')}</div></td>
    <td><span class="badge badge--ocre">${esc(M_TYPE_LBL[m.type] || m.type)}</span><div class="cell-sub">${m.post_count} annonce(s)</div></td>
    <td><code>${esc(m.slug)}</code></td>
    <td>${m.active ? '<span class="badge badge--olive">Actif</span>' : '<span class="badge badge--neutral">Désactivé</span>'}</td>
    <td class="col-actions">
      <button class="icon-btn" data-pwd="${m.id}" title="Réinitialiser le mot de passe"><span data-lucide="key-round"></span></button>
      <button class="icon-btn" data-edit="${m.id}" title="Modifier"><span data-lucide="pencil"></span></button>
      <button class="icon-btn danger" data-delmer="${m.id}" title="Supprimer"><span data-lucide="trash-2"></span></button>
    </td></tr>`;
}
function mPostRow(p) {
  const isLive = p.status !== 'hidden';
  return `<tr>
    <td><span class="badge badge--ardoise">${esc(KIND_LBL[p.kind] || p.kind)}</span> <span class="cell-title">${esc(p.title)}</span>
      ${p.price ? `<div class="cell-sub">${esc(p.price)}</div>` : ''}</td>
    <td>${esc(p.merchant_name)}<div class="cell-sub">${fmtDate(p.created_at)}</div></td>
    <td>${isLive ? '<span class="badge badge--olive">En ligne</span>' : '<span class="badge badge--neutral">Masquée</span>'}</td>
    <td class="col-actions">
      ${isLive ? `<button class="icon-btn" data-mphide="${p.id}" title="Masquer"><span data-lucide="eye-off"></span></button>`
               : `<button class="icon-btn ok" data-mpshow="${p.id}" title="Publier"><span data-lucide="eye"></span></button>`}
      <button class="icon-btn danger" data-mpdel="${p.id}" title="Supprimer"><span data-lucide="trash-2"></span></button>
    </td></tr>`;
}
function merchantModal(m) {
  const e = m || {};
  const typeOpts = M_TYPES_ADMIN.map(t => `<option value="${t}" ${e.type === t ? 'selected' : ''}>${M_TYPE_LBL[t]}</option>`).join('');
  openModal(`
    <h3>${m ? 'Modifier' : 'Ajouter'} un commerçant</h3>
    <form id="merchant-form">
      <div class="field-row">
        <div class="field"><label>Nom du commerce</label><input name="name" value="${esc(e.name || '')}" required /></div>
        <div class="field"><label>Type</label><select name="type">${typeOpts}</select></div>
      </div>
      ${m ? `<div class="field"><label>Identifiant de connexion</label><input value="${esc(e.slug || '')}" disabled /><div class="hint">L'identifiant ne se modifie pas. Utilisez la clé pour changer le mot de passe.</div></div>`
          : `<div class="field-row">
               <div class="field"><label>Identifiant (login)</label><input name="slug" placeholder="boulangerie-martin" /><div class="hint">Laissez vide pour le générer depuis le nom.</div></div>
               <div class="field"><label>Mot de passe</label><input name="password" type="text" placeholder="6 caractères min." required /></div>
             </div>`}
      <div class="field"><label>Description</label><textarea name="description">${esc(e.description || '')}</textarea></div>
      <div class="field-row">
        <div class="field"><label>Adresse</label><input name="address" value="${esc(e.address || '')}" placeholder="12 rue de Montety, Toulon" /></div>
        <div class="field"><label>Téléphone</label><input name="phone" value="${esc(e.phone || '')}" placeholder="04 94 00 00 00" /></div>
      </div>
      ${m ? `<div class="field" style="margin-top:14px"><label>Photo de la boutique</label>
        ${e.photo_key ? `<img src="/img/${esc(e.photo_key)}" alt="" style="width:96px;height:96px;object-fit:cover;border-radius:12px;display:block;margin-bottom:8px" />` : ''}
        <input type="file" name="photo" accept="image/*" /><div class="hint">JPEG, PNG ou WebP · 3 Mo max.</div></div>
      <label style="display:flex; align-items:center; gap:8px; margin:4px 0 0"><input type="checkbox" name="active" ${e.active ? 'checked' : ''} style="width:auto" /> Compte actif</label>` : ''}
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button>
        <button type="submit" class="btn btn--accent btn--md">${m ? 'Enregistrer' : 'Créer le compte'}</button>
      </div>
    </form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#merchant-form').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    const payload = { name: f.name.value.trim(), type: f.type.value,
      description: f.description.value.trim(), address: f.address.value.trim(), phone: f.phone.value.trim() };
    try {
      if (m) {
        payload.active = f.active.checked ? 1 : 0;
        if (f.photo && f.photo.files[0]) payload.photo_key = await adminUpload(f.photo.files[0]);
        await api('/admin/merchants/' + m.id, { method: 'PUT', body: JSON.stringify(payload) });
        closeModal(); toast('Commerçant enregistré'); renderAdminMerchants();
      } else {
        payload.slug = f.slug.value.trim(); payload.password = f.password.value;
        const r = await api('/admin/merchants', { method: 'POST', body: JSON.stringify(payload) });
        closeModal();
        alert('Compte créé.\n\nIdentifiant : ' + r.slug + '\nMot de passe : ' + payload.password + '\n\nTransmettez ces accès au commerçant.');
        renderAdminMerchants();
      }
    } catch (ex) { toast(ex.message, true); }
  });
}
function merchantPwdModal(id) {
  openModal(`
    <h3>Nouveau mot de passe</h3>
    <form id="merchant-pwd-form">
      <div class="field"><label>Mot de passe (6 caractères min.)</label><input name="password" type="text" required /></div>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button>
        <button type="submit" class="btn btn--accent btn--md">Définir</button>
      </div>
    </form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#merchant-pwd-form').addEventListener('submit', async ev => {
    ev.preventDefault();
    const pwd = ev.target.password.value;
    try { await api('/admin/merchants/' + id + '/password', { method: 'POST', body: JSON.stringify({ password: pwd }) });
      closeModal(); alert('Nouveau mot de passe défini : ' + pwd + '\n\nTransmettez-le au commerçant.'); }
    catch (ex) { toast(ex.message, true); }
  });
}
async function delMerchant(id) {
  if (!confirm('Supprimer ce commerçant et toutes ses annonces ?')) return;
  try { await api('/admin/merchants/' + id, { method: 'DELETE' }); toast('Commerçant supprimé'); renderAdminMerchants(); }
  catch (ex) { toast(ex.message, true); }
}
async function setMPost(id, status) {
  try { await api('/admin/merchant-posts/' + id, { method: 'PATCH', body: JSON.stringify({ status }) }); renderAdminMerchants(); }
  catch (ex) { toast(ex.message, true); }
}
async function delMPost(id) {
  if (!confirm('Supprimer cette annonce ?')) return;
  try { await api('/admin/merchant-posts/' + id, { method: 'DELETE' }); renderAdminMerchants(); }
  catch (ex) { toast(ex.message, true); }
}

/* ----------------------------- Comptabilité ----------------------------- */
let ACC_TAB = 'journal', ACC_FROM = '', ACC_TO = '', ACC_ACCOUNTS = [], ACC_LEDGER = '';
function eur(n) { return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
function accExercice() { const y = new Date().getFullYear(); if (!ACC_FROM) ACC_FROM = y + '-01-01'; if (!ACC_TO) ACC_TO = y + '-12-31'; }

async function renderAccounting() {
  accExercice();
  const c = $('#dash-content'); c.innerHTML = '<p class="muted">Chargement…</p>';
  ACC_ACCOUNTS = await api('/admin/accounting/accounts');
  drawAccounting();
}
async function drawAccounting() {
  const c = $('#dash-content');
  const tab = (v, l) => `<button class="seg-btn ${ACC_TAB === v ? 'is-active' : ''}" data-atab="${v}">${l}</button>`;
  c.innerHTML = `
    <div class="acc-toolbar">
      <div class="seg seg--wrap">${tab('journal', 'Journal')}${tab('balance', 'Balance')}${tab('resultat', 'Résultat')}${tab('bilan', 'Bilan')}${tab('ledger', 'Grand livre')}${tab('plan', 'Plan comptable')}</div>
      <div class="acc-period">
        <label>Du <input type="date" id="acc-from" value="${ACC_FROM}"></label>
        <label>au <input type="date" id="acc-to" value="${ACC_TO}"></label>
        <a class="btn btn--ghost btn--sm" href="/api/admin/accounting/export.csv"><span data-lucide="download"></span> CSV</a>
      </div>
    </div>
    <div id="acc-body"><p class="muted">Chargement…</p></div>`;
  $$('.seg-btn', c).forEach(b => b.addEventListener('click', () => { ACC_TAB = b.dataset.atab; drawAccounting(); }));
  $('#acc-from').addEventListener('change', e => { ACC_FROM = e.target.value; drawAccounting(); });
  $('#acc-to').addEventListener('change', e => { ACC_TO = e.target.value; drawAccounting(); });
  icons();
  const body = $('#acc-body');
  if (ACC_TAB === 'journal') await accJournal(body);
  else if (ACC_TAB === 'plan') await accPlan(body);
  else if (ACC_TAB === 'ledger') await accLedger(body);
  else {
    const bal = await api(`/admin/accounting/balance?from=${ACC_FROM}&to=${ACC_TO}`);
    if (ACC_TAB === 'balance') accBalance(body, bal);
    else if (ACC_TAB === 'resultat') accResultat(body, bal);
    else accBilan(body, bal);
  }
  icons();
}
async function accJournal(body) {
  const entries = await api(`/admin/accounting/entries?from=${ACC_FROM}&to=${ACC_TO}`);
  body.innerHTML = `<div class="panel">
    <div class="panel-head"><h3>Journal (${entries.length})</h3>
      <button class="btn btn--accent btn--sm" id="acc-new"><span data-lucide="plus"></span> Nouvelle écriture</button></div>
    <div class="panel-body">${entries.length ? entries.map(entryBlock).join('') : '<div class="empty-state">Aucune écriture sur la période.</div>'}</div></div>`;
  $('#acc-new').addEventListener('click', entryModal);
  $$('[data-entdel]', body).forEach(b => b.addEventListener('click', () => delEntry(b.dataset.entdel)));
  icons();
}
function srcBadge(s) { return s === 'membership' ? '<span class="badge badge--olive">cotisation</span>' : s === 'donation' ? '<span class="badge badge--brique">don</span>' : ''; }
function entryBlock(e) {
  const total = e.lines.reduce((s, l) => s + (l.debit || 0), 0);
  return `<div class="acc-entry">
    <div class="acc-entry-head">
      <div><strong>${fmtDate(e.edate)}</strong> · ${esc(e.label)} ${e.piece ? `<span class="muted">(${esc(e.piece)})</span>` : ''} ${srcBadge(e.source)}</div>
      <div class="muted">${eur(total)} ${e.source === 'manual' ? `<button class="icon-btn danger" data-entdel="${e.id}" title="Supprimer"><span data-lucide="trash-2"></span></button>` : ''}</div>
    </div>
    <table class="acc-lines"><tbody>${e.lines.map(l => `<tr><td>${esc(l.acode)} ${esc(l.aname)}</td><td class="num">${l.debit ? eur(l.debit) : ''}</td><td class="num">${l.credit ? eur(l.credit) : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
function entryModal() {
  const opts = ACC_ACCOUNTS.map(a => `<option value="${a.id}">${esc(a.code)} — ${esc(a.name)}</option>`).join('');
  const lineRow = () => `<div class="acc-line-row"><select class="acc-l-acc"><option value="">— compte —</option>${opts}</select><input class="acc-l-deb" type="number" step="0.01" min="0" placeholder="Débit"><input class="acc-l-cre" type="number" step="0.01" min="0" placeholder="Crédit"><button type="button" class="icon-btn acc-l-del"><span data-lucide="x"></span></button></div>`;
  openModal(`<h3>Nouvelle écriture</h3>
    <form id="entry-form">
      <div class="form-grid2"><div class="field"><label>Date</label><input name="edate" type="date" value="${ACC_TO}" required></div><div class="field"><label>Pièce (n°)</label><input name="piece" placeholder="Facture, reçu…"></div></div>
      <div class="field"><label>Libellé</label><input name="label" required placeholder="Achat boissons pour le bar"></div>
      <div class="acc-lines-edit" id="acc-lines">${lineRow()}${lineRow()}</div>
      <button type="button" class="btn btn--ghost btn--sm" id="acc-addline"><span data-lucide="plus"></span> Ajouter une ligne</button>
      <div class="acc-balance no" id="acc-bal">Débit 0,00 € · Crédit 0,00 €</div>
      <div class="modal-actions"><button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button><button type="submit" class="btn btn--accent btn--md">Enregistrer</button></div>
    </form>`);
  const linesEl = $('#acc-lines');
  function recompute() {
    let d = 0, cr = 0;
    $$('.acc-line-row', linesEl).forEach(r => { d += Number($('.acc-l-deb', r).value) || 0; cr += Number($('.acc-l-cre', r).value) || 0; });
    const ok = Math.round(d * 100) === Math.round(cr * 100) && d > 0;
    const bal = $('#acc-bal'); bal.textContent = `Débit ${eur(d)} · Crédit ${eur(cr)}` + (ok ? '  ✓ équilibré' : '  — à équilibrer'); bal.className = 'acc-balance ' + (ok ? 'ok' : 'no');
  }
  function bindRow(r) {
    $('.acc-l-del', r).addEventListener('click', () => { if ($$('.acc-line-row', linesEl).length > 2) { r.remove(); recompute(); } });
    $('.acc-l-deb', r).addEventListener('input', () => { if ($('.acc-l-deb', r).value) $('.acc-l-cre', r).value = ''; recompute(); });
    $('.acc-l-cre', r).addEventListener('input', () => { if ($('.acc-l-cre', r).value) $('.acc-l-deb', r).value = ''; recompute(); });
  }
  $$('.acc-line-row', linesEl).forEach(bindRow);
  $('#acc-addline').addEventListener('click', () => { const div = document.createElement('div'); div.innerHTML = lineRow(); const r = div.firstElementChild; linesEl.appendChild(r); bindRow(r); icons(); });
  $('#modal-cancel').addEventListener('click', closeModal);
  icons();
  $('#entry-form').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    const lines = $$('.acc-line-row', linesEl).map(r => ({ account_id: $('.acc-l-acc', r).value, debit: $('.acc-l-deb', r).value, credit: $('.acc-l-cre', r).value })).filter(l => l.account_id && (l.debit || l.credit));
    try { await api('/admin/accounting/entries', { method: 'POST', body: JSON.stringify({ edate: f.edate.value, label: f.label.value.trim(), piece: f.piece.value.trim(), lines }) });
      closeModal(); toast('Écriture enregistrée'); drawAccounting();
    } catch (ex) { toast(ex.message, true); }
  });
}
async function delEntry(id) { if (!confirm('Supprimer cette écriture ?')) return; try { await api('/admin/accounting/entries/' + id, { method: 'DELETE' }); toast('Écriture supprimée'); drawAccounting(); } catch (ex) { toast(ex.message, true); } }

function accBalance(body, bal) {
  let td = 0, tc = 0;
  const rows = bal.map(a => { td += a.debit; tc += a.credit; const s = a.debit - a.credit;
    return `<tr><td><code>${esc(a.code)}</code></td><td>${esc(a.name)}</td><td class="num">${a.debit ? eur(a.debit) : ''}</td><td class="num">${a.credit ? eur(a.credit) : ''}</td><td class="num">${eur(Math.abs(s))} ${s >= 0 ? 'D' : 'C'}</td></tr>`; }).join('');
  body.innerHTML = `<div class="panel"><div class="panel-head"><h3>Balance générale</h3></div><div class="panel-body">
    ${bal.length ? `<table class="table acc-table"><thead><tr><th>Compte</th><th>Libellé</th><th class="num">Débit</th><th class="num">Crédit</th><th class="num">Solde</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><th colspan="2">Totaux</th><th class="num">${eur(td)}</th><th class="num">${eur(tc)}</th><th></th></tr></tfoot></table>` : '<div class="empty-state">Aucun mouvement sur la période.</div>'}</div></div>`;
}
function accResultat(body, bal) {
  const charges = bal.filter(a => a.klass === 6).map(a => ({ ...a, montant: a.debit - a.credit }));
  const produits = bal.filter(a => a.klass === 7).map(a => ({ ...a, montant: a.credit - a.debit }));
  const tC = charges.reduce((s, a) => s + a.montant, 0), tP = produits.reduce((s, a) => s + a.montant, 0), res = tP - tC;
  const tbl = (rows, tot, lbl) => `<table class="table acc-table"><tbody>${rows.length ? rows.map(a => `<tr><td>${esc(a.code)} ${esc(a.name)}</td><td class="num">${eur(a.montant)}</td></tr>`).join('') : '<tr><td class="muted">—</td><td></td></tr>'}</tbody><tfoot><tr><th>${lbl}</th><th class="num">${eur(tot)}</th></tr></tfoot></table>`;
  body.innerHTML = `<div class="acc-two">
    <div class="panel"><div class="panel-head"><h3>Charges</h3></div><div class="panel-body">${tbl(charges, tC, 'Total charges')}</div></div>
    <div class="panel"><div class="panel-head"><h3>Produits</h3></div><div class="panel-body">${tbl(produits, tP, 'Total produits')}</div></div></div>
    <div class="acc-result ${res >= 0 ? 'pos' : 'neg'}">Résultat de l'exercice : <strong>${eur(Math.abs(res))} ${res >= 0 ? '(excédent)' : '(déficit)'}</strong></div>`;
}
function accBilan(body, bal) {
  const charges = bal.filter(a => a.klass === 6).reduce((s, a) => s + (a.debit - a.credit), 0);
  const produits = bal.filter(a => a.klass === 7).reduce((s, a) => s + (a.credit - a.debit), 0);
  const res = produits - charges;
  const actif = bal.filter(a => a.klass === 2 || a.klass === 3 || a.klass === 5 || (a.klass === 4 && a.type === 'actif')).map(a => ({ ...a, montant: a.debit - a.credit })).filter(a => Math.round(a.montant * 100) !== 0);
  const passif = bal.filter(a => a.klass === 1 || (a.klass === 4 && a.type === 'passif')).map(a => ({ ...a, montant: a.credit - a.debit })).filter(a => Math.round(a.montant * 100) !== 0);
  const tA = actif.reduce((s, a) => s + a.montant, 0), tP = passif.reduce((s, a) => s + a.montant, 0) + res;
  const side = (rows, extra) => `<table class="table acc-table"><tbody>${rows.map(a => `<tr><td>${esc(a.code)} ${esc(a.name)}</td><td class="num">${eur(a.montant)}</td></tr>`).join('')}${extra || ''}</tbody></table>`;
  body.innerHTML = `<div class="acc-two">
    <div class="panel"><div class="panel-head"><h3>Actif</h3><strong>${eur(tA)}</strong></div><div class="panel-body">${side(actif)}</div></div>
    <div class="panel"><div class="panel-head"><h3>Passif</h3><strong>${eur(tP)}</strong></div><div class="panel-body">${side(passif, `<tr><td><em>Résultat de l'exercice</em></td><td class="num">${eur(res)}</td></tr>`)}</div></div></div>
    <p class="hint" style="margin-top:12px">${Math.round(tA * 100) === Math.round(tP * 100) ? '✓ Bilan équilibré.' : '⚠️ Actif ≠ Passif : pensez à saisir les soldes d\'ouverture (fonds associatifs, immobilisations, solde de banque initial).'}</p>`;
}
async function accLedger(body) {
  const opts = ACC_ACCOUNTS.map(a => `<option value="${a.id}" ${ACC_LEDGER == a.id ? 'selected' : ''}>${esc(a.code)} — ${esc(a.name)}</option>`).join('');
  body.innerHTML = `<div class="panel"><div class="panel-head"><h3>Grand livre</h3><select id="acc-ledsel" class="acc-ledsel"><option value="">— choisir un compte —</option>${opts}</select></div><div class="panel-body" id="acc-ledbody"><p class="muted">Choisissez un compte.</p></div></div>`;
  $('#acc-ledsel').addEventListener('change', async e => { ACC_LEDGER = e.target.value; await fillLedger(); });
  if (ACC_LEDGER) await fillLedger();
  icons();
}
async function fillLedger() {
  const entries = await api(`/admin/accounting/entries?from=${ACC_FROM}&to=${ACC_TO}`);
  const aid = Number(ACC_LEDGER); let solde = 0; const rows = [];
  entries.slice().reverse().forEach(e => e.lines.filter(l => l.account_id === aid).forEach(l => {
    solde += (l.debit || 0) - (l.credit || 0);
    rows.push(`<tr><td>${fmtDate(e.edate)}</td><td>${esc(e.label)}</td><td class="num">${l.debit ? eur(l.debit) : ''}</td><td class="num">${l.credit ? eur(l.credit) : ''}</td><td class="num">${eur(Math.abs(solde))} ${solde >= 0 ? 'D' : 'C'}</td></tr>`);
  }));
  $('#acc-ledbody').innerHTML = rows.length ? `<table class="table acc-table"><thead><tr><th>Date</th><th>Libellé</th><th class="num">Débit</th><th class="num">Crédit</th><th class="num">Solde</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : '<div class="empty-state">Aucun mouvement sur ce compte.</div>';
}
async function accPlan(body) {
  const by = {}; ACC_ACCOUNTS.forEach(a => { (by[a.klass] = by[a.klass] || []).push(a); });
  const cl = { 1: '1 — Fonds propres & emprunts', 2: '2 — Immobilisations', 3: '3 — Stocks', 4: '4 — Tiers', 5: '5 — Comptes financiers', 6: '6 — Charges', 7: '7 — Produits' };
  body.innerHTML = `<div class="panel"><div class="panel-head"><h3>Plan comptable (${ACC_ACCOUNTS.length})</h3><button class="btn btn--accent btn--sm" id="acc-addacc"><span data-lucide="plus"></span> Ajouter un compte</button></div>
    <div class="panel-body">${[1, 2, 3, 4, 5, 6, 7].filter(k => by[k]).map(k => `<div class="acc-class"><h4>${cl[k]}</h4><table class="table acc-table"><tbody>${by[k].map(a => `<tr><td><code>${esc(a.code)}</code></td><td>${esc(a.name)}</td><td class="muted">${esc(a.type)}</td><td class="col-actions"><button class="icon-btn danger" data-accdel="${a.id}" title="Supprimer"><span data-lucide="trash-2"></span></button></td></tr>`).join('')}</tbody></table></div>`).join('')}</div></div>`;
  $('#acc-addacc').addEventListener('click', accountModal);
  $$('[data-accdel]', body).forEach(b => b.addEventListener('click', () => delAccount(b.dataset.accdel)));
  icons();
}
function accountModal() {
  openModal(`<h3>Ajouter un compte</h3><form id="acc-form">
    <div class="form-grid2"><div class="field"><label>Numéro</label><input name="code" placeholder="606" required></div><div class="field"><label>Classe</label><select name="klass">${[1, 2, 3, 4, 5, 6, 7].map(k => `<option value="${k}">${k}</option>`).join('')}</select></div></div>
    <div class="field"><label>Libellé</label><input name="name" required></div>
    <div class="field"><label>Type</label><select name="type"><option value="charge">Charge</option><option value="produit">Produit</option><option value="actif">Actif</option><option value="passif">Passif</option></select></div>
    <div class="modal-actions"><button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button><button type="submit" class="btn btn--accent btn--md">Créer</button></div></form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#acc-form').addEventListener('submit', async e => { e.preventDefault(); const f = e.target;
    try { await api('/admin/accounting/accounts', { method: 'POST', body: JSON.stringify({ code: f.code.value.trim(), name: f.name.value.trim(), klass: f.klass.value, type: f.type.value }) });
      closeModal(); toast('Compte créé'); ACC_ACCOUNTS = await api('/admin/accounting/accounts'); drawAccounting();
    } catch (ex) { toast(ex.message, true); } });
}
async function delAccount(id) { if (!confirm('Supprimer ce compte ?')) return; try { await api('/admin/accounting/accounts/' + id, { method: 'DELETE' }); ACC_ACCOUNTS = await api('/admin/accounting/accounts'); toast('Compte supprimé'); drawAccounting(); } catch (ex) { toast(ex.message, true); } }

/* ----------------------------- Bar ----------------------------- */
let BAR_TAB = 'caisse', BAR_PRODUCTS = [], BAR_CART = {};
async function renderBar() {
  const c = $('#dash-content'); c.innerHTML = '<p class="muted">Chargement…</p>';
  BAR_PRODUCTS = await api('/admin/bar/products');
  drawBar();
}
async function drawBar() {
  const c = $('#dash-content');
  const tab = (v, l) => `<button class="seg-btn ${BAR_TAB === v ? 'is-active' : ''}" data-btab="${v}">${l}</button>`;
  c.innerHTML = `<div class="acc-toolbar"><div class="seg seg--wrap">${tab('caisse', 'Caisse')}${tab('stock', 'Produits & stock')}${tab('recettes', 'Recettes')}${tab('gerants', 'Gérants')}${tab('vitrine', 'Page publique')}</div>
    <a class="btn btn--ghost btn--sm" href="bar.html" target="_blank" rel="noopener"><span data-lucide="external-link"></span> Voir la page</a></div>
    <div id="bar-body"><p class="muted">Chargement…</p></div>`;
  $$('.seg-btn', c).forEach(b => b.addEventListener('click', () => { BAR_TAB = b.dataset.btab; drawBar(); }));
  icons();
  const body = $('#bar-body');
  if (BAR_TAB === 'caisse') barCaisse(body);
  else if (BAR_TAB === 'stock') barStock(body);
  else if (BAR_TAB === 'recettes') await barRecettes(body);
  else if (BAR_TAB === 'gerants') await barGerants(body);
  else await barVitrine(body);
  icons();
}
function barCaisse(body) {
  const active = BAR_PRODUCTS.filter(p => p.active);
  const cart = Object.entries(BAR_CART).filter(([id, q]) => q > 0).map(([id, q]) => ({ p: BAR_PRODUCTS.find(x => x.id == id), q })).filter(x => x.p);
  const total = cart.reduce((s, { p, q }) => s + p.price * q, 0);
  body.innerHTML = `<div class="bar-caisse">
    <div class="bar-products-grid">${active.length ? active.map(p => `<button class="bar-prod-btn" data-add="${p.id}"><span class="bar-prod-name">${esc(p.name)}</span><span class="bar-prod-price">${eur(p.price)}</span><span class="bar-prod-stock ${p.stock <= 5 ? 'low' : ''}">stock ${p.stock}</span></button>`).join('') : '<p class="muted">Aucun produit actif. Ajoutez-en dans « Produits & stock ».</p>'}</div>
    <div class="bar-ticket card">
      <h3 style="margin:0 0 12px">Ticket</h3>
      <div id="bar-cart">${cart.length ? cart.map(({ p, q }) => `<div class="bar-cart-row"><span>${esc(p.name)}</span><span class="bar-qty"><button class="icon-btn" data-dec="${p.id}">−</button> ${q} <button class="icon-btn" data-inc="${p.id}">+</button></span><span>${eur(p.price * q)}</span></div>`).join('') : '<p class="muted">Cliquez sur les produits pour les ajouter.</p>'}</div>
      <div class="bar-total">Total <strong>${eur(total)}</strong></div>
      <div class="field" style="margin-top:10px"><label>Ou montant libre (€)</label><input id="bar-free" type="number" step="0.01" min="0" placeholder="ex. 12.50"></div>
      <div class="field"><label>Note (facultatif)</label><input id="bar-note" placeholder="Soirée, service…"></div>
      <button class="btn btn--accent btn--md btn--full" id="bar-encaisser">Encaisser</button>
      ${cart.length ? '<button class="btn btn--ghost btn--sm btn--full" id="bar-clear" style="margin-top:8px">Vider le ticket</button>' : ''}
    </div></div>`;
  $$('[data-add]', body).forEach(b => b.addEventListener('click', () => { BAR_CART[b.dataset.add] = (BAR_CART[b.dataset.add] || 0) + 1; barCaisse(body); icons(); }));
  $$('[data-inc]', body).forEach(b => b.addEventListener('click', () => { BAR_CART[b.dataset.inc] = (BAR_CART[b.dataset.inc] || 0) + 1; barCaisse(body); icons(); }));
  $$('[data-dec]', body).forEach(b => b.addEventListener('click', () => { const id = b.dataset.dec; BAR_CART[id] = Math.max(0, (BAR_CART[id] || 0) - 1); barCaisse(body); icons(); }));
  const clr = $('#bar-clear', body); if (clr) clr.addEventListener('click', () => { BAR_CART = {}; barCaisse(body); icons(); });
  $('#bar-encaisser', body).addEventListener('click', async () => {
    const items = Object.entries(BAR_CART).filter(([id, q]) => q > 0).map(([id, q]) => ({ product_id: Number(id), qty: q }));
    const free = Number($('#bar-free', body).value) || 0;
    const note = $('#bar-note', body).value.trim();
    if (items.length === 0 && free <= 0) { alert('Ajoutez des produits ou un montant libre.'); return; }
    try {
      const r = await api('/admin/bar/sales', { method: 'POST', body: JSON.stringify({ items, free_amount: free, note }) });
      BAR_CART = {}; BAR_PRODUCTS = await api('/admin/bar/products'); toast('Recette encaissée : ' + eur(r.total) + ' — comptabilité mise à jour'); drawBar();
    } catch (ex) { toast(ex.message, true); }
  });
}
function barStock(body) {
  body.innerHTML = `<div class="panel"><div class="panel-head"><h3>Produits & stock (${BAR_PRODUCTS.length})</h3><button class="btn btn--accent btn--sm" id="bar-addp"><span data-lucide="plus"></span> Ajouter un produit</button></div>
    <div class="panel-body"><table class="table"><thead><tr><th>Produit</th><th>Prix</th><th>Stock</th><th>État</th><th class="col-actions">Actions</th></tr></thead>
    <tbody>${BAR_PRODUCTS.map(p => `<tr><td class="cell-title">${esc(p.name)}<div class="cell-sub">${esc(p.unit || '')}</div></td><td>${eur(p.price)}</td>
      <td><span class="bar-stock-ctrl"><button class="icon-btn" data-sdec="${p.id}">−</button> <strong class="${p.stock <= 5 ? 'stock-low' : ''}">${p.stock}</strong> <button class="icon-btn" data-sinc="${p.id}">+</button> <button class="icon-btn" data-sset="${p.id}" title="Réajuster le stock">±</button></span></td>
      <td>${p.active ? '<span class="badge badge--olive">Actif</span>' : '<span class="badge badge--neutral">Masqué</span>'}</td>
      <td class="col-actions"><button class="icon-btn" data-pedit="${p.id}" title="Modifier"><span data-lucide="pencil"></span></button><button class="icon-btn danger" data-pdel="${p.id}" title="Supprimer"><span data-lucide="trash-2"></span></button></td></tr>`).join('')}</tbody></table></div></div>`;
  $('#bar-addp', body).addEventListener('click', () => barProductModal());
  $$('[data-pedit]', body).forEach(b => b.addEventListener('click', () => barProductModal(BAR_PRODUCTS.find(p => p.id == b.dataset.pedit))));
  $$('[data-pdel]', body).forEach(b => b.addEventListener('click', () => barDelProduct(b.dataset.pdel)));
  $$('[data-sinc]', body).forEach(b => b.addEventListener('click', () => barStockAdj(b.dataset.sinc, 1)));
  $$('[data-sdec]', body).forEach(b => b.addEventListener('click', () => barStockAdj(b.dataset.sdec, -1)));
  $$('[data-sset]', body).forEach(b => b.addEventListener('click', () => barStockSet(b.dataset.sset)));
  icons();
}
async function barStockAdj(id, delta) { try { await api('/admin/bar/products/' + id + '/stock', { method: 'POST', body: JSON.stringify({ delta }) }); BAR_PRODUCTS = await api('/admin/bar/products'); drawBar(); } catch (ex) { toast(ex.message, true); } }
async function barStockSet(id) { const p = BAR_PRODUCTS.find(x => x.id == id); const v = prompt('Stock pour « ' + p.name + ' » :', p.stock); if (v === null) return; try { await api('/admin/bar/products/' + id + '/stock', { method: 'POST', body: JSON.stringify({ set: Number(v) || 0 }) }); BAR_PRODUCTS = await api('/admin/bar/products'); drawBar(); } catch (ex) { toast(ex.message, true); } }
async function barDelProduct(id) { if (!confirm('Supprimer ce produit ?')) return; try { await api('/admin/bar/products/' + id, { method: 'DELETE' }); BAR_PRODUCTS = await api('/admin/bar/products'); toast('Produit supprimé'); drawBar(); } catch (ex) { toast(ex.message, true); } }
function barProductModal(p) {
  const e = p || {};
  openModal(`<h3>${p ? 'Modifier' : 'Ajouter'} un produit</h3><form id="bp-form">
    <div class="field"><label>Nom</label><input name="name" value="${esc(e.name || '')}" required></div>
    <div class="form-grid2"><div class="field"><label>Prix (€)</label><input name="price" type="number" step="0.01" min="0" value="${e.price != null ? esc(e.price) : ''}"></div><div class="field"><label>Unité</label><input name="unit" value="${esc(e.unit || '')}" placeholder="verre, tasse…"></div></div>
    ${p ? `<label style="display:flex;align-items:center;gap:8px;margin:4px 0"><input type="checkbox" name="active" ${e.active ? 'checked' : ''} style="width:auto"> Actif (visible sur la carte)</label>` : '<div class="field"><label>Stock initial</label><input name="stock" type="number" step="1" min="0" value="0"></div>'}
    <div class="modal-actions"><button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button><button type="submit" class="btn btn--accent btn--md">${p ? 'Enregistrer' : 'Ajouter'}</button></div></form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#bp-form').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    const payload = { name: f.name.value.trim(), price: f.price.value, unit: f.unit.value.trim() };
    try {
      if (p) { payload.active = f.active.checked ? 1 : 0; await api('/admin/bar/products/' + p.id, { method: 'PUT', body: JSON.stringify(payload) }); }
      else { payload.stock = f.stock.value; await api('/admin/bar/products', { method: 'POST', body: JSON.stringify(payload) }); }
      closeModal(); BAR_PRODUCTS = await api('/admin/bar/products'); toast('Produit enregistré'); drawBar();
    } catch (ex) { toast(ex.message, true); }
  });
}
async function barRecettes(body) {
  const sales = await api('/admin/bar/sales');
  const total = sales.reduce((s, x) => s + (Number(x.total) || 0), 0);
  body.innerHTML = `<div class="panel"><div class="panel-head"><h3>Recettes du bar — ${eur(total)} (${sales.length})</h3></div>
    <div class="panel-body"><p class="muted" style="padding:0 22px">Chaque encaissement crée automatiquement une écriture comptable (caisse du bar 531 / recettes du bar 706).</p>
    ${sales.length ? `<table class="table"><thead><tr><th>Date</th><th>Détail</th><th>Total</th><th class="col-actions"></th></tr></thead><tbody>${sales.map(s => `<tr><td class="muted">${fmtDate(s.sdate)}</td><td>${s.items.length ? s.items.map(i => esc(i.name) + ' ×' + i.qty).join(', ') : '<span class="muted">montant libre</span>'}${s.note ? `<div class="cell-sub">${esc(s.note)}</div>` : ''}</td><td class="cell-title">${eur(s.total)}</td><td class="col-actions"><button class="icon-btn danger" data-saledel="${s.id}" title="Supprimer (restaure le stock)"><span data-lucide="trash-2"></span></button></td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">Aucune recette enregistrée.</div>'}</div></div>`;
  $$('[data-saledel]', body).forEach(b => b.addEventListener('click', () => barDelSale(b.dataset.saledel)));
  icons();
}
async function barDelSale(id) { if (!confirm("Supprimer cette recette ? Le stock sera restauré et l'écriture comptable annulée.")) return; try { await api('/admin/bar/sales/' + id, { method: 'DELETE' }); BAR_PRODUCTS = await api('/admin/bar/products'); toast('Recette supprimée'); drawBar(); } catch (ex) { toast(ex.message, true); } }
async function barVitrine(body) {
  const s = await api('/admin/settings');
  body.innerHTML = `<div class="panel"><div class="panel-head"><h3>Page publique du bar</h3></div><div class="panel-body" style="padding:22px">
    <p class="muted" style="margin:0 0 16px">Texte affiché sur la page publique du bar. La carte est générée automatiquement à partir des produits actifs.</p>
    <form id="bar-vitrine-form"><div class="field"><label>Description</label><textarea name="bar_description" rows="3">${esc(s.bar_description || '')}</textarea></div>
    <div class="field"><label>Horaires</label><input name="bar_hours" value="${esc(s.bar_hours || '')}"></div>
    <button class="btn btn--accent btn--md" type="submit">Enregistrer</button></form></div></div>`;
  $('#bar-vitrine-form', body).addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    try { await api('/admin/settings', { method: 'PUT', body: JSON.stringify({ bar_description: f.bar_description.value.trim(), bar_hours: f.bar_hours.value.trim() }) }); toast('Page du bar enregistrée'); }
    catch (ex) { toast(ex.message, true); }
  });
}

async function barGerants(body) {
  const list = await api('/admin/bar/managers');
  body.innerHTML = `<div class="panel">
    <div class="panel-head"><h3>Gérants de bar (${list.length})</h3><button class="btn btn--accent btn--sm" id="bg-add"><span data-lucide="user-plus"></span> Inviter un gérant</button></div>
    <div class="panel-body">
      <p class="muted" style="padding:0 22px">Les gérants accèdent à l'espace tactile <code>…/bar-admin.html</code> (caisse, stock, consignes). Ils choisissent eux-mêmes leur mot de passe via l'e-mail d'invitation.</p>
      ${list.length ? `<table class="table"><thead><tr><th>Nom</th><th>E-mail</th><th class="col-actions">Actions</th></tr></thead><tbody>${list.map(g => `<tr><td class="cell-title">${esc(g.name)}</td><td class="muted">${esc(g.email)}</td><td class="col-actions"><button class="icon-btn" data-bgreset="${g.id}" title="Envoyer un lien de réinitialisation"><span data-lucide="mail"></span></button><button class="icon-btn danger" data-bgdel="${g.id}" title="Supprimer"><span data-lucide="trash-2"></span></button></td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">Aucun gérant. Cliquez sur « Inviter un gérant ».</div>'}
    </div></div>`;
  $('#bg-add').addEventListener('click', () => {
    openModal(`<h3>Inviter un gérant de bar</h3><form id="bg-form">
      <div class="field"><label>Nom</label><input name="name" required></div>
      <div class="field"><label>E-mail</label><input name="email" type="email" required></div>
      <p class="hint">Un e-mail d'invitation sera envoyé. Le gérant choisira son mot de passe — vous ne le verrez pas.</p>
      <div class="modal-actions"><button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button><button type="submit" class="btn btn--accent btn--md">Inviter</button></div></form>`);
    $('#modal-cancel').addEventListener('click', closeModal);
    $('#bg-form').addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target;
      try { const r = await api('/admin/bar/managers', { method: 'POST', body: JSON.stringify({ name: f.name.value.trim(), email: f.email.value.trim() }) });
        closeModal(); if (r.emailed) toast('Invitation envoyée'); else alert("Compte créé mais e-mail non envoyé : " + (r.warning || '')); drawBar();
      } catch (ex) { toast(ex.message, true); }
    });
  });
  $$('[data-bgreset]', body).forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Envoyer un lien de réinitialisation à ce gérant ?')) return;
    try { await api('/admin/bar/managers/' + b.dataset.bgreset + '/reset', { method: 'POST', body: '{}' }); toast('Lien envoyé par e-mail'); } catch (ex) { toast(ex.message, true); }
  }));
  $$('[data-bgdel]', body).forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Supprimer ce gérant de bar ?')) return;
    try { await api('/admin/bar/managers/' + b.dataset.bgdel, { method: 'DELETE' }); toast('Gérant supprimé'); drawBar(); } catch (ex) { toast(ex.message, true); }
  }));
  icons();
}

/* ----------------------------- Lieu de vie (devis) ----------------------------- */
let DEVIS_LIST = [], LEVELS = [], CURRENT_LEVEL = null, PLACING = null;
function devisStatusBadge(s) { return s === 'valide' ? '<span class="badge badge--olive">Validé</span>' : s === 'refuse' ? '<span class="badge badge--brique">Refusé</span>' : '<span class="badge badge--ocre">À valider</span>'; }
async function renderDevis() {
  const c = $('#dash-content'); c.innerHTML = '<p class="muted">Chargement…</p>';
  const [list, levels] = await Promise.all([api('/admin/devis'), api('/admin/levels')]);
  DEVIS_LIST = list; LEVELS = levels; PLACING = null;
  if (!LEVELS.find(l => l.id === CURRENT_LEVEL)) CURRENT_LEVEL = LEVELS.length ? LEVELS[0].id : null;
  drawDevis();
}
function drawDevis() {
  const c = $('#dash-content');
  const aValider = DEVIS_LIST.filter(d => d.status === 'a_valider').length;
  const valides = DEVIS_LIST.filter(d => d.status === 'valide');
  const totalValide = valides.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const badge = $('#badge-devis'); if (badge) { badge.textContent = aValider; badge.hidden = !aValider; }
  const cur = LEVELS.find(l => l.id === CURRENT_LEVEL) || null;
  const placeTitle = (DEVIS_LIST.find(d => d.id == PLACING) || {}).title || '';
  c.innerHTML = `
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat-card card"><div class="stat-ic"><span data-lucide="file-clock"></span></div><div class="stat-val">${aValider}</div><div class="stat-lbl">Devis à valider</div></div>
      <div class="stat-card card"><div class="stat-ic"><span data-lucide="check-circle-2"></span></div><div class="stat-val">${valides.length}</div><div class="stat-lbl">Devis validés</div></div>
      <div class="stat-card card"><div class="stat-ic"><span data-lucide="hammer"></span></div><div class="stat-val">${eur(totalValide)}</div><div class="stat-lbl">Montant validé</div></div>
    </div>
    <div class="panel" style="margin-bottom:24px">
      <div class="panel-head"><h3>Devis (${DEVIS_LIST.length})</h3><button class="btn btn--accent btn--sm" id="dev-add"><span data-lucide="plus"></span> Ajouter un devis</button></div>
      <div class="panel-body">${DEVIS_LIST.length ? `<table class="table"><thead><tr><th>Devis</th><th>Lot</th><th>Montant</th><th>Statut</th><th class="col-actions">Actions</th></tr></thead><tbody>${DEVIS_LIST.map(devisRow).join('')}</tbody></table>` : '<div class="empty-state">Aucun devis. Cliquez sur « Ajouter un devis ».</div>'}</div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Plan du lieu de vie</h3><button class="btn btn--accent btn--sm" id="lvl-add"><span data-lucide="plus"></span> Ajouter un étage</button></div>
      <div class="panel-body" style="padding:22px">
        ${LEVELS.length ? `<div class="lvl-tabs">${LEVELS.map(l => { const n = DEVIS_LIST.filter(d => d.level_id === l.id && d.plan_x != null).length; return `<button class="lvl-tab ${l.id === CURRENT_LEVEL ? 'is-active' : ''}" data-lvl="${l.id}">${esc(l.name)}${n ? ` <span class="lvl-count">${n}</span>` : ''}</button>`; }).join('')}</div>` : ''}
        ${cur ? `
          <div class="lvl-bar">
            <input type="file" id="lvl-img-input" accept="image/*" hidden>
            <button class="btn btn--secondary btn--sm" id="lvl-img-btn"><span data-lucide="image-up"></span> ${cur.image_key ? "Changer l'image" : "Ajouter une image"}</button>
            <button class="btn btn--ghost btn--sm" id="lvl-rename"><span data-lucide="pencil"></span> Renommer</button>
            <button class="btn btn--ghost btn--sm" id="lvl-del" style="color:var(--brique-600)"><span data-lucide="trash-2"></span> Supprimer cet étage</button>
          </div>
          ${PLACING ? `<p class="hint" style="color:var(--brique-600)">📍 Cliquez sur le plan « ${esc(cur.name)} » pour placer « ${esc(placeTitle)} » — ou <a href="#" id="cancel-place">annuler</a>.</p>` : '<p class="muted" style="margin-top:0">Bouton 📍 dans la liste d\'un devis, puis cliquez sur le plan de l\'étage voulu. Cliquez une punaise pour la retirer.</p>'}
          ${cur.image_key ? `<div class="plan-wrap ${PLACING ? 'placing' : ''}" id="plan-wrap"><img src="/img/${esc(cur.image_key)}" alt="${esc(cur.name)}">${DEVIS_LIST.filter(d => d.level_id === cur.id && d.plan_x != null && d.plan_y != null).map(planPin).join('')}</div>` : '<div class="empty-state">Aucune image pour cet étage. Cliquez sur « Ajouter une image » (PNG/JPG).</div>'}
        ` : '<div class="empty-state">Aucun étage. Cliquez sur « Ajouter un étage » (rez-de-chaussée, 1er étage, combles, extérieur…).</div>'}
      </div>
    </div>`;
  $('#dev-add').addEventListener('click', () => devisModal());
  $$('[data-dvalid]', c).forEach(b => b.addEventListener('click', () => setDevis(b.dataset.dvalid, 'valide')));
  $$('[data-drefus]', c).forEach(b => b.addEventListener('click', () => setDevis(b.dataset.drefus, 'refuse')));
  $$('[data-dedit]', c).forEach(b => b.addEventListener('click', () => devisModal(DEVIS_LIST.find(d => d.id == b.dataset.dedit))));
  $$('[data-ddel]', c).forEach(b => b.addEventListener('click', () => delDevis(b.dataset.ddel)));
  $$('[data-dplace]', c).forEach(b => b.addEventListener('click', () => {
    if (!LEVELS.length) { alert("Ajoutez d'abord un étage avec une image de plan."); return; }
    PLACING = b.dataset.dplace; drawDevis();
  }));
  $$('[data-lvl]', c).forEach(b => b.addEventListener('click', () => { CURRENT_LEVEL = Number(b.dataset.lvl); drawDevis(); }));
  $('#lvl-add').addEventListener('click', addLevel);
  const lr = $('#lvl-rename'); if (lr) lr.addEventListener('click', renameLevel);
  const ld = $('#lvl-del'); if (ld) ld.addEventListener('click', deleteLevel);
  const li = $('#lvl-img-input'), lib = $('#lvl-img-btn');
  if (lib) {
    lib.addEventListener('click', () => li.click());
    li.addEventListener('change', async () => {
      if (!li.files[0]) return; lib.disabled = true; lib.textContent = 'Envoi…';
      try { const key = await adminUpload(li.files[0]); await api('/admin/levels/' + CURRENT_LEVEL, { method: 'PUT', body: JSON.stringify({ image_key: key }) }); const l = LEVELS.find(x => x.id === CURRENT_LEVEL); if (l) l.image_key = key; drawDevis(); }
      catch (ex) { alert(ex.message); lib.disabled = false; }
    });
  }
  const cp = $('#cancel-place'); if (cp) cp.addEventListener('click', e => { e.preventDefault(); PLACING = null; drawDevis(); });
  const wrap = $('#plan-wrap');
  if (wrap && PLACING) wrap.addEventListener('click', async e => {
    if (e.target.closest('.plan-pin')) return;
    const r = wrap.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 100;
    try { await api('/admin/devis/' + PLACING + '/position', { method: 'POST', body: JSON.stringify({ level_id: CURRENT_LEVEL, plan_x: x, plan_y: y }) });
      const d = DEVIS_LIST.find(dd => dd.id == PLACING); if (d) { d.level_id = CURRENT_LEVEL; d.plan_x = x; d.plan_y = y; } PLACING = null; drawDevis(); }
    catch (ex) { alert(ex.message); }
  });
  $$('.plan-pin', c).forEach(p => p.addEventListener('click', e => {
    e.stopPropagation(); const d = DEVIS_LIST.find(dd => dd.id == p.dataset.pin);
    if (d && confirm(`${d.title} — ${d.amount != null ? eur(d.amount) : ''}\n\nRetirer cette punaise du plan ?`)) removePin(d.id);
  }));
  icons();
}
async function addLevel() {
  const name = prompt("Nom du nouvel étage (ex. 1er étage, Combles, Extérieur) :");
  if (!name) return;
  try { const r = await api('/admin/levels', { method: 'POST', body: JSON.stringify({ name: name.trim() }) }); LEVELS = await api('/admin/levels'); CURRENT_LEVEL = r.id; drawDevis(); }
  catch (ex) { toast(ex.message, true); }
}
async function renameLevel() {
  const cur = LEVELS.find(l => l.id === CURRENT_LEVEL); if (!cur) return;
  const name = prompt("Renommer l'étage :", cur.name); if (!name) return;
  try { await api('/admin/levels/' + cur.id, { method: 'PUT', body: JSON.stringify({ name: name.trim() }) }); cur.name = name.trim(); drawDevis(); }
  catch (ex) { toast(ex.message, true); }
}
async function deleteLevel() {
  if (!confirm("Supprimer cet étage ? Les punaises de devis placées dessus seront retirées.")) return;
  try { await api('/admin/levels/' + CURRENT_LEVEL, { method: 'DELETE' }); LEVELS = await api('/admin/levels'); DEVIS_LIST = await api('/admin/devis'); CURRENT_LEVEL = LEVELS.length ? LEVELS[0].id : null; drawDevis(); }
  catch (ex) { toast(ex.message, true); }
}
function devisRow(d) {
  return `<tr>
    <td><div class="cell-title">${esc(d.title)}</div><div class="cell-sub">${esc(d.supplier || '')}</div>${d.document_key ? `<a href="/img/${esc(d.document_key)}" target="_blank" class="cell-sub" style="color:var(--ardoise-700)">📎 Document</a>` : ''}</td>
    <td class="muted">${esc(d.lot || '—')}</td>
    <td class="cell-title">${d.amount != null ? eur(d.amount) : '—'}</td>
    <td>${devisStatusBadge(d.status)}${d.plan_x != null ? ` <span class="badge badge--ardoise">📍 ${esc((LEVELS.find(l => l.id === d.level_id) || {}).name || '')}</span>` : ''}</td>
    <td class="col-actions">
      ${d.status !== 'valide' ? `<button class="icon-btn ok" data-dvalid="${d.id}" title="Valider"><span data-lucide="check"></span></button>` : ''}
      ${d.status !== 'refuse' ? `<button class="icon-btn" data-drefus="${d.id}" title="Refuser"><span data-lucide="x"></span></button>` : ''}
      <button class="icon-btn" data-dplace="${d.id}" title="Placer sur le plan"><span data-lucide="map-pin"></span></button>
      <button class="icon-btn" data-dedit="${d.id}" title="Modifier"><span data-lucide="pencil"></span></button>
      <button class="icon-btn danger" data-ddel="${d.id}" title="Supprimer"><span data-lucide="trash-2"></span></button>
    </td></tr>`;
}
function planPin(d) {
  const cls = d.status === 'valide' ? 'pin-valide' : d.status === 'refuse' ? 'pin-refuse' : 'pin-attente';
  return `<button class="plan-pin ${cls}" data-pin="${d.id}" style="left:${d.plan_x}%;top:${d.plan_y}%" title="${esc(d.title)}"><span data-lucide="map-pin"></span></button>`;
}
async function setDevis(id, status) { try { await api('/admin/devis/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ status }) }); DEVIS_LIST = await api('/admin/devis'); toast('Devis mis à jour'); drawDevis(); } catch (ex) { toast(ex.message, true); } }
async function removePin(id) { try { await api('/admin/devis/' + id + '/position', { method: 'POST', body: JSON.stringify({ plan_x: null, plan_y: null }) }); const d = DEVIS_LIST.find(dd => dd.id == id); if (d) { d.plan_x = null; d.plan_y = null; } drawDevis(); } catch (ex) { toast(ex.message, true); } }
async function delDevis(id) { if (!confirm('Supprimer ce devis ?')) return; try { await api('/admin/devis/' + id, { method: 'DELETE' }); DEVIS_LIST = await api('/admin/devis'); toast('Devis supprimé'); drawDevis(); } catch (ex) { toast(ex.message, true); } }
function devisModal(d) {
  const e = d || {};
  openModal(`<h3>${d ? 'Modifier' : 'Ajouter'} un devis</h3><form id="devis-form">
    <div class="field"><label>Intitulé des travaux</label><input name="title" value="${esc(e.title || '')}" required></div>
    <div class="form-grid2"><div class="field"><label>Fournisseur</label><input name="supplier" value="${esc(e.supplier || '')}"></div><div class="field"><label>Lot / poste</label><input name="lot" value="${esc(e.lot || '')}" placeholder="Toiture, Électricité…"></div></div>
    <div class="field"><label>Montant (€)</label><input name="amount" type="number" step="0.01" min="0" value="${e.amount != null ? esc(e.amount) : ''}"></div>
    <div class="field"><label>Description</label><textarea name="description">${esc(e.description || '')}</textarea></div>
    <div class="field"><label>Document (PDF ou image, facultatif)</label><input type="file" name="document" accept="image/*,application/pdf">${e.document_key ? '<div class="hint">Un document est déjà attaché (laisser vide pour le conserver).</div>' : ''}</div>
    <div class="modal-actions"><button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button><button type="submit" class="btn btn--accent btn--md">${d ? 'Enregistrer' : 'Ajouter'}</button></div></form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#devis-form').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    try {
      const payload = { title: f.title.value.trim(), supplier: f.supplier.value.trim(), lot: f.lot.value.trim(), amount: f.amount.value, description: f.description.value.trim() };
      if (f.document.files[0]) payload.document_key = await adminUpload(f.document.files[0]);
      if (d) await api('/admin/devis/' + d.id, { method: 'PUT', body: JSON.stringify(payload) });
      else await api('/admin/devis', { method: 'POST', body: JSON.stringify(payload) });
      closeModal(); toast('Devis enregistré'); DEVIS_LIST = await api('/admin/devis'); drawDevis();
    } catch (ex) { toast(ex.message, true); }
  });
}

/* ----------------------------- Administrateurs ----------------------------- */
async function renderAdmins() {
  const c = $('#dash-content');
  c.innerHTML = '<p class="muted">Chargement…</p>';
  const list = await api('/admin/admins');
  c.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3>Administrateurs (${list.length})</h3>
        <button class="btn btn--accent btn--sm" id="add-admin"><span data-lucide="user-plus"></span> Ajouter un administrateur</button>
      </div>
      <div class="panel-body">
        <table class="table">
          <thead><tr><th>Nom</th><th>E-mail (identifiant)</th><th class="col-actions">Actions</th></tr></thead>
          <tbody>${list.map(adminRow).join('')}</tbody>
        </table>
      </div>
    </div>
    <p class="hint" style="margin-top:14px">Chaque administrateur peut se connecter avec son e-mail et son mot de passe, et changer son propre mot de passe dans Réglages.</p>`;
  $('#add-admin').addEventListener('click', () => adminModal());
  $$('[data-apw]', c).forEach(b => b.addEventListener('click', () => resetAdmin(b.dataset.apw, b.dataset.name)));
  $$('[data-adel]', c).forEach(b => b.addEventListener('click', () => delAdmin(b.dataset.adel)));
  icons();
}
function adminRow(a) {
  return `<tr>
    <td><div class="cell-title">${esc(a.name)}</div>${a.me ? '<span class="badge badge--ardoise">Vous</span>' : ''}</td>
    <td class="muted">${esc(a.email)}</td>
    <td class="col-actions">
      <button class="icon-btn" data-apw="${a.id}" data-name="${esc(a.name)}" title="Envoyer un lien de réinitialisation"><span data-lucide="mail"></span></button>
      ${a.me ? '' : `<button class="icon-btn danger" data-adel="${a.id}" title="Supprimer"><span data-lucide="trash-2"></span></button>`}
    </td></tr>`;
}
async function resetAdmin(id, name) {
  if (!confirm(`Envoyer un lien de réinitialisation de mot de passe à ${name} ?\n\nIl recevra un e-mail et choisira lui-même son mot de passe — vous ne le verrez pas.`)) return;
  try { await api('/admin/admins/' + id + '/reset', { method: 'POST', body: '{}' }); toast('Lien de réinitialisation envoyé par e-mail.'); }
  catch (ex) { toast(ex.message, true); }
}
function adminModal() {
  openModal(`
    <h3>Ajouter un administrateur</h3>
    <form id="admin-form">
      <div class="field"><label>Nom</label><input name="name" required /></div>
      <div class="field"><label>E-mail (servira d'identifiant)</label><input name="email" type="email" required /></div>
      <p class="hint">Un e-mail d'invitation sera envoyé à cette adresse. La personne choisira elle-même son mot de passe — vous ne le verrez jamais.</p>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button>
        <button type="submit" class="btn btn--accent btn--md">Inviter</button>
      </div>
    </form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#admin-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try {
      const r = await api('/admin/admins', { method: 'POST', body: JSON.stringify({
        name: f.name.value.trim(), email: f.email.value.trim() }) });
      closeModal();
      if (r.emailed) toast("Invitation envoyée par e-mail.");
      else alert("Compte créé, mais l'e-mail d'invitation n'a pas pu être envoyé :\n" + (r.warning || '') + "\n\nConfigurez l'envoi d'e-mails dans Réglages, puis utilisez « Renvoyer le lien ».");
      renderAdmins();
    } catch (ex) { toast(ex.message, true); }
  });
}
async function delAdmin(id) {
  if (!confirm('Supprimer cet administrateur ?')) return;
  try { await api('/admin/admins/' + id, { method: 'DELETE' }); toast('Administrateur supprimé'); renderAdmins(); }
  catch (ex) { toast(ex.message, true); }
}

/* ----------------------------- Modèles ----------------------------- */
const TPL_META = {
  password_invite: { label: 'Invitation administrateur', ph: '{{name}}, {{link}}', email: true },
  password_reset: { label: 'Réinitialisation du mot de passe', ph: '{{name}}, {{link}}', email: true },
  membership_welcome: { label: 'Accusé de réception — adhésion', ph: '{{name}}', email: true },
  contact_ack: { label: 'Accusé de réception — contact', ph: '{{name}}', email: true },
  thank_you: { label: 'Remerciement de don', ph: '{{name}}, {{amount}}', email: true },
  attestation_don: { label: 'Reçu fiscal / attestation de don', ph: '{{donor_name}}, {{amount}}, {{date}}, {{method}}, {{receipt_no}}, {{assoc_name}}, {{assoc_address}}, {{today}}, {{year}}', email: false },
};
async function renderTemplates() {
  const c = $('#dash-content'); c.innerHTML = '<p class="muted">Chargement…</p>';
  const tpls = await api('/admin/templates');
  c.innerHTML = `<p class="hint" style="margin-bottom:18px">Les variables entre doubles accolades (ex. <code>{{name}}</code>) sont remplacées automatiquement. <code>{{link}}</code> insère le bouton du lien.</p>` +
    tpls.map(t => {
      const m = TPL_META[t.key] || { label: t.key, ph: '', email: true };
      return `<div class="panel" style="margin-bottom:20px"><div class="panel-head"><h3>${esc(m.label)}</h3>${m.email ? '<span class="badge badge--ardoise">E-mail</span>' : '<span class="badge badge--ocre">Document</span>'}</div>
        <div class="panel-body" style="padding:22px"><form data-tplform="${t.key}">
          ${m.email ? `<div class="field"><label>Objet</label><input name="subject" value="${esc(t.subject || '')}"></div>` : ''}
          <div class="field"><label>${m.email ? 'Message' : 'Contenu (HTML)'}</label><textarea name="body" rows="${m.email ? 7 : 14}"${m.email ? '' : ' style="font-family:monospace;font-size:0.85rem"'}>${esc(t.body || '')}</textarea></div>
          <p class="hint">Variables disponibles : ${esc(m.ph) || 'aucune'}</p>
          <button class="btn btn--accent btn--sm" type="submit">Enregistrer</button>
        </form></div></div>`;
    }).join('');
  $$('[data-tplform]', c).forEach(f => f.addEventListener('submit', async e => {
    e.preventDefault();
    const key = f.getAttribute('data-tplform');
    const payload = { body: f.body.value };
    if (f.subject) payload.subject = f.subject.value;
    try { await api('/admin/templates/' + key, { method: 'PUT', body: JSON.stringify(payload) }); toast('Modèle enregistré'); }
    catch (ex) { toast(ex.message, true); }
  }));
  icons();
}

/* ----------------------------- Réglages ----------------------------- */
function mailHelpModal() {
  openModal(`
    <h3>Gérer les e-mails du quartier</h3>
    <div class="help-doc">
      <h4>1. Modifier les redirections (qui reçoit quoi)</h4>
      <p>Les adresses <code>@lesamisdemontety.com</code> (bonjour@, contact@, president@, tresorier@…) sont <strong>redirigées</strong> vers de vraies boîtes Gmail. Pour changer la destination :</p>
      <ol>
        <li>Allez sur <a href="https://dash.cloudflare.com" target="_blank" rel="noopener">dash.cloudflare.com</a> → domaine <strong>lesamisdemontety.com</strong>.</li>
        <li>Menu <strong>Email → Email Routing → Routing rules</strong>.</li>
        <li>Sur une adresse, cliquez <strong>Edit</strong> et choisissez la boîte de destination (ex. <code>tresorier@</code> → le Gmail du trésorier). <strong>Create address</strong> pour en ajouter une.</li>
        <li>Chaque boîte de destination reçoit un e-mail de confirmation à valider (une fois).</li>
      </ol>

      <h4>2. Envoyer depuis l'adresse pro avec Gmail</h4>
      <p>Pour <strong>écrire</strong> avec <code>bonjour@lesamisdemontety.com</code> depuis Gmail :</p>
      <ol>
        <li>Gmail → ⚙️ <strong>Voir tous les paramètres → Comptes et importation</strong>.</li>
        <li>« Envoyer des e-mails en tant que » → <strong>Ajouter une autre adresse e-mail</strong>.</li>
        <li>Nom : <em>Les Amis de Montety</em> · Adresse : <code>bonjour@lesamisdemontety.com</code> · décochez « Traiter comme un alias ».</li>
        <li>Serveur SMTP : <code>smtp.resend.com</code> · Port <strong>465</strong> (SSL) · Identifiant : <code>resend</code> · Mot de passe : <strong>votre clé Resend</strong> (la même qu'ici).</li>
        <li>Validez. Vous pourrez alors choisir l'expéditeur dans Gmail.</li>
      </ol>
      <p class="muted">À noter : <code>noreply@</code> sert uniquement aux e-mails automatiques du site (invitations, reçus…), on n'y répond pas.</p>
    </div>
    <div class="modal-actions"><button type="button" class="btn btn--accent btn--md" id="modal-cancel">J'ai compris</button></div>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  icons();
}
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
    <div class="panel" style="margin-bottom:24px">
      <div class="panel-head"><h3>Envoi d'e-mails (invitations & réinitialisations)</h3></div>
      <div class="panel-body" style="padding:22px">
        <p class="muted" style="margin:0 0 16px">Nécessaire pour les liens d'invitation et de réinitialisation des administrateurs. ${s.resend_configured ? '<strong style="color:var(--olive-700)">✓ Configuré.</strong>' : '<strong style="color:var(--brique-600)">Non configuré.</strong>'}</p>
        <form id="mail-form" style="max-width:520px">
          <div class="field"><label>Adresse d'expéditeur</label><input name="mail_from" value="${esc(s.mail_from || '')}" placeholder="Les Amis de Montety &lt;noreply@lesamisdemontety.com&gt;" /></div>
          <div class="field"><label>Clé d'API d'envoi (Resend)</label><input name="resend_api_key" type="password" placeholder="${s.resend_configured ? '•••••••• (laisser vide pour conserver)' : 're_...'}" /><div class="hint">Collez votre clé Resend. Elle reste secrète, jamais réaffichée.</div></div>
          <button class="btn btn--accent btn--md" type="submit">Enregistrer</button>
        </form>
        <button class="btn btn--secondary btn--sm" id="mail-help-btn" style="margin-top:16px"><span data-lucide="circle-help"></span> Aide : redirections & envoi depuis l'adresse pro</button>
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
  $('#mail-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const payload = { mail_from: f.mail_from.value.trim() };
    if (f.resend_api_key.value.trim()) payload.resend_api_key = f.resend_api_key.value.trim();
    try { await api('/admin/settings', { method: 'PUT', body: JSON.stringify(payload) }); toast('Configuration e-mail enregistrée'); renderSettings(); }
    catch (ex) { toast(ex.message, true); }
  });
  $('#mail-help-btn').addEventListener('click', mailHelpModal);
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
