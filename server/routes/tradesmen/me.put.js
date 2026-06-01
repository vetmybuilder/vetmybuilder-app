// server/routes/tradesmen/me.put.js
const { claimPipelineEntry } = require("../../lib/claimPipelineEntry");
const { cleanPhone, isValidUKPhone } = require("../../lib/phone");
const { verifyWebPresence } = require("../../lib/webPresence");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen/me.put]";

  if (!mysqlQuery) {
    throw new Error("mysqlQuery must be attached to ctx");
  }

  // ---------- helpers ----------
  const queryAll = async (sql, params = []) => mysqlQuery(sql, params);

  const queryOne = async (sql, params = []) => {
    const rows = await queryAll(sql, params);
    return rows?.[0] || null;
  };

  const run = async (sql, params = []) => mysqlQuery(sql, params);

  function mysqlNow() {
    const d = new Date();
    return d.toISOString().slice(0, 19).replace("T", " ");
  }

  // One-shot column bootstrap so existing dev/staging DBs pick up the
  // supporting_docs_json column without a manual ALTER. The schema files
  // already declare it; this just reconciles installs that were created
  // before the column existed. Runs once per process.
  let columnEnsured = false;
  async function ensureSupportingDocsJsonColumn() {
    if (columnEnsured) return;
    columnEnsured = true;
    try {
      await mysqlQuery(
        "ALTER TABLE tradesmen ADD COLUMN supporting_docs_json TEXT NULL",
      );
      log.info?.(`${TAG} added supporting_docs_json column`);
    } catch (err) {
      // Duplicate column = already there (MySQL error 1060). Anything
      // else is a real problem worth logging but not fatal.
      const msg = String(err?.message || "");
      if (!/Duplicate column|already exists/i.test(msg)) {
        log.warn?.(`${TAG} ensureSupportingDocsJsonColumn failed`, msg);
      }
    }
  }

  // Same self-healing trick for web_verification_reason - the column
  // holds the machine code from verifyWebPresence (e.g. brand_mismatch,
  // parked_or_placeholder) so admin can show a human label next to
  // "Website confirmed" when the check didn't tick.
  let reasonColumnEnsured = false;
  async function ensureWebVerificationReasonColumn() {
    if (reasonColumnEnsured) return;
    reasonColumnEnsured = true;
    try {
      await mysqlQuery(
        "ALTER TABLE tradesmen ADD COLUMN web_verification_reason VARCHAR(64) NULL",
      );
      log.info?.(`${TAG} added web_verification_reason column`);
    } catch (err) {
      const msg = String(err?.message || "");
      if (!/Duplicate column|already exists/i.test(msg)) {
        log.warn?.(`${TAG} ensureWebVerificationReasonColumn failed`, msg);
      }
    }
  }

  // Acquisition channel ref (flyer/QR/social campaign code).
  let acqRefColumnEnsured = false;
  async function ensureAcqRefColumn() {
    if (acqRefColumnEnsured) return;
    acqRefColumnEnsured = true;
    try {
      await mysqlQuery(
        "ALTER TABLE tradesmen ADD COLUMN acq_ref VARCHAR(64) NULL",
      );
      log.info?.(`${TAG} added acq_ref column`);
    } catch (err) {
      const msg = String(err?.message || "");
      if (!/Duplicate column|already exists/i.test(msg)) {
        log.warn?.(`${TAG} ensureAcqRefColumn failed`, msg);
      }
    }
  }

  // ---- CH + location helpers ----
  let matchByName = ctx.matchByName;
  let extractLocationTokens = ctx.extractLocationTokens;

  if (!extractLocationTokens) {
    try {
      const loc = require("../../lib/location");
      extractLocationTokens =
        loc.extractLocationTokens || extractLocationTokens;
    } catch {}
  }

  if (!matchByName) {
    try {
      const ch = require("../../lib/companiesHouse");
      matchByName = ch.matchByName || matchByName;
    } catch {}
  }

  // ---- ensure tradesmen_photos ----
  let photosEnsured = false;
  async function ensurePhotosTable() {
    if (photosEnsured) return;
    photosEnsured = true;
    log.info(`${TAG} ensuring tradesmen_photos table...`);

    await run(`
      CREATE TABLE IF NOT EXISTS tradesmen_photos (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        tradesman_user_id VARCHAR(255) NOT NULL,
        url TEXT NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_tradesmen_photos_user (tradesman_user_id, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  // ---- small utilities ----
  const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const toCSV = (arr) => (Array.isArray(arr) ? arr.join(",") : arr || "");
  const toArr = (x) =>
    Array.isArray(x)
      ? x
      : typeof x === "string"
      ? x
          .split(/[,;|]/g)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const toPhotoArray = (body) => {
    if (!body) return [];
    const buckets = [];
    if (Array.isArray(body.workPhotos)) buckets.push(body.workPhotos);
    if (Array.isArray(body.photos)) buckets.push(body.photos);
    if (Array.isArray(body.photoUrls)) buckets.push(body.photoUrls);
    return buckets
      .flat()
      .map((u) => {
        // Defense-in-depth: a previous bug let R2 result objects
        // ({ key, publicUrl }) leak into tradesmen_photos.url where
        // String(obj) produced "[object Object]". If we see an object
        // shape, pull publicUrl/url; otherwise coerce to string.
        if (u && typeof u === "object") {
          return String(u.publicUrl || u.url || "").trim();
        }
        return String(u || "").trim();
      })
      .filter((s) => s && s !== "[object Object]");
  };

  // ---- scoring ----
  const WEIGHTS = {
    serviceAreasMin3: 10,
    webPresenceAny: 5,
    chVerified: 25,
    tradesMin3: 15,
    photosMin3: 15,
    discountAny: 5,
    docsMin2: 10,
    warrantyMax: 15,
  };
  const toBadge = (s) =>
    s >= 85 ? "platinum" : s >= 70 ? "gold" : s >= 50 ? "silver" : "bronze";

  const lerpWarranty = (m) => {
    const v = Math.max(0, int(m, 0));
    if (v >= 36) return 20;
    return Math.round((v / 36) * 20);
  };

  function computeScore(row) {
    const saCount = toArr(row.service_areas).length;
    const tradeCount = toArr(row.trade_types).length;
    const photos = Math.max(0, int(row.photo_count, 0));
    const hasDiscount =
      Math.max(
        int(row.offers_discount, 0),
        int(row.discount_min_percent, 0),
        int(row.discount_max_percent, 0)
      ) > 0;
    const wPts = lerpWarranty(row.warranty_months);
    const chOK = String(row.ch_status || "").toLowerCase() === "verified";
    const webOK = int(row.web_verified, 0) === 1;

    let score =
      (saCount >= 3 ? WEIGHTS.serviceAreasMin3 : 0) +
      (webOK ? WEIGHTS.webPresenceAny : 0) +
      (chOK ? WEIGHTS.chVerified : 0) +
      (tradeCount >= 3 ? WEIGHTS.tradesMin3 : 0) +
      (photos >= 3 ? WEIGHTS.photosMin3 : 0) +
      (hasDiscount ? WEIGHTS.discountAny : 0) +
      Math.min(wPts, WEIGHTS.warrantyMax) +
      (int(row.supporting_doc_count, 0) >= 2 ? WEIGHTS.docsMin2 : 0);

    return { score: Math.max(0, Math.min(100, score)), badge: toBadge(score) };
  }

  // ---------- ROUTE ----------
  router.put("/tradesmen/me", auth, async (req, res) => {
    await ensureSupportingDocsJsonColumn();
    await ensureWebVerificationReasonColumn();
    await ensureAcqRefColumn();
    const uid = req.user.uid;

    log.info(`${TAG} incoming update`, {
      uid,
      companyName: req.body?.companyName,
      tradeTypes: req.body?.tradeTypes,
      serviceAreas: req.body?.serviceAreas,
    });

    try {
      await ensurePhotosTable();

      const body = req.body || {};
      const companyName = (body.companyName || "").trim();

      if (!companyName) {
        log.warn(`${TAG} missing companyName`, { uid });
        return res.status(400).json({ error: "companyName_required" });
      }

      // Acquisition ref captured on the signup landing page. Same
      // alphabet as the /go/:code route accepts so a fuzzed value
      // never reaches the DB. Anything that fails the pattern is
      // dropped silently - we don't want a malformed marketing param
      // to fail the whole profile save.
      const acqRefRaw = String(body.acquisitionRef || "").trim();
      const acqRef = /^[A-Za-z0-9._-]{1,64}$/.test(acqRefRaw)
        ? acqRefRaw
        : null;

      // Pre-check: is this a brand-new tradesperson row, or a profile
      // update of an existing one? The upsert below doesn't distinguish,
      // and we only want to fire the Slack signup notification on the
      // first save. One indexed SELECT on the PK is effectively free.
      let isFirstSave = false;
      try {
        const existing = await mysqlQuery(
          "SELECT 1 FROM tradesmen WHERE user_id = ? LIMIT 1",
          [uid],
        );
        isFirstSave = !(existing && existing.length);
      } catch {
        // If the check fails, fall back to not-notifying rather than
        // double-notifying. Better silent than spammy.
      }

      const rawPhone = (req.body && req.body.phone) || "";
      if (rawPhone && !isValidUKPhone(rawPhone)) {
        return res.status(400).json({
          ok: false,
          field: "phone",
          message: "Enter a valid UK phone number",
        });
      }

      const contactName = body.contactName || null;
      const phone = body.phone || null;
      const email = body.email || null;

      const tradeTypes = toCSV(body.tradeTypes);
      const serviceAreas = toCSV(body.serviceAreas);
      const website = (body.website || "").trim() || null;
      const socialLinksArr = toArr(body.socialLinks);
      const socialLinks = JSON.stringify(socialLinksArr);

      // Re-verify web presence on every profile update. join.post sets
      // web_verified at signup; without this, a tradesperson who adds or
      // changes their website later keeps the old verified flag (which
      // defaults to 0) and "Website confirmed" stays unticked in admin.
      // Network failures keep the flag at 0 - same behaviour as signup.
      //
      // We also persist the first reason from the failed check so the
      // admin drawer can render a human label next to the unticked
      // row (e.g. "Parked or placeholder page"). Only the website
      // reason is captured here; social-link failures are uninteresting
      // for admin diagnosis.
      let webVerified = 0;
      let webVerificationReason = null;
      try {
        if (website || socialLinksArr.length) {
          const vr = await verifyWebPresence(website, socialLinksArr, {
            vendorName: body.companyName || body.contactName || undefined,
          });
          webVerified = vr?.verified ? 1 : 0;
          if (!vr?.verified && website) {
            // reasons are formatted as "website:<code>" or "socials:<code>".
            const first = (vr?.reasons || []).find((r) =>
              String(r || "").startsWith("website:"),
            );
            if (first) {
              webVerificationReason = String(first).slice("website:".length);
            }
          }
          log.info(`${TAG} web presence`, {
            verified: !!vr?.verified,
            reasons: vr?.reasons,
          });
        }
      } catch (e) {
        log.warn(`${TAG} web presence check failed`, { error: e?.message });
      }

      // External review-platform links (Trustpilot / Bark / etc.). The
      // tradesperson supplies a public profile URL per platform; we
      // validate the URL is on an expected host for the declared
      // platform and reject anything that doesn't match. The client
      // (web/utils/reviewLinks.ts) does the same check up-front; doing
      // it again server-side guards against a bad actor POSTing
      // arbitrary URLs by hand.
      const REVIEW_PLATFORM_DOMAINS = {
        trustpilot: ["trustpilot.com", "uk.trustpilot.com"],
        bark: ["bark.com"],
        mybuilder: ["mybuilder.com"],
        checkatrade: ["checkatrade.com"],
        houzz: ["houzz.co.uk", "houzz.com"],
        yell: ["yell.com"],
      };
      const normaliseReviewLink = (platform, rawUrl) => {
        const allowed = REVIEW_PLATFORM_DOMAINS[platform];
        if (!allowed) return null;
        let v = String(rawUrl || "").trim();
        if (!v) return null;
        if (!/^https?:\/\//i.test(v)) v = "https://" + v;
        let parsed;
        try {
          parsed = new URL(v);
        } catch {
          return null;
        }
        parsed.protocol = "https:";
        const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
        const ok = allowed.some((d) => {
          const dn = d.toLowerCase().replace(/^www\./, "");
          return host === dn || host.endsWith("." + dn);
        });
        return ok ? parsed.toString() : null;
      };
      const reviewLinksRaw = Array.isArray(body.reviewLinks) ? body.reviewLinks : [];
      const reviewLinksClean = [];
      for (const e of reviewLinksRaw) {
        if (!e || typeof e !== "object") continue;
        if (typeof e.platform !== "string" || typeof e.url !== "string") continue;
        const cleanUrl = normaliseReviewLink(e.platform, e.url);
        if (!cleanUrl) continue;
        reviewLinksClean.push({ platform: e.platform, url: cleanUrl });
      }
      const reviewLinks = reviewLinksClean.length
        ? JSON.stringify(reviewLinksClean)
        : null;

      const photoUrls = toPhotoArray(body);
      const photoCount =
        (photoUrls && photoUrls.length) || int(body.photoCount, 0);

      // Typed supporting-docs list (insurance, certs, memberships). The
       // count column drives the trust score; the JSON column captures
       // what the trade actually claimed for admin review. Older clients
       // sent only the count - we honour that here too.
      const supportingDocsArr = Array.isArray(body.supportingDocs)
        ? body.supportingDocs
        : [];
      const supportingDocCount = supportingDocsArr.length > 0
        ? supportingDocsArr.length
        : int(body.supportingDocCount, 0);
      const supportingDocsJson = supportingDocsArr.length
        ? JSON.stringify(supportingDocsArr)
        : null;

      const discountMinPercent = int(
        body.discountMinPercent ?? body.discountMin,
        0
      );
      const discountMaxPercent = int(
        body.discountMaxPercent ?? body.discountMax,
        0
      );
      const offersDiscount = int(
        body.offersDiscount,
        Math.max(discountMinPercent, discountMaxPercent)
      );

      const warrantyMonths = int(body.warrantyMonths, 0);

      const rawProfilePictureUrl =
        typeof body.profilePictureUrl === "string"
          ? body.profilePictureUrl.trim() || null
          : null;

      // Companies House identity is a TRUST signal that drives the
      // "Verified" badge across the deck and the vmb_score. It MUST be
      // derived server-side from matchByName(). Any client-supplied
      // chStatus / chName / chMatchScore / web_verified is ignored here
      // - those were previously trusted, which let a tradesperson POST
      // {companyNumber:"x", chStatus:"verified"} and self-elevate.
      //
      // A client-supplied companyNumber is treated as a HINT only - we
      // never store it directly; matchByName's result is the only source
      // of truth for the persisted number, name, score, and verdict.
      const companyNumberHint = (body.companyNumber || "").trim() || null;

      let companyNumber = null;
      let chStatus = null;
      let chName = null;
      let chCheckedAt = null;
      let chMatchScore = 0;

      // --- Companies House lookup (always run, server-authoritative) ---
      if (typeof matchByName === "function") {
        try {
          const toks = extractLocationTokens?.(serviceAreas || "") || {};
          const hint =
            toks.sector ||
            toks.outward ||
            (serviceAreas.split(",")[0] || "").trim() ||
            null;

          const result = await matchByName({
            name: companyName,
            locationHint: hint,
            companyNumberHint,
          });

          chCheckedAt = mysqlNow();
          const verdict = String(result?.verdict || "").toLowerCase();

          chStatus = ["verified", "good", "exact"].includes(verdict)
            ? "verified"
            : verdict || "ambiguous";

          if (result?.best) {
            companyNumber = result.best.number || null;
            chName = result.best.name || null;
            chMatchScore = Number(result.best.score || 0);
          }

          log.info(`${TAG} CH match`, {
            uid,
            verdict,
            companyNumber,
            chStatus,
            chMatchScore,
          });
        } catch (e) {
          log.warn(`${TAG} CH lookup failed`, {
            uid,
            error: e?.message || e,
          });
        }
      }

      // ---------- DB transaction ----------
      try {
        // Ensure the users table has a row for this uid. Every
        // authenticated person should appear in users regardless of
        // role (homeowner vs tradesperson). Without this, tradespeople
        // who registered via the email/password wizard were invisible
        // in the admin User Management page because they only had a
        // tradesmen row.
        // Split the trader's contactName ("Olive Tester") into first +
        // last so the users row has firstName populated. Without this,
        // auth.tsx's profileComplete = !!me.firstName stays false and
        // SiteHeader's isMidSignup gate suppresses the entire account
        // chrome - the trader sees the guest header ("Sign in / Get
        // started") on /tradesman/jobs after signing up.
        const nameParts = String(contactName || "")
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        const userFirstName = nameParts[0] || null;
        const userLastName =
          nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

        await run(
          `
          INSERT INTO users (uid, email, firstName, lastName, createdAt)
          VALUES (?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE
            email = COALESCE(VALUES(email), email),
            firstName = COALESCE(users.firstName, VALUES(firstName)),
            lastName = COALESCE(users.lastName, VALUES(lastName))
          `,
          [uid, email, userFirstName, userLastName],
        );

        // UPSERT main row
        await run(
          `
          INSERT INTO tradesmen (
            user_id, company_name, contact_name, phone, email,
            trade_types, service_areas,
            web_verified, web_verification_reason, web_url, social_links_json, review_links_json,
            offers_discount, warranty_months, photo_count, supporting_doc_count,
            supporting_docs_json,
            discount_min_percent, discount_max_percent,
            company_number, ch_status, ch_name, ch_checked_at, ch_match_score,
            acq_ref,
            vmb_score, vmb_badge, created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?,
            ?, ?,
            ?, ?, ?, ?, ?,
            ?,
            0, 'bronze', NOW(), NOW()
          )
          ON DUPLICATE KEY UPDATE
            company_name        = VALUES(company_name),
            contact_name        = VALUES(contact_name),
            phone               = VALUES(phone),
            email               = VALUES(email),
            trade_types         = VALUES(trade_types),
            service_areas       = VALUES(service_areas),
            web_verified        = VALUES(web_verified),
            web_verification_reason = VALUES(web_verification_reason),
            web_url             = VALUES(web_url),
            social_links_json   = VALUES(social_links_json),
            review_links_json   = VALUES(review_links_json),
            offers_discount     = VALUES(offers_discount),
            warranty_months     = VALUES(warranty_months),
            photo_count         = VALUES(photo_count),
            supporting_doc_count= VALUES(supporting_doc_count),
            supporting_docs_json= VALUES(supporting_docs_json),
            discount_min_percent= VALUES(discount_min_percent),
            discount_max_percent= VALUES(discount_max_percent),
            company_number      = COALESCE(VALUES(company_number), company_number),
            ch_status           = COALESCE(VALUES(ch_status), ch_status),
            ch_name             = COALESCE(VALUES(ch_name), ch_name),
            ch_checked_at       = COALESCE(VALUES(ch_checked_at), ch_checked_at),
            ch_match_score      = COALESCE(VALUES(ch_match_score), ch_match_score),
            -- First-touch attribution: don't overwrite an existing ref
            -- if the trade comes back via a different channel.
            acq_ref             = COALESCE(acq_ref, VALUES(acq_ref)),
            updated_at          = NOW()
        `,
          [
            uid,
            companyName,
            contactName,
            phone,
            email,
            tradeTypes,
            serviceAreas,
            webVerified,
            webVerificationReason,
            website,
            socialLinks,
            reviewLinks,
            offersDiscount,
            warrantyMonths,
            photoCount,
            supportingDocCount,
            supportingDocsJson,
            discountMinPercent,
            discountMaxPercent,
            companyNumber,
            chStatus,
            chName,
            chCheckedAt,
            chMatchScore,
            acqRef,
          ]
        );

        log.info(`${TAG} upserted tradesmen row`, { uid });

        // Slack notification on first-time signup only (skips subsequent
        // profile edits). Fire-and-forget: a Slack failure must never
        // affect the signup response. SLACK_WEBHOOK_URL unset = no-op.
        if (isFirstSave) {
          const { postSlackMessage } = require("../../lib/slack");
          const reviewBase = (
            process.env.PUBLIC_API_BASE || "https://vetmybuilder.com"
          ).replace(/\/+$/, "");
          const reviewLink = `${reviewBase}/admin/tradesmen-leaderboard`;
          const contactBits = [email, phone].filter(Boolean).join("  -  ") || "-";
          postSlackMessage({
            text: `New tradesperson signup: ${companyName}`,
            blocks: [
              {
                type: "header",
                text: { type: "plain_text", text: "New tradesperson signup" },
              },
              {
                type: "section",
                fields: [
                  { type: "mrkdwn", text: `*Company*\n${companyName}` },
                  { type: "mrkdwn", text: `*Trades*\n${tradeTypes || "-"}` },
                  { type: "mrkdwn", text: `*Areas*\n${serviceAreas || "-"}` },
                  { type: "mrkdwn", text: `*Contact*\n${contactBits}` },
                ],
              },
              {
                type: "actions",
                elements: [
                  {
                    type: "button",
                    text: { type: "plain_text", text: "Review in admin" },
                    url: reviewLink,
                    style: "primary",
                  },
                ],
              },
            ],
          }).catch(() => {});
        }

        // SYNC PHOTOS
        await run(`DELETE FROM tradesmen_photos WHERE tradesman_user_id = ?`, [
          uid,
        ]);

        if (photoUrls.length > 0) {
          let idx = 0;
          for (const url of photoUrls) {
            await run(
              `
              INSERT INTO tradesmen_photos
                (tradesman_user_id, url, sort_order)
              VALUES (?, ?, ?)
            `,
              [uid, url, idx++]
            );
          }
          log.info(`${TAG} synced photos`, {
            uid,
            count: photoUrls.length,
          });
        } else {
          log.info(`${TAG} no photos provided`, { uid });
        }

        // PROFILE PICTURE — only keep if still present in the saved photo set
        const photoUrlSet = new Set(photoUrls);
        const effectiveProfilePicUrl =
          rawProfilePictureUrl && photoUrlSet.has(rawProfilePictureUrl)
            ? rawProfilePictureUrl
            : null;

        await run(
          `UPDATE tradesmen SET profile_picture_url = ? WHERE user_id = ?`,
          [effectiveProfilePicUrl, uid]
        );

        // RECOMPUTE SCORE
        const row = await queryOne(
          `SELECT * FROM tradesmen WHERE user_id = ?`,
          [uid]
        );
        const { score, badge } = computeScore(row);

        await run(
          `
          UPDATE tradesmen
             SET vmb_score = ?, vmb_badge = ?, updated_at = NOW()
           WHERE user_id = ?
        `,
          [score, badge, uid]
        );

        log.info(`${TAG} saved successfully`, {
          uid,
          score,
          badge,
          companyNumber,
          chStatus,
        });

        // Fire-and-forget: claim pipeline entry if this company matches
        claimPipelineEntry({
          mysqlQuery: run,
          uid,
          companyName: companyName,
          companyNumber: companyNumber || null,
          broadcastNotification: ctx.broadcastNotification,
        }).catch(() => {});

        const finalRow = await queryOne(
          `SELECT * FROM tradesmen WHERE user_id = ?`,
          [uid]
        );

        res.json({ ok: true, profile: finalRow });
        ctx.logActivity("tradesman.update", "info", req.user.uid, "Tradesman profile updated");
        return;
      } catch (e) {
        log.error(`${TAG} db error`, {
          uid,
          error: e?.message || e,
        });
        return res.status(500).json({ error: "server_error" });
      }
    } catch (outer) {
      log.error(`${TAG} unexpected error`, {
        uid,
        error: outer?.message || outer,
      });
      return res.status(500).json({ error: "server_error" });
    }
  });

  if (!ctx.__logged_tradesmen_me_put) {
    ctx.__logged_tradesmen_me_put = true;
    log.info("[routes] mounted: PUT /tradesmen/me");
  }
};
