/**
 * Reusable rate-limiters for public endpoints.
 *
 * We expose three pre-built limiters tuned to different abuse profiles:
 *
 *  - signupLimiter        5 reqs / 15 min / IP   (auth signup + email check)
 *  - contactLimiter       5 reqs / hour  / IP    (public contact form)
 *  - publicWriteLimiter  30 reqs / hour  / IP    (other anonymous POSTs)
 *
 * Anything that's behind auth and lives off a session token can rely on
 * the Firebase token rather than IP. These limiters target the genuinely
 * public surface area.
 *
 * Skip rules:
 *  - NODE_ENV === "test"          - so vitest + supertest never trip
 *  - PILOT_AREAS_BYPASS === "1"   - so E2E / staging override flag works
 */

const rateLimit = require("express-rate-limit");

const SKIP =
  process.env.NODE_ENV === "test" ||
  process.env.PILOT_AREAS_BYPASS === "1";

function buildLimiter({ windowMs, max, name }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => SKIP,
    handler: (req, res /*, next, opts */) => {
      // Compute remaining seconds. express-rate-limit attaches resetTime
      // (a Date) to req.rateLimit; fall back to the window if missing.
      const resetTime = req.rateLimit?.resetTime;
      const retryAfter = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(windowMs / 1000);

      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: "rate_limited",
        retryAfter,
        limiter: name,
      });
    },
  });
}

const signupLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  name: "signup",
});

const contactLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  name: "contact",
});

const publicWriteLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  name: "public_write",
});

module.exports = {
  signupLimiter,
  contactLimiter,
  publicWriteLimiter,
};
