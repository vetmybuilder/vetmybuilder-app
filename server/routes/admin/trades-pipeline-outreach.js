// server/routes/admin/trades-pipeline-outreach.js
//
// Compose + send a cold-outreach email to a pending pipeline row.
//
//   POST /api/admin/trades-pipeline/outreach/draft
//        body: { id }
//        returns: { subject, body, to, alreadySent, sentAt }
//
//   POST /api/admin/trades-pipeline/outreach/send
//        body: { id, subject, body }
//        returns: { ok, id, sentAt }
//        refuses if outreach_sent_at is already set, or no email on row.
//
// Sends FROM hello@vetmybuilder.com via Resend. Stamps outreach_sent_at
// + persists the actual subject/body that was sent.

const REGISTER_URL =
  "https://vetmybuilder.com/tradesman/register-tradesmen";
const FROM_ADDRESS = "VetMyBuilder <hello@vetmybuilder.com>";

// Idempotent column bootstrap so we don't wait for a manual migration on
// dev / staging installs. Mirrors the pattern in me.put.js etc.
let columnsEnsured = false;
async function ensureColumns(mysqlQuery, log) {
  if (columnsEnsured) return;
  columnsEnsured = true;
  const alters = [
    "ALTER TABLE tradesperson_pipeline ADD COLUMN outreach_sent_at DATETIME NULL",
    "ALTER TABLE tradesperson_pipeline ADD COLUMN outreach_subject VARCHAR(255) NULL",
    "ALTER TABLE tradesperson_pipeline ADD COLUMN outreach_body TEXT NULL",
    "ALTER TABLE tradesperson_pipeline ADD COLUMN outreach_recipient_name VARCHAR(255) NULL",
  ];
  for (const sql of alters) {
    try {
      await mysqlQuery(sql);
    } catch (err) {
      const msg = String(err?.message || "");
      if (!/Duplicate column|already exists/i.test(msg)) {
        log.warn?.(`[outreach] ensureColumns: ${msg}`);
      }
    }
  }
}

function firstName(fullName) {
  if (!fullName) return "";
  const cleaned = String(fullName).trim();
  // Officers can be "SURNAME, First" or "First Surname"
  if (cleaned.includes(",")) {
    const [, rest] = cleaned.split(",");
    return (rest || "").trim().split(" ")[0] || "";
  }
  return cleaned.split(" ")[0] || "";
}

