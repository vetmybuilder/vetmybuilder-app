/**
 * POST /api/contact
 * Body: { name, email, subject, message }
 * Sends a contact form submission to the site owner via Resend.
 */

const { logger, withRequest } = require("../../lib/logger");

module.exports = (router) => {
  router.post("/contact", async (req, res) => {
    const log = withRequest(req).child({ route: "contact" });

    const { name, email, subject, message } = req.body || {};

    if (!name || !email || !message) {
      return res.status(400).json({ ok: false, error: "name, email and message are required" });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const toEmail = process.env.CONTACT_EMAIL;

    if (!apiKey || !toEmail) {
      log.error("RESEND_API_KEY or CONTACT_EMAIL not configured");
      return res.status(500).json({ ok: false, error: "email not configured" });
    }

    try {
      const { Resend } = require("resend");
      const resend = new Resend(apiKey);

      await resend.emails.send({
        from: "VetMyBuilder Contact <noreply@vetmybuilder.com>",
        to: toEmail,
        reply_to: email,
        subject: subject ? `[Contact] ${subject}` : `[Contact] Message from ${name}`,
        html: `
          <p><strong>Name:</strong> ${escHtml(name)}</p>
          <p><strong>Email:</strong> ${escHtml(email)}</p>
          ${subject ? `<p><strong>Subject:</strong> ${escHtml(subject)}</p>` : ""}
          <hr />
          <p style="white-space:pre-wrap">${escHtml(message)}</p>
        `,
      });

      log.info({ name, email }, "Contact form email sent");
      return res.json({ ok: true });
    } catch (err) {
      log.error({ err: err?.message }, "Failed to send contact email");
      return res.status(500).json({ ok: false, error: "failed to send" });
    }
  });
};

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
