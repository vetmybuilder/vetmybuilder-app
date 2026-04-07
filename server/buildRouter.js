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

  // Trades role guard
  ctx.requireTradesman = ctx.requireTradesman || requireTradesman(ctx);

  ensureAdminTables();

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

  // Companies House
  {
    const ch = require("./lib/companiesHouse");
    ctx.getCompanyProfile = ctx.getCompanyProfile || ch.getCompanyProfile;
    ctx.searchCompanies = ctx.searchCompanies || ch.searchCompanies;
    ctx.matchByName = ctx.matchByName || ch.matchByName;
    ctx.chDiag = ctx.chDiag || ch.chDiag;
  }

  ctx.notifyUsers = ctx.notifyUsers || (() => {});

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

  // ---------------- auth ----------------
  require("./routes/auth/beta-status.get")(router, ctx);
  require("./routes/auth/check-email.post")(router, ctx);
  require("./routes/auth/check-username.get")(router, ctx);
  require("./routes/auth/signup.post")(router, ctx);

  // ---------------- Notifications & SSE ----------------
  require("./routes/notifications/stream.get")(router, ctx);
  require("./routes/notifications/notifications.get")(router, ctx);
  require("./routes/notifications/notification.read.post")(router, ctx);
  require("./routes/notifications/read-all.post")(router, ctx);

  // ---------------- Account / Profile / Me ----------------
  require("./routes/accounts/account.get")(router, ctx);
  require("./routes/account/account.post")(router, ctx);
  require("./routes/profile/profile.get")(router, ctx);
  require("./routes/profile/profile.post")(router, ctx);
  require("./routes/me/me.get")(router, ctx);

  // ---------------- Projects ----------------
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
  require("./routes/recommendations/recommendation.get")(router, ctx);
  require("./routes/recommendations/verification.get")(router, ctx);

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
  require("./routes/tradesmen/favourites.get")(router, ctx);
  require("./routes/tradesmen/tradesman.get")(router, ctx);
  require("./routes/tradesmen/favourite.post")(router, ctx);
  require("./routes/tradesmen/google-reviews.get")(router, ctx);

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

  // ---------------- Admin ----------------
  require("./routes/admin/tradesmen.get")(router, ctx);
  require("./routes/admin/tradesman.status.post")(router, ctx);
  require("./routes/admin/tradesman.flag.post")(router, ctx);
  require("./routes/admin/subscriptions.post")(router, ctx);
  require("./routes/admin/tradesmen.unlocks.post")(router, ctx);
  require("./routes/admin/subscription.sweep.post")(router, ctx);
  require("./routes/admin/subscriptions.cancel.post")(router, ctx);
  require("./routes/admin/recommendation-leaderboard.get")(router, ctx);
  require("./routes/admin/spotlight.approve.post")(router, ctx);
  require("./routes/admin/spotlight.reject.post")(router, ctx);
  require("./routes/admin/pending-payments.get")(router, ctx);
  require("./routes/admin/subscription.approve.post")(router, ctx);
  require("./routes/admin/subscription.reject.post")(router, ctx);

  return router;
}

module.exports = { buildRouter };
