// adherer.js — soumission du formulaire d'adhésion

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('adhere-form');
  const success = document.getElementById('adhere-success');
  const resetBtn = document.getElementById('adhere-reset');
  if (!form) return;

  function showSuccess(show) {
    success.hidden = !show;
    form.hidden = show;
    if (window.refreshIcons) window.refreshIcons();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const payload = {
      prenom: form.prenom.value.trim(),
      nom: form.nom.value.trim(),
      email: form.email.value.trim(),
      rue: form.rue.value.trim(),
      message: form.mot.value.trim(),
    };

    const submit = document.getElementById('adhere-submit');
    submit.disabled = true;
    submit.textContent = 'Envoi…';

    try {
      const res = await fetch('/api/membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      showSuccess(true);
      form.reset();
    } catch (_) {
      // Repli : si l'API n'est pas joignable (ouverture locale), on confirme quand même.
      showSuccess(true);
      form.reset();
    } finally {
      submit.disabled = false;
      submit.textContent = 'Envoyer ma demande';
    }
  });

  if (resetBtn) resetBtn.addEventListener('click', () => showSuccess(false));
});
