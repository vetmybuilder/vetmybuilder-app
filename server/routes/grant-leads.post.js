// server/routes/grant-leads.post.js
//
// POST /api/grant-leads
//
// Public, unauthenticated endpoint. Captures a complete submission
// from the /free-wall-insulation eligibility helper and routes the
// lead to a verified specialist (Elegant Building by default).
//
// Body shape (matches the mock answers state):
//   {
//     property: "semi" | "detached" | ... ,
//     tenure:   "owner" | "private-rent" | ... ,
//     heating:  "gas" | "electric" | ... ,
//     epc:      "A" | "B" | ... | "G" | "?",
//     benefits: string[]    // e.g. ["pension-credit"] or ["none"]
//     postcode: string,
//     name:     string,
//     email:    string,
//     phone:    string,
//     consent:  boolean,
//     source?:  string      // UTM tag or "direct"
//   }
//
// Behaviour:
//   - Auto-creates the grant_leads + grant_lead_events tables on the
//     first call so dev environments without migrations applied still
//     work after a git pull (mirrors the demand-signal pattern).
//   - Server-side eligibility scoring: full / partial / none. The
//     client also shows an indicative result but the server's verdict
//     is the one that lands in the table.
//   - Generates a stable reference code VMB-G-YYYY-NNNNN where NNNNN
//     is the row id zero-padded. Returned so the confirmation screen
//     can display it.
//   - Status starts at "new". Email integration is deferred (Phase 2).

const { publicWriteLimiter } = require("../lib/rateLimiters");

const VALID_PROPERTY = new Set([
  "semi",
  "detached",
  "mid-terrace",
  "end-terrace",
  "bungalow",
  "flat",
]);
const VALID_TENURE = new Set([
  "owner",
  "private-rent",
  "social-rent",
  "landlord",
]);
const VALID_HEATING = new Set(["gas", "electric", "oil", "lpg", "other"]);
const VALID_EPC = new Set(["A", "B", "C", "D", "E", "F", "G", "?"]);

