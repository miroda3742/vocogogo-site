/* ==========================================================================
   Shared contact-form script — copied into js/contact.js for every site
   (main + 4 apps). Handles submitting #contact-form to the site's own
   /api/contact Worker endpoint and showing a status message. Turnstile
   itself is handled by the widget's own <script> tag in contact.html;
   this file only resets the widget after a failed/successful submit.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  var form = document.getElementById('contact-form');
  if (!form) return;

  var status = document.getElementById('form-status');
  var submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    status.textContent = '';
    status.className = 'form-status';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    fetch('/api/contact', {
      method: 'POST',
      body: new FormData(form),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok && result.data && result.data.ok) {
          form.reset();
          if (window.turnstile) window.turnstile.reset();
          status.textContent = "Message sent — thanks, I'll get back to you soon.";
          status.className = 'form-status success';
        } else {
          throw new Error((result.data && result.data.error) || 'Something went wrong. Please try again.');
        }
      })
      .catch(function (err) {
        if (window.turnstile) window.turnstile.reset();
        status.textContent = err.message || 'Something went wrong. Please try again.';
        status.className = 'form-status error';
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send message';
      });
  });
});
