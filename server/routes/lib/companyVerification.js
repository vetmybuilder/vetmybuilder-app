// server/routes/lib/companyVerification.js
//
// Shared helper for queuing company verification work safely from routes.
// This wraps ctx.queueCompanyVerification in a small guard + try/catch so
// individual routes don't have to repeat the same boilerplate.

function queueVerification(queueFn, opts) {
  const {
    recId = null,
    name,
    locationHint,
    sourceTag = "generic",
  } = opts || {};

  if (!queueFn || typeof queueFn !== "function") {
    // No worker wired up – nothing to do.
    return;
  }

  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) {
    return;
  }

  const payload = {
    recId,
    name: trimmedName,
    locationHint: locationHint || undefined,
  };

  try {
    queueFn(payload);
  } catch (e) {
    // Non-fatal – routes should still succeed even if the queue fails
    const msg = e && e.message ? e.message : e;
    // eslint-disable-next-line no-console
    console.warn(
      `[companyVerification:${sourceTag}] queueCompanyVerification failed`,
      msg
    );
  }
}

module.exports = {
  queueVerification,
};
