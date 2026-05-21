#!/usr/bin/env node
// scripts/posthog-daily-digest.js
//
// Pulls last-24h activity from PostHog and emails a digest to
// DIGEST_TO (defaults to support@vetmybuilder.com) via Resend.
//
// Designed to be run by the prod VM's system cron, e.g.
//   0 7 * * * cd /var/www/vetmybuilder && node scripts/posthog-daily-digest.js >> /var/log/vmb-digest.log 2>&1
//
// Required env:
//   POSTHOG_API_KEY     - personal API key with query:read scope
//   POSTHOG_PROJECT_ID  - numeric project id from the PostHog URL
//   RESEND_API_KEY      - same key the server uses for outbound mail
//
// Optional env:
//   POSTHOG_HOST        - default eu.posthog.com
//   DIGEST_TO           - default support@vetmybuilder.com
//   DIGEST_FROM         - default VetMyBuilder <noreply@vetmybuilder.com>
//   DIGEST_WINDOW_HOURS - default 24
//   PUBLIC_APP_URL      - default https://vetmybuilder.com (used in email footer)

const { Resend } = require("resend");

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_HOST = process.env.POSTHOG_HOST || "eu.posthog.com";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DIGEST_TO = process.env.DIGEST_TO || "support@vetmybuilder.com";
const DIGEST_FROM =
  process.env.DIGEST_FROM || "VetMyBuilder <noreply@vetmybuilder.com>";
const WINDOW_HOURS = Number(process.env.DIGEST_WINDOW_HOURS || 24);
const APP_URL = process.env.PUBLIC_APP_URL || "https://vetmybuilder.com";

