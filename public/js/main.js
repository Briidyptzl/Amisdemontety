// main.js — en-tête, pied de page et comportements communs

const NAV_LINKS = [
  { id: 'accueil', label: 'Accueil', href: 'index.html' },
  { id: 'agenda', label: "L'agenda", href: 'agenda.html' },
  { id: 'quartier', label: 'Le quartier', href: 'quartier.html' },
  { id: 'entraide', label: 'Entraide', href: 'entraide.html' },
  { id: 'commercants', label: 'Commerçants', href: 'commercants.html' },
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
          <a href="adherer.html">Adhérer</a>
          <a href="don.html">Faire un don</a>
        </div>
        <div class="footer-col">
          <h4>Nous trouver</h4>
          <p>Place de Montety, Toulon</p>
          <a href="mailto:bonjour@lesamisdemontety.com" data-contact-email>bonjour@lesamisdemontety.com</a>
          <a href="contact.html">Nous écrire</a>
          <div class="footer-script script">tous les âges, un même quartier</div>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} Les Amis de Montety</span>
        <a href="admin.html"><span data-lucide="lock"></span> Espace administrateur</a>
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

document.addEventListener('DOMContentLoaded', () => {
  renderHeader();
  renderFooter();
  initNavToggle();
  refreshIcons();
});
