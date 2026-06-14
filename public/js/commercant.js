// commercant.js — fiche détaillée d'un commerçant

const MD_TYPES = {
  boulangerie: 'Boulangerie', boucherie: 'Boucherie', epicerie: 'Épicerie', primeur: 'Primeur',
  pizzeria: 'Pizzeria', restaurant: 'Restaurant', bar: 'Bar', cafe: 'Café',
  fleuriste: 'Fleuriste', coiffeur: 'Coiffeur', autre: 'Autre commerce',
};
const MD_KINDS = {
  invendu: { label: 'Invendu', badge: 'badge--brique badge--solid' },
  promo: { label: 'Promo', badge: 'badge--ocre badge--solid' },
  annonce: { label: 'Annonce', badge: 'badge--ardoise' },
};
function dEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function dType(t) { return MD_TYPES[t] || (t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Commerce'); }
function mapsUrl(addr) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr); }

function productCard(p) {
  const img = p.photo_key
    ? `<div class="prod-photo"><img src="/img/${dEsc(p.photo_key)}" alt="${dEsc(p.name)}" loading="lazy" /></div>`
    : `<div class="prod-photo prod-photo--empty"><span data-lucide="image"></span></div>`;
  return `<article class="card prod-card">
    ${img}
    <div class="prod-body">
      <div class="prod-head"><h3>${dEsc(p.name)}</h3>${p.price ? `<span class="m-price">${dEsc(p.price)}</span>` : ''}</div>
      ${p.description ? `<p class="muted" style="margin:6px 0 0; font-size:.93rem">${dEsc(p.description)}</p>` : ''}
    </div>
  </article>`;
}
function postCard(p) {
  const k = MD_KINDS[p.kind] || MD_KINDS.annonce;
  return `<article class="card m-post">
    <div class="event-tags"><span class="badge ${k.badge}">${k.label}</span>${p.price ? `<span class="m-price">${dEsc(p.price)}</span>` : ''}</div>
    <h3>${dEsc(p.title)}</h3>
    ${p.body ? `<p class="m-body">${dEsc(p.body)}</p>` : ''}
    ${p.available_until ? `<div class="m-until"><span data-lucide="clock"></span> ${dEsc(p.available_until)}</div>` : ''}
  </article>`;
}

async function load() {
  const el = document.getElementById('merchant-detail');
  const slug = new URLSearchParams(location.search).get('c') || new URLSearchParams(location.search).get('slug');
  if (!slug) { el.innerHTML = '<p class="muted">Commerçant introuvable.</p>'; return; }
  let data;
  try {
    const res = await fetch('/api/merchants/' + encodeURIComponent(slug));
    if (!res.ok) throw new Error();
    data = await res.json();
  } catch (_) { el.innerHTML = '<p class="muted">Ce commerçant n\'existe pas ou n\'est plus actif.</p>'; return; }

  const m = data.merchant;
  document.title = m.name + ' — Les Amis de Montety';
  const photo = m.photo_key
    ? `<div class="detail-photo"><img src="/img/${dEsc(m.photo_key)}" alt="${dEsc(m.name)}" /></div>`
    : `<div class="detail-photo detail-photo--empty"><span data-lucide="store"></span></div>`;
  el.innerHTML = `
    <div class="detail-hero">
      ${photo}
      <div class="detail-info">
        <span class="badge badge--ocre">${dEsc(dType(m.type))}</span>
        <h1>${dEsc(m.name)}</h1>
        ${m.description ? `<p class="lead" style="margin:8px 0 16px">${dEsc(m.description)}</p>` : ''}
        <div class="m-meta">
          ${m.address ? `<div><span data-lucide="map-pin"></span> <a href="${mapsUrl(m.address)}" target="_blank" rel="noopener">${dEsc(m.address)}</a></div>` : ''}
          ${m.phone ? `<div><span data-lucide="phone"></span> <a href="tel:${dEsc(m.phone.replace(/[^+0-9]/g, ''))}">${dEsc(m.phone)}</a></div>` : ''}
        </div>
      </div>
    </div>

    ${data.products.length ? `
      <section style="margin-top:56px">
        <div class="section-head"><span class="eyebrow">La carte</span><h2>Les produits</h2></div>
        <div class="grid-3">${data.products.map(productCard).join('')}</div>
      </section>` : ''}

    ${data.posts.length ? `
      <section style="margin-top:56px">
        <div class="section-head"><span class="eyebrow">Actualités</span><h2>Annonces & invendus</h2></div>
        <div class="grid-3">${data.posts.map(postCard).join('')}</div>
      </section>` : ''}

    ${(!data.products.length && !data.posts.length) ? '<p class="muted" style="margin-top:40px">Ce commerçant n\'a pas encore publié de produits ni d\'annonces.</p>' : ''}
  `;
  if (window.refreshIcons) window.refreshIcons();
}

document.addEventListener('DOMContentLoaded', load);
