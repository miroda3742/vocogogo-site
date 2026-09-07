/* ==========================================================================
   Shared Cloudflare Worker entry point — copied into worker.js for every
   site (main + 4 apps). Serves the site's static files and handles
   POST /api/contact. Identical code everywhere; behavior is configured
   per-project via Variables and Secrets set in each site's Cloudflare
   dashboard (Workers & Pages → [project] → Settings → Variables and
   Secrets):

     TURNSTILE_SECRET_KEY  — secret key from the Cloudflare Turnstile
                              dashboard, for the widget on THIS site's
                              contact.html. Add as a Secret.
     RESEND_API_KEY        — API key from resend.com. Add as a Secret.
     CONTACT_TO_EMAIL       — inbox that should receive submissions
     CONTACT_FROM_EMAIL     — verified sender address in Resend,
                              e.g. contact@mirodalab.com (must be on a
                              domain you've verified in Resend — plain
                              inbox addresses like Gmail won't work here)
     SITE_NAME              — optional, e.g. "Margins". Prefixes the email
                              subject line so submissions are identifiable
                              at a glance if multiple sites deliver to the
                              same inbox. Falls back to a generic subject
                              if unset.

   See README.md "Contact form setup" for the full walkthrough.
   ========================================================================== */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/contact' && request.method === 'POST') {
      return handleContact(request, env);
    }

    // Everything else is a static file — hand it to the assets binding.
    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request, env) {
  try {
    const form = await request.formData();

    // Honeypot: real visitors never see this field (hidden off-screen via
    // CSS). Bots that fill in every field trip it. Pretend success so the
    // bot doesn't learn anything and try again with a different approach.
    if ((form.get('company') || '').toString().trim() !== '') {
      return jsonOk();
    }

    const name = (form.get('name') || '').toString().trim();
    const email = (form.get('email') || '').toString().trim();
    const message = (form.get('message') || '').toString().trim();
    const token = (form.get('cf-turnstile-response') || '').toString();

    if (!name || !email || !message) {
      return jsonError('Please fill in all fields.', 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonError('Please enter a valid email address.', 400);
    }
    if (message.length > 5000) {
      return jsonError('Message is too long.', 400);
    }
    if (!token) {
      return jsonError('Please complete the verification challenge.', 400);
    }

    // Verify the Turnstile token server-side — never trust the client.
    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: request.headers.get('CF-Connecting-IP') || '',
      }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.success) {
      return jsonError('Verification failed. Please reload the page and try again.', 400);
    }

    // Send the email via Resend.
    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM_EMAIL,
        to: [env.CONTACT_TO_EMAIL],
        reply_to: email,
        subject: env.SITE_NAME
          ? `[${env.SITE_NAME}] New message from ${name}`
          : `New contact form message from ${name}`,
        text: `From: ${name} <${email}>\n\n${message}`,
      }),
    });

    if (!sendRes.ok) {
      console.error('Resend error:', await sendRes.text());
      return jsonError('Could not send your message right now. Please try again later.', 502);
    }

    return jsonOk();
  } catch (err) {
    console.error('Contact form error:', err);
    return jsonError('Something went wrong. Please try again later.', 500);
  }
}

function jsonOk() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
