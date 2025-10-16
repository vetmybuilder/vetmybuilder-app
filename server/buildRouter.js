// server/buildRouter.js
const { Router } = require("express");

function buildRouter(ctx) {
  if (!ctx || !ctx.db) {
    throw new Error("buildRouter: ctx.db is required");
  }

  // ---- Hydrate ctx with defaults so routes can rely on them ----
  // SSE
  if (!ctx.clientsByUser || !ctx.sseSend) {
    const sse = require("./lib/sse");
    ctx.clientsByUser = ctx.clientsByUser || sse.clientsByUser;
    ctx.sseSend = ctx.sseSend || sse.sseSend;
  }

  // Uploads
  if (!ctx.upload || !ctx.UPLOAD_DIR) {
    const uploads = require("./lib/uploads");
    ctx.upload = ctx.upload || uploads.upload;
    ctx.UPLOAD_DIR = ctx.UPLOAD_DIR || uploads.UPLOAD_DIR;
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

  // Companies House
  {
    ctx.getCompanyProfile = ctx.getCompanyProfile || ch.getCompanyProfile;
    ctx.searchCompanies = ctx.searchCompanies || ch.searchCompanies;
    ctx.matchByName = ctx.matchByName || ch.matchByName;
    ctx.chDiag = ctx.chDiag || ch.chDiag;
  }

  // Notifications (fallback is provided by index, but keep reference available)
  ctx.notifyUsers = ctx.notifyUsers || ((/* db, uids, payload */) => {});

  // Background verification queue
  const ensureCompanyVerificationTable = require("./boot/ensureCompanyVerificationTable");
  ensureCompanyVerificationTable(ctx.db);

  const {
    makeQueueCompanyVerification,
  } = require("./lib/companyVerifyHelpers");
  ctx.queueCompanyVerification =
    ctx.queueCompanyVerification ||
    makeQueueCompanyVerification({
      db: ctx.db,
      matchByName: ctx.matchByName,
    });

  // Auth middlewares (expect provided by index)
  // ctx.auth: required for protected routes
  // ctx.touchUserMw: optional but recommended
  if (!ctx.auth) {
    throw new Error("buildRouter: ctx.auth is required (auth middleware)");
  }
  ctx.touchUserMw = ctx.touchUserMw || ((req, _res, next) => next());

  const router = Router();

  // ---------------- Test-only routes ----------------
  require("./routes/__test__/db/clear.post")(router, ctx);
  require("./routes/__test__/users.post")(router, ctx);
  require("./routes/__test__/auth/custom-token.post")(router, ctx);
  require("./routes/__test__/auth/id-token.post")(router, ctx);

  // ---------------- Notifications & SSE ----------------
  require("./routes/notifications/stream.get")(router, ctx);
  require("./routes/notifications/notifications.get")(router, ctx);
  require("./routes/notifications/notification.read.post")(router, ctx);
  require("./routes/notifications/read-all.post")(router, ctx);

  // ---------------- Account / Profile / Me ----------------
  // (Keep both folder styles for now; you can consolidate later)
  require("./routes/accounts/account.get")(router, ctx); // GET /api/account
  require("./routes/account/account.post")(router, ctx); // POST /api/account
  require("./routes/profile/profile.get")(router, ctx);
  require("./routes/profile/profile.post")(router, ctx);
  require("./routes/me/me.get")(router, ctx);

  // ---------------- Projects ----------------
  require("./routes/projects/projects.get")(router, ctx);
  require("./routes/projects/projects.post")(router, ctx);
  require("./routes/projects/publish.post")(router, ctx);
  require("./routes/projects/unfavourite.post")(router, ctx);
  require("./routes/projects/favourite.post")(router, ctx);
  require("./routes/projects/project.get")(router, ctx);
  require("./routes/projects/project.put")(router, ctx);
  require("./routes/projects/archive.post")(router, ctx);
  require("./routes/projects/unarchive.post")(router, ctx);
  require("./routes/projects/magic-link.post")(router, ctx);

  // Project recommendations
  require("./routes/projects/recommendations.get")(router, ctx);
  require("./routes/projects/recommendations.post")(router, ctx);

  // ---------------- Recommendations ----------------
  // Public via magic link
  require("./routes/recommendations/magic.post")(router, ctx);
  require("./routes/recommendations/magic.get")(router, ctx);

  // Authed rec routes
  require("./routes/recommendations/like.post")(router, ctx);
  require("./routes/recommendations/recommendation.get")(router, ctx);
  require("./routes/recommendations/verification.get")(router, ctx);

  // ---------------- Companies House helpers ----------------
  require("./routes/verify-company.get")(router, ctx);
  require("./routes/verify-company.test.get")(router, ctx);
  require("./routes/ch/diag.get")(router, ctx);

  // ---------------- Debug ----------------
  require("./routes/debug/reclinks.get")(router, ctx);

  return router;
}

module.exports = { buildRouter };
