// agenda.js — chargement et affichage des événements (API ou repli local)

// Données d'exemple (repli si l'API n'est pas disponible — ex. ouverture en local)
const FALLBACK_EVENTS = [
  { title: 'Café-tricot', cat: 'Atelier', tone: 'ocre', free: 1, when: 'JEU. 18 JUIN · 15H', descr: 'Aiguilles, laine et bavardages. Débutants bienvenus, on apprend ensemble.' },
  { title: 'Repas de rue', cat: 'Événement', tone: 'brique', free: 0, when: 'SAM. 27 JUIN · 19H', descr: 'Chacun apporte un plat, on installe les grandes tables place de Montety.' },
  { title: 'Aide aux devoirs', cat: 'Entraide', tone: 'olive', free: 1, when: 'TOUS LES MAR. · 17H', descr: 'Les retraités du quartier accompagnent les écoliers, dans la bonne humeur.' },
  { title: 'Balade contée', cat: 'Sortie', tone: 'ardoise', free: 1, when: 'DIM. 5 JUIL. · 10H', descr: 'Sur les pas de Paulin de Montety : histoires et mémoires du quartier.' },
  { title: 'Atelier jardinage', cat: 'Atelier', tone: 'olive', free: 0, when: 'SAM. 11 JUIL. · 10H', descr: 'On plante les bacs partagés du bas de la rue. Outils fournis.' },
  { title: 'Loto de quartier', cat: 'Événement', tone: 'brique', free: 0, when: 'VEN. 17 JUIL. · 20H30', descr: 'La soirée préférée des anciens comme des petits. Lots offerts par les commerçants.' },
];

const TONE_BY_CAT = { 'Atelier': 'ocre', 'Événement': 'brique', 'Entraide': 'olive', 'Sortie': 'ardoise' };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function eventCard(ev) {
  const tone = ev.tone || TONE_BY_CAT[ev.cat] || 'neutral';
  const free = (ev.free === 1 || ev.free === true) ? '<span class="badge badge--olive badge--solid">Gratuit</span>' : '';
  return `
    <article class="card card--interactive event-card">
      <div class="event-tags">
        <span class="badge badge--${tone}">${esc(ev.cat)}</span>
        ${free}
      </div>
      <div class="event-when">${esc(ev.when)}</div>
      <h3>${esc(ev.title)}</h3>
      <p>${esc(ev.descr || ev.desc || '')}</p>
    </article>`;
}

let ALL_EVENTS = [];

function renderEvents(filter) {
  document.querySelectorAll('[data-events-grid]').forEach(grid => {
    const limit = parseInt(grid.getAttribute('data-limit') || '0', 10);
    let list = ALL_EVENTS;
    if (filter && filter !== 'Tous') list = list.filter(e => e.cat === filter);
    if (limit > 0) list = list.slice(0, limit);
    grid.innerHTML = list.length
      ? list.map(eventCard).join('')
      : '<p style="color:var(--color-text-muted)">Aucun rendez-vous pour le moment. Revenez bientôt&nbsp;!</p>';
  });
  if (window.refreshIcons) window.refreshIcons();
}

function initFilters() {
  const bar = document.getElementById('agenda-filters');
  if (!bar) return;
  bar.addEventListener('click', e => {
    const btn = e.target.closest('.filter-chip');
    if (!btn) return;
    bar.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('is-active'));
    btn.classList.add('is-active');
    renderEvents(btn.getAttribute('data-filter'));
  });
}

async function loadEvents() {
  try {
    const res = await fetch('/api/events', { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    ALL_EVENTS = Array.isArray(data) && data.length ? data : FALLBACK_EVENTS;
  } catch (_) {
    ALL_EVENTS = FALLBACK_EVENTS; // ouverture locale / API absente
  }
  renderEvents('Tous');
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('[data-events-grid]')) {
    initFilters();
    loadEvents();
  }
});
