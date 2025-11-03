// server/buildRouter.js
const { Router } = require("express");
const { requireTradesman } = require("./lib/roles");
const ensureAdminTables = require("./boot/ensureAdminTables");

function buildRouter(ctx) {
  if (!ctx || !ctx.db) {
    throw new Error("buildRouter: ctx.db is required");
  }

  // ---- Hydrate ctx with defaults so routes can rely on them ----

  // Trades role guard
  ctx.requireTradesman = ctx.requireTradesman || requireTradesman(ctx);

  ensureAdminTables(ctx.db);

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
    const ch = require("./lib/companiesHouse");
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
  require("./routes/__test__/auth/session.post")(router, ctx);

  // ---------------- Notifications & SSE ----------------
  require("./routes/notifications/stream.get")(router, ctx);
  require("./routes/notifications/notifications.get")(router, ctx);
  require("./routes/notifications/notification.read.post")(router, ctx);
  require("./routes/notifications/read-all.post")(router, ctx);

  // ---------------- Account / Profile / Me ----------------
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
  require("./routes/projects/close.post")(router, ctx);
  require("./routes/projects/close.photos.post")(router, ctx);
  require("./routes/projects/close.photos.get")(router, ctx);
  require("./routes/projects/project-closure.get")(router, ctx);
  require("./routes/projects/magic-link.post")(router, ctx);

  // Project recommendations
  require("./routes/projects/recommendations.get")(router, ctx);
  require("./routes/projects/recommendations.post")(router, ctx);

  // ---------------- Recommendations ----------------
  require("./routes/recommendations/magic.post")(router, ctx);
  require("./routes/recommendations/magic.get")(router, ctx);
  require("./routes/recommendations/like.post")(router, ctx);
  require("./routes/recommendations/ratings.recommendations.get")(router, ctx);
  require("./routes/recommendations/recommendation.get")(router, ctx);
  require("./routes/recommendations/verification.get")(router, ctx);

  // ---------------- Companies House helpers ----------------
  require("./routes/verify-company.get")(router, ctx);
  require("./routes/verify-company.test.get")(router, ctx);
  require("./routes/ch/diag.get")(router, ctx);

  // ---------------- Debug ----------------
  require("./routes/debug/reclinks.get")(router, ctx);
  require("./routes/debug/leaderboard.get")(router, ctx);
  require("./routes/debug/trades-role.get")(router, ctx);
  require("./routes/debug/routes.get")(router, ctx);

  // ---------------- Tradesmen / Builders ----------------
  require("./routes/tradesmen/discover.get")(router, ctx);
  require("./routes/tradesmen/jobs.get")(router, ctx);
  require("./routes/tradesmen/me.get")(router, ctx);
  require("./routes/tradesmen/me.put")(router, ctx);
  // require("./routes/tradesmen/register.post")(router, ctx);
  require("./routes/tradesmen/join.post")(router, ctx);
  require("./routes/tradesmen/interest.post")(router, ctx);
  require("./routes/tradesmen/interest.get")(router, ctx);

  // // ---------------- Chats ----------------
  // require("./routes/chats/start.post")(router, ctx);
  // require("./routes/chats/messages.get")(router, ctx);
  // require("./routes/chats/messages.post")(router, ctx);
  // require("./routes/chats/stream.get")(router, ctx);
  // // optional list endpoint:
  // require("./routes/chats/chats.get")(router, ctx);

  // ---------------- Admin ----------------
  require("./routes/admin/tradesmen.get")(router, ctx);
  require("./routes/admin/tradesman.status.post")(router, ctx);
  require("./routes/admin/tradesman.flag.post")(router, ctx);

  return router;
}

module.exports = { buildRouter };
