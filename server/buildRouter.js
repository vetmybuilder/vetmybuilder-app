const { Router } = require("express");
const { requireTradesman } = require("./lib/roles");
const ensureAdminTables = require("./boot/ensureAdminTables");
const { attachPayments } = require("./boot/attachPayments");

function buildRouter(ctx) {
  if (!ctx) {
    throw new Error("buildRouter: ctx is required");
  }

  if (!ctx.mysqlQuery) {
    throw new Error("buildRouter: ctx.mysqlQuery is required (MySQL)");
  }

  // ---- Hydrate ctx with defaults so routes can rely on them ----

  // Provide Pino logger so routes don't fall back to console
  if (!ctx.log) {
    const { logger } = require("./lib/logger");
    ctx.log = logger;
  }

  // Trades role guard
  ctx.requireTradesman = ctx.requireTradesman || requireTradesman(ctx);

  ensureAdminTables();

  // SSE
  if (!ctx.clientsByUser || !ctx.sseSend) {
    const sse = require("./lib/sse");
    ctx.clientsByUser = ctx.clientsByUser || sse.clientsByUser;
    ctx.sseSend = ctx.sseSend || sse.sseSend;
  }
  if (!ctx.broadcastNotification) {
    const sse = require("./lib/sse");
    ctx.broadcastNotification = sse.broadcastNotification;
  }
  if (!ctx.broadcastEvent) {
    const sse = require("./lib/sse");
    ctx.broadcastEvent = sse.broadcastEvent;
  }

  // Uploads
  if (!ctx.upload || !ctx.UPLOAD_DIR) {
    const uploads = require("./lib/uploads");
    ctx.upload = ctx.upload || uploads.upload;
    ctx.UPLOAD_DIR = ctx.UPLOAD_DIR || uploads.UPLOAD_DIR;
  }

  // Payments (mock)
  if (!ctx.payments) {
    attachPayments(ctx);
  }

  // Validation and helpers
  {
    const { RecSchema } = require("./lib/validation");
    const { cleanPhone } = require("./lib/phone");
    const { extractLocationTokens } = require("./lib/location");
    const { resolveFirebaseApiKey, PUBLIC_API_BASE } = require("./lib/config");

    ctx.RecSchema = ctx.RecSchema || RecSchema;
    ctx.cleanPhone = ctx.cleanPhone || cleanPhone;
    ctx.extractLocationTokens =
      ctx.extractLocationTokens || extractLocationTokens;
    ctx.resolveFirebaseApiKey =
      ctx.resolveFirebaseApiKey || resolveFirebaseApiKey;
    ctx.PUBLIC_API_BASE = ctx.PUBLIC_API_BASE || PUBLIC_API_BASE;
  }

  // Email helpers
  // sendBuilderInviteEmail is exposed via ctx so tests can inject a mock.
  // vi.mock() doesn't reliably intercept CJS require() once the module has
  // been loaded by another test in the same suite. Production gets the real
  // implementation via the fallback below.
  if (!ctx.sendBuilderInviteEmail) {
    const { sendBuilderInviteEmail } = require("./lib/sendBuilderInviteEmail");
    ctx.sendBuilderInviteEmail = sendBuilderInviteEmail;
  }

  // Companies House
  {
    const ch = require("./lib/companiesHouse");
    ctx.getCompanyProfile = ctx.getCompanyProfile || ch.getCompanyProfile;
    ctx.searchCompanies = ctx.searchCompanies || ch.searchCompanies;
    ctx.matchByName = ctx.matchByName || ch.matchByName;
    ctx.chDiag = ctx.chDiag || ch.chDiag;
  }

  ctx.notifyUsers = ctx.notifyUsers || (() => {});

  // Ensure all tables exist on startup — no-op if already present.
  // This prevents manual SQL on prod when new tables are added.
  const ensureTables = [
    `CREATE TABLE IF NOT EXISTS activity_log (
      id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event       VARCHAR(50)   NOT NULL,
      level       VARCHAR(10)   NOT NULL DEFAULT 'info',
      actor_uid   VARCHAR(128)  DEFAULT NULL,
      detail      TEXT          DEFAULT NULL,
      created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_al_created (created_at),
      INDEX idx_al_level   (level, created_at),
      INDEX idx_al_event   (event, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS project_classifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      classifier_version VARCHAR(40) NOT NULL,
      raw_description TEXT,
      structured JSON,
      cost_pence DECIMAL(10,4) DEFAULT 0,
      latency_ms INT DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      classified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_pc_project (project_id, classified_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS match_observations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      recommendation_id INT DEFAULT NULL,
      tradesman_uid VARCHAR(128) DEFAULT NULL,
      event VARCHAR(40) NOT NULL,
      meta JSON,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_mo_project (project_id, created_at),
      KEY idx_mo_event (event, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS recommendation_signals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      recommendation_id INT NOT NULL,
      signal_version VARCHAR(40) NOT NULL,
      sentiment DECIMAL(5,3) DEFAULT NULL,
      detail_score DECIMAL(5,3) DEFAULT NULL,
      generic_score DECIMAL(5,3) DEFAULT NULL,
      themes JSON,
      cost_pence DECIMAL(10,4) DEFAULT 0,
      latency_ms INT DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_rs_rec (recommendation_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS ai_inference_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      feature VARCHAR(60) NOT NULL,
      model VARCHAR(60) DEFAULT NULL,
      prompt_hash CHAR(64) DEFAULT NULL,
      prompt TEXT,
      response TEXT,
      cost_pence DECIMAL(10,4) DEFAULT 0,
      latency_ms INT DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_ail_feature (feature, created_at),
      KEY idx_ail_hash (prompt_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reporter_uid VARCHAR(128) NOT NULL,
      target_type ENUM('profile','recommendation','photo') NOT NULL,
      target_id VARCHAR(255) NOT NULL,
      category ENUM('abuse','spam','fake_review','inappropriate_image','other') NOT NULL,
      detail TEXT DEFAULT NULL,
      status ENUM('open','reviewed','dismissed') NOT NULL DEFAULT 'open',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME DEFAULT NULL,
      resolved_by VARCHAR(128) DEFAULT NULL,
      KEY idx_reports_status (status, created_at),
      KEY idx_reports_target (target_type, target_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS notification_preferences (
      uid VARCHAR(128) NOT NULL,
      category VARCHAR(50) NOT NULL,
      push_enabled TINYINT NOT NULL DEFAULT 1,
      PRIMARY KEY (uid, category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      uid VARCHAR(128) NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_push_uid (uid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS builder_summaries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company VARCHAR(255) NOT NULL,
      bullets JSON NOT NULL,
      recommendation_count INT NOT NULL,
      recommendation_ids JSON NOT NULL,
      classifier_version VARCHAR(40) NOT NULL,
      computed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_company (company)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS tradesperson_pipeline (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_name VARCHAR(255) NOT NULL,
      trade_types VARCHAR(255) NULL,
      service_areas VARCHAR(255) NULL,
      google_place_id VARCHAR(255) NULL,
      google_rating DECIMAL(3,2) NULL,
      google_reviews_count INT NULL,
      company_number VARCHAR(20) NULL,
      ch_status VARCHAR(50) NULL,
      ch_name VARCHAR(255) NULL,
      phone VARCHAR(50) NULL,
      email VARCHAR(255) NULL,
      website TEXT NULL,
      ai_review_summary TEXT NULL,
      vetting_score INT DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      discovered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME NULL,
      claimed_by VARCHAR(255) NULL,
      INDEX idx_pipeline_status (status),
      INDEX idx_pipeline_trade_types (trade_types),
      INDEX idx_pipeline_service_areas (service_areas),
      UNIQUE INDEX idx_pipeline_google_place_id (google_place_id),
      INDEX idx_pipeline_company_number (company_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];
  for (const sql of ensureTables) {
    ctx.mysqlQuery(sql).catch(() => {});
  }

  // Self-healing schema patches for pre-existing dev/prod DBs.
  // - chat_messages.attachments_json: image attachments on chat
  // - swipe_interest.source: add 'paid_unlock' as a third source value
  // Errors are logged but never block boot; the schema files (mysql_schema.sql
  // + docker/mysql/init/02-schema.sql) carry the canonical column shape.
  (async () => {
    try {
      await ctx.mysqlQuery(
        `ALTER TABLE chat_messages ADD COLUMN attachments_json TEXT NULL`,
      );
    } catch (e) {
      const msg = String(e?.message || "").toLowerCase();
      if (!msg.includes("duplicate column") && !msg.includes("already exists")) {
        // eslint-disable-next-line no-console
        console.warn("[buildRouter] chat_messages.attachments_json ALTER:", e?.message);
      }
    }
    try {
      await ctx.mysqlQuery(
        `ALTER TABLE swipe_interest MODIFY source ENUM('recommended', 'subscribed', 'paid_unlock') NOT NULL`,
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[buildRouter] swipe_interest.source MODIFY:", e?.message);
    }
  })();
  {
    const { makeLogActivity } = require("./lib/activityLog");
    ctx.logActivity = ctx.logActivity || makeLogActivity(ctx.mysqlQuery);
  }

  const ensureCompanyVerificationTable = require("./boot/ensureCompanyVerificationTable");
  ensureCompanyVerificationTable();

  const {
    makeQueueCompanyVerification,
  } = require("./lib/companyVerifyHelpers");

  ctx.queueCompanyVerification =
    ctx.queueCompanyVerification ||
    makeQueueCompanyVerification({
      mysqlQuery: ctx.mysqlQuery,
      matchByName: ctx.matchByName,
    });

  if (!ctx.auth) {
    throw new Error("buildRouter: ctx.auth is required (auth middleware)");
  }
  ctx.touchUserMw = ctx.touchUserMw || ((req, _res, next) => next());

  const router = Router();

  // ---------------- Debug / MySQL test ----------------
  require("./routes/db-test.get")(router, ctx);

  // ---------------- Test-only routes ----------------
  require("./routes/__test__/db/clear.post")(router, ctx);
  require("./routes/__test__/users.post")(router, ctx);
  require("./routes/__test__/auth/custom-token.post")(router, ctx);
  require("./routes/__test__/auth/id-token.post")(router, ctx);
  require("./routes/__test__/auth/session.post")(router, ctx);
  require("./routes/__test__/sim/live-projects.get")(router, ctx);

  // ---------------- contact ----------------
  require("./routes/contact/contact.post")(router, ctx);

  // ---------------- feedback ----------------
  require("./routes/feedback/feedback.post")(router, ctx);

  // ---------------- auth ----------------
  require("./routes/auth/beta-status.get")(router, ctx);
  require("./routes/auth/check-email.post")(router, ctx);
  require("./routes/auth/check-username.get")(router, ctx);
  require("./routes/auth/signup.post")(router, ctx);

  // ---------------- Boroughs ----------------
  require("./routes/boroughs/search.get")(router, ctx);

  // ---------------- Pilot launch areas ----------------
  require("./routes/pilot/areas.get")(router, ctx);

  // ---------------- Notifications & SSE ----------------
  require("./routes/notifications/stream.get")(router, ctx);
  require("./routes/notifications/notifications.get")(router, ctx);
  require("./routes/notifications/notification.read.post")(router, ctx);
  require("./routes/notifications/read-all.post")(router, ctx);
  require("./routes/notifications/notification.delete")(router, ctx);
  require("./routes/notifications/preferences.get")(router, ctx);
  require("./routes/notifications/preferences.put")(router, ctx);

  // ---------------- Push ----------------
  require("./routes/push/subscribe.post")(router, ctx);
  require("./routes/push/unsubscribe.post")(router, ctx);

  // ---------------- Account / Profile / Me ----------------
  require("./routes/accounts/account.get")(router, ctx);
  require("./routes/account/account.post")(router, ctx);
  require("./routes/me/me.get")(router, ctx);

  // ---------------- Projects ----------------
  // preview-matches.get must register BEFORE project.get so the literal
  // /preview-matches path isn't swallowed by /projects/:id.
  require("./routes/projects/preview-matches.get")(router, ctx);
  require("./routes/projects/projects.get")(router, ctx);
  require("./routes/projects/projects.post")(router, ctx);
  require("./routes/projects/publish.post")(router, ctx);
  require("./routes/projects/project.get")(router, ctx);
  require("./routes/projects/project.put")(router, ctx);
  require("./routes/projects/archive.post")(router, ctx);
  require("./routes/projects/unarchive.post")(router, ctx);
  require("./routes/projects/close.post")(router, ctx);
  require("./routes/projects/close.photos.post")(router, ctx);
  require("./routes/projects/close.photos.get")(router, ctx);
  require("./routes/projects/project-closure.get")(router, ctx);
  require("./routes/projects/magic-link.post")(router, ctx);
  require("./routes/projects/owner-contact.get")(router, ctx);
  require("./routes/projects/unlock-contact.checkout.post")(router, ctx);
  require("./routes/projects/shares.get")(router, ctx);

  require("./routes/projects/recommendations.get")(router, ctx);
  require("./routes/projects/recommendations.post")(router, ctx);

  // ---------------- Reports ----------------
  require("./routes/reports/reports.post")(router, ctx);

  // ---------------- Hires ----------------
  require("./routes/projects/hires.post")(router, ctx);
  require("./routes/projects/hires.get")(router, ctx);
  require("./routes/tradesmen/me.hires.get")(router, ctx);
  require("./routes/hires/accept.patch")(router, ctx);
  require("./routes/hires/decline.patch")(router, ctx);
  require("./routes/hires/cancel.patch")(router, ctx);

  // ---------------- Recommendations ----------------
  require("./routes/recommendations/magic.post")(router, ctx);
  require("./routes/recommendations/magic.get")(router, ctx);
  require("./routes/recommendations/like.post")(router, ctx);
  require("./routes/recommendations/ratings.recommendations.get")(router, ctx);
  // inbox.get must register before recommendation.get so /recommendations/inbox
  // isn't swallowed by the /recommendations/:id wildcard.
  require("./routes/recommendations/inbox.get")(router, ctx);
  require("./routes/recommendations/recommendation.get")(router, ctx);
  require("./routes/recommendations/verification.get")(router, ctx);
  require("./routes/recommendations/dismiss-from-deck.post")(router, ctx);
  require("./routes/recommendations/unfavourite.post")(router, ctx);

  // ---------------- Companies House helpers ----------------
  require("./routes/verify-company.get")(router, ctx);
  require("./routes/verify-company.test.get")(router, ctx);
  require("./routes/ch/diag.get")(router, ctx);

  // ---------------- Debug ----------------
  require("./routes/debug/reclinks.get")(router, ctx);
  require("./routes/debug/trades-role.get")(router, ctx);
  require("./routes/debug/routes.get")(router, ctx);

  // ---------------- Tradesmen / Builders ----------------
  require("./routes/tradesmen/jobs.get")(router, ctx);
  require("./routes/tradesmen/jobs/swipe.post")(router, ctx);
  require("./routes/tradesmen/me.get")(router, ctx);
  require("./routes/tradesmen/me.put")(router, ctx);
  require("./routes/tradesmen/join.post")(router, ctx);
  require("./routes/tradesmen/interest.post")(router, ctx);
  require("./routes/tradesmen/interest.get")(router, ctx);
  require("./routes/tradesmen/leaderboard.get")(router, ctx);
  require("./routes/tradesmen/precheck.post")(router, ctx);
  require("./routes/tradesmen/shares.post")(router, ctx);
  require("./routes/tradesmen/shares.get")(router, ctx);
  require("./routes/tradesmen/featured.get")(router, ctx);
  require("./routes/tradesmen/spotlight.get")(router, ctx);
  require("./routes/tradesmen/upload-photos.post")(router, ctx);
  require("./routes/tradesmen/upload-docs.post")(router, ctx);
  require("./routes/tradesmen/favourites.get")(router, ctx);
  require("./routes/tradesmen/tradesman.get")(router, ctx);
  require("./routes/tradesmen/favourite.post")(router, ctx);
  require("./routes/tradesmen/google-reviews.get")(router, ctx);
  require("./routes/tradesmen/incoming-interest.get")(router, ctx);

  // ---------------- Swipe matching ----------------
  require("./routes/projects/matches.get")(router, ctx);
  require("./routes/projects/match-rows.get.js")(router, ctx);
  require("./routes/projects/swipe.post")(router, ctx);
  require("./routes/swipe/respond.post")(router, ctx);
  require("./routes/matches/list.get.js")(router, ctx);
  require("./routes/matches/get.js")(router, ctx);
  require("./routes/tradesman/incoming-interest.get.js")(router, ctx);
  require("./routes/tradesman/matches.get.js")(router, ctx);

  // ---------------- Chat ----------------
  require("./routes/chat/messages.get.js")(router, ctx);
  require("./routes/chat/messages.post.js")(router, ctx);

  // ---------------- Plans ----------------
  require("./routes/meta/plans.get")(router, ctx);

  // ---------------- Payments (mock) ----------------
  require("./routes/payments/checkout.post")(router, ctx);
  require("./routes/payments/checkout.session.get")(router, ctx);
  require("./routes/payments/mock.pay.post")(router, ctx);
  require("./routes/payments/mock.cancel.post")(router, ctx);
  require("./routes/payments/mock.session.get")(router, ctx);
  require("./routes/payments/subscription.uncancel.post")(router, ctx);
  require("./routes/payments/oneoff.spotlight.purchase.post")(router, ctx);
  require("./routes/payments/spotlight.purchase.post")(router, ctx);
  require("./routes/payments/mock.webhook.post")(router, ctx);
  require("./routes/payments/stripe-webhook.post")(router, ctx);
  require("./routes/payments/activate-unlock.post")(router, ctx);

  // ---------------- Subscriptions ----------------
  require("./routes/subscriptions/checkout.post")(router, ctx);
  require("./routes/subscriptions/cancel.post")(router, ctx);
  require("./routes/subscriptions/me.get")(router, ctx);
  require("./routes/subscriptions/stripe-webhook.post")(router, ctx);

  // ---------------- Admin ----------------
  require("./routes/admin/projects.get")(router, ctx);
  require("./routes/admin/projects.delete")(router, ctx);
  require("./routes/admin/tradesmen.get")(router, ctx);
  require("./routes/admin/cleanup")(router, ctx);
  require("./routes/admin/tradesman.status.post")(router, ctx);
  require("./routes/admin/tradesman.flag.post")(router, ctx);
  require("./routes/admin/subscriptions.post")(router, ctx);
  require("./routes/admin/builder-subscriptions.post")(router, ctx);
  require("./routes/admin/oneoff-unlocks.post")(router, ctx);
  require("./routes/admin/tradesmen.unlocks.post")(router, ctx);
  require("./routes/admin/subscription.sweep.post")(router, ctx);
  require("./routes/admin/subscriptions.cancel.post")(router, ctx);
  require("./routes/admin/recommendation-leaderboard.get")(router, ctx);
  require("./routes/admin/spotlight.approve.post")(router, ctx);
  require("./routes/admin/spotlight.reject.post")(router, ctx);
  // Admin grant/revoke (no payment required - editorial spotlight)
  require("./routes/admin/spotlight.grant.post")(router, ctx);
  require("./routes/admin/pending-payments.get")(router, ctx);
  require("./routes/admin/subscription.approve.post")(router, ctx);
  require("./routes/admin/subscription.reject.post")(router, ctx);
  require("./routes/admin/compute-builder-summaries.post")(router, ctx);
  require("./routes/admin/compute-recommendation-signals.post")(router, ctx);
  require("./routes/admin/enrich-tradesmen.post")(router, ctx);
  require("./routes/admin/users.get")(router, ctx);
  require("./routes/admin/users.post")(router, ctx);
  require("./routes/admin/pilot-areas.get")(router, ctx);
  require("./routes/admin/pilot-areas.patch")(router, ctx);
  require("./routes/admin/users.put")(router, ctx);
  require("./routes/admin/users.delete")(router, ctx);
  require("./routes/admin/dashboard.stats.get")(router, ctx);
  require("./routes/admin/dashboard.ai-breakdown.get")(router, ctx);
  require("./routes/admin/dashboard.activity.get")(router, ctx);
  require("./routes/admin/reports.get")(router, ctx);
  require("./routes/admin/reports.resolve.patch")(router, ctx);
  require("./routes/admin/trades-pipeline.get")(router, ctx);
  require("./routes/admin/trades-pipeline.patch")(router, ctx);
  require("./routes/admin/trades-pipeline-discover")(router, ctx);
  require("./routes/admin/trades-pipeline.reverify.post")(router, ctx);
  require("./routes/admin/trades-pipeline.resurface.post")(router, ctx);
  require("./routes/admin/feedback.get")(router, ctx);
  require("./routes/admin/pricing.get")(router, ctx);
  require("./routes/admin/pricing.put")(router, ctx);

  return router;
}

module.exports = { buildRouter };