function titleCase(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const TEMPLATES = {
  default: {
    label: "Default - founder story",
    render(row) {
      const company = titleCase(row.company_name || "your business");
      const recipFirst = firstName(row.outreach_recipient_name || "");
      const greeting = recipFirst ? `Hi ${recipFirst},` : "Hi there,";
      const trade = (row.trade_types || "tradesperson").toLowerCase();
      return {
        subject: `Quick one for ${company} - new local jobs in your area`,
        body: `${greeting}

I came across ${company} while pulling together a list of trusted local tradespeople for VetMyBuilder, and the work I've seen is genuinely impressive.

VetMyBuilder is a new platform I built where homeowners post real jobs in their borough and trades match directly - no bidding wars, no per-lead fees.

The reason I built it: a friend in the trade showed me how much he was paying for leads that went nowhere. I figured the model needed flipping.

We're just opening sign-ups across:
• Waltham Forest
• Barnet
• Redbridge
• Epping

I'd love to have ${trade}s like ${company} come on board as founding members and sit at the top of the preferred list.

It's **Free** to sign up, takes about a minute.
${REGISTER_URL}

If it's not for you, no worries - just hit reply and I'll take ${company} off the list.

Cheers,
Chris (Founder & CEO)
hello@vetmybuilder.com
https://vetmybuilder.com`,
      };
    },
  },
  short: {
    label: "Short & direct",
    render(row) {
      const company = titleCase(row.company_name || "your business");
      const recipFirst = firstName(row.outreach_recipient_name || "");
      const greeting = recipFirst ? `Hi ${recipFirst},` : "Hi there,";
      return {
        subject: `${company} - local job leads, no per-lead fees`,
        body: `${greeting}

Saw ${company}'s work and wanted to drop a quick line.

I'm launching **VetMyBuilder** this month - local homeowners post real jobs, trades match directly. No bidding wars, no lead fees.

Sign-ups are open in Waltham Forest, Barnet, Redbridge and Epping. It's **Free** and takes about a minute:
${REGISTER_URL}

If it's not for you, just hit reply and I'll take you off the list.

Cheers,
Chris (Founder & CEO)
hello@vetmybuilder.com
https://vetmybuilder.com`,
      };
    },
  },
  value: {
    label: "Value-led - lead-fee angle",
    render(row) {
      const company = titleCase(row.company_name || "your business");
      const recipFirst = firstName(row.outreach_recipient_name || "");
      const greeting = recipFirst ? `Hi ${recipFirst},` : "Hi there,";
      const trade = (row.trade_types || "tradesperson").toLowerCase();
      return {
        subject: `How many lead fees has ${company} paid this month?`,
        body: `${greeting}

Quick question: how many leads has ${company} paid for that went nowhere?

A friend in the trade showed me how much he was burning on lead-gen sites. I built VetMyBuilder so it doesn't have to work that way - homeowners post real jobs in their borough and ${trade}s match directly. No bidding wars, no per-lead fees.

The first wave of sign-ups is open in:
• Waltham Forest
• Barnet
• Redbridge
• Epping

Founding members sit at the top of the homeowner feed.

It's **Free** to sign up, takes about a minute.
${REGISTER_URL}

If you'd rather not hear from me again, just reply STOP.

Cheers,
Chris (Founder & CEO)
hello@vetmybuilder.com
https://vetmybuilder.com`,
      };
    },
  },
};

function renderTemplate(row, templateId) {
  const id = TEMPLATES[templateId] ? templateId : "default";
  return TEMPLATES[id].render(row);
}

function listTemplates() {
  return Object.entries(TEMPLATES).map(([id, t]) => ({ id, label: t.label }));
}

const PUBLIC_APP_URL = "https://vetmybuilder.com";
const BANNER_URL = `${PUBLIC_APP_URL}/hero.png`;
const LOGO_URL = `${PUBLIC_APP_URL}/icon-512.png`;

// Convert the plain-text body editors use into formatted HTML. Supports
// **bold** markdown, • bullet lines, naked URLs become clickable links,
// and the brand sig lines (hello@vetmybuilder.com, https://vetmybuilder.com)
// get special treatment: the URL renders as a clickable logo image,
// and the email gets a ✉️ icon prefix.
function formatBodyInner(text) {
  const esc = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const lines = String(text).split(/\r?\n/);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*•\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*•\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*•\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
    } else {
      blocks.push({ kind: "line", text: line });
      i++;
    }
  }

  const renderInline = (s) => {
    let out = esc(s);
    out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    out = out.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" style="color:#059669;text-decoration:underline;">$1</a>',
    );
    return out;
  };

  // Brand-sig replacements - applied per line so they always win over
  // the generic URL linkifier.
  const renderLine = (s) => {
    const trimmed = s.trim();
    // Bare brand URL line -> clickable wordmark banner (wide rectangle).
    if (
      /^https?:\/\/(?:www\.)?vetmybuilder\.com\/?$/i.test(trimmed)
    ) {
      return `<a href="${PUBLIC_APP_URL}" style="display:block;text-decoration:none;line-height:0;margin-top:8px;"><img src="${PUBLIC_APP_URL}/email-banner.png" alt="VetMyBuilder" style="display:block;border:0;width:240px;max-width:60%;height:auto;border-radius:8px;" /></a>`;
    }
    // Brand email line -> ✉️ icon + clickable mailto.
    if (/^hello@vetmybuilder\.com$/i.test(trimmed)) {
      return `<span>✉️</span>&nbsp;<a href="mailto:hello@vetmybuilder.com" style="color:#059669;text-decoration:underline;">hello@vetmybuilder.com</a>`;
    }
    return renderInline(s);
  };

  let html = "";
  for (const b of blocks) {
    if (b.kind === "ul") {
      html += `<ul style="margin:8px 0 14px 18px;padding:0;color:#0f172a;">`;
      for (const it of b.items) {
        html += `<li style="margin:2px 0;">${renderInline(it)}</li>`;
      }
      html += `</ul>`;
    } else {
      html += `<div style="margin:0 0 6px 0;">${renderLine(b.text) || "&nbsp;"}</div>`;
    }
  }
  return html;
}

