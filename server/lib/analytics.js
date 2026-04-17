// server/lib/analytics.js
// Server-side PostHog analytics. Fire-and-forget — never blocks requests.

const { PostHog } = require("posthog-node");
const { logger } = require("./logger");

const POSTHOG_KEY = process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY || "";
const POSTHOG_HOST = process.env.POSTHOG_HOST || process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

let client = null;

if (POSTHOG_KEY) {
  client = new PostHog(POSTHOG_KEY, {
    host: POSTHOG_HOST,
    flushAt: 20,
    flushInterval: 10000, // flush every 10 seconds
  });
  logger.info("[analytics] PostHog server-side tracking initialised");
} else {
  logger.info("[analytics] PostHog key not set — server-side tracking disabled");
}

/**
 * Track a server-side event.
 * @param {string} uid - Firebase UID (or "anonymous" for unauthenticated)
 * @param {string} event - Event name
 * @param {Record<string, any>} [properties] - Event properties
 */
function track(uid, event, properties) {
  if (!client) return;
  try {
    client.capture({
      distinctId: uid || "anonymous",
      event,
      properties: {
        ...properties,
        $source: "server",
      },
    });
  } catch (err) {
    logger.warn({ err: err?.message, event }, "[analytics] capture failed");
  }
}

/**
 * Identify a user with properties.
 * @param {string} uid
 * @param {Record<string, any>} properties
 */
function identify(uid, properties) {
  if (!client || !uid) return;
  try {
    client.identify({
      distinctId: uid,
      properties,
    });
  } catch (err) {
    logger.warn({ err: err?.message }, "[analytics] identify failed");
  }
}

// ---- Pre-built event helpers ----

function trackSignup(uid, { method, role, email }) {
  track(uid, "user_signed_up", { method, role, email });
  identify(uid, { email, role });
}

function trackLogin(uid, { method, email }) {
  track(uid, "user_logged_in", { method, email });
}

function trackProjectCreated(uid, { projectId, type, location }) {
  track(uid, "project_created", { project_id: projectId, type, location });
}

function trackProjectPublished(uid, { projectId, type, location }) {
  track(uid, "project_published", { project_id: projectId, type, location });
}

function trackProjectClosed(uid, { projectId }) {
  track(uid, "project_closed", { project_id: projectId });
}

function trackRecommendationMade(uid, { projectId, company, source }) {
  track(uid, "recommendation_made", { project_id: projectId, company, source });
}

function trackHireSent(uid, { projectId, tradesmanId, channel }) {
  track(uid, "hire_sent", { project_id: projectId, tradesman_id: tradesmanId, channel });
}

function trackHireAccepted(uid, { hireId, projectId }) {
  track(uid, "hire_accepted", { hire_id: hireId, project_id: projectId });
}

function trackHireDeclined(uid, { hireId, projectId }) {
  track(uid, "hire_declined", { hire_id: hireId, project_id: projectId });
}

function trackHireCancelled(uid, { hireId, projectId, reason }) {
  track(uid, "hire_cancelled", { hire_id: hireId, project_id: projectId, reason });
}

function trackTradesmanJoined(uid, { companyName, tradeTypes }) {
  track(uid, "tradesman_joined", { company_name: companyName, trade_types: tradeTypes });
}

function trackTradesmanActivated(uid, { companyName }) {
  track(uid, "tradesman_activated", { company_name: companyName });
}

function trackInterestExpressed(uid, { projectId, companyName }) {
  track(uid, "interest_expressed", { project_id: projectId, company_name: companyName });
}

function trackProfileShared(uid, { projectId, companyName }) {
  track(uid, "profile_shared", { project_id: projectId, company_name: companyName });
}

function trackReportCreated(uid, { targetType, targetId, category }) {
  track(uid, "report_created", { target_type: targetType, target_id: targetId, category });
}

function trackApiError(uid, { route, status, error }) {
  track(uid || "anonymous", "api_error", { route, status, error });
}

// Flush on shutdown
function shutdown() {
  if (client) {
    client.shutdown();
  }
}

module.exports = {
  track,
  identify,
  trackSignup,
  trackLogin,
  trackProjectCreated,
  trackProjectPublished,
  trackProjectClosed,
  trackRecommendationMade,
  trackHireSent,
  trackHireAccepted,
  trackHireDeclined,
  trackHireCancelled,
  trackTradesmanJoined,
  trackTradesmanActivated,
  trackInterestExpressed,
  trackProfileShared,
  trackReportCreated,
  trackApiError,
  shutdown,
};
