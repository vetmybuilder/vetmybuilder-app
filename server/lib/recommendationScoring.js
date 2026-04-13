// server/lib/recommendationScoring.js
//
// Pure scoring helpers for the recommendation/builder ranking system.
//
// Exposed deliberately as a stand-alone module so it can be:
//   - unit-tested without Express, MySQL, or Firebase
//   - reused by future ranking surfaces (public project view's "Top
//     recommendations", the tradesmen.vmb_score recompute job, etc.)
//
// Keep this file pure: no I/O, no logging, no DB queries. If you need
// new inputs, add them as parameters — never reach out from here.

/**
 * computeScore — v2
 *
 * Changes from v1:
 *   1. Dropped the constant `+1.0 isRecommended` term (every row is by
 *      definition a recommendation, so it added no signal).
 *   2. Rebalanced provenance: friend > community (was the other way
 *      around). Real word-of-mouth is a stronger trust signal than a
 *      postcode-locality match.
 *   3. NEW: hires contribute the strongest individual term in the
 *      formula. An accepted hire is the closest thing we have to a
 *      "verified booking" — a homeowner committing to use this builder
 *      for a real project. Capped via log2 to avoid runaway gaming.
 *   4. Wins cap raised from 4 → 5 so heavy-volume builders pull
 *      meaningfully ahead of light ones.
 *   5. NEW: acceptance-rate dampener. Builders who decline a lot of
 *      hire requests have their entire score multiplied by their
 *      acceptance rate, with a Bayesian threshold (≥3 hires of data)
 *      and a 0.5 floor (halved, never zeroed).
 *   6. NEW: 18-month recency half-life. Old recommendations gradually
 *      lose weight because builder quality changes over time, and as
 *      a side benefit ancient burner-account abuse fades automatically.
 *
 * @param {Object} params
 * @param {number} [params.fromFriend=0]       — 0 or 1, friend recommendation flag
 * @param {number} [params.fromCommunity=0]    — 0 or 1, postcode-locality match flag
 * @param {number} [params.likes=0]            — like count
 * @param {number} [params.wins=0]             — completion-win count
 * @param {number} [params.recPhotos=0]        — photo count attached to the rec
 * @param {number} [params.completionPhotos=0] — photo count from project closures
 * @param {number} [params.wouldAgain=0]       — count of "would use again" votes
 * @param {Object|null} [params.ch=null]       — Companies House verification info
 * @param {number} [params.hiresAccepted=0]    — accepted hires from this rec
 * @param {number} [params.hiresDeclined=0]    — declined hires from this rec
 * @param {number} [params.ageDays=0]          — recommendation age in days (decay input)
 * @returns {number} score, rounded to nearest 0.05
 */
function computeScore({
  fromFriend = 0,
  fromCommunity = 0,
  likes = 0,
  wins = 0,
  recPhotos = 0,
  completionPhotos = 0,
  wouldAgain = 0,
  ch = null,
  hiresAccepted = 0,
  hiresDeclined = 0,
  ageDays = 0,
} = {}) {
  let s = 0;

  // Provenance (CHANGE 2 — rebalanced)
  if (fromFriend)    s += 0.5;   // was 0.2
  if (fromCommunity) s += 0.25;  // was 0.4

  // Hires (CHANGE 3 — NEW)
  if (hiresAccepted > 0) {
    s += Math.min(4, Math.log2(1 + hiresAccepted)) * 1.2;
  }

  // Wins (CHANGE 4 — cap raised 4 → 5)
  s += Math.min(5, Math.log2(1 + wins)) * 0.8;

  // Likes (unchanged)
  s += Math.min(4, Math.log2(1 + likes)) * 0.5;

  // Photos (unchanged)
  if (recPhotos > 0)
    s += Math.min(3, Math.log2(1 + recPhotos)) * 0.35;
  if (completionPhotos > 0)
    s += Math.min(3, Math.log2(1 + completionPhotos)) * 0.25;

  // Would use again (unchanged)
  s += wouldAgain * 0.7;

  // Companies House (unchanged)
  if (ch) {
    const st = String(ch.status || "").toLowerCase();
    if (st === "verified") s += 0.6;
    else if (st === "ambiguous") s += 0.15;
    if (Number.isFinite(ch.score))
      s += Math.min(0.5, (Number(ch.score) / 100) * 0.5);
  }

  // Acceptance-rate dampener (CHANGE 5 — NEW)
  // Bayesian threshold: only apply once we have ≥3 hires of data,
  // otherwise small samples create wild swings (0/1 = 0%, 1/1 = 100%).
  // Floor at 0.5 so a serial-decliner is halved, never zeroed —
  // there may be legitimate reasons (full schedule, area mismatch).
  const totalHires = hiresAccepted + hiresDeclined;
  if (totalHires >= 3) {
    const rate = hiresAccepted / totalHires;
    s *= Math.max(0.5, rate);
  }

  // Recency decay (CHANGE 6 — NEW)
  // 18-month half-life: decay = exp(-ln2 * ageMonths / 18)
  //   age 0 mo  →  1.00
  //   age 6 mo  →  0.79
  //   age 12 mo →  0.63
  //   age 18 mo →  0.50  (half-life)
  //   age 24 mo →  0.40
  //   age 36 mo →  0.25
  if (ageDays > 0) {
    const ageMonths = ageDays / 30;
    const decay = Math.exp((-Math.LN2 * ageMonths) / 18);
    s *= decay;
  }

  return Math.round(s * 20) / 20;
}

/** Days since a recommendation row's createdAt. Returns 0 if missing/invalid. */
function ageInDays(createdAt, now = Date.now()) {
  if (!createdAt) return 0;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return 0;
  const days = (now - t) / (1000 * 60 * 60 * 24);
  return days > 0 ? days : 0;
}

/**
 * Normalise a raw score to 0-100 for display.
 * Raw scores from the v1 formula range from 0 to ~8, v2 up to ~15.
 * Curve calibrated so:
 *   raw 0   → 0
 *   raw 2   → ~28
 *   raw 4   → ~49
 *   raw 5   → ~57    (decent builder, amber)
 *   raw 7   → ~69    (good builder, upper amber)
 *   raw 8   → ~74    (strong builder, green)
 *   raw 10  → ~81    (very strong, green)
 *   raw 15  → ~92    (exceptional, green)
 */
function normaliseScore(raw) {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  // Logarithmic curve with divisor 5 — balances v1 and v2 ranges
  const normalised = Math.round(100 * (1 - Math.exp(-raw / 5)));
  return Math.min(100, Math.max(0, normalised));
}

module.exports = { computeScore, ageInDays, normaliseScore };
