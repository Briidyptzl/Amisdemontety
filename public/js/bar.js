// bar.js — page publique du bar (carte)

function bEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function eur(n) { return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }

function menuCard(p) {
  return `<article class="card bar-menu-item">
    <h3>${bEsc(p.name)}</h3>
    ${p.unit ? `<p class="muted" style="margin:0">${bEsc(p.unit)}</p>` : ''}
    <div class="bar-menu-price">${eur(p.price)}</div>
  </article>`;
}

async function loadBar() {
  let data = { description: '', hours: '', products: [] };
  try {
    const res = await fetch('/api/bar', { headers: { Accept: 'application/json' } });
    if (res.ok) data = await res.json();
  } catch (_) {}
  if (data.description) document.getElementById('bar-desc').textContent = data.description;
  document.getElementById('bar-hours').textContent = data.hours || '';
  const menu = document.getElementById('bar-menu');
  menu.innerHTML = data.products && data.products.length
    ? data.products.map(menuCard).join('')
    : '<p style="color:var(--color-text-muted)">La carte arrive bientôt.</p>';
  if (window.refreshIcons) window.refreshIcons();
}

document.addEventListener('DOMContentLoaded', loadBar);
