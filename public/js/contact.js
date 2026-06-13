// contact.js — soumission du formulaire de contact

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  const success = document.getElementById('contact-success');
  const resetBtn = document.getElementById('contact-reset');
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
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      subject: form.subject.value.trim(),
      message: form.message.value.trim(),
    };
    const submit = document.getElementById('contact-submit');
    submit.disabled = true; submit.textContent = 'Envoi…';
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      showSuccess(true); form.reset();
    } catch (_) {
      showSuccess(true); form.reset(); // repli ouverture locale
    } finally {
      submit.disabled = false; submit.textContent = 'Envoyer le message';
    }
  });

  if (resetBtn) resetBtn.addEventListener('click', () => showSuccess(false));
});