function fail(msg) {
  console.error(`[posthog-digest] ${msg}`);
  process.exit(1);
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function hogql(query) {
  const url = `https://${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${POSTHOG_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PostHog ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = await res.json();
  return Array.isArray(data?.results) ? data.results : [];
}

// ---- Queries ----------------------------------------------------------------

// Single roll-up of the event counts we care about. One round-trip.
const EVENTS_OF_INTEREST = [
  "user_signed_up",
  "user_logged_in",
  "project_created",
  "project_published",
  "project_closed",
  "match_formed",
  "chat_thread_opened",
  "chat_message_sent",
  "checkout_started",
  "payment_failed",
  "unlock_activated",
  "pass_activated",
  "api_error",
  "client_error",
  "report_submitted",
];

function eventCountsQuery(hours) {
  const list = EVENTS_OF_INTEREST.map((e) => `'${e}'`).join(", ");
  return `
    SELECT event, count() AS cnt
    FROM events
    WHERE timestamp > now() - INTERVAL ${hours} HOUR
      AND event IN (${list})
    GROUP BY event
    ORDER BY cnt DESC
  `;
}

function signupsByRoleQuery(hours) {
  return `
    SELECT properties.role AS role, count() AS cnt
    FROM events
    WHERE event = 'user_signed_up'
      AND timestamp > now() - INTERVAL ${hours} HOUR
    GROUP BY role
  `;
}

function registerFunnelQuery(hours) {
  return `
    SELECT toInt(properties.step) AS step, count() AS cnt
    FROM events
    WHERE event = 'register_step_completed'
      AND timestamp > now() - INTERVAL ${hours} HOUR
    GROUP BY step
    ORDER BY step
  `;
}

// ---- Render -----------------------------------------------------------------

function rowsToMap(rows) {
  // PostHog returns each row as a tuple [col1, col2]. First col is the key
  // (event name or role or step), second is the count.
  const out = new Map();
  for (const r of rows || []) {
    out.set(r[0], Number(r[1] ?? 0));
  }
  return out;
}

function fmtNum(n) {
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("en-GB").format(n);
}

function renderDigest({ counts, signupsByRole, funnel, windowHours, generatedAt }) {
  const get = (k) => counts.get(k) || 0;
  const signupTotal =
    (signupsByRole.get("homeowner") || 0) +
    (signupsByRole.get("tradesman") || 0);
  const errorTotal = get("api_error") + get("client_error");

  const sections = [
    {
      title: "Signups",
      rows: [
        ["Homeowner", signupsByRole.get("homeowner") || 0],
        ["Tradesperson", signupsByRole.get("tradesman") || 0],
        ["Total", signupTotal],
      ],
    },
    {
      title: "Auth & engagement",
      rows: [
        ["Logins", get("user_logged_in")],
        ["Reports submitted", get("report_submitted")],
      ],
    },
    {
      title: "Projects",
      rows: [
        ["Projects created", get("project_created")],
        ["Projects published", get("project_published")],
        ["Projects closed", get("project_closed")],
      ],
    },
    {
      title: "Matching & chat",
      rows: [
        ["Matches formed", get("match_formed")],
        ["Chat threads opened", get("chat_thread_opened")],
        ["Messages sent", get("chat_message_sent")],
      ],
    },
    {
      title: "Payments",
      rows: [
        ["Checkout started", get("checkout_started")],
        ["Unlocks activated", get("unlock_activated")],
        ["Passes activated", get("pass_activated")],
        ["Payment failed", get("payment_failed")],
      ],
    },
    {
      title: "Errors",
      rows: [
        ["API errors (server-facing)", get("api_error")],
        ["Client errors (window.onerror)", get("client_error")],
        ["Total", errorTotal],
      ],
    },
  ];

  const funnelRows = Array.from(funnel.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([step, cnt]) => [`Step ${escHtml(step)}`, cnt]);

  const renderTable = (rows) => `
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px;">
      ${rows
        .map(
          ([k, v], i) => `
        <tr style="background:${i % 2 ? "#f8fafc" : "#ffffff"};">
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#334155;">${escHtml(k)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#0f172a;">${fmtNum(Number(v))}</td>
        </tr>`,
        )
        .join("")}
    </table>`;

  const sectionsHtml = sections
    .map(
      (s) => `
    <div style="margin:18px 0;">
      <h3 style="margin:0 0 6px 0;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;">${escHtml(s.title)}</h3>
      ${renderTable(s.rows)}
    </div>`,
    )
    .join("");

  const funnelHtml =
    funnelRows.length === 0
      ? `<p style="color:#64748b;font-size:13px;margin:6px 0;">No register_step_completed events in window.</p>`
      : renderTable(funnelRows);

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:640px;margin:0 auto;padding:24px 18px;">
    <h1 style="margin:0 0 4px 0;font-size:20px;">VetMyBuilder - Daily digest</h1>
    <p style="margin:0 0 18px 0;color:#64748b;font-size:13px;">
      Last ${escHtml(windowHours)} hours - generated ${escHtml(generatedAt)}
    </p>
    ${sectionsHtml}

    <div style="margin:18px 0;">
      <h3 style="margin:0 0 6px 0;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;">Tradesperson register funnel</h3>
      ${funnelHtml}
    </div>

    <p style="margin:24px 0 0 0;font-size:12px;color:#94a3b8;">
      Source: PostHog (${escHtml(POSTHOG_HOST)}) - <a href="${escHtml(APP_URL)}" style="color:#94a3b8;">${escHtml(APP_URL)}</a>
    </p>
  </div>
</body></html>`;
}

// ---- Main -------------------------------------------------------------------

(async () => {
  if (!POSTHOG_API_KEY) fail("POSTHOG_API_KEY missing");
  if (!POSTHOG_PROJECT_ID) fail("POSTHOG_PROJECT_ID missing");
  if (!RESEND_API_KEY) fail("RESEND_API_KEY missing");

  const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  console.log(
    `[posthog-digest] generating ${WINDOW_HOURS}h digest for project ${POSTHOG_PROJECT_ID} -> ${DIGEST_TO}`,
  );

  let counts;
  let signupsByRole;
  let funnel;
  try {
    const [a, b, c] = await Promise.all([
      hogql(eventCountsQuery(WINDOW_HOURS)),
      hogql(signupsByRoleQuery(WINDOW_HOURS)),
      hogql(registerFunnelQuery(WINDOW_HOURS)),
    ]);
    counts = rowsToMap(a);
    signupsByRole = rowsToMap(b);
    funnel = rowsToMap(c);
  } catch (err) {
    fail(`PostHog query failed: ${err?.message || err}`);
  }

  const html = renderDigest({
    counts,
    signupsByRole,
    funnel,
    windowHours: WINDOW_HOURS,
    generatedAt,
  });

  try {
    const resend = new Resend(RESEND_API_KEY);
    const result = await resend.emails.send({
      from: DIGEST_FROM,
      to: DIGEST_TO,
      subject: `VMB daily digest - last ${WINDOW_HOURS}h`,
      html,
    });
    if (result?.error) {
      fail(
        `Resend rejected the send: ${result.error.message || JSON.stringify(result.error)}`,
      );
    }
    console.log(`[posthog-digest] sent OK (id=${result?.data?.id || "?"})`);
  } catch (err) {
    fail(`Email send failed: ${err?.message || err}`);
  }
})();