// Full email shell: logo header (clickable), formatted body, footer
// with VMB social/web links. Table-based for client compatibility.
function bodyToHtml(text) {
  const inner = formatBodyInner(text);
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f1f5f9;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;">
    <tr><td align="center" style="padding:24px 12px;">
      <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
        <tr><td style="padding:0;line-height:0;">
          <a href="${PUBLIC_APP_URL}" style="display:block;line-height:0;text-decoration:none;">
            <img src="${BANNER_URL}" alt="VetMyBuilder" width="600" style="display:block;border:0;width:100%;height:auto;" />
          </a>
        </td></tr>
        <tr><td style="padding:24px 28px 28px;font-size:15px;line-height:1.55;">
          ${inner}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

module.exports = (router, ctx) => {
  const { mysqlQuery, auth } = ctx;
  const log = ctx.log || console;
  const { requireAdmin } = require("../../lib/roles");
  const adminGuard = [auth, requireAdmin(ctx)];

  router.post(
    "/admin/trades-pipeline/outreach/draft",
    ...adminGuard,
    async (req, res) => {
      await ensureColumns(mysqlQuery, log);

      const id = Number(req.body?.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: "id required" });
      }
      const rows = await mysqlQuery(
        `SELECT id, company_name, trade_types, email,
                outreach_sent_at, outreach_subject, outreach_body,
                outreach_recipient_name
           FROM tradesperson_pipeline
          WHERE id = ?
          LIMIT 1`,
        [id],
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: "row not found" });
      }
      const row = rows[0];
      if (!row.email) {
        return res.status(400).json({ error: "no email on this row" });
      }

      // If we've already sent, return the actual sent copy.
      if (row.outreach_sent_at) {
        const sentBody = row.outreach_body || "";
        return res.json({
          to: row.email,
          subject: row.outreach_subject || "",
          body: sentBody,
          bodyHtml: bodyToHtml(sentBody),
          alreadySent: true,
          sentAt: row.outreach_sent_at,
          templates: listTemplates(),
        });
      }

      const templateId = String(req.body?.templateId || "default");
      const { subject, body } = renderTemplate(row, templateId);
      return res.json({
        to: row.email,
        subject,
        body,
        bodyHtml: bodyToHtml(body),
        alreadySent: false,
        sentAt: null,
        templateId,
        templates: listTemplates(),
      });
    },
  );

  router.get(
    "/admin/trades-pipeline/outreach/templates",
    ...adminGuard,
    (req, res) => res.json({ templates: listTemplates() }),
  );

  // Re-render the HTML preview for arbitrary subject + body. The modal
  // calls this on a debounce as the admin edits.
  router.post(
    "/admin/trades-pipeline/outreach/render",
    ...adminGuard,
    (req, res) => {
      const body = String(req.body?.body || "");
      return res.json({ bodyHtml: bodyToHtml(body) });
    },
  );

  router.post(
    "/admin/trades-pipeline/outreach/send",
    ...adminGuard,
    async (req, res) => {
      await ensureColumns(mysqlQuery, log);

      const id = Number(req.body?.id);
      const subject = String(req.body?.subject || "").trim();
      const body = String(req.body?.body || "").trim();
      // Optional override of the recipient (used for admin test sends).
      // When set + valid we send there instead of row.email.
      const toOverride = String(req.body?.to || "").trim().toLowerCase();
      const toOverrideValid =
        toOverride && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toOverride);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: "id required" });
      }
      if (!subject || !body) {
        return res.status(400).json({ error: "subject and body required" });
      }

      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "RESEND_API_KEY not configured" });
      }

      const rows = await mysqlQuery(
        `SELECT id, company_name, email, outreach_sent_at
           FROM tradesperson_pipeline
          WHERE id = ?
          LIMIT 1`,
        [id],
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: "row not found" });
      }
      const row = rows[0];
      if (!row.email) {
        return res.status(400).json({ error: "no email on this row" });
      }
      // Re-send is blocked for the REAL target only. Test sends (to
      // override) can be repeated freely.
      if (row.outreach_sent_at && !toOverrideValid) {
        return res
          .status(409)
          .json({ error: "already sent", sentAt: row.outreach_sent_at });
      }

      try {
        const { Resend } = require("resend");
        const resend = new Resend(apiKey);
        // Send both text + html so email clients pick whichever they
        // prefer. Plain body keeps **markers** in text; html version
        // converts them to <strong>.
        const sendTo = toOverrideValid ? toOverride : row.email;
        const result = await resend.emails.send({
          from: FROM_ADDRESS,
          to: sendTo,
          subject,
          text: body.replace(/\*\*(.+?)\*\*/g, "$1"),
          html: bodyToHtml(body),
        });
        if (result?.error) {
          const detail =
            result.error.message || JSON.stringify(result.error);
          log.error?.(`[outreach] Resend rejected: ${detail}`);
          return res
            .status(502)
            .json({ error: "resend_failed", detail });
        }

        // Test sends (to override) don't stamp outreach_sent_at - so
        // the real address can still be emailed later. Real sends get
        // the timestamp + the row is locked from re-send.
        if (!toOverrideValid) {
          await mysqlQuery(
            `UPDATE tradesperson_pipeline
                SET outreach_sent_at = NOW(),
                    outreach_subject = ?,
                    outreach_body = ?
              WHERE id = ?`,
            [subject, body, id],
          );
        }

        ctx.logActivity?.(
          "admin.pipeline.outreach.send",
          "info",
          req.user?.uid,
          toOverrideValid
            ? `Outreach TEST sent to ${sendTo} (pipeline #${id}, real target ${row.email})`
            : `Outreach sent to ${row.email} (pipeline #${id})`,
        );

        return res.json({
          ok: true,
          id,
          sentAt: toOverrideValid ? null : new Date().toISOString(),
          testSend: !!toOverrideValid,
        });
      } catch (err) {
        log.error?.({ err: err?.message }, "[outreach] send failed");
        return res
          .status(500)
          .json({ error: "send_failed", detail: err?.message });
      }
    },
  );

  // Manual outreach: admin adds a company that wasn't discovered, then
  // the existing Compose flow takes over (modal opens on returned id).
  // The row is inserted as status='approved' so it doesn't pollute the
  // pending review queue and is easy to filter from discovered rows.
  router.post(
    "/admin/trades-pipeline/manual/add",
    ...adminGuard,
    async (req, res) => {
      await ensureColumns(mysqlQuery, log);

      const company = String(req.body?.company || "").trim();
      const email = String(req.body?.email || "").trim().toLowerCase();
      const trade = String(req.body?.trade || "General Builder").trim();
      const area = String(req.body?.area || "").trim();
      const recipientName = String(req.body?.recipientName || "").trim();

      if (!company) {
        return res.status(400).json({ error: "company required" });
      }
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return res.status(400).json({ error: "valid email required" });
      }

      try {
        // Skip if we've already onboarded this email as a tradesperson.
        const onboarded = await mysqlQuery(
          "SELECT 1 FROM tradesmen WHERE LOWER(email) = ? LIMIT 1",
          [email],
        );
        if (onboarded.length > 0) {
          return res
            .status(409)
            .json({ error: "already_onboarded", message: "email belongs to an existing tradesperson" });
        }

        // De-dupe against the pipeline by email (case-insensitive). If
        // an existing row matches, just hand back its id instead of
        // inserting again - admin can still Compose against it.
        const existing = await mysqlQuery(
          "SELECT id FROM tradesperson_pipeline WHERE LOWER(email) = ? LIMIT 1",
          [email],
        );
        if (existing.length > 0) {
          return res.json({
            id: existing[0].id,
            reused: true,
          });
        }

        const result = await mysqlQuery(
          `INSERT INTO tradesperson_pipeline
             (company_name, trade_types, service_areas, email,
              outreach_recipient_name, status, discovered_at)
           VALUES (?, ?, ?, ?, ?, 'approved', NOW())`,
          [company, trade, area || null, email, recipientName || null],
        );

        ctx.logActivity?.(
          "admin.pipeline.manual.add",
          "info",
          req.user?.uid,
          `Manual pipeline entry added: ${company} (${email})`,
        );

        return res.json({ id: result.insertId, reused: false });
      } catch (err) {
        log.error?.({ err: err?.message }, "[outreach] manual add failed");
        return res
          .status(500)
          .json({ error: "manual_add_failed", detail: err?.message });
      }
    },
  );
};
