// main.js — en-tête, pied de page et comportements communs

const NAV_LINKS = [
  { id: 'accueil', label: 'Accueil', href: 'index.html' },
  { id: 'agenda', label: "L'agenda", href: 'agenda.html' },
  { id: 'quartier', label: 'Le quartier', href: 'quartier.html' },
  { id: 'entraide', label: 'Entraide', href: 'entraide.html' },
  { id: 'commercants', label: 'Commerçants', href: 'commercants.html' },
  { id: 'bar', label: 'Le bar', href: 'bar.html' },
  { id: 'adherer', label: 'Adhérer', href: 'adherer.html' },
  { id: 'contact', label: 'Contact', href: 'contact.html' },
];

function renderHeader() {
  const el = document.querySelector('[data-header]');
  if (!el) return;
  const active = document.body.dataset.page || '';
  const links = NAV_LINKS.map(l =>
    `<a href="${l.href}"${l.id === active ? ' class="is-active"' : ''}>${l.label}</a>`).join('');
  el.innerHTML = `
    <div class="site-header__inner">
      <a class="brand" href="index.html">
        <img src="assets/logo-montety.png" alt="" />
        <span>Les Amis de Montety</span>
      </a>
      <button class="nav-toggle" aria-label="Menu" aria-expanded="false" data-nav-toggle>
        <span data-lucide="menu"></span>
      </button>
      <div class="header-right" id="site-nav">
        <nav class="site-nav">${links}</nav>
        <a class="btn btn--accent btn--sm header-don" href="don.html">
          <span data-lucide="hand-heart"></span> Faire un don
        </a>
      </div>
    </div>`;
}

function renderFooter() {
  const el = document.querySelector('[data-footer]');
  if (!el) return;
  el.innerHTML = `
    <div class="site-footer__inner">
      <div class="footer-brand">
        <img src="assets/logo-montety-cream.png" alt="" />
        <div>
          <div class="name">Les Amis de Montety</div>
          <div class="sub">Association de quartier · Toulon</div>
        </div>
      </div>
      <div class="footer-cols">
        <div class="footer-col">
          <h4>Le quartier</h4>
          <a href="index.html">Accueil</a>
          <a href="agenda.html">L'agenda</a>
          <a href="quartier.html">Le quartier</a>
          <a href="entraide.html">Entraide</a>
          <a href="commercants.html">Commerçants</a>
          <a href="bar.html">Le bar</a>
          <a href="adherer.html">Adhérer</a>
          <a href="don.html">Faire un don</a>
        </div>
        <div class="footer-col">
          <h4>Nous trouver</h4>
          <a href="https://www.google.com/maps/search/?api=1&query=11%20boulevard%20Commandant%20Nicolas%2C%2083000%20Toulon" target="_blank" rel="noopener"><span data-lucide="map-pin"></span> 11 boulevard Commandant Nicolas, 83000 Toulon</a>
          <a href="mailto:bonjour@lesamisdemontety.com" data-contact-email>bonjour@lesamisdemontety.com</a>
          <a href="contact.html">Nous écrire</a>
          <div class="footer-script script">tous les âges, un même quartier</div>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} Les Amis de Montety</span>
        <span class="footer-spaces">
          <a href="admin.html"><span data-lucide="lock"></span> Administrateur</a>
          <a href="bar-admin.html"><span data-lucide="beer"></span> Gérant de bar</a>
          <a href="commercants.html#connexion"><span data-lucide="store"></span> Espace commerçant</a>
        </span>
      </div>
    </div>`;
}

function initNavToggle() {
  const btn = document.querySelector('[data-nav-toggle]');
  const nav = document.getElementById('site-nav');
  if (!btn || !nav) return;
  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', String(open));
  });
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons({ attrs: { 'stroke-width': 1.8, width: 24, height: 24 } });
  }
}
window.refreshIcons = refreshIcons;

// Référencement : canonical, Open Graph, données structurées
function injectSEO() {
  const head = document.head;
  const url = location.origin + location.pathname.replace(/index\.html$/, '');
  const desc = (document.querySelector('meta[name="description"]') || {}).content || '';
  const img = location.origin + '/assets/logo-montety.png';
  const set = (sel, make) => { if (!document.querySelector(sel)) head.appendChild(make()); };
  const meta = (attr, key, val) => { const m = document.createElement('meta'); m.setAttribute(attr, key); m.content = val; return m; };
  set('link[rel="canonical"]', () => { const l = document.createElement('link'); l.rel = 'canonical'; l.href = url; return l; });
  set('meta[property="og:title"]', () => meta('property', 'og:title', document.title));
  set('meta[property="og:description"]', () => meta('property', 'og:description', desc));
  set('meta[property="og:type"]', () => meta('property', 'og:type', 'website'));
  set('meta[property="og:url"]', () => meta('property', 'og:url', url));
  set('meta[property="og:image"]', () => meta('property', 'og:image', img));
  set('meta[property="og:site_name"]', () => meta('property', 'og:site_name', 'Les Amis de Montety'));
  set('meta[property="og:locale"]', () => meta('property', 'og:locale', 'fr_FR'));
  set('meta[name="twitter:card"]', () => meta('name', 'twitter:card', 'summary'));
  if (!document.getElementById('ld-org')) {
    const s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'ld-org';
    s.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'NGO', name: 'Les Amis de Montety',
      url: location.origin + '/', logo: img, email: 'bonjour@lesamisdemontety.com',
      address: { '@type': 'PostalAddress', streetAddress: '11 boulevard Commandant Nicolas', postalCode: '83000', addressLocality: 'Toulon', addressCountry: 'FR' },
      description: 'Association de quartier intergénérationnelle à Toulon.',
    });
    document.head.appendChild(s);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  injectSEO();
  renderHeader();
  renderFooter();
  initNavToggle();
  refreshIcons();
});
