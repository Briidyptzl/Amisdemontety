'use strict';

const THEME_LABELS = { air: 'Air', naval: 'Naval', geopolitique: 'Géopolitique' };
const THEME_KEYS = ['air', 'naval', 'geopolitique'];

let currentView = 'air';

// --- utilitaires ----------------------------------------------------------

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Rendu Markdown minimal et sûr (titres, listes, gras, paragraphes).
function md(text) {
  const lines = esc(text).split('\n');
  let html = '';
  let inList = false;
  for (let line of lines) {
    line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const h = line.match(/^(#{1,3})\s+(.*)/);
    const li = line.match(/^\s*[-*]\s+(.*)/);
    if (h) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3>${h[2]}</h3>`;
    } else if (li) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${li[1]}</li>`;
    } else if (line.trim() === '') {
      if (inList) { html += '</ul>'; inList = false; }
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p>${line}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html;
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function getToken() {
  const el = document.querySelector('#import-form [name=token]');
  return el && el.value ? { 'X-Ingest-Token': el.value } : {};
}

// --- santé / état ---------------------------------------------------------

async function loadHealth() {
  try {
    const h = await api('/api/health');
    document.getElementById('dot-claude').classList.toggle('on', h.claude);
    document.getElementById('dot-x').classList.toggle('on', h.x);
  } catch { /* ignore */ }
}

// --- vue thème ------------------------------------------------------------

function itemCard(it) {
  const img = it.media && it.media[0]
    ? `<img src="${esc(it.media[0])}" alt="" loading="lazy" onerror="this.remove()" />` : '';
  const badges = it.themes.map((t) => `<span class="badge ${t}">${THEME_LABELS[t]}</span>`).join('');
  const place = it.place ? `<span class="badge place">📍 ${esc(it.place)}</span>` : '';
  const author = it.author ? esc(it.author) : (it.author_name ? esc(it.author_name) : 'Anonyme');
  const link = it.url ? `<a class="card-link" href="${esc(it.url)}" target="_blank" rel="noopener">source ↗</a>` : '';
  const summary = it.summary ? `<div class="card-summary">${esc(it.summary)}</div>` : '';
  return `<article class="card">
    ${img}
    <div class="card-body">
      <div class="card-author">${author}</div>
      <div class="card-text">${esc(it.text)}</div>
      ${summary}
      <div class="card-foot">${badges}${place}${link}</div>
    </div>
  </article>`;
}

async function loadTheme(theme) {
  document.getElementById('summary-title').textContent = `Résumé IA — ${THEME_LABELS[theme]}`;
  document.getElementById('feed-title').textContent = `Publications — ${THEME_LABELS[theme]}`;
  const body = document.getElementById('summary-body');
  const meta = document.getElementById('summary-meta');
  const feed = document.getElementById('feed');
  body.textContent = 'Chargement…';
  meta.textContent = '';
  feed.innerHTML = '';

  // Résumé (cache)
  try {
    const s = await api(`/api/themes/${theme}/summary`);
    if (s.cached && s.summary) {
      body.innerHTML = md(s.summary);
      meta.textContent = `${s.item_count} publication(s) · généré le ${new Date(s.generated_at).toLocaleString('fr-FR')}`;
    } else {
      body.innerHTML = '<p class="hint">Aucun résumé en cache. Cliquez sur « Régénérer » pour en produire un.</p>';
    }
  } catch (e) {
    body.innerHTML = `<p class="hint">Résumé indisponible : ${esc(e.message)}</p>`;
  }

  // Fil
  try {
    const { items } = await api(`/api/feed?theme=${theme}&limit=60`);
    feed.innerHTML = items.length ? items.map(itemCard).join('')
      : '<div class="empty">Aucune publication pour ce thème. Importez des données via l\'onglet « ＋ Import ».</div>';
  } catch (e) {
    feed.innerHTML = `<div class="empty">Erreur : ${esc(e.message)}</div>`;
  }
}

async function regenSummary() {
  const btn = document.getElementById('btn-regen');
  const body = document.getElementById('summary-body');
  btn.disabled = true; btn.textContent = '⏳ Analyse…';
  body.textContent = 'Génération du résumé par Claude…';
  try {
    const s = await api(`/api/themes/${currentView}/summary`, { method: 'POST', headers: getToken() });
    body.innerHTML = md(s.summary);
    document.getElementById('summary-meta').textContent =
      `${s.item_count} publication(s) · généré le ${new Date(s.generated_at).toLocaleString('fr-FR')}`;
  } catch (e) {
    body.innerHTML = `<p class="hint">Échec : ${esc(e.message)}</p>`;
  } finally {
    btn.disabled = false; btn.textContent = '↻ Régénérer';
  }
}

// --- vue localisations ----------------------------------------------------

function locCard(l) {
  const counts = THEME_KEYS
    .filter((k) => l.counts[k] > 0)
    .map((k) => `<span class="badge ${k}">${THEME_LABELS[k]} ${l.counts[k]}</span>`)
    .join('');
  const thumbs = (l.images || []).map((u) => `<img src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()" />`).join('');
  const map = (l.lat != null && l.lon != null)
    ? `<a class="card-link" href="https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lon}#map=6/${l.lat}/${l.lon}" target="_blank" rel="noopener">carte ↗</a>` : '';
  return `<div class="loc-card">
    <div class="loc-head"><span class="loc-name">📍 ${esc(l.place)}</span><span class="loc-total">${l.total} publication(s)</span></div>
    <div class="loc-counts">${counts}</div>
    <div class="loc-thumbs">${thumbs}</div>
    <div style="margin-top:8px">${map}</div>
  </div>`;
}

async function loadLocations() {
  const box = document.getElementById('locations');
  box.innerHTML = '<div class="empty">Chargement…</div>';
  try {
    const { locations } = await api('/api/locations');
    box.innerHTML = locations.length ? locations.map(locCard).join('')
      : '<div class="empty">Aucune localisation détectée pour l\'instant.</div>';
  } catch (e) {
    box.innerHTML = `<div class="empty">Erreur : ${esc(e.message)}</div>`;
  }
}

// --- import ---------------------------------------------------------------

async function submitImport(ev) {
  ev.preventDefault();
  const form = ev.target;
  const out = document.getElementById('import-result');
  const media = form.media.value.split('\n').map((s) => s.trim()).filter(Boolean);
  const payload = {
    text: form.text.value.trim(),
    author: form.author.value.trim(),
    url: form.url.value.trim(),
    media,
    source: 'manual',
  };
  out.className = 'import-result'; out.textContent = 'Classement en cours…';
  try {
    const r = await api('/api/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...getToken() },
      body: JSON.stringify(payload),
    });
    const res = r.results[0] || {};
    if (res.ok) {
      const themes = (res.themes || []).map((t) => THEME_LABELS[t]).join(', ') || 'aucun thème';
      out.className = 'import-result ok';
      out.textContent = `Ajouté ✓ — thèmes : ${themes}${res.place ? ' · lieu : ' + res.place : ''}`;
      form.text.value = ''; form.media.value = '';
    } else {
      out.className = 'import-result err';
      out.textContent = res.error ? `Erreur : ${res.error}` : (res.skipped ? 'Ignoré (doublon ou vide).' : 'Non ajouté.');
    }
  } catch (e) {
    out.className = 'import-result err';
    out.textContent = `Erreur : ${e.message}`;
  }
}

async function xSync() {
  const out = document.getElementById('import-result');
  out.className = 'import-result'; out.textContent = 'Synchronisation de la Liste X…';
  try {
    const r = await api('/api/x/sync', { method: 'POST', headers: { 'content-type': 'application/json', ...getToken() }, body: '{}' });
    out.className = 'import-result ok';
    out.textContent = `${r.inserted} nouvelle(s) publication(s) sur ${r.fetched} récupérée(s).`;
  } catch (e) {
    out.className = 'import-result err';
    out.textContent = `Erreur : ${e.message}`;
  }
}

// --- navigation -----------------------------------------------------------

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  const isTheme = THEME_KEYS.includes(view);
  document.getElementById('view-theme').classList.toggle('hidden', !isTheme);
  document.getElementById('view-locations').classList.toggle('hidden', view !== 'locations');
  document.getElementById('view-import').classList.toggle('hidden', view !== 'import');
  if (isTheme) loadTheme(view);
  else if (view === 'locations') loadLocations();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('tabs').addEventListener('click', (e) => {
    if (e.target.classList.contains('tab')) switchView(e.target.dataset.view);
  });
  document.getElementById('btn-regen').addEventListener('click', regenSummary);
  document.getElementById('import-form').addEventListener('submit', submitImport);
  document.getElementById('btn-xsync').addEventListener('click', xSync);
  loadHealth();
  switchView('air');
});
