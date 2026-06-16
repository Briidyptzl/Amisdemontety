// definir-mot-de-passe.js — définition du mot de passe via lien (invitation / réinitialisation)

const TOKEN = new URLSearchParams(location.search).get('token') || '';
const $ = s => document.querySelector(s);
let ACCOUNT_TYPE = 'admin';

// Destination de connexion selon le type de compte
function destFor(type) {
  if (type === 'merchant') return { url: 'commercants.html#connexion', label: 'votre espace commerçant' };
  if (type === 'bar') return { url: 'bar-admin.html', label: 'votre espace gérant de bar' };
  return { url: 'admin.html', label: "l'espace administrateur" };
}

async function api(path, body) {
  const res = await fetch('/api' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}
function icons() { if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } }); }

async function init() {
  if (!TOKEN) { showInvalid(); return; }
  try {
    const r = await api('/auth/validate-token', { token: TOKEN });
    if (!r.valid) { showInvalid(r.account_type); return; }
    ACCOUNT_TYPE = r.account_type || 'admin';
    $('#subtitle').textContent = (r.kind === 'invite' ? 'Bienvenue ' : 'Bonjour ') + (r.name || '') + ' — choisissez votre mot de passe.';
    $('#form').hidden = false;
  } catch (_) { showInvalid(); }
}
function showInvalid(type) {
  $('#subtitle').textContent = '';
  if (type) $('#invalid-link').setAttribute('href', destFor(type).url);
  $('#invalid').hidden = false;
}

$('#form').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#error'); err.hidden = true;
  const p1 = $('#pwd').value, p2 = $('#pwd2').value;
  if (p1.length < 8) { err.textContent = 'Le mot de passe doit faire 8 caractères minimum.'; err.hidden = false; return; }
  if (p1 !== p2) { err.textContent = 'Les deux mots de passe ne correspondent pas.'; err.hidden = false; return; }
  const btn = $('#submit'); btn.disabled = true; btn.textContent = 'Enregistrement…';
  try {
    await api('/auth/set-password', { token: TOKEN, password: p1 });
    const d = destFor(ACCOUNT_TYPE);
    $('#done-text').textContent = 'Vous pouvez maintenant vous connecter à ' + d.label + '.';
    $('#done-link').setAttribute('href', d.url);
    $('#form').hidden = true; $('#title').hidden = true; $('#subtitle').hidden = true;
    $('#done').hidden = false; icons();
  } catch (ex) {
    err.textContent = ex.message; err.hidden = false;
    btn.disabled = false; btn.textContent = 'Enregistrer mon mot de passe';
  }
});

document.addEventListener('DOMContentLoaded', () => { init(); icons(); });
