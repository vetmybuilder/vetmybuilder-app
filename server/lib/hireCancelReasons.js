// server/lib/hireCancelReasons.js
//
// Canonical set of reasons a homeowner can give when cancelling a hire.
//
// The DB column `hires.cancelReason` is a free VARCHAR(50) — validation is
// enforced here in app code rather than as a DB ENUM, so adding/renaming a
// reason doesn't require a schema migration. The UI maps these snake_case
// keys to user-facing labels.
//
// Add new reasons to this list and to CANCEL_REASON_LABELS together.

const HIRE_CANCEL_REASONS = [
  "changed_mind",
  "chose_another",
  "project_cancelled",
  "other",
];

const HIRE_CANCEL_REASON_LABELS = {
  changed_mind: "Changed my mind",
  chose_another: "Chose a different tradesperson",
  project_cancelled: "Project is no longer happening",
  other: "Other",
};

function isValidHireCancelReason(value) {
  return typeof value === "string" && HIRE_CANCEL_REASONS.includes(value);
}

module.exports = {
  HIRE_CANCEL_REASONS,
  HIRE_CANCEL_REASON_LABELS,
  isValidHireCancelReason,
};
