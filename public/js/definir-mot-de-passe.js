// definir-mot-de-passe.js — définition du mot de passe via lien (invitation / réinitialisation)

const TOKEN = new URLSearchParams(location.search).get('token') || '';
const $ = s => document.querySelector(s);

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
    if (!r.valid) { showInvalid(); return; }
    $('#subtitle').textContent = (r.kind === 'invite' ? 'Bienvenue ' : 'Bonjour ') + (r.name || '') + ' — choisissez votre mot de passe.';
    $('#form').hidden = false;
  } catch (_) { showInvalid(); }
}
function showInvalid() {
  $('#subtitle').textContent = '';
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
    $('#form').hidden = true; $('#title').hidden = true; $('#subtitle').hidden = true;
    $('#done').hidden = false; icons();
  } catch (ex) {
    err.textContent = ex.message; err.hidden = false;
    btn.disabled = false; btn.textContent = 'Enregistrer mon mot de passe';
  }
});

document.addEventListener('DOMContentLoaded', () => { init(); icons(); });
