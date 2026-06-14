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
  messages: 'Messages', donations: 'Dons', listings: 'Entraide', merchants: 'Commerçants',
  admins: 'Administrateurs', settings: 'Réglages',
};
function switchView(view) {
  $$('.dash-nav__item').forEach(b => b.classList.toggle('is-active', b.dataset.view === view));
  $('#view-title').textContent = VIEW_TITLES[view] || '';
  const render = { dashboard: renderDashboard, events: renderEvents, memberships: renderMemberships, messages: renderMessages, donations: renderDonations, listings: renderAdminListings, merchants: renderAdminMerchants, admins: renderAdmins, settings: renderSettings }[view];
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
      <div class="panel-head"><h3>Demandes d'adhésion (${list.length})</h3></div>
      <div class="panel-body">
        ${list.length ? `<table class="table">
          <thead><tr><th>Nom</th><th>Contact</th><th>Paiement</th><th>Statut</th><th class="col-actions">Actions</th></tr></thead>
          <tbody>${list.map(memberRow).join('')}</tbody>
        </table>` : `<div class="empty-state">Aucune demande pour l'instant.</div>`}
      </div>
    </div>`;
  $$('[data-acc]', c).forEach(b => b.addEventListener('click', () => setMember(b.dataset.acc, 'accepted')));
  $$('[data-dec]', c).forEach(b => b.addEventListener('click', () => setMember(b.dataset.dec, 'declined')));
  $$('[data-pay]', c).forEach(b => b.addEventListener('click', () => paymentModal(list.find(m => m.id == b.dataset.pay))));
  $$('[data-del]', c).forEach(b => b.addEventListener('click', () => delMember(b.dataset.del)));
  icons();
  refreshBadges();
}
const PAY_LBL = { especes: 'Espèces', cheque: 'Chèque', virement: 'Virement', helloasso: 'HelloAsso', cb: 'Carte' };
function paymentModal(m) {
  openModal(`
    <h3>Paiement — ${esc(m.prenom)} ${esc(m.nom)}</h3>
    <form id="pay-form">
      <div class="form-grid2">
        <div class="field"><label>Montant (€)</label><input name="amount" type="number" min="0" step="0.01" value="${m.amount != null ? esc(m.amount) : ''}" /></div>
        <div class="field"><label>Moyen</label>
          <select name="pay_method">
            <option value="">—</option>
            ${Object.entries(PAY_LBL).map(([k, v]) => `<option value="${k}" ${m.pay_method === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </div>
      </div>
      <label style="display:flex; align-items:center; gap:8px; margin:4px 0"><input type="checkbox" name="paid" ${m.paid ? 'checked' : ''} style="width:auto" /> Encaissé / payé</label>
      <p class="hint">Les adhésions encaissées (espèces, chèque, virement…) alimentent automatiquement la comptabilité.</p>
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
        amount: f.amount.value || null, pay_method: f.pay_method.value || null, paid: f.paid.checked ? 1 : 0 }) });
      closeModal(); toast('Paiement enregistré'); renderMemberships();
    } catch (ex) { toast(ex.message, true); }
  });
}
function memberRow(m) {
  const badge = { pending: 'badge--ocre', accepted: 'badge--olive', declined: 'badge--brique' }[m.status] || 'badge--neutral';
  const label = { pending: 'En attente', accepted: 'Accepté', declined: 'Refusé' }[m.status] || m.status;
  const pay = m.paid
    ? `<span class="badge badge--olive badge--solid">${m.amount != null ? Number(m.amount).toLocaleString('fr-FR') + ' €' : 'Payé'}</span>${m.pay_method ? `<div class="cell-sub">${esc(PAY_LBL[m.pay_method] || m.pay_method)}</div>` : ''}`
    : (m.amount != null ? `<span class="muted">${Number(m.amount).toLocaleString('fr-FR')} € — non encaissé</span>` : '<span class="cell-sub">—</span>');
  return `<tr>
    <td><div class="cell-title">${esc(m.prenom)} ${esc(m.nom)}</div><div class="cell-sub">${esc(m.rue || '')}</div>${m.message ? `<div class="cell-sub">${esc(m.message)}</div>` : ''}</td>
    <td><a href="mailto:${esc(m.email)}">${esc(m.email)}</a><div class="cell-sub">${fmtDateTime(m.created_at)}</div></td>
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
  $$('[data-apw]', c).forEach(b => b.addEventListener('click', () => adminPwdModal(b.dataset.apw, b.dataset.name)));
  $$('[data-adel]', c).forEach(b => b.addEventListener('click', () => delAdmin(b.dataset.adel)));
  icons();
}
function adminRow(a) {
  return `<tr>
    <td><div class="cell-title">${esc(a.name)}</div>${a.me ? '<span class="badge badge--ardoise">Vous</span>' : ''}</td>
    <td class="muted">${esc(a.email)}</td>
    <td class="col-actions">
      <button class="icon-btn" data-apw="${a.id}" data-name="${esc(a.name)}" title="Réinitialiser le mot de passe"><span data-lucide="key-round"></span></button>
      ${a.me ? '' : `<button class="icon-btn danger" data-adel="${a.id}" title="Supprimer"><span data-lucide="trash-2"></span></button>`}
    </td></tr>`;
}
function adminModal() {
  openModal(`
    <h3>Ajouter un administrateur</h3>
    <form id="admin-form">
      <div class="field"><label>Nom</label><input name="name" required /></div>
      <div class="field"><label>E-mail (servira d'identifiant)</label><input name="email" type="email" required /></div>
      <div class="field"><label>Mot de passe (8 caractères min.)</label><input name="password" type="text" required /></div>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button>
        <button type="submit" class="btn btn--accent btn--md">Créer le compte</button>
      </div>
    </form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#admin-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/admin/admins', { method: 'POST', body: JSON.stringify({
        name: f.name.value.trim(), email: f.email.value.trim(), password: f.password.value }) });
      closeModal(); alert('Compte créé.\n\nIdentifiant : ' + f.email.value.trim() + '\nMot de passe : ' + f.password.value + '\n\nTransmettez ces accès.');
      renderAdmins();
    } catch (ex) { toast(ex.message, true); }
  });
}
function adminPwdModal(id, name) {
  openModal(`
    <h3>Mot de passe — ${esc(name)}</h3>
    <form id="apwd-form">
      <div class="field"><label>Nouveau mot de passe (8 caractères min.)</label><input name="password" type="text" required /></div>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost btn--md" id="modal-cancel">Annuler</button>
        <button type="submit" class="btn btn--accent btn--md">Définir</button>
      </div>
    </form>`);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#apwd-form').addEventListener('submit', async e => {
    e.preventDefault();
    const pwd = e.target.password.value;
    try { await api('/admin/admins/' + id + '/password', { method: 'POST', body: JSON.stringify({ password: pwd }) });
      closeModal(); alert('Nouveau mot de passe défini : ' + pwd); }
    catch (ex) { toast(ex.message, true); }
  });
}
async function delAdmin(id) {
  if (!confirm('Supprimer cet administrateur ?')) return;
  try { await api('/admin/admins/' + id, { method: 'DELETE' }); toast('Administrateur supprimé'); renderAdmins(); }
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