async function ensureTables(mysqlQuery) {
  await mysqlQuery(
    `CREATE TABLE IF NOT EXISTS grant_leads (
       id INT AUTO_INCREMENT PRIMARY KEY,
       reference_code VARCHAR(32) NOT NULL,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       property_type VARCHAR(40) NOT NULL,
       tenure VARCHAR(40) NOT NULL,
       heating_fuel VARCHAR(40) NOT NULL,
       epc_rating VARCHAR(4) NOT NULL,
       benefits JSON NOT NULL,
       postcode VARCHAR(16) NOT NULL,
       name VARCHAR(120) NOT NULL,
       email VARCHAR(190) NOT NULL,
       phone VARCHAR(40) NOT NULL,
       qualified VARCHAR(10) NOT NULL,
       assigned_tradesperson_uid VARCHAR(255) NULL,
       status VARCHAR(20) NOT NULL DEFAULT 'new',
       source VARCHAR(80) NULL,
       ip VARCHAR(64) NULL,
       user_agent TEXT NULL,
       consent_at DATETIME NULL,
       notes TEXT NULL,
       last_status_at DATETIME NULL,
       viewed_at DATETIME NULL,
       UNIQUE KEY uq_grant_leads_reference (reference_code),
       KEY idx_grant_leads_status (status),
       KEY idx_grant_leads_qualified (qualified),
       KEY idx_grant_leads_assigned (assigned_tradesperson_uid),
       KEY idx_grant_leads_created (created_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  await mysqlQuery(
    `CREATE TABLE IF NOT EXISTS grant_lead_events (
       id INT AUTO_INCREMENT PRIMARY KEY,
       grant_lead_id INT NOT NULL,
       event_type VARCHAR(40) NOT NULL,
       prev_status VARCHAR(20) NULL,
       new_status VARCHAR(20) NULL,
       detail TEXT NULL,
       actor_uid VARCHAR(128) NULL,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       KEY idx_grant_lead_events_lead (grant_lead_id),
       KEY idx_grant_lead_events_created (created_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
}

function classify({ benefits, heating, epc }) {
  const hasBenefit =
    Array.isArray(benefits) &&
    benefits.length > 0 &&
    !benefits.includes("none");
  const heatingFlag = ["electric", "oil", "lpg", "other"].includes(heating);
  const epcFlag = ["D", "E", "F", "G"].includes(epc);
  if (hasBenefit && (heatingFlag || epcFlag)) return "full";
  if (heatingFlag || epcFlag) return "partial";
  return "none";
}

function makeReference(id) {
  const year = new Date().getFullYear();
  return `VMB-G-${year}-${String(id).padStart(5, "0")}`;
}

module.exports = function mountGrantLeadsPost(router, ctx) {
  const { mysqlQuery, broadcastNotification, logActivity } = ctx;
  const log = ctx.log || console;
  const TAG = "[POST /api/grant-leads]";
  const { notifyGrantLeadAssignee } = require("../lib/notifyGrantLeadAssignee");
  const { resolveGrantAssigneeUid } = require("../lib/resolveGrantAssignee");

  router.post("/grant-leads", publicWriteLimiter, async (req, res) => {
    const body = req.body || {};

    // ----- Validate quiz answers -----
    const property = String(body.property || "").trim();
    const tenure = String(body.tenure || "").trim();
    const heating = String(body.heating || "").trim();
    const epc = String(body.epc || "").trim();
    const benefits = Array.isArray(body.benefits) ? body.benefits : [];
    const postcode = String(body.postcode || "").trim().toUpperCase();

    if (!VALID_PROPERTY.has(property)) {
      return res.status(400).json({ error: "invalid_property" });
    }
    if (!VALID_TENURE.has(tenure)) {
      return res.status(400).json({ error: "invalid_tenure" });
    }
    if (!VALID_HEATING.has(heating)) {
      return res.status(400).json({ error: "invalid_heating" });
    }
    if (!VALID_EPC.has(epc)) {
      return res.status(400).json({ error: "invalid_epc" });
    }
    if (
      !/^[A-Z]{1,2}[0-9R][0-9A-Z]?\s*[0-9][A-Z]{2}$/.test(postcode)
    ) {
      return res.status(400).json({ error: "invalid_postcode" });
    }

    // ----- Validate contact -----
    const name = String(body.name || "").trim().slice(0, 120);
    const email = String(body.email || "").trim().slice(0, 190);
    const phone = String(body.phone || "").trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: "missing_name" });
    if (!email.includes("@"))
      return res.status(400).json({ error: "invalid_email" });
    if (phone.length < 7)
      return res.status(400).json({ error: "invalid_phone" });

    const qualified = classify({ benefits, heating, epc });

    const source = body.source ? String(body.source).slice(0, 80) : "direct";
    const ip =
      req.headers["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      null;
    const ua = req.headers["user-agent"] || null;
    const consentAt = body.consent ? new Date() : null;

    try {
      await ensureTables(mysqlQuery);

      // Routing v1: every lead goes to the configured default specialist
      // (Elegant). Resolver returns null if neither env nor company-name
      // lookup yields a uid - the lead still saves; admin can re-assign.
      const assigneeUid = await resolveGrantAssigneeUid(mysqlQuery);

      // Insert with a placeholder reference, then update with the
      // generated VMB-G-YYYY-NNNNN once we know the row id. Two-step
      // because the reference encodes the id itself.
      const result = await mysqlQuery(
        `INSERT INTO grant_leads
           (reference_code, property_type, tenure, heating_fuel,
            epc_rating, benefits, postcode, name, email, phone,
            qualified, assigned_tradesperson_uid, status, source,
            ip, user_agent, consent_at, last_status_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?,
                 ?, ?, ?, NOW())`,
        [
          "pending",
          property,
          tenure,
          heating,
          epc,
          JSON.stringify(benefits),
          postcode,
          name,
          email,
          phone,
          qualified,
          assigneeUid,
          source,
          ip,
          ua,
          consentAt,
        ],
      );
      const newId = result.insertId;
      const reference = makeReference(newId);
      await mysqlQuery(
        `UPDATE grant_leads SET reference_code = ? WHERE id = ?`,
        [reference, newId],
      );
      await mysqlQuery(
        `INSERT INTO grant_lead_events
           (grant_lead_id, event_type, new_status, detail)
         VALUES (?, 'created', 'new', ?)`,
        [newId, JSON.stringify({ qualified, source })],
      );

      log.info?.(
        { newId, reference, qualified, postcode, assigneeUid },
        `${TAG} captured`,
      );

      // Fire-and-forget push to the assigned specialist (Elegant by
      // default). Resolves the uid via env or `tradesmen` company name
      // and falls through silently if neither route succeeds - the
      // lead is already saved and admin can chase manually.
      notifyGrantLeadAssignee({
        mysqlQuery,
        grantLeadId: newId,
        reference,
        postcode,
        name,
        phone,
        broadcastNotification,
        logActivity,
      }).catch((err) => {
        log.warn?.({ err: err?.message }, `${TAG} assignee notify error`);
      });

      return res.status(201).json({
        ok: true,
        id: newId,
        reference,
        qualified,
      });
    } catch (err) {
      log.error?.({ err: err?.message }, `${TAG} insert failed`);
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
