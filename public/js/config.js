// config.js — récupère la configuration publique (liens HelloAsso, e-mail) et l'applique

(async function () {
  let cfg = {};
  try {
    const res = await fetch('/api/config', { headers: { Accept: 'application/json' } });
    if (res.ok) cfg = await res.json();
  } catch (_) { /* ouverture locale : on garde les valeurs par défaut */ }

  const map = { membership: cfg.membershipUrl, donation: cfg.donationUrl };

  document.querySelectorAll('[data-helloasso]').forEach(el => {
    const url = map[el.getAttribute('data-helloasso')];
    if (url) {
      el.setAttribute('href', url);
      el.removeAttribute('data-helloasso-missing');
    } else {
      // Pas encore configuré : on neutralise le lien et on le signale.
      el.setAttribute('data-helloasso-missing', '1');
    }
  });

  // Affiche/masque les blocs « lien manquant »
  document.querySelectorAll('[data-helloasso-fallback]').forEach(el => {
    const kind = el.getAttribute('data-helloasso-fallback');
    el.hidden = !!map[kind];
  });
  document.querySelectorAll('[data-helloasso-embed]').forEach(el => {
    const kind = el.getAttribute('data-helloasso-embed');
    if (map[kind]) {
      el.innerHTML = `<iframe src="${map[kind]}" style="width:100%;min-height:740px;border:none;background:transparent" title="HelloAsso" allow="payment"></iframe>`;
    }
  });

  if (cfg.contactEmail) {
    document.querySelectorAll('[data-contact-email]').forEach(el => {
      el.textContent = cfg.contactEmail;
      el.setAttribute('href', 'mailto:' + cfg.contactEmail);
    });
  }
})();
