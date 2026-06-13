// entraide.js — plateforme d'entraide (petites annonces)

const ENTRAIDE_CATS = ['Courses', 'Bricolage', 'Jardinage', 'Transport', 'Informatique', 'Animaux', 'Cours & soutien', 'Compagnie', 'Autre'];

function eEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function eDate(s) {
  if (!s) return '';
  const d = new Date(s.length <= 10 ? s + 'T00:00' : s.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}
function contactLink(c) {
  const v = String(c || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `<a href="mailto:${eEsc(v)}">${eEsc(v)}</a>`;
  if (/^[+0-9 ().-]{6,}$/.test(v)) return `<a href="tel:${eEsc(v.replace(/[^+0-9]/g, ''))}">${eEsc(v)}</a>`;
  return eEsc(v);
}

let ALL_LISTINGS = [];
let CUR_FILTER = 'tous';

function listingCard(l) {
  const isDemande = l.type === 'demande';
  const typeBadge = isDemande
    ? '<span class="badge badge--brique badge--solid">Je cherche</span>'
    : '<span class="badge badge--olive badge--solid">Je propose</span>';
  const cat = l.category ? `<span class="badge badge--ocre">${eEsc(l.category)}</span>` : '';
  const where = l.area ? ` · ${eEsc(l.area)}` : '';
  return `
    <article class="card listing-card">
      <div class="event-tags">${typeBadge}${cat}</div>
      <h3>${eEsc(l.title)}</h3>
      <p class="listing-desc">${eEsc(l.description)}</p>
      <div class="listing-foot">
        <div class="listing-who"><span data-lucide="user-round"></span> ${eEsc(l.author_name)}${where}</div>
        <div class="listing-contact"><span data-lucide="send"></span> ${contactLink(l.contact)}</div>
        <div class="listing-date">${eDate(l.created_at)}</div>
      </div>
    </article>`;
}

function renderListings() {
  const grid = document.querySelector('[data-listings-grid]');
  if (!grid) return;
  let list = ALL_LISTINGS;
  if (CUR_FILTER !== 'tous') list = list.filter(l => l.type === CUR_FILTER);
  grid.innerHTML = list.length
    ? list.map(listingCard).join('')
    : '<p style="color:var(--color-text-muted)">Aucune annonce pour le moment. Soyez le premier à en déposer une&nbsp;!</p>';
  if (window.refreshIcons) window.refreshIcons();
}

async function loadListings() {
  try {
    const res = await fetch('/api/listings', { headers: { Accept: 'application/json' } });
    ALL_LISTINGS = res.ok ? await res.json() : [];
  } catch (_) { ALL_LISTINGS = []; }
  renderListings();
}

function initFilters() {
  const bar = document.getElementById('entraide-filters');
  bar.addEventListener('click', e => {
    const btn = e.target.closest('.filter-chip');
    if (!btn) return;
    bar.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('is-active'));
    btn.classList.add('is-active');
    CUR_FILTER = btn.getAttribute('data-filter');
    renderListings();
  });
}

function initForm() {
  const wrap = document.getElementById('form-wrap');
  const form = document.getElementById('entraide-form');
  const success = document.getElementById('entraide-success');
  const catSel = document.getElementById('l-cat');
  catSel.innerHTML = ENTRAIDE_CATS.map(c => `<option>${c}</option>`).join('');

  function show(open) { wrap.hidden = !open; if (open) { window.scrollTo({ top: wrap.offsetTop - 80, behavior: 'smooth' }); if (window.refreshIcons) window.refreshIcons(); } }
  function showSuccess(s) { success.hidden = !s; form.hidden = s; if (window.refreshIcons) window.refreshIcons(); }

  document.getElementById('toggle-form').addEventListener('click', () => { showSuccess(false); show(true); });
  document.getElementById('entraide-cancel').addEventListener('click', () => show(false));
  document.getElementById('entraide-reset').addEventListener('click', () => showSuccess(false));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const payload = {
      type: form.type.value, category: form.category.value,
      title: form.title.value.trim(), description: form.description.value.trim(),
      author_name: form.author_name.value.trim(), contact: form.contact.value.trim(),
      area: form.area.value.trim(), website: form.website.value,
    };
    const btn = document.getElementById('entraide-submit');
    btn.disabled = true; btn.textContent = 'Publication…';
    try {
      const res = await fetch('/api/listings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      form.reset();
      showSuccess(true);
      loadListings();
    } catch (_) {
      showSuccess(true); form.reset(); loadListings();
    } finally { btn.disabled = false; btn.textContent = "Publier l'annonce"; }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initFilters();
  initForm();
  loadListings();
});
